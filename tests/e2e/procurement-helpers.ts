import { expect, type Page } from '@playwright/test';
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

export const saved = (page: Page): Promise<SliceSession> => page.evaluate(readBrowserSession);
export async function decide(page: Page, id: string) {
  await choose(page, id);
  await review(page);
  await continueReview(page);
}
export async function checkAll(page: Page) {
  for (const field of await page.getByRole('checkbox').all()) await field.check();
}
export async function start(
  page: Page,
  options: {
    eventSeed?: string;
    supplier?: string;
    payment?: string;
    term?: string;
    fraud?: boolean;
    bulk?: boolean;
    quantity?: number;
    checkpoint?: (stage: number) => Promise<void>;
    assessment?: () => Promise<void>;
  } = {},
) {
  await startInquiry(page, options.supplier, options.checkpoint, options.assessment);
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await resolveMail(
    page,
    'fraud',
    'fraud',
    options.fraud ? 'risky' : 'safe',
    options.fraud ?? false,
  );
  await selectLead(page, options.fraud ? 'customer_d' : 'customer_c');
  await options.checkpoint?.(3);
  if (options.bulk || options.quantity) {
    const quantity = options.quantity ?? 5000;
    await page.getByLabel('数量 Q', { exact: true }).fill(String(quantity));
    await page.getByLabel('国内总费用 D', { exact: true }).fill(String(quantity * 0.7));
    await page.getByRole('button', { name: '应用参数并清空草稿', exact: true }).click();
  }
  await submitCurrentQuote(page, true);
  await choose(page, 'continue_negotiation');
  await review(page);
  await continueReview(page);
  await options.checkpoint?.(4);
  await decide(page, options.bulk ? 'offer_bulk' : 'offer_hold');
  await decide(page, 'payment_' + (options.payment ?? 'tt'));
  if (options.payment === 'lc') await decide(page, 'lc_accept');
  await decide(page, 'terms_' + (options.term ?? 'fob'));
  if (options.fraud) {
    await decide(page, 'fraud_pay');
    await choose(page, 'fraud_continue');
    await next(page);
  } else {
    await choose(page, 'counterparty_continue');
    await next(page);
  }
  await checkAll(page);
  await choose(page, 'contract_sign');
  await review(page);
  await page.getByRole('button', { name: /查看签约记录/ }).click();
  await choose(page, 'continue_procurement');
  await review(page);
  await continueReview(page);
  await expect(page).toHaveURL(/#\/contract$/);
  await options.checkpoint?.(5);
}
export async function acceptPi(page: Page) {
  await checkAll(page);
  await decide(page, 'pi_accept');
}
export async function funding(page: Page) {
  await checkAll(page);
  await decide(page, 'funding_verify');
}
export async function production(page: Page) {
  await decide(page, 'supplier_deposit');
  await choose(page, 'production_wait');
  await next(page);
}
export async function inspect(page: Page, allPass = false) {
  for (const row of await page.locator('.evidence-card').all()) {
    const read = row.getByRole('button', { name: '查看证据' });
    if (await read.count()) await read.click();
    const evidence = await row.locator('.evidence-copy').innerText();
    const bad = /不一致|缺失|不同|无法对应|旧稿|不足|短缺|混用/.test(evidence);
    await row
      .getByRole('radio', { name: !allPass && bad ? '异常，需处理' : '符合', exact: true })
      .check();
  }
  await decide(page, 'inspection_submit');
}
export async function clearInspection(page: Page) {
  await inspect(page);
  const rework = page.locator('[data-choice-id="inspection_rework"]');
  if (await rework.isEnabled()) {
    await decide(page, 'inspection_rework');
    await inspect(page);
  }
  const supplement = page.locator('[data-choice-id="inspection_supplement"]');
  if (await supplement.isEnabled()) {
    await decide(page, 'inspection_supplement');
    await inspect(page);
  }
  await decide(page, 'inspection_accept');
}
export async function finish(page: Page) {
  await decide(page, 'supplier_balance');
  await expect(page.getByRole('heading', { name: '验收入库完成，等待后续履约。' })).toBeVisible();
}
