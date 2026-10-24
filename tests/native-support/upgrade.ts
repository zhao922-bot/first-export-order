import { expect, type Page } from '@playwright/test';
import { startInquiry, resolveMail, selectLead } from '../e2e/inquiry-helpers';
import { saved } from '../e2e/procurement-helpers';
import { inDesk } from '../e2e/desk-helpers';

/** Create a real old-version save through business UI, including a paid fee and RNG history. */
export async function createLegacyProgress(page: Page) {
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await startInquiry(page);
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await resolveMail(page, 'fraud');
  await selectLead(page, 'customer_c');
  await (await inDesk(page.getByLabel('每件预计退税（CNY/件）', { exact: true }))).fill('2.23');
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
  if (await page.locator('.fixed-desk').count()) await assertFixedDesk(page);
}

/** Check the actual native viewport, including an Android keyboard resize. */
export async function assertFixedDesk(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const viewport = window.visualViewport;
        const height = viewport?.height ?? innerHeight;
        const pager = document.querySelector('.desk-pages:not([hidden]) .desk-pagination');
        const visiblePager =
          [...document.querySelectorAll('.desk-pagination')].find(
            (el) => el.getBoundingClientRect().height > 0,
          ) ?? pager;
        const bottom = visiblePager?.getBoundingClientRect().bottom ?? Infinity;
        return (
          scrollX === 0 &&
          scrollY === 0 &&
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight &&
          bottom <= height + 1
        );
      }),
    )
    .toBe(true);
  const dimensions = await page.evaluate(() => {
    const scene = document.querySelector('.story-stage')!.getBoundingClientRect();
    const pane = [...document.querySelectorAll('.desk-pages')]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.height > 0)!;
    return {
      wide: innerWidth >= 1000,
      tallEnoughForScene: (visualViewport?.height ?? innerHeight) >= 500,
      scene: { right: scene.right, bottom: scene.bottom, height: scene.height },
      pane: { x: pane.x, y: pane.y },
    };
  });
  if (dimensions.wide && dimensions.tallEnoughForScene) {
    await expect(page.locator('.story-stage')).toBeVisible();
    expect(dimensions.scene.height).toBeGreaterThan(100);
  }
  if (dimensions.scene.height > 0) {
    if (dimensions.wide) expect(dimensions.scene.right).toBeLessThan(dimensions.pane.x);
    else expect(dimensions.scene.bottom).toBeLessThan(dimensions.pane.y);
  }
}

/** Real page buttons, a paid operation and a reload: no status popup or replayed charge. */
export async function exerciseFixedDesk(page: Page) {
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  const turnTo = async (name: string | RegExp) => {
    const target = page.getByRole('button', { name, exact: typeof name === 'string' });
    for (let i = 0; i < 60; i++) {
      if (
        await target.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            clip = el.closest('.desk-page-clip')!.getBoundingClientRect();
          return r.top >= clip.top && r.bottom <= clip.bottom;
        })
      ) {
        await target.click();
        return;
      }
      await page
        .locator('.desk-pages:visible')
        .getByRole('button', { name: '下一页', exact: true })
        .click();
    }
    throw Error('Native pagination failed to reveal the operation');
  };
  await assertFixedDesk(page);
  await turnTo(/选择500ml 保温杯/);
  await expect(page.locator('.supplier-card')).toHaveCount(3);
  await expect(page.locator('.consequence')).toHaveCount(0);
  await turnTo('选择恒信制造');
  await (await inDesk(page.locator('.mentor-review button.primary'))).click();
  await turnTo(/支付样品核验费并保留结果/);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await expect(page.locator('[data-resource="cash"] .hud-delta')).toHaveText('−¥200.00');
  const before = await saved(page);
  await page.reload();
  expect(await saved(page)).toEqual(before);
  await expect(page.locator('.hud-delta')).toHaveCount(0);
  await assertFixedDesk(page);
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
