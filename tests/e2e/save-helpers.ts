import type { SliceSession } from '../../src/engine/slice/session';
import { expect, type Page } from '@playwright/test';
export async function waitForSave(page: Page) {
  await expect(page.locator('.app-shell')).toBeVisible();
  // The landing button also covers the time before the lazy store exists.
  await page.waitForFunction(
    () =>
      !document.querySelector('.landing-primary button:disabled') &&
      document.querySelector('.app-shell')?.getAttribute('data-saving') !== 'true',
    undefined,
    { polling: 'raf' },
  );
}
/** 可在 page.evaluate 内独立执行，读取已提交槽；不修改游戏状态。 */
export function readBrowserSession(): SliceSession {
  const prefix = 'first-export.slice.v2:auto:';
  const head = localStorage.getItem(prefix + 'head');
  if (!head) return JSON.parse(localStorage.getItem('first-export.slice.v1')!) as SliceSession;
  const token = JSON.parse(head) as { side: string };
  return (
    JSON.parse(localStorage.getItem(prefix + token.side)!) as { payload: { session: SliceSession } }
  ).payload.session;
}
