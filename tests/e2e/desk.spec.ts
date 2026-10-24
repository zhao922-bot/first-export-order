import { test, expect, type Page, type Locator } from '@playwright/test';
import { installSeed, shippingSeed } from './event-helpers';
import { saved } from './procurement-helpers';
import { inDesk } from './desk-helpers';
import oldSave from '../fixtures/visual-v020-paid-save.json' with { type: 'json' };

test.setTimeout(60000);

async function fixed(page: Page) {
  const viewport = await page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
    h: document.documentElement.scrollHeight,
    w: document.documentElement.scrollWidth,
    ih: innerHeight,
    iw: innerWidth,
  }));
  expect(viewport).toMatchObject({ x: 0, y: 0 });
  expect(viewport.h).toBeLessThanOrEqual(viewport.ih);
  expect(viewport.w).toBeLessThanOrEqual(viewport.iw);
  const r = await page.locator('.desk-pagination:visible').boundingBox();
  const hud = await page.getByTestId('cash').boundingBox();
  expect(r!.y + r!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const scene = await page.locator('.story-stage').boundingBox();
  const pane = await page.locator('.desk-pages:visible').boundingBox();
  if (scene && pane) {
    if (page.viewportSize()!.width >= 1000) expect(scene.x + scene.width).toBeLessThan(pane.x);
    else expect(scene.y + scene.height).toBeLessThan(pane.y);
  }
  expect(hud!.y).toBeGreaterThanOrEqual(0);
}
async function turnTo(page: Page, target: Locator) {
  const pages = page.locator('.desk-pages:visible');
  for (let i = 0; i < 60; i++) {
    const fits = await target.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        p = el.closest('.desk-page-clip')!.getBoundingClientRect();
      return r.top >= p.top && r.bottom <= p.bottom;
    });
    if (fits) return;
    const next = pages.getByRole('button', { name: '下一页', exact: true });
    await expect(next).toBeEnabled();
    await next.click();
  }
  throw new Error('分页没有呈现目标操作');
}

test('竖屏固定工作台：真实翻页选择、数值动画、复盘与刷新无重复扣费', async ({ page }, info) => {
  if (info.project.name.includes('mobile')) await page.setViewportSize({ width: 390, height: 844 });
  await installSeed(page, shippingSeed('none'));
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await expect(page.locator('.fixed-desk')).toBeVisible();
  await turnTo(page, page.getByRole('button', { name: /选择500ml 保温杯/ }));
  const top = await page.getByTestId('cash').boundingBox();
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await expect(page.locator('.supplier-card')).toHaveCount(3);
  await expect(page.locator('.consequence')).toHaveCount(0);
  await turnTo(page, page.getByRole('button', { name: '选择恒信制造', exact: true }));
  await page.getByRole('button', { name: '选择恒信制造', exact: true }).click();
  await expect(page.locator('.mentor-review')).toBeVisible();
  await turnTo(page, page.locator('.mentor-review button.primary'));
  await page.locator('.mentor-review button.primary').click();
  const pay = page.getByRole('button', { name: /支付样品核验费并保留结果/ });
  await turnTo(page, pay);
  await pay.click();
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await expect(page.locator('[data-resource="cash"] .hud-delta')).toHaveText('−¥200.00');
  // A trailing card margin must not produce a second, entirely empty page.
  if (info.project.name.includes('mobile'))
    await expect(page.locator('.desk-pages:visible')).toHaveAttribute('data-pages', '1');
  expect((await page.getByTestId('cash').boundingBox())!.y).toBe(top!.y);
  await page.screenshot({ path: info.outputPath('fixed-desk-paid.png') });
  const paid = await saved(page);
  await page.reload();
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await expect(page.locator('.hud-delta')).toHaveCount(0);
  expect(await saved(page)).toEqual(paid);
  await fixed(page);
  await (await inDesk(page.getByRole('button', { name: /进入第 2 关/ }))).click();
  await expect(page).toHaveURL(/#\/mail$/);
  await fixed(page);
});

test('320px、短视口、键盘逐项定位报价与草稿恢复', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  const field = page.getByLabel('汇率 E', { exact: true });
  await (await inDesk(field)).fill('7.35');
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  const before = await saved(page);
  await page.reload();
  await expect(field).toHaveValue('7.35');
  expect(await saved(page)).toEqual(before);
  // Android/iOS keyboards may change only visualViewport, leaving media queries at 568px.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 340 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.fixed-desk')).toHaveClass(/desk-keyboard/);
  await (await inDesk(field)).focus();
  const pager = await page.locator('.desk-pagination:visible').boundingBox();
  expect(pager!.y + pager!.height).toBeLessThanOrEqual(340);
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await page.setViewportSize({ width: 320, height: 360 });
  await (await inDesk(field)).focus();
  await fixed(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 800, height: 600 });
  await (await inDesk(field)).focus();
  await fixed(page);
});

test('旧版付款后存档停在原位置；仅确认后进入复盘，动效不重放', async ({ page }) => {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('first-export.slice.v2:auto:head'))
      localStorage.setItem('first-export.slice.v1', JSON.stringify(s));
  }, oldSave.payload.session);
  await page.goto('/#/supplier');
  await expect(page.locator('.legacy-feedback')).toBeVisible();
  expect(await saved(page)).toEqual(oldSave.payload.session);
  await expect(page.locator('.hud-delta')).toHaveCount(0);
  await (await inDesk(page.getByRole('button', { name: /接着处理/ }))).click();
  await expect(page.locator('.mentor-review')).toBeVisible();
  const next = await saved(page);
  expect(next.snapshot.journal).toEqual(oldSave.payload.session.snapshot.journal);
  expect(next.snapshot.story.rngState).toEqual(oldSave.payload.session.snapshot.story.rngState);
});
test('新增校核错误改变表单高度后，当前输入框仍完整留在可见页', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  const first = page.getByLabel('每件预计退税（CNY/件）', { exact: true });
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-invalid', 'true');
  await (await inDesk(first)).fill('0');
  const before = await saved(page);
  const next = page.locator('.desk-pages:visible .desk-pagination button').last();
  if (await next.isEnabled()) await next.click();
  await first.focus();
  await expect
    .poll(async () =>
      first.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.closest('.desk-page-clip')!.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
      }),
    )
    .toBe(true);
  expect(await saved(page)).toEqual(before);
});

test('Windows 高缩放宽屏低高度保留角色列，操作区不留空白行', async ({ page }) => {
  await page.setViewportSize({ width: 1126, height: 557 });
  await page.goto('/');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await expect(page.locator('.story-stage')).toBeVisible();
  await expect(page.locator('.story-stage .character-crop img')).toHaveJSProperty(
    'naturalWidth',
    1536,
  );
  const scene = await page.locator('.story-stage').boundingBox();
  const pane = await page.locator('.desk-pages:visible').boundingBox();
  expect(scene!.height).toBeGreaterThan(150);
  expect(pane!.y).toBeLessThan(300);
  await fixed(page);
  await turnTo(page, page.getByRole('button', { name: /选择500ml 保温杯/ }));
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await expect(page.locator('.supplier-card')).toHaveCount(3);
  await fixed(page);
});
