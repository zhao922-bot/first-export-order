import { inDesk } from './desk-helpers';
import { expect, type Page } from '@playwright/test';
import { installSeed } from './event-helpers';
import { seed, arrive, select, declaration, dispatch, deliver } from './logistics-helpers';
import { choose, next, review, continueReview } from './inquiry-helpers';
import { decide, saved } from './procurement-helpers';
export async function begin(page: Page, options: Parameters<typeof arrive>[1] = {}) {
  if (options.eventSeed) await installSeed(page, options.eventSeed);
  else await seed(page, 'none');
  await arrive(page, options);
  await select(page, 'steady', options.term ?? 'fob');
  await declaration(page);
  await dispatch(page);
  if (await page.locator('[data-choice-id="risk_clear"]').count()) {
    await choose(page, 'risk_clear');
    await next(page);
  }
  await deliver(page);
  await choose(page, 'continue_collection');
  await review(page);
  await continueReview(page);
  await expect(page).toHaveURL(/#\/documents$/);
  await options.checkpoint?.(7);
}
export async function documents(page: Page) {
  await choose(page, 'documents_start');
  await next(page);
}
/** 只比较屏幕上的草稿与源记录；不读题库故障列表或从存档注入答案。 */
export async function correct(page: Page) {
  for (const tab of await page.locator('[data-document-id]').all()) {
    await (await inDesk(tab)).click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    for (const row of await page.locator('[data-doc-key]').all()) {
      const key = (await row.getAttribute('data-doc-key'))!,
        source = await page.locator(`[data-document-source="${key.split('.')[1]}"]`).innerText(),
        draft = await row.locator('.document-value').innerText();
      const mark = row.getByRole('checkbox');
      if (draft !== source) {
        await (await inDesk(mark)).check();
        await (await inDesk(row.getByRole('textbox'))).fill(source);
      } else if (await mark.isChecked()) await (await inDesk(mark)).uncheck();
    }
  }
  await decide(page, 'documents_submit');
  await expect(page.getByRole('heading', { name: '单据校核通过' })).toBeVisible();
  await choose(page, 'documents_accept');
  await next(page);
}
export async function tax(page: Page, wrong = false) {
  for (const row of await page.locator('[data-tax-field]').all()) {
    const missing = (await row.innerText()).includes('记录缺失');
    await (
      await inDesk(row.getByRole('combobox'))
    ).selectOption(wrong || !missing ? 'verified' : 'missing');
  }
  await decide(page, 'tax_verify');
}
export async function end(page: Page, eligible = true) {
  await tax(page);
  await decide(page, eligible ? 'tax_receive' : 'tax_ineligible');
  await expect(page.getByRole('heading', { name: /七关流程完成：/ })).toBeVisible();
  const done = await saved(page);
  expect(done.collection!.closed).toBe(true);
  expect(done.snapshot.story.stage).toBe(7);
  expect(done.collection!.taxEligible).toBe(eligible);
  await page.reload();
  await expect(page).toHaveURL(/#\/ending$/);
  await expect(page.getByRole('heading', { name: /七关流程完成：/ })).toBeVisible();
  expect((await saved(page)).snapshot.journal).toEqual(done.snapshot.journal);
}
