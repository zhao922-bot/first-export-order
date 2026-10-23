import { test, expect } from '@playwright/test';
import { collectionGame } from '../fixtures/collection';
import { pack } from '../fixtures/economy';
import { encodeSave } from '../../src/persistence/sliceSave';
import { readBrowserSession } from './save-helpers';
import { decide } from './procurement-helpers';
import { negotiationGame, toContract } from '../fixtures/negotiation';

const rebate = '每件预计退税（CNY/件）';
const headKey = 'first-export.slice.v2:auto:head';
async function practice(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await expect(page.getByLabel(rebate)).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
}

test('并发写入在同一事务内排队，冲突页不会覆盖已提交槽', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if ((window as unknown as { pauseSave: string | null }).pauseSave === k) {
        (window as unknown as { pauseSave: string | null }).pauseSave = null;
        // eslint-disable-next-line no-debugger -- Deterministic cross-tab commit interleaving.
        debugger;
      }
      original.call(this, k, v);
    };
  });
  await practice(page);
  const second = await context.newPage();
  await second.goto('/#/quote');
  await expect(second.getByLabel(rebate)).toBeVisible();
  await expect(second.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  const before = await page.evaluate(readBrowserSession);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Debugger.enable');
  const paused = new Promise<void>((resolve) => cdp.once('Debugger.paused', () => resolve()));
  await page.evaluate((key) => {
    const head = JSON.parse(localStorage.getItem(key)!);
    (window as unknown as { pauseSave: string }).pauseSave = key.replace(
      'head',
      head.side === 'a' ? 'b' : 'a',
    );
  }, headKey);
  await page.getByLabel(rebate).fill('1.11');
  try {
    await paused;
    await second.getByLabel(rebate).fill('2.22');
    // B has accepted an input intent, but cannot enter A's active commit.
    expect(await second.evaluate(readBrowserSession)).toEqual(before);
    await cdp.send('Debugger.resume');
    await expect(second.locator('.storage-banner')).toContainText('另一标签页');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
    expect((await page.evaluate(readBrowserSession)).answers.rebateUnitCny).toBe('1.11');
    await page.reload();
    await expect(page.getByLabel(rebate)).toHaveValue('1.11');
    await expect(page.locator('.storage-banner')).toHaveCount(0);
    expect((await page.evaluate(readBrowserSession)).snapshot.journal).toEqual(
      before.snapshot.journal,
    );
  } finally {
    await cdp.send('Debugger.disable');
    await cdp.detach();
  }
});

test('关闭第二个只读页面后，原页继续统计与提交报价', async ({ page, context }) => {
  await practice(page);
  const second = await context.newPage();
  await second.goto('/#/glossary');
  await expect(second.getByRole('heading', { name: '随用随查 · 外贸知识' })).toBeVisible();
  await expect(second.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  await second.close();
  await page.bringToFront();
  await page.getByLabel(rebate).fill('2.23');
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('first-export.playtest.v1')!).runs.at(-1).counts
            .quote_submitted,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = '/playtest';
  });
  await expect(page.getByRole('heading', { name: '本地试玩记录与知识测评' })).toBeVisible();
  await expect(page.getByText(/本页暂停记录/)).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('first-export.playtest.v1')!).runs.at(-1).counts
          .run_resumed,
    ),
  ).toBeGreaterThan(0);
});

test('OA+EXW 未核验装船时解释日期等待原因，核验后显示真实到期日', async ({ page }) => {
  const game = collectionGame('oa', 'exw');
  const raw = encodeSave({ session: game.session, parameterDraft: null }, pack);
  await page.addInitScript((raw) => {
    const value = JSON.parse(raw);
    localStorage.setItem('first-export.slice.v2:auto:a', raw);
    localStorage.setItem(
      'first-export.slice.v2:auto:head',
      JSON.stringify({
        side: 'a',
        generation: value.generation,
        checksum: value.checksum,
        previous: null,
      }),
    );
  }, raw);
  await page.goto('/#/documents');
  const context = page.getByRole('complementary', { name: '当前业务条件' });
  await expect(context).toContainText('OA 到期日待核验实际装船日期后确定');
  await expect(context).not.toContainText('第 天');
  await decide(page, 'buyer_shipment');
  await expect(context).toContainText(/OA 到期：第 \d+ 天/);
  expect((await page.evaluate(readBrowserSession)).snapshot.order.collectionDueDay).not.toBeNull();
});

test('写锁等待期间立即刷新，报价与参数输入仍可恢复且不重放账本', async ({ page, context }) => {
  await practice(page);
  const before = await page.evaluate(readBrowserSession);
  const blocker = await context.newPage();
  // A same-origin document without an app store, solely to hold the test mutex.
  await blocker.goto('/robots-audit.txt');
  await blocker.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('first-export-storage-mutex', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('mutex', 'readwrite');
          (window as unknown as { hold: boolean }).hold = true;
          const pump = () => {
            const r = transaction.objectStore('mutex').get('writer');
            r.onsuccess = () => {
              resolve();
              if ((window as unknown as { hold: boolean }).hold) pump();
            };
          };
          transaction.oncomplete = () => db.close();
          pump();
        };
      }),
  );
  try {
    await page.getByLabel(rebate).fill('2.23');
    await page.getByLabel('FOB 成本基数（CNY/件）').fill('26.47');
    await page.getByLabel('汇率 E', { exact: true }).fill('7.50');
    expect(await page.evaluate(readBrowserSession)).toEqual(before);
    await page.reload();
  } finally {
    await blocker.evaluate(() => {
      (window as unknown as { hold: boolean }).hold = false;
    });
  }
  await expect(page.getByLabel(rebate)).toHaveValue('2.23');
  await expect(page.getByLabel('FOB 成本基数（CNY/件）')).toHaveValue('26.47');
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  const after = await page.evaluate(readBrowserSession);
  expect(after.snapshot.journal).toEqual(before.snapshot.journal);
  expect(after.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
  expect(new Set(after.snapshot.story.appliedCommandIds).size).toBe(
    after.snapshot.story.appliedCommandIds.length,
  );
});

test('首页不加载经营引擎、不创建空统计；跳过与重看引导仍可用', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始第 1 关/ })).toBeVisible();
  await page.getByRole('button', { name: /跳过引导/ }).click();
  await page.getByRole('button', { name: /重新查看引导/ }).click();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  expect(urls.some((url) => /\/useSliceGame-.*\.js/.test(url))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('first-export.playtest.v1'))).toBeNull();
  await page.getByRole('button', { name: /开始第 1 关/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
});

test('首页按需引擎加载失败可刷新重试，旧进度原样保留', async ({ page }) => {
  await practice(page);
  await page.getByLabel(rebate).fill('2.23');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  const before = await page.evaluate(readBrowserSession);
  await page.goto('/');
  await page.route('**/assets/useSliceGame-*.js', (route) => route.abort());
  await page.getByRole('button', { name: '继续本地进度 →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('页面资源暂时未加载成功');
  expect(await page.evaluate(readBrowserSession)).toEqual(before);
  await page.unroute('**/assets/useSliceGame-*.js');
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
  await page.getByRole('button', { name: '继续本地进度 →', exact: true }).click();
  await expect(page.getByLabel(rebate)).toHaveValue('2.23');
  expect(await page.evaluate(readBrowserSession)).toEqual(before);
});

test('勾选合同后立即刷新仍恢复确认，重复刷新不签约或重复记账', async ({ page, context }) => {
  const game = negotiationGame();
  toContract(game);
  const raw = encodeSave({ session: game.session, parameterDraft: null }, pack);
  await page.addInitScript((raw) => {
    if (localStorage.getItem('first-export.slice.v2:auto:head')) return;
    const v = JSON.parse(raw);
    localStorage.setItem('first-export.slice.v2:auto:a', raw);
    localStorage.setItem(
      'first-export.slice.v2:auto:head',
      JSON.stringify({ side: 'a', generation: v.generation, checksum: v.checksum, previous: null }),
    );
  }, raw);
  await page.goto('/#/contract');
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  const before = await page.evaluate(readBrowserSession);
  const blocker = await context.newPage();
  await blocker.goto('/robots-audit.txt');
  await blocker.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('first-export-storage-mutex', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('mutex', 'readwrite');
          (window as unknown as { hold: boolean }).hold = true;
          const pump = () => {
            const r = tx.objectStore('mutex').get('writer');
            r.onsuccess = () => {
              resolve();
              if ((window as unknown as { hold: boolean }).hold) pump();
            };
          };
          tx.oncomplete = () => db.close();
          pump();
        };
      }),
  );
  try {
    await page.getByRole('checkbox').first().check();
    expect(await page.evaluate(readBrowserSession)).toEqual(before);
    await page.reload();
  } finally {
    await blocker.evaluate(() => {
      (window as unknown as { hold: boolean }).hold = false;
    });
  }
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-saving', 'false');
  const after = await page.evaluate(readBrowserSession);
  expect(after.negotiation!.confirmations).toHaveLength(1);
  expect(after.snapshot.order.status).toBe(before.snapshot.order.status);
  expect(after.snapshot.journal).toEqual(before.snapshot.journal);
  expect(after.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  expect(await page.evaluate(readBrowserSession)).toEqual(after);
});
