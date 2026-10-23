import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importSave } from '../../src/persistence/sliceSave';
import { eventPack } from '../fixtures/economy';
import { installSeed, shippingSeed } from './event-helpers';
import { next, review, continueReview } from './inquiry-helpers';
import { saved } from './procurement-helpers';

const oldSave = readFileSync('tests/fixtures/visual-v020-paid-save.json', 'utf8');
const oldGame = importSave(oldSave, eventPack);
const portrait = (page: Page) =>
  page.locator('.story-stage .character-portrait, .mentor-review .character-portrait');
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function aboveFold(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test('手机首屏入口、目录键盘开合、图鉴及引导定位', async ({ page }, info) => {
  const mobile = info.project.name.includes('mobile');
  if (mobile) await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.locator('.landing-stage img')).toHaveJSProperty('naturalWidth', 1536);
  await aboveFold(page, '[data-guide="start"]');
  const stageBox = await page.locator('.landing-stage').boundingBox();
  const portraitBox = await page.locator('.landing-stage .character-portrait').boundingBox();
  expect(portraitBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
  await page.screenshot({
    path: info.outputPath('home-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  if (mobile) {
    const menu = page.getByRole('button', { name: '旅程目录', exact: true });
    await expect(page.getByRole('navigation', { name: '关卡进度' })).toBeHidden();
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('navigation', { name: '关卡进度' }).locator('.nav-step'),
    ).toHaveCount(7);
    await expect(page.getByRole('link', { name: '试玩记录与知识测评', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize({ width: 320, height: 568 });
    await aboveFold(page, '[data-guide="start"]');
    await noOverflow(page);
    await page.setViewportSize({ width: 360, height: 800 });
  }
  await page.getByRole('button', { name: '定位当前操作', exact: true }).click();
  await expect(page.locator('[data-guide="start"]')).toBeFocused();
  await page.keyboard.press('Enter');
  for (const target of ['progress', 'resources', 'glossary']) {
    await page.getByRole('button', { name: '定位当前操作', exact: true }).click();
    await expect(
      page.locator(`[data-guide="${target}"].onboarding-highlight`).first(),
    ).toBeVisible();
    await page
      .getByRole('button', { name: target === 'glossary' ? '开始动手' : '下一项说明', exact: true })
      .click();
  }
  await noOverflow(page);
});

for (const [id, name] of [
  ['cup_500', '500ml 保温杯'],
  ['tws', '无线耳机'],
  ['yoga', '瑜伽服套装'],
] as const) {
  test(`样品陈列与表情随 ${name} 决策变化，付费与刷新保持一致`, async ({ page }, info) => {
    await installSeed(page, shippingSeed('none'));
    await page.goto('/');
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    await page.getByRole('button', { name: /开始第 1 关/ }).click();
    await expect(portrait(page)).toHaveAttribute('data-expression', 'welcome');
    await expect(page.locator('.sample-steps [aria-current="step"]')).toHaveText(/认识产品/);
    await page.screenshot({
      path: info.outputPath('sample-preview.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: `选择${name} →`, exact: true }).click();
    await next(page);
    await expect(portrait(page)).toHaveAttribute('data-expression', 'thinking');
    await expect(page.locator('.sample-desk')).toHaveAttribute('data-product', id);
    const before = await saved(page);
    await page.reload();
    await expect(portrait(page)).toHaveAttribute('data-expression', 'thinking');
    expect(await saved(page)).toEqual(before);
    await page.locator('.supplier-card button').first().click();
    await review(page);
    await expect(portrait(page)).toHaveAttribute('data-expression', 'reflecting');
    await continueReview(page);
    await expect(portrait(page)).toHaveAttribute('data-expression', 'explaining');
    await expect(page.locator('.sample-steps [aria-current="step"]')).toHaveText(/核验证据/);
    await page.getByRole('button', { name: /支付样品核验费并保留结果/ }).click();
    const paid = await saved(page);
    expect(paid.snapshot.player.cashCnyFen).toBe(9_980_000);
    await page.reload();
    expect(await saved(page)).toEqual(paid);
    await review(page);
    await expect(portrait(page)).toHaveAttribute('data-expression', 'encouraging');
    await expect(portrait(page).locator('img')).toHaveJSProperty('naturalWidth', 1536);
    await page.screenshot({
      path: info.outputPath('mentor-preview.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await noOverflow(page);
    await page.getByRole('button', { name: /进入第 2 关/ }).click();
    await expect(page).toHaveURL(/#\/mail$/);
    expect((await saved(page)).snapshot.player.cashCnyFen).toBe(9_980_000);
  });
}

test('旧本地槽恢复和旧 JSON 导入，表情不重抽、不重复扣费', async ({ page }, info) => {
  if (info.project.name.includes('mobile')) await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((session) => {
    if (!localStorage.getItem('first-export.slice.v2:auto:head'))
      localStorage.setItem('first-export.slice.v1', JSON.stringify(session));
  }, oldGame.session);
  await page.goto('/');
  await aboveFold(page, '[data-guide="resume"]');
  await page.getByRole('button', { name: /继续本地进度/ }).click();
  await expect(page.locator('.consequence')).toBeVisible();
  expect(await saved(page)).toEqual(oldGame.session);
  await page.reload();
  expect(await saved(page)).toEqual(oldGame.session);
  await page.getByRole('link', { name: '存档与恢复', exact: true }).click();
  await page.getByLabel(/选择 JSON 存档/).setInputFiles({
    name: 'v0.2.0.json',
    mimeType: 'application/json',
    buffer: Buffer.from(oldSave),
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '确认载入此存档', exact: true }).click();
  await expect(page).toHaveURL(/#\/supplier$/);
  expect(await saved(page)).toEqual(oldGame.session);
  await review(page);
  await expect(portrait(page)).toHaveAttribute('data-expression', 'encouraging');
  const reviewed = await saved(page);
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  await page.reload();
  expect(await saved(page)).toEqual(reviewed);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  await page.screenshot({
    path: info.outputPath('restored-save.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /进入第 2 关/ }).click();
  expect((await saved(page)).snapshot.player.cashCnyFen).toBe(9_980_000);
});

test('表情图集加载失败回退原林姐；风险复盘保留关切而不预言质量结果', async ({ page }) => {
  await installSeed(page, shippingSeed('none'));
  await page.route('**/assets/portraits/lin-expressions-v1*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.landing-stage img')).toHaveAttribute(
    'src',
    /cast-v1-delivery\.webp$/,
  );
  await expect(page.locator('.landing-stage img')).toHaveJSProperty('naturalWidth', 1536);
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await next(page);
  await page.getByRole('button', { name: '选择利达工贸', exact: true }).click();
  await review(page);
  await expect(portrait(page)).toHaveAttribute('data-expression', 'concerned');
  await expect(portrait(page)).toHaveAttribute('data-portrait-fallback', 'true');
  await expect(page.locator('.mentor-copy')).toContainText('不预言必然出事');
  await expect(page.locator('.mentor-review button.primary')).toBeEnabled();
});
