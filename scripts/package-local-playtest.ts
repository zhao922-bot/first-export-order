import { resolve } from 'node:path';
import { access, writeFile, readFile } from 'node:fs/promises';
import {
  prepareRuntime,
  productionLicenses,
  buildPackage,
  zipDirectory,
  hash,
} from './local-playtest/package';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !/^--out=.+$/.test(args[0])))
    throw Error('用法：pnpm playtest:package [--out=新目录]');
  const root = resolve('.'),
    out = resolve(args[0]?.slice(6) ?? 'outputs/local-playtest-win-x64');
  for (const file of [out, out + '.zip']) {
    try {
      await access(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    throw Error('目标已存在，请用 --out= 指定新目录，避免覆盖历史包：' + file);
  }
  const runtimeDir = await prepareRuntime(resolve('work/local-playtest-runtime'));
  const licenses = await productionLicenses(root);
  const manifest = await buildPackage({ root, out, web: resolve('dist'), runtimeDir, licenses });
  await zipDirectory(out, out + '.zip');
  const digest = hash(await readFile(out + '.zip'));
  await writeFile(out + '.zip.sha256', digest + '  ' + out.split(/[\\/]/).at(-1) + '.zip\n');
  console.log(
    `可分发包：${out}.zip\nSHA-256: ${digest}\n${manifest.files.length} 个已校验文件；运行时 ${manifest.runtime.version}；本机默认端口 4173。`,
  );
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
