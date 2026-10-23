import { writeFile, readFile } from 'node:fs/promises';
import { productionLicenses } from './local-playtest/package';

const webLicenses = await productionLicenses(process.cwd());
const nativeLicenses =
  'Android native libraries: AndroidX and Apache Cordova (Apache License 2.0).\n' +
  'Sources: https://android.googlesource.com/platform/frameworks/support/ ; https://github.com/apache/cordova-android\n\n' +
  (await readFile('docs/native/APACHE-2.0.txt', 'utf8'));
await writeFile(
  'android/app/src/main/assets/THIRD_PARTY_LICENSES.txt',
  webLicenses + '\n\n' + nativeLicenses,
);
