import { _electron, chromium, test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { saved, decide } from '../e2e/procurement-helpers';
import { begin, documents, correct, end } from '../e2e/collection-helpers';
import {
  portableExe,
  unpackedExe,
  legacyExe,
  releaseRoot,
  nativeVersion,
} from '../native-support/release';
import {
  createLegacyProgress,
  assertLegacyProgress,
  assertVisualScene,
} from '../native-support/upgrade';

test('portable EXE self-extracts and opens the bundled game', async ({
  browserName: _browserName,
}, info) => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const launcher = spawn(
    portableExe,
    [
      '--user-data-dir=' + info.outputPath('portable-profile'),
      '--remote-debugging-port=' + port,
      '--remote-debugging-address=127.0.0.1',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 60000 },
      )
      .toBe(true);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const page = browser.contexts()[0]!.pages()[0]!;
      await expect(page.getByRole('heading', { name: /先看清成本/ })).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(page.locator('.landing-stage .character-crop img')).toHaveJSProperty(
        'naturalWidth',
        1536,
      );
      expect(
        await page.locator('.character-crop').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('character-breathe');
      await page.getByRole('button', { name: /开始第 1 关/ }).click();
      await expect(page.getByTestId('onboarding')).toHaveAttribute(
        'data-guide-step',
        'overview-progress',
      );
      await page.screenshot({ path: resolve(releaseRoot, 'windows-portable.png'), fullPage: true });
    } finally {
      const cdp = await browser.newBrowserCDPSession();
      // Electron exits before acknowledging Browser.close on some Windows builds.
      await Promise.race([
        cdp.send('Browser.close').catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      await browser.close();
    }
  } finally {
    launcher.kill();
  }
});

async function launch(profile: string, executable = unpackedExe) {
  const app = await _electron.launch({
    executablePath: executable,
    args: ['--user-data-dir=' + profile],
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: /先看清成本/ })).toBeVisible();
  return { app, page };
}

test('packaged EXE: offline seven stages, sandbox, restart restores exact saved state', async ({
  browserName: _browserName,
}, info) => {
  const profile = info.outputPath('profile');
  let instance = await launch(profile);
  try {
    const page = instance.page;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/^https?:/, (route) => route.abort());
    expect(
      await page.evaluate(() => ({ node: 'require' in window, secure: isSecureContext })),
    ).toEqual({ node: false, secure: true });
    expect(await page.evaluate(() => 'process' in window)).toBe(false);
    await expect(page.getByTestId('onboarding')).toHaveAttribute('data-guide-step', 'start');
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    await begin(page, {
      payment: 'lc',
      term: 'cif',
      checkpoint: (stage) => assertVisualScene(page, stage),
    });
    await documents(page);
    await correct(page);
    await decide(page, 'lc_present');
    await decide(page, 'lc_collect');
    await end(page);
    const before = await saved(page);
    await page.getByLabel('界面动效', { exact: true }).selectOption('off');
    await page.screenshot({ path: resolve(releaseRoot, 'windows-ending.png'), fullPage: true });
    expect(errors).toEqual([]);
    await instance.app.close();
    instance = await launch(profile);
    await expect(instance.page.getByTestId('onboarding')).toHaveCount(0);
    await expect(instance.page.getByLabel('界面动效', { exact: true })).toHaveValue('off');
    await instance.page.getByRole('button', { name: /继续本地进度/ }).click();
    expect(await saved(instance.page)).toEqual(before);
    await expect(instance.page.getByRole('heading', { name: /七关流程完成/ })).toBeVisible();
  } finally {
    await instance.app.close();
  }
});

test('0.1.0 to current EXE: same profile and old exported JSON retain paid ledger, RNG and quote draft', async ({
  browserName: _browserName,
}, info) => {
  const profile = info.outputPath('upgrade-profile');
  const exported = info.outputPath('legacy-export.json');
  let instance = await launch(profile, legacyExe);
  try {
    expect(await instance.app.evaluate(({ app }) => app.getVersion())).toBe('0.1.0');
    const before = await createLegacyProgress(instance.page);
    await instance.app.evaluate(({ session }, destination) => {
      session.defaultSession.on('will-download', (_event, item) => item.setSavePath(destination));
    }, exported);
    await instance.page.getByRole('link', { name: '存档与恢复', exact: true }).click();
    await instance.page.getByRole('button', { name: '导出当前进度', exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(exported, 'utf8')).payload.session;
        } catch {
          return null;
        }
      })
      .toEqual(before.session);
    await instance.app.close();
    instance = await launch(profile);
    expect(await instance.app.evaluate(({ app }) => app.getVersion())).toBe(nativeVersion);
    await assertLegacyProgress(instance.page, before);
    await instance.page.getByLabel('界面动效', { exact: true }).selectOption('off');
    await instance.page.reload();
    expect(await saved(instance.page)).toEqual(before.session);
    await instance.page.screenshot({
      path: resolve(releaseRoot, 'windows-upgrade.png'),
      fullPage: true,
    });
    await instance.app.close();
    instance = await launch(profile);
    await expect(instance.page.getByLabel('界面动效', { exact: true })).toHaveValue('off');
    await instance.page.getByRole('button', { name: /继续本地进度/ }).click();
    expect(await saved(instance.page)).toEqual(before.session);
    await instance.app.close();
    instance = await launch(info.outputPath('legacy-import-profile'));
    await instance.page.getByRole('link', { name: '存档与恢复', exact: true }).click();
    await instance.page.getByLabel(/选择 JSON 存档/).setInputFiles(exported);
    await instance.page.getByRole('button', { name: '确认载入此存档', exact: true }).click();
    expect(await saved(instance.page)).toEqual(before.session);
    await expect(instance.page.getByLabel('每件预计退税（CNY/件）', { exact: true })).toHaveValue(
      '2.23',
    );
    await writeFile(
      resolve(releaseRoot, 'WINDOWS_UPGRADE.json'),
      JSON.stringify(
        {
          from: '0.1.0',
          to: nativeVersion,
          sameProfileEqual: true,
          restartEqual: true,
          legacyImportEqual: true,
          session: before.session,
        },
        null,
        2,
      ),
    );
  } finally {
    await instance.app.close();
  }
});

test('packaged EXE: export JSON, import it in a fresh profile, preserve quote draft', async ({
  browserName: _browserName,
}, info) => {
  const directory = info.outputPath('downloads');
  await mkdir(directory, { recursive: true });
  let instance = await launch(info.outputPath('profile'));
  try {
    await instance.app.evaluate(({ session }, directory) => {
      session.defaultSession.on('will-download', (_event, item) =>
        item.setSavePath(directory + '/' + item.getFilename()),
      );
    }, directory);
    await instance.page.getByRole('button', { name: '直接练习报价', exact: true }).click();
    await instance.page.getByLabel('每件预计退税（CNY/件）', { exact: true }).fill('2.23');
    const before = await saved(instance.page);
    await instance.page.getByRole('link', { name: '存档与恢复', exact: true }).click();
    await instance.page.getByRole('button', { name: '导出当前进度', exact: true }).click();
    const path = resolve(directory, '出海第一单-本地存档.json');
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(path, 'utf8')) !== null;
        } catch {
          return false;
        }
      })
      .toBe(true);
    await instance.app.close();
    instance = await launch(info.outputPath('other-profile'));
    await instance.page.getByRole('link', { name: '存档与恢复', exact: true }).click();
    await instance.page.getByLabel(/选择 JSON 存档/).setInputFiles(path);
    await instance.page.getByRole('button', { name: '确认载入此存档', exact: true }).click();
    expect(await saved(instance.page)).toEqual(before);
    await expect(instance.page.getByLabel('每件预计退税（CNY/件）', { exact: true })).toHaveValue(
      '2.23',
    );
  } finally {
    await instance.app.close();
  }
});
