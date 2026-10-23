import { readFile, writeFile, mkdir, readdir, stat, copyFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';
import runtime from './runtime.json';
import { loadPackage, type PackageManifest } from './server';

const exec = promisify(execFile);
export const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function powershell(command: string, env: Record<string, string>) {
  if (process.platform !== 'win32')
    throw Error('此打包器生成 Windows x64 包，请在 Windows 上运行。');
  await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; " + command],
    { env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
}
export async function zipDirectory(source: string, destination: string) {
  await powershell(
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:PLAYTEST_ZIP_SOURCE, $env:PLAYTEST_ZIP_TARGET)',
    { PLAYTEST_ZIP_SOURCE: resolve(source), PLAYTEST_ZIP_TARGET: resolve(destination) },
  );
}
export async function prepareRuntime(cache: string) {
  await mkdir(cache, { recursive: true });
  const archive = join(cache, runtime.archive);
  let bytes: Buffer | undefined;
  try {
    bytes = await readFile(archive);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  if (!bytes) {
    console.log('下载固定版本官方运行时（仅制包时需要联网）…');
    const response = await fetch(runtime.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`运行时下载失败：${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== runtime.sha256) throw Error('官方运行时 SHA-256 不匹配，未采用下载文件。');
    await writeFile(archive, bytes, { flag: 'wx' });
  }
  if (hash(bytes) !== runtime.sha256)
    throw Error('运行时缓存 SHA-256 不匹配，请核对缓存，不自动使用损坏文件。');
  const target = join(cache, 'runtime-' + runtime.version);
  await mkdir(target, { recursive: true });
  // 官方 ZIP 已核对摘要；仅提取两个准确条目，不解压任意路径。
  await powershell(
    `Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[System.IO.Compression.ZipFile]::OpenRead($env:PLAYTEST_ARCHIVE)
try {
  foreach($name in @('node.exe','LICENSE')) {
    $entry=$archive.GetEntry($env:PLAYTEST_ARCHIVE_ROOT+'/'+$name)
    if($null -eq $entry) { throw 'Missing runtime archive entry' }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $env:PLAYTEST_RUNTIME_TARGET $name),$true)
  }
} finally { $archive.Dispose() }`,
    {
      PLAYTEST_ARCHIVE: resolve(archive),
      PLAYTEST_ARCHIVE_ROOT: basename(runtime.archive, '.zip'),
      PLAYTEST_RUNTIME_TARGET: resolve(target),
    },
  );
  const probe = await exec(
    join(target, 'node.exe'),
    ['-p', 'JSON.stringify([process.version,process.platform,process.arch])'],
    { windowsHide: true },
  );
  if (probe.stdout.trim() !== JSON.stringify([runtime.version, runtime.platform, runtime.arch]))
    throw Error('运行时版本或架构不符。');
  return target;
}
async function listFiles(root: string, folder = root): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isSymbolicLink()) throw Error(`不打包符号链接：${full}`);
    if (entry.isDirectory()) found.push(...(await listFiles(root, full)));
    else if (entry.isFile()) found.push(relative(root, full).replaceAll('\\', '/'));
  }
  return found.sort();
}
/** 只收集生产依赖的原始许可文件，不收集项目外的用户数据。 */
export async function productionLicenses(root: string) {
  const visited = new Set<string>(),
    sections: string[] = [];
  async function walk(name: string, from: string): Promise<void> {
    const require = createRequire(from);
    let file: string;
    try {
      file = require.resolve(name + '/package.json');
    } catch {
      let dir = dirname(require.resolve(name));
      for (;;) {
        try {
          const candidate = join(dir, 'package.json');
          const p = JSON.parse(await readFile(candidate, 'utf8'));
          if (p.name === name) {
            file = candidate;
            break;
          }
        } catch {
          /* 查找声明该模块的包根目录。 */
        }
        const parent = dirname(dir);
        if (parent === dir) throw Error(`找不到依赖清单：${name}`);
        dir = parent;
      }
    }
    file = await realpath(file);
    if (visited.has(file)) return;
    visited.add(file);
    const p = JSON.parse(await readFile(file, 'utf8')) as {
      name: string;
      version: string;
      dependencies?: Record<string, string>;
    };
    const dir = dirname(file),
      licenses = (await readdir(dir)).filter((n) => /^(licen[sc]e|copying)([.-].*)?$/i.test(n));
    if (!licenses.length) {
      // 此 npm 版本未随包提供 LICENSE；保留相同 tag 的上游原文，不推测许可。
      if (p.name === '@vue/devtools-api' && p.version === '6.6.4')
        sections.push(
          `${p.name}@${p.version}\nSource: https://raw.githubusercontent.com/vuejs/devtools-v6/v6.6.4/LICENSE\n\n` +
            (await readFile(
              join(root, 'scripts/local-playtest/licenses/vue-devtools-api-6.6.4-LICENSE.txt'),
              'utf8',
            )),
        );
      else throw Error(`依赖缺少许可原文：${p.name}@${p.version}`);
    }
    for (const license of licenses)
      sections.push(
        `${p.name}@${p.version} / ${license}\n\n${await readFile(join(dir, license), 'utf8')}`,
      );
    for (const child of Object.keys(p.dependencies ?? {}).sort()) await walk(child, file);
  }
  const packageFile = resolve(root, 'package.json'),
    p = JSON.parse(await readFile(packageFile, 'utf8'));
  for (const name of Object.keys(p.dependencies).sort()) await walk(name, packageFile);
  return (
    'Production dependency notices (includes transitive dependencies)\n\n' +
    sections.join('\n\n====================\n\n')
  );
}
export async function buildPackage(options: {
  root: string;
  out: string;
  web: string;
  runtimeDir: string;
  licenses: string;
}) {
  const { root, out, web, runtimeDir } = options;
  const pack = JSON.parse(await readFile(join(root, 'src/content/levels/L01-L07.json'), 'utf8'));
  // 只创建新目录，历史包和已有试玩数据均不覆盖。
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  await mkdir(join(out, 'web'));
  await mkdir(join(out, 'runtime'));
  for (const file of await listFiles(web)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.endsWith('.map'))
      throw Error('生产构建含未允许文件：' + file);
    await mkdir(dirname(join(out, 'web', file)), { recursive: true });
    await copyFile(join(web, file), join(out, 'web', file));
  }
  for (const file of ['node.exe', 'LICENSE'])
    await copyFile(join(runtimeDir, file), join(out, 'runtime', file));
  const source = await readFile(join(root, 'scripts/local-playtest/server.ts'), 'utf8');
  await writeFile(
    join(out, 'server.mjs'),
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText,
  );
  for (const file of ['START-LOCAL.cmd', 'START-PHONE.cmd']) {
    const text = await readFile(join(root, 'scripts/local-playtest', file), 'utf8');
    await writeFile(join(out, file), text.replace(/\r?\n/g, '\r\n'));
  }
  for (const file of ['README.txt', 'TROUBLESHOOTING.txt'])
    await copyFile(join(root, 'docs/local-playtest', file), join(out, file));
  for (const file of ['PLAYER_GUIDE', 'FEEDBACK_FORM'])
    await copyFile(join(root, 'docs/playtest', file + '.md'), join(out, file + '.txt'));
  await writeFile(join(out, 'THIRD-PARTY-NOTICES.txt'), options.licenses);
  const manifest: PackageManifest = {
    format: 'first-export-local-playtest',
    packageVersion: 'local-playtest-1',
    target: 'win-x64',
    defaultPort: 4173,
    contentVersion: pack.contentVersion,
    configVersion: pack.playtest.configVersion,
    contentSha256: hash(await readFile(join(root, 'src/content/levels/L01-L07.json'))),
    runtime: { version: runtime.version, archiveSha256: runtime.sha256, source: runtime.url },
    files: [],
  };
  for (const file of await listFiles(out)) {
    const full = join(out, file);
    manifest.files.push({
      path: file,
      bytes: (await stat(full)).size,
      sha256: hash(await readFile(full)),
    });
  }
  await writeFile(join(out, 'package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await loadPackage(out);
  return manifest;
}
