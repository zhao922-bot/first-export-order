import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { assetPath, isAppPage } from '../../desktop/policy';
import { exportJson } from '../../src/app/exportJson';

const bridge = vi.hoisted(() => ({ native: false, save: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
  registerPlugin: () => ({ save: bridge.save }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  bridge.save.mockReset();
});

describe('native wrapper boundary', () => {
  it('packages matching app versions without changing the installed identity', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const builder = JSON.parse(readFileSync('electron-builder.config.json', 'utf8'));
    const gradle = readFileSync('android/app/build.gradle', 'utf8');
    expect(builder.directories.output).toBe(`outputs/native-${pkg.version}/windows`);
    expect(gradle).toContain(`versionName "${pkg.version}"`);
    expect(gradle).toContain('applicationId "cn.firstexportorder.game"');
    expect(Number(gradle.match(/versionCode (\d+)/)?.[1])).toBeGreaterThan(2);
    expect(builder.appId).toBe('cn.firstexportorder.game');
    expect(builder.win.executableName).toBe('FirstExportOrder');
  });
  it('only serves bundled assets within the fixed app origin', () => {
    const root = resolve('dist');
    expect(assetPath('trade://app/#/quote', root)).toBe(resolve(root, 'index.html'));
    expect(assetPath('trade://app/assets/index.js', root)).toBe(resolve(root, 'assets/index.js'));
    for (const url of [
      'https://app/',
      'file:///C:/secret',
      'trade://other/',
      'trade://u:p@app/',
      'trade://app/%2e%2e%2fsecret',
      'trade://app/a%5c..%5csecret',
      'trade://app/C:/secret',
      'trade://app/%00',
      'trade://app/%ZZ',
    ])
      expect(assetPath(url, root)).toBeNull();
  });
  it('allows hash routes but rejects navigation to arbitrary files or remote pages', () => {
    expect(isAppPage('trade://app/#/quote')).toBe(true);
    expect(isAppPage('trade://app/index.html#/recovery')).toBe(true);
    for (const url of [
      'https://example.com',
      'trade://app/assets/x.js',
      'trade://u@app/',
      'invalid',
    ])
      expect(isAppPage(url)).toBe(false);
  });
  it('native export preserves JSON exactly and reports successful document write', async () => {
    bridge.native = true;
    bridge.save.mockResolvedValue({ saved: true });
    expect(await exportJson('{"cash":0,"文本":"林姐"}', '存档.json')).toContain('已保存');
    expect(bridge.save).toHaveBeenCalledWith({
      filename: '存档.json',
      text: '{"cash":0,"文本":"林姐"}',
    });
  });
  it('cancelling a native document picker does not report a saved file', async () => {
    bridge.native = true;
    bridge.save.mockResolvedValue({ saved: false });
    expect(await exportJson('{}', 'save.json')).toContain('已取消');
  });
  it('propagates native write errors for visible UI feedback', async () => {
    bridge.native = true;
    bridge.save.mockRejectedValue(Error('disk full'));
    await expect(exportJson('{}', 'save.json')).rejects.toThrow('disk full');
  });
  it('rejects unsafe filenames before opening a picker', async () => {
    for (const filename of ['../save.json', 'C:\\save.json', 'a\n.json', 'save.exe'])
      await expect(exportJson('{}', filename)).rejects.toThrow('文件名');
    expect(bridge.save).not.toHaveBeenCalled();
  });
  it('browser downloads keep their JSON filename and release the Blob URL', async () => {
    bridge.native = false;
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    expect(await exportJson('{"seed":"same"}', 'save.json')).toContain('下载');
    expect(anchor).toMatchObject({ href: 'blob:test', download: 'save.json' });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(await (create.mock.calls[0]![0] as Blob).text()).toBe('{"seed":"same"}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
