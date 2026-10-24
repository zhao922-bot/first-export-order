import { expect, type Locator, type Page } from '@playwright/test';
import { waitForSave } from './save-helpers';

/** Keyboard/focus accessibility also reveals controls on a paginated business sheet. */
export async function inDesk(locator: Locator): Promise<Locator> {
  await locator.waitFor({ state: 'attached', timeout: 15000 });
  const pane = await locator.evaluate((el) =>
    el.closest('.desk-pages')?.getAttribute('aria-label'),
  );
  if (pane) {
    const page = locator.page();
    const tab = page.locator('.desk-tabs').getByRole('button', { name: pane, exact: true });
    if ((await tab.count()) && (await tab.getAttribute('aria-pressed')) !== 'true')
      await tab.click();
    // A persistence transaction can briefly disable a choice. focus() on a
    // disabled control does nothing, so wait before asking the pager to reveal it.
    await expect(locator).toBeEnabled();
    await locator.focus();
    await expect
      .poll(async () =>
        locator.evaluate((el) => {
          const clip = el.closest('.desk-page-clip')?.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return !clip || (r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1);
        }),
      )
      .toBe(true);
  }
  return locator;
}
export async function acknowledge(page: Page) {
  await waitForSave(page);
  // Historical builds do not expose data-saving. Their async choice may still
  // be committing when the click returns, so wait for the expected receipt.
  if (!(await page.locator('.fixed-desk').count())) {
    await page.locator('.consequence button.primary').waitFor({ state: 'visible', timeout: 15000 });
  }
  const legacy = page.locator('.consequence button.primary, .legacy-feedback button.primary');
  if (await legacy.count()) await (await inDesk(legacy)).click();
  await waitForSave(page);
}
