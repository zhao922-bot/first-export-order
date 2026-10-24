import { inDesk } from './desk-helpers';
import { businessSeed } from './event-helpers';
import { test, expect } from '@playwright/test';
import { begin, documents, correct, tax, end } from './collection-helpers';
import { choose, next, review, continueReview } from './inquiry-helpers';
import { useRescue, declineRescue } from './rescue-helpers';
import { decide, saved } from './procurement-helpers';
test.setTimeout(150000);
test('第 1→2→3→4→5→6→7：T/T 单据纠错、键盘保存、截图保护、退税分两步', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await begin(page);
  await documents(page);
  await expect(page.locator('.document-field .guidance-note')).toHaveCount(0);
  await (
    await inDesk(page.locator('[data-doc-key="invoice.product"]').getByRole('checkbox'))
  ).check();
  await decide(page, 'documents_submit');
  await expect(page.getByRole('status', { name: '单据核对结果' })).toContainText('漏报 4 · 误报 1');
  await expect(page.locator('[data-choice-id="documents_accept"]')).toBeDisabled();
  await choose(page, 'documents_retry');
  await next(page);
  await decide(page, 'documents_submit');
  await choose(page, 'documents_retry');
  await next(page);
  await expect(page.locator('.document-field .guidance-note')).toHaveCount(1);
  const quantity = page.locator('[data-doc-key="invoice.quantity"]');
  await quantity.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await (
    await inDesk(quantity.getByRole('textbox'))
  ).fill(await page.locator('[data-document-source="quantity"]').innerText());
  await page.reload();
  await expect(quantity.getByRole('checkbox')).toBeChecked();
  await page.screenshot({ path: info.outputPath('documents.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await correct(page);
  const before = await saved(page);
  await decide(page, 'tt_verify');
  await choose(page, 'tt_release');
  await useRescue(page);
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await decide(page, 'tt_chase');
  const received = await saved(page);
  expect(received.collection!.bankFeeFen).toBe(0);
  await expect(page.getByTestId('collection-receivable')).toHaveText('¥0.00');
  await tax(page);
  const accrued = await saved(page);
  expect(accrued.snapshot.player.cashCnyFen).toBe(received.snapshot.player.cashCnyFen);
  expect(accrued.collection!.rebateAccruedFen).toBeGreaterThan(0);
  await expect(page.getByTestId('collection-rebate')).toHaveText('¥0.00');
  await decide(page, 'tax_receive');
  await expect(page.getByRole('heading', { name: /七关流程完成：/ })).toBeVisible();
  const finished = await saved(page);
  expect(finished.snapshot.player.cumulativeProfitCnyFen).toBe(
    accrued.snapshot.player.cumulativeProfitCnyFen,
  );
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(finished.snapshot.journal);
  await page.screenshot({ path: info.outputPath('seven-complete.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('L/C + CIF：额外信用证收货人核对、银行结算与汇差', async ({ page }) => {
  await begin(page, { payment: 'lc', term: 'cif' });
  if (
    !(await page.locator('.context-archive').getAttribute('open')) &&
    (await page.locator('.context-archive').evaluate((el) => !(el as HTMLDetailsElement).open))
  )
    await (await inDesk(page.locator('.context-archive > summary'))).click();
  await page.locator('.desk-tabs').getByRole('button', { name: '业务资料', exact: true }).click();
  await expect(page.getByRole('region', { name: '收汇与退税账本' })).toContainText('CIF 保险金额');
  await documents(page);
  await correct(page);
  expect((await saved(page)).collection!.marks).toHaveLength(5);
  await decide(page, 'lc_present');
  await expect(page.locator('[data-choice-id="lc_collect"]')).toBeEnabled();
  await decide(page, 'lc_collect');
  const received = await saved(page);
  expect(received.collection!.exchangeGainFen).toBeLessThan(0);
  expect(received.collection!.bankFeeFen).toBe(12000);
  await end(page);
});
test('OA + FOB：审批延迟未到账，后续核验全额到账且交付时钟冻结', async ({ page }) => {
  await begin(page, { payment: 'oa', eventSeed: businessSeed({ oa: 'oa_delayed' }) });
  await documents(page);
  await correct(page);
  const before = await saved(page);
  await decide(page, 'oa_due');
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await decide(page, 'oa_chase');
  const partial = await saved(page);
  expect(partial.collection!.outstandingUsdCent).toBeGreaterThan(0);
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(partial.snapshot.journal);
  await decide(page, 'oa_recover');
  await decide(page, 'oa_complete');
  await end(page);
  const done = await saved(page);
  expect(done.snapshot.order.deliveryCompletedDay).toBe(before.snapshot.order.deliveryCompletedDay);
  expect(done.snapshot.order.overdueDaysCharged).toBe(before.snapshot.order.overdueDaysCharged);
  expect(done.snapshot.order.remainingDeliveryDays).toBe(
    before.snapshot.order.remainingDeliveryDays,
  );
});
test('EXW + OA：核验买方装船后起算，不把买方出口资料当本方退税资格', async ({ page }) => {
  await begin(page, { payment: 'oa', term: 'exw', eventSeed: businessSeed({ oa: 'oa_full' }) });
  await expect(page.locator('[data-choice-id="documents_start"]')).toBeDisabled();
  const before = await saved(page);
  await decide(page, 'buyer_shipment');
  const verified = await saved(page);
  expect(verified.snapshot.order.collectionDueDay).toBe(verified.logistics!.shipmentDay! + 60);
  expect(verified.snapshot.journal).toEqual(before.snapshot.journal);
  await documents(page);
  await correct(page);
  await decide(page, 'oa_due');
  await decide(page, 'oa_chase');
  await decide(page, 'oa_complete');
  await tax(page, true);
  await expect(page.locator('[data-choice-id="tax_receive"]')).toBeDisabled();
  await choose(page, 'tax_retry');
  await next(page);
  await end(page, false);
});
test('T/T：复盘后重复无款放单形成坏账，现金和退税不虚增', async ({ page }) => {
  await begin(page);
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  const before = await saved(page);
  await choose(page, 'tt_release');
  await useRescue(page);
  await choose(page, 'tt_release');
  await declineRescue(page);
  await review(page);
  await continueReview(page);
  expect((await saved(page)).snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen);
  await choose(page, 'loss_continue');
  await next(page);
  await end(page, false);
  expect((await saved(page)).collection!.badDebtFen).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '七关流程完成：亏钱交学费' })).toBeVisible();
});
for (const scenario of ['oa_partial_loss', 'oa_default'])
  test('OA 证据核销：' + scenario, async ({ page }, info) => {
    await begin(page, { payment: 'oa', eventSeed: businessSeed({ oa: scenario }) });
    await documents(page);
    await correct(page);
    const initial = await saved(page);
    await decide(page, 'oa_due');
    await decide(page, 'oa_chase');
    const first = await saved(page);
    await expect(page.locator('[data-choice-id="oa_writeoff"]')).toBeDisabled();
    await page.reload();
    expect((await saved(page)).collection!.oaScenarioId).toBe(scenario);
    expect((await saved(page)).snapshot.journal).toEqual(first.snapshot.journal);
    await decide(page, 'oa_recover');
    const investigated = await saved(page);
    expect(investigated.collection!.outstandingUsdCent).toBeGreaterThan(0);
    expect(investigated.collection!.badDebtFen).toBe(0);
    await expect(page.getByTestId('oa-evidence')).toContainText(/无可|无财产/);
    await expect(page.locator('[data-choice-id="oa_recover"]')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('oa-evidence.png'), fullPage: true });
    if (scenario === 'oa_default')
      expect(investigated.snapshot.journal).toEqual(initial.snapshot.journal);
    await decide(page, 'oa_writeoff');
    expect((await saved(page)).snapshot.player.cashCnyFen).toBe(
      investigated.snapshot.player.cashCnyFen,
    );
    await end(page, false);
    expect((await saved(page)).collection!.badDebtFen).toBeGreaterThan(0);
  });

test('低价供应商：收齐尾款仍须核验采购凭证，不能自动退税', async ({ page }) => {
  await begin(page, { supplier: '利达工贸' });
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page, false);
  await expect(page.getByTestId('collection-rebate')).toHaveText('¥0.00');
});
