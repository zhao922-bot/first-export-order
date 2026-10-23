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
export const legacyExe = resolve('outputs/native/windows/win-unpacked/FirstExportOrder.exe');
export const legacyApk = resolve('outputs/native/android/FirstExportOrder-0.1.0-android-test.apk');
