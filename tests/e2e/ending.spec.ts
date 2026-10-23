import { test, expect, type Page } from '@playwright/test';
import { begin, documents, correct, end } from './collection-helpers';
import { decide, saved } from './procurement-helpers';
import { continueReview } from './inquiry-helpers';
import { endingBoundary } from '../fixtures/debrief';
import { pack } from '../fixtures/economy';
import type { SliceSession } from '../../src/engine/slice/session';
test.setTimeout(150000);
async function boundary(page: Page, session: SliceSession) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('boundary-loaded')) {
      localStorage.setItem('first-export.slice.v1', JSON.stringify(s));
      sessionStorage.setItem('boundary-loaded', 'yes');
    }
  }, session);
  await page.goto('/#/documents');
  await continueReview(page);
  await expect(page).toHaveURL(/#\/ending$/);
}
test('七关真实通关 → 冻结雷达、跨关回放、复购、知识补学与本地恢复', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await begin(page);
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  await expect(page).toHaveURL(/#\/ending$/);
  const settled = await saved(page);
  expect(settled.ending!.result.kind).toBe('excellent');
  await expect(page.getByRole('heading', { name: '七关流程完成：漂亮出海' })).toBeVisible();
  await expect(page.locator('[data-score-axis]')).toHaveCount(5);
  await expect(page.getByRole('img', { name: /五维评分雷达/ })).toBeVisible();
  await page.getByText('展开五维评分依据与每项证据', { exact: true }).click();
  await expect(page.locator('[data-opportunity="lc_soft"]')).toHaveCount(0);
  await expect(page.locator('[data-opportunity="tax"]')).toContainText('2 / 2');
  await expect(page.locator('[data-replay-id]')).toHaveCount(3);
  await page
    .locator('[data-replay-id]')
    .first()
    .getByText('林姐复盘与下次可以怎么做', { exact: true })
    .click();
  await expect(page.locator('[data-repeat="true"]')).toContainText('Emma');
  await expect(page.locator('[data-term-id]')).toHaveCount(24);
  const term = page.locator('[data-term-id="g12_lc"]');
  await expect(term).toContainText('未解锁');
  await term.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('article', { name: '当前知识词条' });
  await expect(card.getByRole('heading', { name: '即期信用证', exact: true })).toBeFocused();
  await card.getByRole('button', { name: '可以，银行必定付款', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('再想一步');
  await card.getByRole('button', { name: '不可以，仍需核对条款和单据', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('已掌握');
  await expect(term).toContainText('掌握');
  const learned = await saved(page);
  expect(learned.ending).toEqual(settled.ending);
  expect(learned.snapshot.journal).toEqual(settled.snapshot.journal);
  expect(learned.snapshot.story.decisionLog).toEqual(settled.snapshot.story.decisionLog);
  await page.reload();
  await expect(term).toContainText('掌握');
  expect((await saved(page)).ending).toEqual(settled.ending);
  await page.getByText('24 个知识节点与学习前置关系', { exact: true }).click();
  await expect(page.getByRole('img', { name: /知识图谱/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('ending-review.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '重开选品练习 →', exact: true }).click();
  await expect(page).toHaveURL(/#\/supplier$/);
  const fresh = await saved(page);
  expect(fresh.ending).toBeNull();
  expect(fresh.snapshot.story.decisionLog).toEqual([]);
  expect(fresh.snapshot.player.masteredTermIds).toEqual([]);
  expect(fresh.snapshot.order.status).toBe('draft');
  expect(errors).toEqual([]);
});
for (const [kind, title] of [
  ['excellent', '漂亮出海'],
  ['breakeven', '勉强保本'],
  ['tuition', '亏钱交学费'],
  ['bankrupt', '资金链断裂'],
] as const) {
  test(`E11 合法边界账本进入实际结算节点：${title}`, async ({ page }) => {
    const input = endingBoundary(kind);
    await boundary(page, input);
    await expect(page.getByRole('heading', { name: '七关流程完成：' + title })).toBeVisible();
    await expect(page.locator('[data-ending="' + kind + '"]')).toBeVisible();
    expect((await saved(page)).snapshot.journal).toEqual(input.snapshot.journal);
    await expect(page.getByTestId('replay-incomplete')).toContainText('只有 0 个');
    const done = await saved(page);
    await page.reload();
    expect((await saved(page)).ending).toEqual(done.ending);
  });
}
for (const eligible of [true, false])
  test(`E 客户品牌长期合作双门槛：${eligible ? '通过' : '合规不足'}`, async ({ page }) => {
    const input = endingBoundary('excellent');
    input.snapshot.order.customerId = 'customer_e';
    input.snapshot.order.flags.customerIsPotential = true;
    input.snapshot.player.trustByCustomer.customer_e = 100;
    input.snapshot.story.decisionLog = [
      {
        id: 'boundary.evidence',
        nodeId: 'L07.tax',
        choiceId: 'tax_verify',
        stage: 7,
        sequence: 0,
        deltas: { cashCnyFen: 0, profitCnyFen: 0, reputation: 0, trust: 0, days: 0 },
        evidence: pack.rubrics.map((r) => ({
          rubricId: r.id,
          earned: eligible || r.dimension !== 'compliance' ? 2 : 0,
          possible: 2,
        })),
        consequenceText: '边界测试评分证据',
        counterfactualReviewId: null,
      },
    ];
    await boundary(page, input);
    await expect(page.locator('[data-repeat="' + eligible + '"]')).toBeVisible();
    if (eligible) await expect(page.locator('[data-repeat="true"]')).toContainText('品牌长期合作');
    else
      await expect(page.locator('[data-repeat="false"]')).toContainText('总评与合规均达到 80 分');
    expect((await saved(page)).snapshot.order.id).toBe(input.snapshot.order.id);
    expect((await saved(page)).snapshot.journal).toEqual(input.snapshot.journal);
  });
test('进行中可查图鉴、回到原节点，无正式结局时不能提前评分', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始第 1 关 →', exact: true }).click();
  const before = await saved(page);
  await page.getByRole('link', { name: '随用随查 · 知识图鉴', exact: true }).click();
  await expect(page).toHaveURL(/#\/glossary$/);
  await page.locator('[data-term-id="g01_moq"]').click();
  await expect(page.getByRole('article', { name: '当前知识词条' })).toContainText('MOQ');
  await page.getByRole('link', { name: '返回本单进度', exact: true }).click();
  expect((await saved(page)).snapshot.story.nodeId).toBe(before.snapshot.story.nodeId);
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await page.goto('/#/ending');
  await expect(page.getByRole('heading', { name: '本单还没有正式结局' })).toBeVisible();
  expect((await saved(page)).ending).toBeNull();
});
test('成绩被改写的当前存档被拒绝，保留有效备份供恢复', async ({ page }) => {
  await boundary(page, endingBoundary('excellent'));
  const previous = await saved(page);
  // 再提交一次补学操作，让上一份冻结成绩成为已提交备份。
  await page.locator('[data-term-id="g12_lc"]').click();
  await page.evaluate(() => {
    const prefix = 'first-export.slice.v2:auto:';
    const head = JSON.parse(localStorage.getItem(prefix + 'head')!);
    const s = JSON.parse(localStorage.getItem(prefix + head.side)!);
    s.payload.session.ending.result.scores.risk = 100;
    localStorage.setItem(prefix + head.side, JSON.stringify(s));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '本单还没有正式结局' })).toBeVisible();
  await expect(page.locator('.save-state')).toContainText('校验失败');
  await page.getByRole('link', { name: '存档与恢复', exact: true }).click();
  await page.getByRole('button', { name: '恢复上一有效存档' }).click();
  expect(await saved(page)).toEqual(previous);
});
