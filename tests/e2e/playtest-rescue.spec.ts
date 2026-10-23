import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { begin, documents, correct, end } from './collection-helpers';
import {
  start,
  acceptPi,
  funding,
  production,
  clearInspection,
  decide,
  saved,
} from './procurement-helpers';
import { choose } from './inquiry-helpers';
import { type TelemetryData } from '../../src/telemetry/events';
import { calculateMetrics } from '../../src/telemetry/metrics';

type Export = TelemetryData & { metrics: ReturnType<typeof calculateMetrics> };
const records = (page: Page): Promise<TelemetryData> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('first-export.playtest.v1')!));
async function download(page: Page): Promise<Export> {
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本地试玩指标 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await promise).path())!, 'utf8'));
}
const answers = { pre: ['a', 'b', 'c', 'a', 'b', 'c'], post: ['c', 'a', 'b', 'c', 'a', 'b'] };
async function assessment(page: Page, phase: 'pre' | 'post') {
  for (const [i, id] of answers[phase].entries()) {
    await expect(page.getByTestId('assessment-question')).toHaveAttribute(
      'data-item-id',
      new RegExp('^' + phase + '_'),
    );
    await page.locator(`[data-answer-id="${id}"]`).click();
    if (i === 1) {
      await page.reload();
      await expect(page.getByText('第 3 / 6 题', { exact: true })).toBeVisible();
    }
  }
  await expect(page.getByRole('status')).toContainText('已完成，答对 6 / 6 题');
}
test.setTimeout(180000);
test('前测→完整七关→后测→下载：刷新不重答，配对样本和七关统计一致', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await begin(page, { assessment: () => assessment(page, 'pre') });
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  await page.getByRole('link', { name: '进行知识后测 / 导出试玩指标', exact: true }).click();
  await assessment(page, 'post');
  const report = await download(page);
  await writeFile(
    info.outputPath('playtest-export.json'),
    JSON.stringify({ evidenceSource: 'automated-playwright-not-human-study', ...report }, null, 2),
  );
  expect(report.metrics).toMatchObject({
    startedRuns: 1,
    completedRuns: 1,
    completionRate: 1,
    endedRuns: 1,
  });
  expect(report.metrics.knowledge).toMatchObject({
    pairedN: 1,
    preMean: 6,
    postMean: 6,
    improvementPoints: 0,
    preSkipped: 0,
  });
  expect(report.runs[0]!.completed).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(report.runs[0]!.counts.assessment_answered).toBe(12);
  expect(report.runs[0]!.counts.run_finished).toBe(1);
  expect(report.events.filter((e) => e.eventName === 'mentor_reviewed').length).toBeGreaterThan(5);
  const ledger = (await saved(page)).snapshot.journal;
  await page.reload();
  const again = await download(page);
  expect(again.runs[0]!.counts.assessment_answered).toBe(12);
  expect((await saved(page)).snapshot.journal).toEqual(ledger);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('playtest-report.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('E05 真实资金缺口：后果与复盘各刷新一次，恢复原账本和随机结果再止损', async ({
  page,
}, info) => {
  await start(page, { payment: 'oa', bulk: true });
  await acceptPi(page);
  await funding(page);
  await production(page);
  await clearInspection(page);
  const before = await saved(page);
  await choose(page, 'supplier_balance');
  await expect(page.getByTestId('rescue-gap')).not.toHaveText('¥0.00');
  await page.reload();
  await expect(page.getByTestId('rescue-checkpoint')).toBeVisible();
  await page.getByRole('button', { name: '查看林姐的救援复盘', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '林姐 · 先核对再继续', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('rescue-checkpoint.png'), fullPage: true });
  await page.getByRole('button', { name: '使用一次纠错，恢复检查点', exact: true }).click();
  await page.reload();
  const restored = await saved(page);
  expect(restored.snapshot.journal).toEqual(before.snapshot.journal);
  expect(restored.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
  expect(restored.snapshot.story.eventWindows).toEqual(before.snapshot.story.eventWindows);
  expect(restored.procurement!.qualityRoll).toBe(before.procurement!.qualityRoll);
  expect(restored.snapshot.story.drawCount).toBe(before.snapshot.story.drawCount);
  expect(restored.snapshot.player.rescueUsed).toBe(true);
  await decide(page, 'procurement_cancel');
  const data = await records(page);
  expect(data.runs[0]!.counts.rescue_offered).toBe(1);
  expect(data.runs[0]!.counts.rescue_used).toBe(1);
});
test('拒绝救援的确认页刷新保持未扣款，返回复盘后仍可恢复', async ({ page }) => {
  await start(page, { payment: 'oa', bulk: true });
  await acceptPi(page);
  await funding(page);
  await production(page);
  await clearInspection(page);
  const before = await saved(page);
  await choose(page, 'supplier_balance');
  await page.getByRole('button', { name: '查看林姐的救援复盘', exact: true }).click();
  await page.getByRole('button', { name: '拒绝纠错，查看风险确认', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '再次确认这次风险', exact: true })).toBeVisible();
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await page.getByRole('button', { name: '确认拒绝，返回资金安排', exact: true }).click();
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  expect((await records(page)).runs[0]!.counts.rescue_declined).toBe(1);
  await choose(page, 'supplier_balance');
  await page.getByRole('button', { name: '查看林姐的救援复盘', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '使用一次纠错，恢复检查点', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '返回核验，暂不冒险', exact: true }).click();
  await decide(page, 'procurement_cancel');
});
test('有效时长：闲置两分钟封顶，刷新不补计离线间隔，重复导出不增加时长', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '前测并开始七关试玩', exact: true }).click();
  await expect(page.getByTestId('assessment-question')).toBeVisible();
  await page.clock.runFor(180000);
  const before = (await records(page)).runs[0]!.activeMs;
  expect(before).toBeGreaterThan(100000);
  expect(before).toBeLessThanOrEqual(120000);
  await page.evaluate(() =>
    document.addEventListener(
      'wheel',
      () => {
        document.body.dataset.wheelReceived = 'yes';
      },
      { once: true },
    ),
  );
  await page.mouse.wheel(0, 100);
  await expect(page.locator('body')).toHaveAttribute('data-wheel-received', 'yes');
  await page.clock.runFor(180000);
  const afterWheel = (await records(page)).runs[0]!.activeMs;
  expect(afterWheel).toBeGreaterThan(before);
  expect(afterWheel - before).toBeLessThanOrEqual(120000);
  await page.reload();
  await page.clock.runFor(60000);
  expect((await records(page)).runs[0]!.activeMs).toBe(afterWheel);
  const a = await download(page),
    b = await download(page);
  expect(b.runs[0]!.activeMs - a.runs[0]!.activeMs).toBeLessThan(2000);
});
test('跳过与中途恢复不会伪造配对测评，清理统计不删除经营存档', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '前测并开始七关试玩', exact: true }).click();
  await page.locator('[data-answer-id="a"]').click();
  await page.getByRole('button', { name: '跳过本次测评', exact: true }).click();
  await page.reload();
  await expect(page.getByText('本次测评已跳过，不计为零分。')).toBeVisible();
  const report = await download(page);
  expect(report.metrics.knowledge).toMatchObject({ pairedN: 0, preSkipped: 1, preMean: null });
  const before = await saved(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '清空试玩记录', exact: true }).click();
  expect(await saved(page)).toEqual(before);
  expect((await download(page)).metrics.startedRuns).toBe(0);
});
