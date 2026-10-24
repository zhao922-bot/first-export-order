import { resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

export const nativeVersion = pkg.version;
export const releaseRoot = resolve(`outputs/native-${nativeVersion}`);
export const portableExe = resolve(
  releaseRoot,
  `windows/FirstExportOrder-${nativeVersion}-win-x64.exe`,
);
export const unpackedExe = resolve(releaseRoot, 'windows/win-unpacked/FirstExportOrder.exe');
export const currentApk = resolve(
  releaseRoot,
  `android/FirstExportOrder-${nativeVersion}-android-test.apk`,
);
export const legacyReleases = ['0.1.0', '0.2.0', '0.3.0'].map((version) => {
  const root = version === '0.1.0' ? 'outputs/native' : `outputs/native-${version}`;
  return {
    version,
    exe: resolve(root, 'windows/win-unpacked/FirstExportOrder.exe'),
    apk: resolve(root, `android/FirstExportOrder-${version}-android-test.apk`),
  };
});
