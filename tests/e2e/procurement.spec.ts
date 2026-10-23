import { useRescue } from './rescue-helpers';
import { businessSeed, installSeed } from './event-helpers';
import { test, expect } from '@playwright/test';
import { choose, next } from './inquiry-helpers';
import {
  saved,
  start,
  checkAll,
  decide,
  acceptPi,
  funding,
  production,
  inspect,
  finish,
  clearInspection,
} from './procurement-helpers';
test.setTimeout(90000);
test('第 1→2→3→4→5：PI 门槛、截图纠错、真实定金及验收入库，刷新不重复记账', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const signed = await saved(page);
  await expect(page.getByRole('checkbox')).toHaveCount(7);
  await expect(page.locator('[data-choice-id="pi_accept"]')).toBeDisabled();
  await checkAll(page);
  await page.getByRole('checkbox').last().uncheck();
  await page.reload();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(6);
  await expect(page.locator('[data-choice-id="pi_accept"]')).toBeDisabled();
  await page.getByRole('checkbox').last().focus();
  await page.keyboard.press('Space');
  await page.screenshot({ path: info.outputPath('pi-confirmation.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await decide(page, 'pi_accept');
  await decide(page, 'funding_screenshot');
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await funding(page);
  const funded = await saved(page);
  expect(funded.snapshot.player.cashCnyFen).toBe(
    9980000 + funded.procurement!.customerAdvanceFen - 30000,
  );
  expect(funded.snapshot.player.cumulativeProfitCnyFen).toBe(-50000);
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(funded.snapshot.journal);
  await production(page);
  await clearInspection(page);
  await finish(page);
  const end = await saved(page);
  expect(end.snapshot.order).toMatchObject({
    status: 'ready',
    signedDay: signed.snapshot.order.signedDay,
    deliveryDueDay: signed.snapshot.order.deliveryDueDay,
    deliveryCompletedDay: null,
    collectionDueDay: null,
  });
  expect(end.snapshot.scheduled).toEqual([]);
  expect(
    end.snapshot.journal
      .flatMap((e) => e.postings)
      .some((p) => ['sales', 'taxReceivable', 'receivable'].includes(p.account)),
  ).toBe(false);
  await expect(page.getByTestId('supplier-advance')).toHaveText('¥0.00');
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(end.snapshot.journal);
  await page.screenshot({ path: info.outputPath('procurement-complete.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('低价供应商：全选合格不能放行，补检与返工要分别复验', async ({ page }, info) => {
  // 固定到实际批次不合格的种子，缺失资质本身不保证质量问题。
  await installSeed(page, businessSeed({ quality: true, supplier: 'cup_500_budget' }));
  await start(page, { supplier: '利达工贸' });
  await acceptPi(page);
  await funding(page);
  await production(page);
  await expect(page.locator('.procurement-summary .risk-note')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '符合', exact: true }).first()).toBeDisabled();
  await inspect(page, true);
  await expect(page.locator('[data-choice-id="inspection_accept"]')).toBeDisabled();
  await choose(page, 'inspection_retry');
  await next(page);
  await expect(page.locator('.evidence-card .field-error')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('inspection-correction.png'), fullPage: true });
  const before = await saved(page);
  await inspect(page);
  await decide(page, 'inspection_supplement');
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await inspect(page);
  await expect(page.locator('[data-choice-id="inspection_accept"]')).toBeDisabled();
  await decide(page, 'inspection_rework');
  await page.reload();
  await inspect(page);
  await decide(page, 'inspection_accept');
  const fixed = await saved(page);
  expect(fixed.snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen - 90000);
  expect(fixed.snapshot.gameDay - before.snapshot.gameDay).toBe(6);
  expect(fixed.snapshot.order.taxEligibility).toBe('ineligible');
  await finish(page);
});

test('L/C：第 4 关遗留软条款必须修改再核验，开工没有客户定金', async ({ page }) => {
  await start(page, { payment: 'lc', term: 'cif' });
  await acceptPi(page);
  await funding(page);
  await expect(page.getByRole('complementary', { name: '当前业务条件' })).toContainText(
    '核验失败：仍保留',
  );
  await expect(page.locator('[data-choice-id="supplier_deposit"]')).toBeDisabled();
  await choose(page, 'funding_return');
  await next(page);
  await decide(page, 'funding_lc_repair');
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(page.getByTestId('cash')).toHaveText('¥99,600.00');
  await funding(page);
  await expect(page.getByTestId('received-customer')).toHaveText('¥0.00');
  await production(page);
  await clearInspection(page);
  await finish(page);
  const end = await saved(page);
  expect(end.procurement!.bankFeeFen).toBeGreaterThan(80000);
  expect(end.procurement!.customerAdvanceFen).toBe(0);
});

test('OA 无定金：生产后终止，供应商部分退款与实际损失保留', async ({ page }) => {
  await start(page, { payment: 'oa', term: 'exw' });
  await acceptPi(page);
  await funding(page);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await expect(page.getByTestId('received-customer')).toHaveText('¥0.00');
  await production(page);
  const before = await saved(page);
  await decide(page, 'procurement_cancel');
  const end = await saved(page);
  expect(end.snapshot.order.status).toBe('cancelled');
  const expectedRefund = Math.round(before.procurement!.supplierDepositFen * 0.4);
  expect(end.snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen + expectedRefund);
  expect(end.snapshot.player.cumulativeProfitCnyFen).toBe(
    -20000 - before.procurement!.supplierDepositFen + expectedRefund,
  );
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(end.snapshot.journal);
});

test('D 的截图和账户不匹配：第 5 关核验失败，禁止供应商付款', async ({ page }) => {
  await start(page, { fraud: true });
  await acceptPi(page);
  await funding(page);
  await expect(page.getByRole('complementary', { name: '当前业务条件' })).toContainText(
    '核验失败：身份与银行记录不能确认',
  );
  await expect(page.locator('[data-choice-id="supplier_deposit"]')).toBeDisabled();
  await expect(page.getByTestId('received-customer')).toHaveText('¥0.00');
  await expect(page.getByTestId('cash')).toHaveText('¥97,800.00');
  await decide(page, 'procurement_cancel');
  expect((await saved(page)).snapshot.player.cashCnyFen).toBe(9780000);
});

test('盲目接大单：尾款资金缺口保留原流水，并提供停止采购出口', async ({ page }) => {
  await start(page, { payment: 'oa', bulk: true });
  await acceptPi(page);
  await funding(page);
  await production(page);
  await clearInspection(page);
  const before = await saved(page);
  await choose(page, 'supplier_balance');
  await expect(page.getByRole('alert')).toContainText('现金不足');
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await useRescue(page);
  await decide(page, 'procurement_cancel');
  await expect(page.getByRole('heading', { name: '本单结局：亏钱交学费' })).toBeVisible();
  expect((await saved(page)).snapshot.player.cashCnyFen).toBeGreaterThanOrEqual(0);
});
