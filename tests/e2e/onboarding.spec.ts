import { test, expect, type Page } from '@playwright/test';
import { installSeed, shippingSeed } from './event-helpers';
import { next, review, continueReview } from './inquiry-helpers';
import { saved } from './procurement-helpers';

const panel = (page: Page) => page.getByTestId('onboarding');
async function step(page: Page, id: string) {
  await expect(panel(page)).toHaveAttribute('data-guide-step', id);
}
async function overview(page: Page) {
  await step(page, 'overview-progress');
  await page.getByRole('button', { name: '下一项说明', exact: true }).click();
  await step(page, 'overview-resources');
  await page.getByRole('button', { name: '下一项说明', exact: true }).click();
  await step(page, 'overview-glossary');
  await page.getByRole('button', { name: '开始动手', exact: true }).click();
}
test('首次高亮与示范：键盘开始→选品→核验→询盘，刷新/重看不重做付款', async ({ page }, info) => {
  if (info.project.name.includes('mobile')) await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installSeed(page, shippingSeed('none'));
  await page.goto('/');
  await step(page, 'start');
  await page.getByRole('button', { name: '定位当前操作', exact: true }).click();
  await expect(page.locator('[data-guide="start"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await overview(page);
  await step(page, 'product');
  await expect(page.locator('[data-guide="product"].onboarding-highlight')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('onboarding-product.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await step(page, 'feedback');
  const selection = await saved(page);
  await page.reload();
  await step(page, 'feedback');
  expect(await saved(page)).toEqual(selection);
  await next(page);
  await step(page, 'supplier');
  await page.getByRole('button', { name: '选择恒信制造', exact: true }).click();
  await review(page);
  await step(page, 'review');
  await continueReview(page);
  await step(page, 'verify');
  await page.getByRole('button', { name: /支付样品核验费并保留结果/ }).click();
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  const paid = await saved(page);
  await page.reload();
  await step(page, 'feedback');
  expect(await saved(page)).toEqual(paid);
  await page.getByRole('button', { name: '重新查看引导', exact: true }).click();
  await step(page, 'feedback');
  await page.getByRole('button', { name: '定位当前操作', exact: true }).click();
  expect(await saved(page)).toEqual(paid);
  await review(page);
  await step(page, 'finish');
  await page.getByRole('button', { name: /进入第 2 关/ }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.reload();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: '下一步提示', exact: true }).click();
  await step(page, 'inbox');
  await expect(page.locator('.mail-inbox button.onboarding-highlight')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('onboarding-inbox.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('跳过记忆、报价手动求助、再次查看均不改草稿与订单', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.reload();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await page.getByLabel('每件预计退税（CNY/件）', { exact: true }).fill('2.23');
  const before = await saved(page);
  await page.getByRole('button', { name: '下一步提示', exact: true }).click();
  await step(page, 'quote');
  await page.getByRole('button', { name: '定位当前操作', exact: true }).click();
  await expect(page.getByLabel('FOB 成本基数（CNY/件）', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '收起提示', exact: true }).click();
  await page.getByRole('button', { name: '重新查看引导', exact: true }).click();
  await overview(page);
  await step(page, 'quote');
  await page.getByRole('button', { name: '完成引导', exact: true }).click();
  await page.reload();
  await expect(panel(page)).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
});

test('前台停留提示：输入重新计时，关闭不反复弹出，离线跳时不触发', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await overview(page);
  await page.getByRole('button', { name: '完成引导', exact: true }).click();
  const before = await saved(page);
  await page.clock.runFor(59000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
  await page.getByLabel('每件预计退税（CNY/件）', { exact: true }).fill('1');
  await page.clock.runFor(59000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(page.getByTestId('onboarding-idle')).toContainText('从一项计算开始');
  await page
    .getByTestId('onboarding-idle')
    .getByRole('button', { name: '下一步提示', exact: true })
    .click();
  await step(page, 'quote');
  await page.getByRole('button', { name: '收起提示', exact: true }).click();
  await page.clock.runFor(120000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
  const after = await saved(page);
  expect(after.snapshot.journal).toEqual(before.snapshot.journal);
  expect(after.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
  await page.reload();
  await page.clock.fastForward(86400000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
});

test('无本地存储时仍能跳过与重新查看，并显示偏好未保存', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'first-export.onboarding.v1')
        throw new DOMException('blocked', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: '重新查看引导', exact: true }).click();
  await expect(panel(page)).toContainText('引导偏好暂未保存');
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
});
