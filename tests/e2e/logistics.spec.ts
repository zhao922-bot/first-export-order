import { inDesk } from './desk-helpers';
import { test, expect } from '@playwright/test';
import { choose, next } from './inquiry-helpers';
import { decide, saved } from './procurement-helpers';
import { seed, arrive, select, declaration, dispatch, deliver } from './logistics-helpers';
test.setTimeout(120000);
test('第 1→2→3→4→5→6：CIF 保险纠错、申报纠错、刷新与出运账本', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, 'none');
  await arrive(page, { term: 'cif' });
  await expect(page.locator('.forwarder-card')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('forwarders.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await decide(page, 'plan_steady');
  const before = await saved(page);
  await decide(page, 'insurance_skip');
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await decide(page, 'insurance_basic');
  await expect(page.locator('[data-choice-id="declaration_submit"]')).toBeDisabled();
  await declaration(page, false);
  await expect(page.locator('[data-choice-id="logistics_book"]')).toBeDisabled();
  await choose(page, 'declaration_retry');
  await next(page);
  await expect(page.locator('.declaration-row .field-error')).toHaveCount(1);
  const source = (await page.locator('[data-source-field="quantity"]').innerText()).replace(
    '合同源记录：',
    '',
  );
  await (await inDesk(page.getByLabel('数量（件）草稿', { exact: true }))).fill(source);
  await page.reload();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(5);
  await page.getByRole('checkbox', { name: '已核对数量（件）', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.screenshot({ path: info.outputPath('declaration.png'), fullPage: true });
  await decide(page, 'declaration_submit');
  await dispatch(page);
  const booked = await saved(page);
  expect(booked.logistics!.risk).toBe('none');
  expect(booked.logistics!.oceanPaidFen).toBeGreaterThan(0);
  expect(booked.logistics!.insurancePaidFen).toBeGreaterThan(0);
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(booked.snapshot.journal);
  await choose(page, 'risk_clear');
  await next(page);
  await deliver(page);
  const end = await saved(page);
  expect(end.snapshot.order.status).toBe('shipped');
  expect(end.snapshot.story.stage).toBe(6);
  expect(end.snapshot.order.deliveryCompletedDay).toBe(end.logistics!.shipmentDay);
  expect(
    end.snapshot.journal.some((e) =>
      e.postings.some((p) => p.account === 'taxReceivable' && p.amountCnyFen > 0),
    ),
  ).toBe(false);
  await expect(page.getByTestId('logistics-inventory')).toHaveText('¥0.00');
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(end.snapshot.journal);
  await page.screenshot({ path: info.outputPath('logistics-complete.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('FOB 快班查验错过截关，补救后顺延且不扣买方主运费', async ({ page }) => {
  await seed(page, 'customs', 'fast');
  await arrive(page);
  await select(page, 'fast');
  await declaration(page);
  await dispatch(page);
  await expect(page.getByTestId('logistics-risk')).toContainText('查验');
  const before = await saved(page);
  await decide(page, 'customs_standard');
  const resolved = await saved(page);
  expect(resolved.snapshot.gameDay - before.snapshot.gameDay).toBe(2);
  await expect(page.locator('.shipping-timeline')).toContainText('已错过截关');
  expect(resolved.logistics!.oceanPaidFen).toBe(0);
  expect(resolved.logistics!.insurancePaidFen).toBe(0);
  await deliver(page);
});
test('EXW + OA：工厂交付、买方运输不扣款、不伪造装船到期日', async ({ page }) => {
  await seed(page, 'none');
  await arrive(page, { term: 'exw', payment: 'oa' });
  await select(page, 'steady', 'exw');
  await declaration(page);
  await dispatch(page);
  await choose(page, 'risk_clear');
  await next(page);
  await deliver(page);
  const end = await saved(page);
  expect(end.snapshot.order.status).toBe('delivered');
  expect(end.logistics!.shipmentDay).toBeNull();
  expect(end.snapshot.order.collectionDueDay).toBeNull();
  expect(end.logistics!.oceanPaidFen).toBe(0);
  expect(end.logistics!.insurancePaidFen).toBe(0);
  expect(end.logistics!.risk).toBe('none');
  await expect(page.locator('.logistics-summary')).toContainText('买方实际装船证据');
});
test('FOB + OA：晚班甩柜等待，逾期实际扣款，装船后建立 60 天账期', async ({ page }, info) => {
  await seed(page, 'rollover', 'economy');
  await arrive(page, { payment: 'oa' });
  await select(page, 'economy');
  await declaration(page);
  await dispatch(page);
  await expect(page.getByTestId('logistics-risk')).toContainText('甩柜');
  const before = await saved(page);
  await page.screenshot({ path: info.outputPath('shipping-risk.png'), fullPage: true });
  await decide(page, 'rollover_wait');
  expect((await saved(page)).snapshot.player.cashCnyFen).toBe(
    before.snapshot.player.cashCnyFen - 20000,
  );
  const ready = await saved(page);
  await deliver(page);
  const end = await saved(page);
  expect(end.logistics!.penaltyPaidFen).toBeGreaterThan(0);
  expect(end.snapshot.player.cashCnyFen).toBeLessThan(ready.snapshot.player.cashCnyFen);
  expect(end.snapshot.order.collectionDueDay).toBe(end.logistics!.shipmentDay! + 60);
  await expect(page.getByTestId('delivery-clock')).toContainText('交期已冻结');
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(end.snapshot.journal);
});
test('CIF 甩柜改配：出口协调与主运价差按本方责任记账', async ({ page }) => {
  await seed(page, 'rollover', 'steady', 'cif');
  await arrive(page, { term: 'cif' });
  await select(page, 'steady', 'cif');
  await declaration(page);
  await dispatch(page);
  const before = await saved(page);
  await decide(page, 'rollover_priority');
  const after = await saved(page);
  expect(after.snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen - 100000);
  expect(after.logistics!.incidentPaidFen).toBe(100000);
  await deliver(page);
});
test('CIF 大单运费资金不足，整笔回滚并保留暂停出口', async ({ page }) => {
  await seed(page, 'none');
  await arrive(page, { term: 'cif', quantity: 5000 });
  await select(page, 'steady', 'cif');
  await declaration(page);
  const before = await saved(page);
  await choose(page, 'logistics_book');
  await expect(page.getByRole('alert')).toContainText('现金不足');
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await useRescue(page);
  await decide(page, 'logistics_hold');
  await expect(
    page.getByRole('heading', { name: '出运已暂停，库存和合同责任保留。' }),
  ).toBeVisible();
  const end = await saved(page);
  expect(end.snapshot.order.deliveryCompletedDay).toBeNull();
  expect(end.snapshot.order.status).toBe('ready');
  expect(end.snapshot.journal).toEqual(before.snapshot.journal);
});
import { useRescue } from './rescue-helpers';
