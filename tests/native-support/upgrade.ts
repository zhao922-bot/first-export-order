import { expect, type Page } from '@playwright/test';
import { startInquiry, resolveMail, selectLead } from '../e2e/inquiry-helpers';
import { saved } from '../e2e/procurement-helpers';

/** Create a real old-version save through business UI, including a paid fee and RNG history. */
export async function createLegacyProgress(page: Page) {
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await startInquiry(page);
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await resolveMail(page, 'fraud');
  await selectLead(page, 'customer_c');
  await page.getByLabel('每件预计退税（CNY/件）', { exact: true }).fill('2.23');
  const session = await saved(page);
  expect(session.snapshot.story.stage).toBe(3);
  expect(session.snapshot.player.cashCnyFen).toBe(9_980_000);
  return {
    session,
    guide: await page.evaluate(() => localStorage.getItem('first-export.onboarding.v1')),
  };
}

export async function assertVisualScene(page: Page, stage: number) {
  const scenes = ['samples', 'inbox', 'quote', 'meeting', 'warehouse', 'harbor', 'documents'];
  await expect(page.locator('.story-stage')).toHaveAttribute('data-scene', scenes[stage - 1]!);
  await expect(page.locator('.story-stage .character-crop img')).toHaveJSProperty(
    'naturalWidth',
    1536,
  );
  const before = await saved(page);
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  expect(
    await page
      .locator('.character-crop')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(await saved(page)).toEqual(before);
  await page.getByLabel('界面动效', { exact: true }).selectOption('system');
  expect(await saved(page)).toEqual(before);
}

export async function assertLegacyProgress(
  page: Page,
  before: Awaited<ReturnType<typeof createLegacyProgress>>,
) {
  await page.getByRole('button', { name: /继续本地进度/ }).click();
  expect(await saved(page)).toEqual(before.session);
  expect(await page.evaluate(() => localStorage.getItem('first-export.onboarding.v1'))).toBe(
    before.guide,
  );
  await expect(page.getByLabel('每件预计退税（CNY/件）', { exact: true })).toHaveValue('2.23');
  await assertVisualScene(page, 3);
}
