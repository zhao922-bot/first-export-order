import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { productionLicenses } from './local-playtest/package';

const root = process.cwd(),
  target = resolve(root, 'work/native-desktop');
// Reuse the installed runtime to avoid the ZIP extractor's temporary-directory rename.
const builder = JSON.parse(await readFile('electron-builder.config.json', 'utf8')) as {
  electronVersion: string;
};
const runtimeVersion = (await readFile('node_modules/electron/dist/version', 'utf8')).trim();
if (runtimeVersion !== builder.electronVersion)
  throw Error('Installed Electron version does not match the packaging configuration');
await mkdir(target, { recursive: true });
const stagedWeb = resolve(target, 'web');
if (stagedWeb !== resolve(root, 'work/native-desktop/web')) throw Error('Unexpected staging path');
await rm(stagedWeb, { recursive: true, force: true });
await cp('dist', target + '/web', { recursive: true });
for (const name of ['main', 'policy']) {
  const input = await readFile(`desktop/${name}.ts`, 'utf8');
  await writeFile(
    `${target}/${name}.js`,
    ts.transpileModule(input, {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText,
  );
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  target + '/package.json',
  JSON.stringify({
    name: 'first-export-order',
    version: pkg.version,
    private: true,
    type: 'module',
    main: 'main.js',
    description: '出海第一单 · 离线外贸教学游戏',
    author: 'First Export Order',
  }),
);
await writeFile(target + '/THIRD_PARTY_LICENSES.txt', await productionLicenses(root));
await copyFile('docs/NATIVE_PLAYTEST.md', target + '/使用说明.md');
console.log('桌面运行文件已准备：' + target);
