import { expect, test } from '@playwright/test';
import { begin, documents, correct, end } from './collection-helpers';
import { decide, saved } from './procurement-helpers';
import { next, review } from './inquiry-helpers';

test('七关场景、真实客户形象、林姐结局复盘；动效不改变账本或 RNG', async ({ page }, info) => {
  test.setTimeout(180_000);
  const scenes = ['samples', 'inbox', 'quote', 'meeting', 'warehouse', 'harbor', 'documents'];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await begin(page, {
    payment: 'lc',
    term: 'cif',
    checkpoint: async (stage) => {
      const scene = page.locator('.story-stage');
      await expect(scene).toHaveAttribute('data-scene', scenes[stage - 1]!);
      await expect(scene.locator('.character-crop img')).toHaveJSProperty('naturalWidth', 1536);
      if (stage === 4) {
        const session = await saved(page);
        await expect(scene.locator('.character-portrait')).toHaveAttribute(
          'data-actor',
          session.snapshot.order.customerId!,
        );
      }
      const before = await saved(page);
      await page.getByLabel('界面动效', { exact: true }).selectOption('off');
      expect(await saved(page)).toEqual(before);
      await page.getByLabel('界面动效', { exact: true }).selectOption('system');
      expect(await saved(page)).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await scene.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`scene-${stage}.png`) });
    },
  });
  await documents(page);
  await correct(page);
  await decide(page, 'lc_present');
  await decide(page, 'lc_collect');
  await end(page);
  await expect(page.locator('.mentor-ending [data-actor="mentor_lin"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('动效开关、系统偏好实时切换、刷新、键盘与完整文案不等待动画', async ({ page }, info) => {
  if (info.project.name.includes('mobile')) await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.landing-stage .character-crop img')).toHaveJSProperty(
    'naturalWidth',
    1536,
  );
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'on');
  expect(
    await page
      .locator('.character-crop')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('character-breathe');
  await page.locator('.landing-intro').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('home.png') });
  await page.getByRole('button', { name: /跳过引导/ }).click();
  await page.getByRole('button', { name: /开始第 1 关/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await next(page);
  await page.getByRole('button', { name: '选择恒信制造', exact: true }).click();
  await review(page);
  await expect(page.locator('.mentor-review .mentor-copy')).not.toBeEmpty();
  await expect(page.locator('.mentor-review button')).toBeEnabled();
  const before = await saved(page);
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  expect(
    await page.locator('.character-crop').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(await saved(page)).toEqual(before);
  await page.getByLabel('界面动效', { exact: true }).selectOption('system');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  expect(
    await page.locator('.character-crop').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'on');
  await page.locator('.mentor-review').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('mentor.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await saved(page)).toEqual(before);
});

test('离线素材故障与偏好写入失败保留可操作游戏和清晰说明', async ({ page }) => {
  await page.route('**/assets/portraits/cast-v1.png', (route) => route.abort());
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'first-export.presentation.motion.v1') throw new Error('blocked');
      original.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page.locator('.character-fallback')).toHaveText('林');
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  await expect(page.getByText('动效设置仅本次生效，未能保存。')).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await expect(page.locator('.consequence')).toBeVisible();
  expect((await saved(page)).snapshot.order.productId).toBe('cup_500');
});
