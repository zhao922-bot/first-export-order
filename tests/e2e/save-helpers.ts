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
/** Hold the real same-origin write mutex to exercise slow commits deterministically. */
export async function holdWrites(page: Page) {
  await waitForSave(page);
  const blocker = await page.context().newPage();
  await blocker.goto(new URL('/save-test-lock.txt', page.url()).href);
  await blocker.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('first-export-storage-mutex', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('mutex', 'readwrite');
          const state = window as unknown as { holdWrites: boolean };
          state.holdWrites = true;
          const pump = () => {
            const pending = transaction.objectStore('mutex').get('writer');
            pending.onsuccess = () => {
              resolve();
              if (state.holdWrites) pump();
            };
          };
          transaction.oncomplete = () => db.close();
          pump();
        };
      }),
  );
  await page.bringToFront();
  return async () => {
    if (blocker.isClosed()) return;
    await blocker.close();
    await page.bringToFront();
  };
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
