import { inDesk } from './desk-helpers';
import { test, expect, type Page } from '@playwright/test';
import type { SliceSession } from '../../src/engine/slice/session';
import { readBrowserSession } from './save-helpers';
import {
  startInquiry,
  resolveMail,
  selectLead,
  submitCurrentQuote,
  choose,
  next,
  review,
  continueReview,
} from './inquiry-helpers';

const saved = (page: Page): Promise<SliceSession> => page.evaluate(readBrowserSession);
async function enterNegotiation(page: Page) {
  await submitCurrentQuote(page, true);
  await choose(page, 'continue_negotiation');
  await review(page);
  await continueReview(page);
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.getByRole('heading', { name: '第 1 轮 · 价格与数量' })).toBeVisible();
}
async function practice(page: Page) {
  await page.goto('/');
  await (await inDesk(page.getByRole('button', { name: '直接练习报价', exact: true }))).click();
  await enterNegotiation(page);
}
async function decide(page: Page, id: string) {
  await choose(page, id);
  await review(page);
  await continueReview(page);
}
async function toCounterparty(page: Page, payment = 'tt', term = 'fob', lc = 'amend') {
  await decide(page, 'offer_hold');
  await decide(page, 'payment_' + payment);
  if (payment === 'lc') {
    await expect(page.getByRole('heading', { name: '审证 · 买方控制的验收文件' })).toBeVisible();
    await decide(page, 'lc_' + lc);
  }
  await decide(page, 'terms_' + term);
}
async function confirm(page: Page) {
  await choose(page, 'counterparty_continue');
  await next(page);
  await expect(page.locator('[data-choice-id="contract_sign"]')).toBeDisabled();
  const fields = page.getByRole('checkbox');
  await expect(fields).toHaveCount(6);
  for (const field of await fields.all()) await (await inDesk(field)).check();
}
async function sign(page: Page) {
  await choose(page, 'contract_sign');
  await review(page);
  await (await inDesk(page.getByRole('button', { name: /查看签约记录/ }))).click();
  await expect(page.getByRole('heading', { name: '条款已确认，合同已记录。' })).toBeVisible();
}

test('第 1→2→3→4 关：三轮议价、交换条件、六项确认和刷新后签约', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startInquiry(page);
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await resolveMail(page, 'fraud');
  await selectLead(page);
  await enterNegotiation(page);
  await decide(page, 'offer_secured');
  await expect(page.locator('[data-choice-id="payment_lc"]')).toBeDisabled();
  await expect(page.locator('[data-choice-id="payment_oa"]')).toBeDisabled();
  await expect(page.getByRole('region', { name: '谈判条件摘要' })).toContainText('50%');
  await page.screenshot({ path: testInfo.outputPath('negotiation-payments.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await choose(page, 'payment_reprice');
  await next(page);
  await toCounterparty(page);
  await confirm(page);
  await (await inDesk(page.getByRole('checkbox').last())).uncheck();
  await expect(page.locator('[data-choice-id="contract_sign"]')).toBeDisabled();
  await page.getByRole('checkbox').last().focus();
  await page.keyboard.press('Space');
  await page.reload();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(6);
  const before = await saved(page);
  await sign(page);
  await page.reload();
  const after = await saved(page);
  expect(after.snapshot.order).toMatchObject({
    status: 'contracted',
    payment: 'TT',
    incoterm: 'FOB',
    customerId: 'customer_c',
    collectionDueDay: null,
  });
  expect(after.snapshot.order.deliveryDueDay).toBe(after.snapshot.order.signedDay! + 30);
  expect(after.snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen);
  expect(after.snapshot.journal).toEqual(before.snapshot.journal);
  expect(after.snapshot.scheduled).toEqual([]);
  await expect(page.getByTestId('contract-record')).toContainText('FOB 宁波港');
  await page.screenshot({ path: testInfo.outputPath('contract-signed.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const lc of ['amend', 'accept']) {
  test(
    'L/C 必经审证：' + (lc === 'amend' ? '支付改单费并签 CIF' : '保留软条款风险并签 EXW'),
    async ({ page }) => {
      await practice(page);
      const before = await saved(page);
      await toCounterparty(page, 'lc', lc === 'amend' ? 'cif' : 'exw', lc);
      const draft = await saved(page);
      expect(draft.snapshot.order.flags.lcReviewed).toBe(true);
      expect(draft.snapshot.order.flags.lcSoftAccepted).toBe(lc === 'accept');
      expect(draft.snapshot.player.cashCnyFen).toBe(
        before.snapshot.player.cashCnyFen - (lc === 'amend' ? 20000 : 0),
      );
      expect(draft.snapshot.gameDay).toBe(before.snapshot.gameDay + (lc === 'amend' ? 3 : 1));
      if (lc === 'accept')
        await expect(page.getByRole('list', { name: '当前风险' })).toContainText('无法相符交单');
      await confirm(page);
      await sign(page);
      const end = await saved(page);
      expect(end.snapshot.order).toMatchObject({
        status: 'contracted',
        payment: 'LC_SIGHT',
        incoterm: lc === 'amend' ? 'CIF' : 'EXW',
        collectionDueDay: null,
      });
      expect(end.snapshot.player.cashCnyFen).toBe(draft.snapshot.player.cashCnyFen);
      expect(end.snapshot.order.flags.agreedDepositRatio).toBe('0');
    },
  );
}

test('OA 先看到资金缺口，可缩量重谈；签约不把未来应收当现金', async ({ page }) => {
  await practice(page);
  await decide(page, 'offer_hold');
  await expect(page.locator('.payment-grid')).toContainText('OA');
  await decide(page, 'payment_oa');
  await expect(page.getByRole('list', { name: '当前风险' })).toContainText('预计资金出现缺口');
  await decide(page, 'terms_fob');
  await confirm(page);
  await choose(page, 'contract_reprice');
  await next(page);
  await decide(page, 'offer_small');
  await expect(page.getByTestId('deal-quantity')).toHaveText('4000 件');
  await decide(page, 'payment_oa');
  await decide(page, 'terms_fob');
  await choose(page, 'counterparty_continue');
  await next(page);
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
  for (const field of await page.getByRole('checkbox').all()) await (await inDesk(field)).check();
  await sign(page);
  const end = await saved(page);
  expect(end.snapshot.order).toMatchObject({
    payment: 'OA_60',
    quantity: 4000,
    collectionDueDay: null,
  });
  expect(end.snapshot.player.cashCnyFen).toBe(10000000);
  expect(end.snapshot.order.flags.agreedDepositRatio).toBe('0');
  expect(end.snapshot.scheduled).toEqual([]);
});

for (const pay of [false, true]) {
  test(
    'D 异常认证费：' + (pay ? '真实扣款后仍可止损，刷新不重复损失' : '独立核验并拒绝，未付款'),
    async ({ page }) => {
      test.setTimeout(90000);
      await startInquiry(page);
      await resolveMail(page, 'fraud', 'fraud', 'risky', true);
      await resolveMail(page, 'buyer');
      await resolveMail(page, 'competitor');
      await selectLead(page, 'customer_d');
      await enterNegotiation(page);
      await toCounterparty(page);
      await expect(page.locator('[data-choice-id="counterparty_continue"]')).toHaveCount(0);
      const before = await saved(page);
      if (pay) {
        await choose(page, 'fraud_pay');
        await page.reload();
        await expect(page.getByTestId('cash')).toHaveText('¥97,800.00');
        await review(page);
        await continueReview(page);
        await expect(page.getByRole('heading', { name: '损失之后 · 止损还是继续' })).toBeVisible();
        await decide(page, 'fraud_exit');
      } else await decide(page, 'fraud_reject');
      await expect(
        page.getByRole('heading', { name: '本单结局：亏钱交学费', exact: true }),
      ).toBeVisible();
      await page.reload();
      const end = await saved(page);
      expect(end.snapshot.order).toMatchObject({ status: 'cancelled', signedDay: null });
      expect(end.snapshot.player.cashCnyFen).toBe(
        before.snapshot.player.cashCnyFen - (pay ? 200000 : 0),
      );
      expect(end.snapshot.player.cumulativeProfitCnyFen).toBe(
        before.snapshot.player.cumulativeProfitCnyFen - (pay ? 200000 : 0),
      );
      expect(end.snapshot.scheduled).toEqual([]);
    },
  );
}
