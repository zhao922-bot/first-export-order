import { inDesk } from '../e2e/desk-helpers';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { begin, documents, correct, end } from '../e2e/collection-helpers';
import { decide, saved } from '../e2e/procurement-helpers';

test.beforeEach(async ({ request, baseURL }) => {
  const commit = process.env.EXPECTED_COMMIT;
  if (!commit) return;
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get(
            new URL(`deployment.json?commit=${commit}`, baseURL!).href,
          );
          return response.ok() ? (await response.json()).commit : null;
        } catch {
          return null;
        }
      },
      { timeout: 120_000, intervals: [2500] },
    )
    .toBe(commit);
});

async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const shortButtons = await page
    .locator('button, .brand, a.nav-step, .save-link')
    .evaluateAll((items) =>
      items
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 43.5;
        })
        .map((item) => item.textContent?.trim()),
    );
  expect(shortButtons).toEqual([]);
  const numbers = await page.locator('.resource-hud strong').evaluateAll((items) =>
    items.map((item) => {
      const range = document.createRange();
      range.selectNodeContents(item);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (const [i, a] of numbers.entries())
    for (const b of numbers.slice(i + 1))
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true,
      );
}

test('公开目录、角色资源、窄屏和横屏正常', async ({ page, baseURL }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = new URL(baseURL!);
  const badResponses: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).origin === root.origin && response.status() >= 400)
      badResponses.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.landing-stage .character-crop img')).toHaveJSProperty(
    'naturalWidth',
    1536,
  );
  const asset = await page.locator('.landing-stage img').getAttribute('src');
  expect(new URL(asset!, page.url()).pathname).toBe(
    `${root.pathname}assets/portraits/lin-expressions-v1-delivery.webp`,
  );
  await expect(page.getByRole('button', { name: /开始第 1 关/ })).toBeVisible();
  const heroBox = await page.locator('.landing-stage').boundingBox();
  const portraitBox = await page.locator('.landing-stage .character-portrait').boundingBox();
  expect(portraitBox!.y).toBeGreaterThanOrEqual(heroBox!.y);
  const startBox = await page.locator('[data-guide="start"]').boundingBox();
  expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await layout(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.getByRole('button', { name: /跳过引导/ }).click();
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 400 });
  await (await inDesk(page.getByLabel('每件预计退税（CNY/件）', { exact: true }))).fill('2.23');
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  await layout(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await layout(page);
  expect(errors).toEqual([]);
  expect(badResponses).toEqual([]);
});

test('真实七关逐关刷新，账本、随机状态及结局保持一致', async ({ page, context, baseURL }, info) => {
  // Seven chapters now exercise focus-based pagination for every business control.
  // Windows WebKit takes more driver round trips; keep every assertion and give this flow room.
  if (info.project.name === 'iphone-webkit') test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const stages: number[] = [];
  await begin(page, {
    checkpoint: async (stage) => {
      const before = await saved(page);
      await page.reload();
      await expect(page.locator('.work-area h1')).toBeVisible();
      expect(await saved(page)).toEqual(before);
      expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname);
      await expect(page.locator('.story-stage .character-crop img')).toHaveJSProperty(
        'naturalWidth',
        1536,
      );
      await layout(page);
      stages.push(stage);
      if (stage === 2) expect(before.snapshot.player.cashCnyFen).toBe(9_980_000);
      if (stage === 5)
        await page.screenshot({ path: info.outputPath('procurement.png'), fullPage: true });
    },
  });
  expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  const completed = await saved(page);
  await layout(page);
  await page.screenshot({ path: info.outputPath('ending.png'), fullPage: true });
  expect(errors).toEqual([]);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./#/ending');
  await expect(reopened.getByRole('heading', { name: /七关流程完成：/ })).toBeVisible();
  expect(await saved(reopened)).toEqual(completed);
});

test('报价草稿、动效偏好、关页重开及空白上下文 JSON 迁移', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /跳过引导/ }).click();
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  const rebate = page.getByLabel('每件预计退税（CNY/件）', { exact: true });
  await (await inDesk(rebate)).fill('2.23');
  await (await inDesk(page.getByLabel('汇率 E', { exact: true }))).fill('7.50');
  await page.getByLabel('界面动效', { exact: true }).selectOption('off');
  const before = await saved(page);
  await page.reload();
  await expect(rebate).toHaveValue('2.23');
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  expect(await saved(page)).toEqual(before);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./');
  await reopened.getByRole('button', { name: /继续本地进度/ }).click();
  expect(await saved(reopened)).toEqual(before);
  await expect(reopened.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(reopened.locator('.app-shell')).toHaveAttribute('data-motion', 'off');
  await reopened.getByRole('link', { name: '存档与恢复', exact: true }).click();
  const downloading = reopened.waitForEvent('download');
  await reopened.getByRole('button', { name: '导出当前进度', exact: true }).click();
  const download = await downloading;
  const contents = await readFile((await download.path())!);
  const fresh = await browser.newContext({ baseURL: baseURL! });
  try {
    const imported = await fresh.newPage();
    await imported.goto('./#/recovery');
    await imported.getByLabel(/选择 JSON 存档/).setInputFiles({
      name: 'pages-save.json',
      mimeType: 'application/json',
      buffer: contents,
    });
    await imported.getByRole('button', { name: '确认载入此存档' }).click();
    await expect(imported).toHaveURL(/#\/quote$/);
    expect(await saved(imported)).toEqual(before);
    await expect(imported.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
    await imported.reload();
    expect(await saved(imported)).toEqual(before);
    await expect(imported.getByLabel('每件预计退税（CNY/件）', { exact: true })).toHaveValue(
      '2.23',
    );
  } finally {
    await fresh.close();
  }
});
