import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { lanAddresses } from '../../scripts/local-playtest/server';
import { saved } from '../e2e/procurement-helpers';
import { next, review, continueReview, resolveMail, selectLead } from '../e2e/inquiry-helpers';

test('实际 LAN HTTP 无 randomUUID：前测、两关决策、刷新不重复扣款及手机指标下载', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const address = process.env.PLAYTEST_LAN_IP ?? lanAddresses()[0]?.address;
  expect(address, '需要真实私有 IPv4 网卡才能验证手机 HTTP；不能用 localhost 代替').toBeTruthy();
  const origin = `http://${address}:4187`,
    errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin + '/#/');
  expect(
    await page.evaluate(() => ({
      secure: isSecureContext,
      uuid: typeof crypto.randomUUID,
      random: typeof crypto.getRandomValues,
    })),
  ).toEqual({ secure: false, uuid: 'undefined', random: 'function' });
  await page.getByRole('button', { name: '前测并开始七关试玩', exact: true }).click();
  for (let i = 0; i < 6; i++) await page.locator('[data-answer-id]').first().click();
  await page.getByRole('link', { name: '继续当前关卡', exact: true }).click();
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await next(page);
  await page.getByRole('button', { name: '选择恒信制造', exact: true }).click();
  await review(page);
  await continueReview(page);
  await page.getByRole('button', { name: /支付样品核验费并保留结果/ }).click();
  const before = await saved(page);
  expect(before.snapshot.runId).toMatch(
    /^run\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  await page.reload();
  expect((await saved(page)).snapshot.journal).toEqual(before.snapshot.journal);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await review(page);
  await page.getByRole('button', { name: /进入第 2 关/ }).click();
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await resolveMail(page, 'fraud');
  await selectLead(page);
  await expect(page).toHaveURL(/#\/quote$/);
  const current = await saved(page);
  await page.reload();
  expect((await saved(page)).snapshot.story.rngState).toEqual(current.snapshot.story.rngState);
  expect((await saved(page)).snapshot.journal).toEqual(current.snapshot.journal);
  await page.goto(origin + '/#/playtest');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本地试玩指标 JSON', exact: true }).click();
  const data = JSON.parse(await readFile((await (await promise).path())!, 'utf8'));
  expect(data.runs).toHaveLength(1);
  expect(data.runs[0].pre.status).toBe('completed');
  expect(data.runs[0].completed).toEqual([1, 2]);
  expect(data.runs[0].runId).toBe(before.snapshot.runId);
  expect(data.runs[0].counts.quote_submitted ?? 0).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('lan-playtest.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('生产包无外网依赖；根地址与 hash 路由可刷新；其他 origin 不共享浏览器数据', async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await expect(page).toHaveURL(/#\/quote$/);
  const before = await saved(page);
  await page.reload();
  expect((await saved(page)).snapshot.runId).toBe(before.snapshot.runId);
  await page.evaluate(() => localStorage.setItem('distribution-origin-proof', 'only-loopback'));
  const address = process.env.PLAYTEST_LAN_IP ?? lanAddresses()[0]?.address;
  expect(address).toBeTruthy();
  await page.unroute('**/*');
  await page.goto(`http://${address}:4187/#/`);
  expect(await page.evaluate(() => localStorage.getItem('distribution-origin-proof'))).toBeNull();
  await expect(page.getByRole('button', { name: '继续本地进度 →', exact: true })).toHaveCount(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
