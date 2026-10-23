import { expect, type Page } from '@playwright/test';
import { choose, next, review, continueReview } from './inquiry-helpers';
import {
  start,
  acceptPi,
  funding,
  production,
  clearInspection,
  finish,
  decide,
  checkAll,
} from './procurement-helpers';
import { installSeed, shippingSeed } from './event-helpers';
export async function seed(
  page: Page,
  risk: 'none' | 'customs' | 'rollover',
  _plan = 'steady',
  term = 'fob',
) {
  await installSeed(page, shippingSeed(risk, term));
}
export async function arrive(page: Page, options: Parameters<typeof start>[1] = {}) {
  await start(page, options);
  await acceptPi(page);
  await funding(page);
  if (options.payment === 'lc') {
    await choose(page, 'funding_return');
    await next(page);
    await decide(page, 'funding_lc_repair');
    await funding(page);
  }
  await production(page);
  await clearInspection(page);
  await finish(page);
  await choose(page, 'continue_logistics');
  await review(page);
  await continueReview(page);
  await expect(page).toHaveURL(/#\/logistics$/);
  await options.checkpoint?.(6);
}
export async function select(page: Page, plan = 'steady', term = 'fob') {
  await decide(page, 'plan_' + plan);
  await decide(page, 'insurance_' + (term === 'cif' ? 'basic' : 'buyer'));
}
export async function declaration(page: Page, correct = true) {
  if (correct) {
    const quantity = await page.locator('[data-source-field="quantity"]').innerText();
    await page
      .getByLabel('数量（件）草稿', { exact: true })
      .fill(quantity.replace('合同源记录：', ''));
  }
  await checkAll(page);
  await decide(page, 'declaration_submit');
}
export async function dispatch(page: Page) {
  await decide(page, 'logistics_book');
  await decide(page, 'logistics_dispatch');
}
export async function deliver(page: Page) {
  await decide(page, 'logistics_deliver');
  await expect(page.getByRole('heading', { name: '约定交付已完成，尾款仍待核验。' })).toBeVisible();
}
