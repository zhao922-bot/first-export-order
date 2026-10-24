import { inDesk } from './desk-helpers';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { readBrowserSession } from './save-helpers';
import { begin, documents, correct, end } from './collection-helpers';
import { decide, saved, start, acceptPi, funding } from './procurement-helpers';

const rebate = '每件预计退税（CNY/件）';
const headKey = 'first-export.slice.v2:auto:head';
async function practice(page: Page) {
  await page.goto('/');
  await (await inDesk(page.getByRole('button', { name: '直接练习报价', exact: true }))).click();
  await expect(page).toHaveURL(/#\/quote$/);
}
async function recovery(page: Page) {
  await (await inDesk(page.getByRole('link', { name: '存档与恢复', exact: true }))).click();
  await expect(page.getByRole('heading', { name: '存档与恢复', exact: true })).toBeVisible();
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await (await inDesk(page.getByRole('button', { name: '导出当前进度', exact: true }))).click();
  const result = await download;
  return fs.readFile((await result.path())!, 'utf8');
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toEqual({ width: page.viewportSize()!.width, scroll: page.viewportSize()!.width });
}

test('未应用参数与报价草稿刷新保留；非法参数不改变业务快照', async ({ page }) => {
  await practice(page);
  const before = await saved(page);
  await (await inDesk(page.getByLabel('汇率 E', { exact: true }))).fill('7.50');
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  await page.reload();
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(page.getByLabel(rebate, { exact: true })).toHaveValue('2.23');
  await expect(page.getByRole('button', { name: /提交完整报价/ })).toBeDisabled();
  const draft = await saved(page);
  expect(draft.quoteInput).toEqual(before.quoteInput);
  for (const invalid of ['0', '-1', 'abc']) {
    await (await inDesk(page.getByLabel('数量 Q', { exact: true }))).fill(invalid);
    await (
      await inDesk(page.getByRole('button', { name: '应用参数并清空草稿', exact: true }))
    ).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await saved(page)).snapshot).toEqual(draft.snapshot);
  }
  await page.reload();
  await expect(page.getByLabel('数量 Q', { exact: true })).toHaveValue('abc');
});

test('导出 → 清理本地记录 → 导入，精确恢复参数草稿、账本和随机状态', async ({ page }) => {
  await practice(page);
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  await (await inDesk(page.getByLabel('汇率 E', { exact: true }))).fill('7.50');
  const before = await saved(page);
  await recovery(page);
  const file = await exported(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page
    .getByLabel(/选择 JSON 存档/)
    .setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await (await inDesk(page.getByRole('button', { name: '确认载入此存档' }))).click();
  await expect(page).toHaveURL(/#\/quote$/);
  expect(await saved(page)).toEqual(before);
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(page.getByRole('button', { name: /提交完整报价/ })).toBeDisabled();
});

test('当前槽损坏后恢复上一有效版本，保留坏档原文且不重放费用', async ({ page }) => {
  await practice(page);
  const previous = await saved(page);
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  const brokenKey = await page.evaluate((key) => {
    const head = JSON.parse(localStorage.getItem(key)!);
    const record = key.replace('head', head.side);
    localStorage.setItem(record, '{broken');
    return record;
  }, headKey);
  await page.reload();
  await expect(page.locator('.storage-banner')).toContainText('上一有效版本');
  await recovery(page);
  await (await inDesk(page.getByRole('button', { name: '恢复上一有效存档' }))).click();
  await (await inDesk(page.getByRole('link', { name: '返回本单进度', exact: true }))).click();
  expect(await saved(page)).toEqual(previous);
  expect(await page.evaluate((key) => localStorage.getItem(key), brokenKey)).toBe('{broken');
  await page.reload();
  expect(await saved(page)).toEqual(previous);
});

test('切换提交标记时容量不足：内存可导出，刷新仍读上一提交', async ({ page }) => {
  await practice(page);
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  const before = await saved(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, k, value);
    };
  }, headKey);
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('3.45');
  await expect(page.locator('.save-state')).toContainText('未保存');
  expect(await saved(page)).toEqual(before);
  await recovery(page);
  expect(JSON.parse(await exported(page)).payload.session.answers.rebateUnitCny).toBe('3.45');
  await page.reload();
  await (await inDesk(page.getByRole('link', { name: '返回本单进度', exact: true }))).click();
  await expect(page.getByLabel(rebate, { exact: true })).toHaveValue('2.23');
});

test('禁用浏览器存储仍可在内存练习并导出，不出现虚假已保存', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/');
  page.once('dialog', (d) => d.accept());
  await (await inDesk(page.getByRole('button', { name: '直接练习报价', exact: true }))).click();
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  await expect(page.locator('.save-state')).toContainText('存储不可用');
  await recovery(page);
  expect(JSON.parse(await exported(page)).payload.session.answers.rebateUnitCny).toBe('2.23');
  expect(errors).toEqual([]);
});

test('同源双标签检测已知新提交，旧页只读并可导出原进度', async ({ page, context }) => {
  await practice(page);
  const second = await context.newPage();
  await second.goto('/#/quote');
  // Lazy navigation can finish after the document load event: establish the stale view first.
  await expect(second.getByLabel(rebate, { exact: true })).toHaveValue('');
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  await expect(second.locator('.storage-banner')).toContainText('另一标签页');
  await expect(second.locator('.work-area')).toHaveAttribute('inert', '');
  await recovery(second);
  expect(JSON.parse(await exported(second)).payload.session.answers.rebateUnitCny).toBeUndefined();
  second.once('dialog', (d) => d.accept());
  await (await inDesk(second.getByRole('button', { name: '载入浏览器最新进度' }))).click();
  await (await inDesk(second.getByRole('link', { name: '返回本单进度', exact: true }))).click();
  await expect(second.getByLabel(rebate, { exact: true })).toHaveValue('2.23');
  await (await inDesk(second.getByLabel(rebate, { exact: true }))).fill('3.45');
  await expect(page.locator('.storage-banner')).toContainText('另一标签页');
  expect((await second.evaluate(readBrowserSession)).answers.rebateUnitCny).toBe('3.45');
});

test('坏 JSON、未来版本、原型字段及超大导入均保留当前记录', async ({ page }) => {
  await practice(page);
  await recovery(page);
  const head = await page.evaluate((key) => localStorage.getItem(key), headKey);
  const content = JSON.parse(await exported(page));
  content.schemaVersion = 99;
  const cases = [
    ['{bad', '损坏'],
    [JSON.stringify(content), '版本'],
    ['{"__proto__":{"polluted":true}}', '损坏'],
    [' '.repeat(512 * 1024 + 1), '超过'],
  ];
  for (const [data, message] of cases) {
    await page.getByLabel(/选择 JSON 存档/).setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data!),
    });
    await expect(page.locator('main').getByRole('status')).toContainText(message!);
    await expect(page.getByRole('button', { name: '确认载入此存档' })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), headKey)).toBe(head);
  }
  expect(await page.evaluate(() => Object.hasOwn({}, 'polluted'))).toBe(false);
});

test('三个手动槽可载入，重开和覆盖取消均保留原进度', async ({ page }) => {
  await practice(page);
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  const before = await saved(page);
  await recovery(page);
  for (const slot of ['manual1', 'manual2', 'manual3']) {
    await (await inDesk(page.getByLabel('手动存档槽', { exact: true }))).selectOption(slot);
    await (await inDesk(page.getByRole('button', { name: '保存到此槽' }))).click();
    await expect(page.locator('main').getByRole('status')).toContainText('手动存档已保存');
  }
  await (await inDesk(page.getByRole('link', { name: '返回本单进度', exact: true }))).click();
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('3.45');
  await recovery(page);
  page.once('dialog', (d) => d.dismiss());
  await (await inDesk(page.getByRole('button', { name: '保存到此槽' }))).click();
  page.once('dialog', (d) => d.accept());
  await (await inDesk(page.getByRole('button', { name: '载入此槽' }))).click();
  expect(await saved(page)).toEqual(before);
  await page.goto('/');
  page.once('dialog', (d) => d.dismiss());
  await (await inDesk(page.getByRole('button', { name: /重开选品练习/ }))).click();
  expect(await saved(page)).toEqual(before);
});

test('键盘提交错误关联字段与焦点；继续后当前任务标题接收焦点', async ({ page }) => {
  await practice(page);
  await page.getByRole('button', { name: /提交完整报价/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(rebate, { exact: true })).toBeFocused();
  await expect(page.getByLabel(rebate, { exact: true })).toHaveAttribute(
    'aria-describedby',
    'error-rebateUnitCny',
  );
  const fields = [
    [rebate, '2.23'],
    ['FOB 成本基数（CNY/件）', '26.47'],
    ['FOB 对外单价（USD/件）', '4.08'],
    ['CIF 对外单价（USD/件）', '4.68'],
  ];
  for (const [label, value] of fields)
    await (await inDesk(page.getByLabel(label!, { exact: true }))).fill(value!);
  await page.getByRole('button', { name: /提交完整报价/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.page-heading h1')).toBeFocused();
  await expect(page.locator('.mentor-review')).toBeVisible();
});

test('供应商定金按钮连续点击只记一笔，复盘刷新不重复付款', async ({ page }) => {
  test.setTimeout(120000);
  await start(page);
  await acceptPi(page);
  await funding(page);
  const before = await saved(page);
  await (
    await inDesk(page.locator('[data-choice-id="supplier_deposit"]'))
  ).click({ clickCount: 2 });
  const after = await saved(page);
  expect(after.procurement!.supplierDepositFen).toBeGreaterThan(0);
  expect(before.snapshot.player.cashCnyFen - after.snapshot.player.cashCnyFen).toBe(
    after.procurement!.supplierDepositFen,
  );
  expect(after.snapshot.journal.length).toBe(before.snapshot.journal.length + 1);
  await page.reload();
  await expect(page.locator('.mentor-review')).toBeVisible();
  await expect(page.locator('.legacy-feedback')).toHaveCount(0);
  expect(await saved(page)).toEqual(after);
});

test('无存档深链、浏览器前后退与 360×400 输入操作均可恢复', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/documents');
  await expect(page.getByRole('link', { name: '返回入口', exact: true })).toBeVisible();
  await practice(page);
  await page.setViewportSize({ width: 360, height: 400 });
  await (await inDesk(page.getByLabel(rebate, { exact: true }))).fill('2.23');
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  await noOverflow(page);
  const before = await saved(page);
  await recovery(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/quote$/);
  await page.goForward();
  await expect(page).toHaveURL(/#\/recovery$/);
  await page.reload();
  expect(await saved(page)).toEqual(before);
  await noOverflow(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: info.outputPath('recovery-viewport.png') });
  expect(errors).toEqual([]);
});

test('七关 UI 主线逐关刷新；360/768 布局、半改单据和结局恢复', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({
    width: info.project.name.startsWith('mobile') ? 360 : 768,
    height: info.project.name.startsWith('mobile') ? 800 : 1024,
  });
  const stages: number[] = [];
  await begin(page, {
    checkpoint: async (stage) => {
      const before = await saved(page);
      expect(before.snapshot.story.stage).toBe(stage);
      await page.reload();
      await expect(page.locator('.work-area h1')).toBeVisible();
      expect(await saved(page)).toEqual(before);
      await noOverflow(page);
      const shortTargets = await page
        .locator('button, .brand, a.nav-step, .save-link')
        .evaluateAll((items) =>
          items
            .filter((item) => {
              const rect = item.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.height < 44;
            })
            .map((item) => item.textContent?.trim()),
        );
      expect(shortTargets).toEqual([]);
      stages.push(stage);
    },
  });
  expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  await documents(page);
  const row = page.locator('[data-doc-key]').first();
  await (await inDesk(row.getByRole('checkbox'))).check();
  await (await inDesk(row.getByRole('textbox'))).fill('半改草稿');
  const partial = await saved(page);
  await page.reload();
  await expect(page.locator('[data-doc-key]').first().getByRole('textbox')).toHaveValue('半改草稿');
  expect(await saved(page)).toEqual(partial);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('documents-responsive.png'), fullPage: true });
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('ending-responsive.png'), fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('ending-viewport.png') });
  expect(errors).toEqual([]);
});
