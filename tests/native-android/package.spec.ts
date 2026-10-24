import { _android, test, expect } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { saved, decide } from '../e2e/procurement-helpers';
import { begin, documents, correct, end } from '../e2e/collection-helpers';
import { inDesk } from '../e2e/desk-helpers';
import { currentApk, legacyReleases, releaseRoot, nativeVersion } from '../native-support/release';
import {
  createLegacyProgress,
  assertLegacyProgress,
  assertVisualScene,
  assertFixedDesk,
  exerciseFixedDesk,
} from '../native-support/upgrade';

const pkg = 'cn.firstexportorder.game';
const sdk = process.env.ANDROID_HOME ?? resolve(process.env.LOCALAPPDATA!, 'Android/Sdk');
type TestDevice = Awaited<ReturnType<typeof _android.devices>>[number];
async function stopApp(device: TestDevice) {
  await device.shell('am force-stop ' + pkg);
  // am force-stop can finish before Playwright removes the old WebView socket.
  // Wait for its removal before starting, otherwise webView({ pkg }) may return
  // a page from the dead process rather than the restarted application's page.
  await expect
    .poll(() => device.webViews().filter((view) => view.pkg() === pkg).length, { timeout: 15000 })
    .toBe(0);
}
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
      await stopApp(device);
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
      await stopApp(device);
      await device.shell('am start -n ' + pkg + '/.MainActivity');
      page = await (await device.webView({ pkg })).page();
      await page.getByRole('button', { name: /继续本地进度/ }).click();
      expect(await saved(page)).toEqual(before.session);
      await stopApp(device);
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
      await writeFile(
        resolve(releaseRoot, `android-upgrade-${legacy.version}.png`),
        await device.screenshot(),
      );
      await stopApp(device);
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
  // Real WebView + paginated field interactions are slower than a desktop browser.
  test.setTimeout(1200000);
  const serial = process.env.ANDROID_TEST_SERIAL ?? 'emulator-5580';
  if (!serial.startsWith('emulator-')) throw Error('此回归清空应用测试数据，只允许专用模拟器。');
  const device = (await _android.devices()).find((d) => d.serial() === serial);
  if (!device) throw Error('请启动专用 Android 模拟器并安装本轮 APK：' + serial);
  try {
    await stopApp(device);
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
      checkpoint: async (stage) => {
        await assertVisualScene(page, stage);
        console.log('Android native checkpoint: stage ' + stage);
      },
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
    await stopApp(device);
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

test('installed APK: portrait fixed desk, real paging and Android keyboard draft restore', async ({
  browserName: _browserName,
}) => {
  const serial = process.env.ANDROID_TEST_SERIAL ?? 'emulator-5580';
  if (!serial.startsWith('emulator-')) throw Error('Only the dedicated emulator is allowed');
  const device = (await _android.devices()).find((d) => d.serial() === serial);
  if (!device) throw Error('Dedicated Android emulator unavailable');
  const keyboardSetting = (await device.shell('settings get secure show_ime_with_hard_keyboard'))
    .toString()
    .trim();
  try {
    await device.shell('settings put secure show_ime_with_hard_keyboard 1');
    await stopApp(device);
    expect((await adb(serial, 'install', '-r', currentApk)).stdout).toContain('Success');
    await device.shell('pm clear ' + pkg);
    await device.shell('am start -n ' + pkg + '/.MainActivity');
    const page = await (await device.webView({ pkg })).page();
    expect(await page.evaluate(() => innerHeight > innerWidth)).toBe(true);
    await exerciseFixedDesk(page);
    await writeFile(resolve(releaseRoot, 'android-fixed-desk.png'), await device.screenshot());
    await page.locator('a.brand').click();
    // Confirm through Android's actual dialog, so a native modal cannot linger
    // above an already accepted CDP dialog and hide the keyboard screenshot.
    page.once('dialog', () => undefined);
    const restart = page.getByRole('button', { name: '重开独立报价练习', exact: true }).click();
    let dialogXml = '';
    await expect
      .poll(
        async () => {
          await device.shell('uiautomator dump /sdcard/first-export-test-ui.xml');
          dialogXml = (await device.shell('cat /sdcard/first-export-test-ui.xml')).toString();
          return dialogXml.includes('重开将替换') && dialogXml.includes('text="OK"');
        },
        { timeout: 20000 },
      )
      .toBe(true);
    const ok = [...dialogXml.matchAll(/<node\b[^>]*>/g)]
      .map((match) => match[0])
      .find((node) => node.includes('resource-id="android:id/button1"'));
    const bounds = ok?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) throw Error('Android restart confirmation is unavailable');
    await device.shell(
      `input tap ${(Number(bounds[1]) + Number(bounds[3])) / 2} ${(Number(bounds[2]) + Number(bounds[4])) / 2}`,
    );
    await restart;
    const field = await inDesk(page.getByLabel('每件预计退税（CNY/件）', { exact: true }));
    const screenHeight = await page.evaluate(() => visualViewport!.height);
    const box = await field.boundingBox();
    if (!box) throw Error('Quote field is not visible');
    // A touch dispatch, unlike fill(), opens the actual Android soft keyboard.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => visualViewport!.height)).toBeLessThan(screenHeight);
    await (await inDesk(field)).fill('2.23');
    await assertFixedDesk(page);
    const before = await saved(page);
    await device.shell('uiautomator dump /sdcard/first-export-test-ui.xml');
    expect((await device.shell('cat /sdcard/first-export-test-ui.xml')).toString()).not.toContain(
      '重开将替换',
    );
    await writeFile(resolve(releaseRoot, 'android-keyboard.png'), await device.screenshot());
    await device.shell('input keyevent 4');
    await page.reload();
    expect(await saved(page)).toEqual(before);
    await expect(field).toHaveValue('2.23');
    await assertFixedDesk(page);
  } finally {
    await device.shell(
      keyboardSetting === '0' || keyboardSetting === '1'
        ? 'settings put secure show_ime_with_hard_keyboard ' + keyboardSetting
        : 'settings delete secure show_ime_with_hard_keyboard',
    );
    await Promise.race([device.close(), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
  }
});
