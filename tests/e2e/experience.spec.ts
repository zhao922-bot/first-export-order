import { test, expect } from '@playwright/test';
import { startInquiry, readMail, choose } from './inquiry-helpers';
import { start, acceptPi, funding, production, saved } from './procurement-helpers';
import { begin, documents } from './collection-helpers';
test.setTimeout(150000);

test('受限网络冷启动可先操作文字，角色随后加载且不请求全部图集', async ({ page }, info) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 128 * 1024,
    uploadThroughput: 64 * 1024,
    connectionType: 'cellular3g',
  });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  const started = Date.now();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /开始第 1 关/ })).toBeVisible({ timeout: 30000 });
  const interactiveMs = Date.now() - started;
  expect(
    await page.locator('.landing-stage img').evaluate((img) => (img as HTMLImageElement).complete),
  ).toBe(false);
  await page.getByRole('button', { name: /跳过引导/ }).click();
  await expect(page.locator('.landing-stage img')).toHaveJSProperty('complete', true, {
    timeout: 30000,
  });
  await expect(page.locator('.landing-stage img')).toHaveJSProperty('naturalWidth', 1536);
  const transfer = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/portraits/'))
      .map((entry) => ({
        durationMs: entry.duration,
        bytes: (entry as PerformanceResourceTiming).encodedBodySize,
      })),
  );
  expect(transfer[0]!.bytes).toBeLessThan(320_000);
  expect(transfer[0]!.durationMs).toBeGreaterThan(1000);
  expect(
    requested.filter((url) => /\/portraits\//.test(url)).map((url) => new URL(url).pathname),
  ).toEqual(['/assets/portraits/lin-expressions-v1-delivery.webp']);
  expect(requested.some((url) => /\/useSliceGame-.*\.js/.test(url))).toBe(false);
  await info.attach('network-simulation', {
    contentType: 'application/json',
    body: JSON.stringify({
      latencyMs: 150,
      downloadBytesPerSecond: 131072,
      uploadBytesPerSecond: 65536,
      interactiveMs,
      portraitReadyMs: Date.now() - started,
      transfer,
    }),
  });
  await cdp.detach();
});

test('延迟路由显示等待，资源失败可重试，保留已经保存的进度', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始第 1 关/ })).toBeVisible();
  expect(
    requested.some((url) => /\/(SliceWorkbench|EndingView|PlaytestView)-.*\.js/.test(url)),
  ).toBe(false);
  await page.route('**/assets/SupplierView-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await expect(page.locator('.route-notice')).toContainText('正在打开工作台');
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.unroute('**/assets/SupplierView-*.js');
  const before = await saved(page);
  await page.route('**/assets/GlossaryView-*.js', (route) => route.abort());
  await page.locator('[data-guide="glossary"]').click();
  await expect(page.locator('.route-error')).toContainText('页面资源暂时未加载成功');
  expect(await saved(page)).toEqual(before);
  await page.unroute('**/assets/GlossaryView-*.js');
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-guide="glossary"]').click();
  await expect(page).toHaveURL(/#\/glossary$/);
  await expect(page.locator('.route-error')).toHaveCount(0);
});

test('图片损坏逐级回退，读信和关闭动效不改账本', async ({ page }, info) => {
  await startInquiry(page);
  await readMail(page, 'buyer');
  const before = await saved(page);
  await page.route('**/assets/portraits/*.webp', (route) =>
    route.fulfill({ contentType: 'image/webp', body: 'broken' }),
  );
  await page.reload();
  const portrait = page.locator('.story-stage .character-portrait');
  await expect(portrait.locator('img')).toHaveAttribute('src', /cast-thinking-v1\.png$/);
  await expect(portrait.locator('img')).toHaveJSProperty('naturalWidth', 1536);
  expect(await saved(page)).toEqual(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.mail-open-icon span')).toHaveCSS('animation-name', 'none');
  await page
    .locator('.mail-message')
    .screenshot({ path: info.outputPath('mail-open.png'), animations: 'disabled' });
  await page.route('**/assets/portraits/*.png', (route) => route.abort());
  await page.reload();
  await expect(portrait.locator('.character-fallback')).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await choose(page, 'classify_buyer_buyer');
  await expect(page.locator('.ledger-entry')).toHaveAttribute('data-ledger-direction', 'none');
});

test('验货点选、键盘跳转和刷新均不重复付款，手机账本默认折叠', async ({ page }, info) => {
  const mobile = info.project.name.includes('mobile');
  if (mobile) await page.setViewportSize({ width: 360, height: 800 });
  await start(page);
  await acceptPi(page);
  await funding(page);
  await production(page);
  const before = await saved(page);
  const archive = page.locator('.context-archive');
  expect(await archive.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(!mobile);
  if (mobile) {
    await page.locator('.task-shortcut button').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#current-task')).toBeFocused();
    const rect = await page.locator('#current-task').boundingBox();
    expect(rect!.y).toBeGreaterThan(50);
    expect(rect!.y).toBeLessThan(110);
  }
  await page
    .locator('.inspection-map')
    .screenshot({ path: info.outputPath('inspection-map.png'), animations: 'disabled' });
  const point = page.locator('[data-inspection-point="material"]');
  await point.focus();
  await page.keyboard.press('Enter');
  const card = page.getByTestId('evidence-material');
  await expect(card).toBeFocused();
  await expect(card.locator('.evidence-copy')).toBeVisible();
  await expect(point).toHaveAttribute('data-viewed', 'true');
  await expect(card.getByRole('radio', { name: '符合', exact: true })).not.toBeChecked();
  await point.click();
  const viewed = await saved(page);
  expect(viewed.snapshot.journal).toEqual(before.snapshot.journal);
  expect(viewed.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
  await page.reload();
  expect(await saved(page)).toEqual(viewed);
  await expect(card.locator('.evidence-copy')).toBeVisible();
  if (mobile) await archive.locator(':scope > summary').click();
  await expect(page.getByRole('region', { name: '备货资金与交期' })).toBeVisible();
  expect(await saved(page)).toEqual(viewed);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('七关当前任务可直达；单据标记就近对照，草稿恢复不重抽', async ({ page }, info) => {
  const mobile = info.project.name.includes('mobile');
  if (mobile) await page.setViewportSize({ width: 360, height: 800 });
  await begin(page, {
    checkpoint: async (stage) => {
      if (!mobile) return;
      const before = await saved(page);
      await page.locator('.task-shortcut button').click();
      await expect(page.locator('#current-task')).toBeFocused();
      expect(await saved(page)).toEqual(before);
      if (stage === 6)
        await page.screenshot({ path: info.outputPath('task-mobile.png'), animations: 'disabled' });
    },
  });
  await documents(page);
  const field = page.locator('[data-doc-key="invoice.quantity"]');
  await expect(field.locator('.inline-source')).toHaveCount(0);
  await field.getByRole('checkbox').check();
  await expect(field).toHaveClass(/is-marked/);
  const source = await page.locator('[data-document-source="quantity"]').innerText();
  await expect(field.locator('.inline-source strong')).toHaveText(source);
  await expect(field.getByRole('textbox')).toHaveValue('');
  await field.getByRole('textbox').fill(source);
  const draft = await saved(page);
  await page.reload();
  expect(await saved(page)).toEqual(draft);
  await expect(field.getByRole('textbox')).toHaveValue(source);
  await field.screenshot({ path: info.outputPath('document-mark.png'), animations: 'disabled' });
  await field.getByRole('checkbox').uncheck();
  await expect(field.locator('.inline-source')).toHaveCount(0);
  expect((await saved(page)).snapshot.journal).toEqual(draft.snapshot.journal);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('首个脚本无法下载时仍有说明与刷新入口', async ({ page }) => {
  await page.route('**/assets/index-*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '出海第一单', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('正在准备工作台');
  await expect(page.getByRole('link', { name: '重新加载', exact: true })).toBeVisible();
  await page.unroute('**/assets/index-*.js');
  await page.getByRole('link', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('button', { name: /开始第 1 关/ })).toBeVisible();
});
