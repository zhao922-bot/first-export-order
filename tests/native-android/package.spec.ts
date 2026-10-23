import { _android, test, expect } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { saved, decide } from '../e2e/procurement-helpers';
import { begin, documents, correct, end } from '../e2e/collection-helpers';
import { currentApk, legacyReleases, releaseRoot, nativeVersion } from '../native-support/release';
import {
  createLegacyProgress,
  assertLegacyProgress,
  assertVisualScene,
} from '../native-support/upgrade';

const pkg = 'cn.firstexportorder.game';
const sdk = process.env.ANDROID_HOME ?? resolve(process.env.LOCALAPPDATA!, 'Android/Sdk');
async function adb(serial: string, ...args: string[]) {
  if (!serial.startsWith('emulator-')) throw Error('只允许专用模拟器。');
  return promisify(execFile)(resolve(sdk, 'platform-tools/adb.exe'), ['-s', serial, ...args], {
    windowsHide: true,
  });
}

for (const legacy of legacyReleases)
  test(`APK in-place upgrade ${legacy.version} → current preserves real old save, RNG, paid fee, draft and preferences`, async ({
    browserName: _browserName,
  }, info) => {
    const serial = process.env.ANDROID_TEST_SERIAL ?? 'emulator-5580';
    if (!serial.startsWith('emulator-')) throw Error('此回归只允许专用模拟器。');
    const device = (await _android.devices()).find((d) => d.serial() === serial);
    if (!device) throw Error('请启动专用 Android 模拟器：' + serial);
    try {
      await device.shell('am force-stop ' + pkg);
      // The old package is debuggable. Downgrade is confined to the disposable emulator.
      expect((await adb(serial, 'install', '-r', '-d', legacy.apk)).stdout).toContain('Success');
      await device.shell('pm clear ' + pkg);
      expect((await device.shell('dumpsys package ' + pkg)).toString()).toContain(
        'versionName=' + legacy.version,
      );
      await device.shell('svc wifi disable');
      await device.shell('svc data disable');
      await device.shell('am start -n ' + pkg + '/.MainActivity');
      let page = await (await device.webView({ pkg })).page();
      const before = await createLegacyProgress(page);
      // Exercise the documented backup-before-update flow. Read the exported file
      // and restart the OLD app first, so migration is tested from durable old data,
      // not a WebView localStorage write still waiting for the OS disk flush.
      const listFiles = async () =>
        (await device.shell('find /sdcard/Download -maxdepth 1 -type f -print0'))
          .toString()
          .split('\0')
          .filter(Boolean);
      const previousFiles = await listFiles();
      await page.getByRole('link', { name: '存档与恢复', exact: true }).click();
      await page.getByRole('button', { name: '导出当前进度', exact: true }).click();
      const saveButton = await documentSaveButton(device);
      await device.shell(`input tap ${saveButton.x} ${saveButton.y}`);
      await expect(page.getByRole('status').filter({ hasText: '文件已保存' })).toBeVisible();
      const newFiles = (await listFiles()).filter((file) => !previousFiles.includes(file));
      expect(newFiles).toHaveLength(1);
      const backupPath = info.outputPath('old-version-export.json');
      await mkdir(dirname(backupPath), { recursive: true });
      await adb(serial, 'pull', newFiles[0]!, backupPath);
      expect(JSON.parse(await readFile(backupPath, 'utf8')).payload.session).toEqual(
        before.session,
      );
      await device.shell('am force-stop ' + pkg);
      await device.shell('am start -n ' + pkg + '/.MainActivity');
      page = await (await device.webView({ pkg })).page();
      await page.getByRole('button', { name: /继续本地进度/ }).click();
      expect(await saved(page)).toEqual(before.session);
      await device.shell('am force-stop ' + pkg);
      // Deliberately no pm clear / uninstall between old and new installs.
      expect((await adb(serial, 'install', '-r', currentApk)).stdout).toContain('Success');
      expect((await device.shell('dumpsys package ' + pkg)).toString()).toContain(
        'versionName=' + nativeVersion,
      );
      await device.shell('am start -n ' + pkg + '/.MainActivity');
      page = await (await device.webView({ pkg })).page();
      await assertLegacyProgress(page, before);
      await page.getByLabel('界面动效', { exact: true }).selectOption('off');
      await page.reload();
      expect(await saved(page)).toEqual(before.session);
      await page.locator('.story-stage').scrollIntoViewIfNeeded();
      await writeFile(
        resolve(releaseRoot, `android-upgrade-${legacy.version}.png`),
        await device.screenshot(),
      );
      await device.shell('am force-stop ' + pkg);
      await device.shell('am start -n ' + pkg + '/.MainActivity');
      page = await (await device.webView({ pkg })).page();
      await expect(page.getByLabel('界面动效', { exact: true })).toHaveValue('off');
      await page.getByRole('button', { name: /继续本地进度/ }).click();
      expect(await saved(page)).toEqual(before.session);
      await writeFile(
        resolve(releaseRoot, `ANDROID_UPGRADE_${legacy.version}.json`),
        JSON.stringify(
          {
            from: legacy.version,
            to: nativeVersion,
            inPlaceInstall: true,
            savedStateEqual: true,
            restartEqual: true,
            session: before.session,
          },
          null,
          2,
        ),
      );
    } finally {
      await Promise.race([
        device.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
  });

/** Read the actual system picker tree. The old Playwright Android driver caches stale windows on API 36. */
async function documentSaveButton(device: Awaited<ReturnType<typeof _android.devices>>[number]) {
  let xml = '';
  await expect
    .poll(
      async () => {
        await device.shell('uiautomator dump /sdcard/first-export-test-ui.xml');
        xml = (await device.shell('cat /sdcard/first-export-test-ui.xml')).toString();
        return xml.includes('package="com.android.documentsui"') && xml.includes('text="SAVE"');
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const button = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((m) => m[0])
    .find(
      (node) => node.includes('resource-id="android:id/button1"') && node.includes('text="SAVE"'),
    );
  const bounds = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw Error('System save button not found in current UI');
  return {
    x: (Number(bounds[1]) + Number(bounds[3])) / 2,
    y: (Number(bounds[2]) + Number(bounds[4])) / 2,
  };
}

test('installed APK: offline seven stages, native export/cancel and process restart', async ({
  browserName: _browserName,
}, info) => {
  const serial = process.env.ANDROID_TEST_SERIAL ?? 'emulator-5580';
  if (!serial.startsWith('emulator-')) throw Error('此回归清空应用测试数据，只允许专用模拟器。');
  const device = (await _android.devices()).find((d) => d.serial() === serial);
  if (!device) throw Error('请启动专用 Android 模拟器并安装本轮 APK：' + serial);
  try {
    await device.shell('am force-stop ' + pkg);
    expect((await adb(serial, 'install', '-r', currentApk)).stdout).toContain('Success');
    await device.shell('pm clear ' + pkg);
    await device.shell('svc wifi disable');
    await device.shell('svc data disable');
    await device.shell('am start -n ' + pkg + '/.MainActivity');
    let page = await (await device.webView({ pkg })).page();
    await expect(page.getByTestId('onboarding')).toHaveAttribute('data-guide-step', 'start');
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    await expect(page.locator('.landing-stage .character-crop img')).toHaveJSProperty(
      'naturalWidth',
      1536,
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(
      await page.locator('.character-crop').evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('character-breathe');
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('heading', { name: /七关流程完成/ }).scrollIntoViewIfNeeded();
    await writeFile(resolve(releaseRoot, 'android-ending.png'), await device.screenshot());
    await page.getByRole('link', { name: '存档与恢复', exact: true }).click();
    await page.getByRole('button', { name: '导出当前进度', exact: true }).click();
    await documentSaveButton(device);
    await device.shell('input keyevent 4');
    await expect(page.getByRole('status').filter({ hasText: '已取消导出' })).toBeVisible();
    expect(await saved(page)).toEqual(before);
    const listExports = async () =>
      (await device.shell('find /sdcard/Download -maxdepth 1 -type f -print0'))
        .toString()
        .split('\0')
        .filter(Boolean);
    const oldFiles = await listExports();
    await page.getByRole('button', { name: '导出当前进度', exact: true }).click();
    const button = await documentSaveButton(device);
    await device.shell(`input tap ${button.x} ${button.y}`);
    await expect(page.getByRole('status').filter({ hasText: '文件已保存' })).toBeVisible();
    // Android appends a suffix rather than overwriting an existing document.
    const newFiles = (await listExports()).filter((name) => !oldFiles.includes(name));
    expect(newFiles).toHaveLength(1);
    const filename = newFiles[0]!.split('/').at(-1)!;
    expect(filename).toMatch(/^出海第一单-本地存档(?: \(\d+\))?\.json$/);
    // adb sync preserves UTF-8 filenames without shell parsing or escaping.
    const destination = info.outputPath('native-export.json');
    await mkdir(dirname(destination), { recursive: true });
    await promisify(execFile)(
      resolve(sdk, 'platform-tools/adb.exe'),
      ['-s', serial, 'pull', newFiles[0]!, destination],
      { windowsHide: true },
    );
    expect(JSON.parse(await readFile(destination, 'utf8')).payload.session).toEqual(before);
    await device.shell('input keyevent 4');
    await expect(page).toHaveURL(/#\/ending$/);
    expect(await saved(page)).toEqual(before);
    await device.shell('am force-stop ' + pkg);
    await device.shell('am start -n ' + pkg + '/.MainActivity');
    page = await (await device.webView({ pkg })).page();
    await page.getByRole('button', { name: /继续本地进度/ }).click();
    await expect(page.getByRole('heading', { name: /七关流程完成/ })).toBeVisible();
    expect(await saved(page)).toEqual(before);
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  } finally {
    // Old Android automation drivers may not acknowledge shutdown on API 36.
    await Promise.race([device.close(), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
  }
});
