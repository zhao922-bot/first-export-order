import { readFile, stat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { contentPackSchema } from '../src/domain/schemas/content';
import { validateContent } from '../src/content/validation';
import { manifestSchema, protocolSchema } from './playtest/schema';
import { aggregatePlaytests } from './playtest/aggregate';
import { renderReport, auditReviews } from './playtest/report';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
async function readBounded(file: string, max = 2 * 1024 * 1024) {
  if ((await stat(file)).size > max) throw Error(`文件超过 ${max} 字节: ${file}`);
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > max) throw Error(`文件读取期间超过上限: ${file}`);
  return { value: JSON.parse(text) as unknown, sha256: sha(text) };
}
async function main() {
  const args = process.argv.slice(2),
    options: Record<string, string> = {};
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'pnpm playtest:aggregate --manifest=<名单.json> [--input=<导出目录>] [--out=<新报告目录>] [--protocol=<协议.json>] [--content=<内容.json>] [--require-gates]',
    );
    return;
  }
  for (const arg of args) {
    if (arg === '--require-gates') {
      options.requireGates = '1';
      continue;
    }
    const match = /^--(manifest|input|out|protocol|content)=(.+)$/.exec(arg);
    if (!match || options[match[1]!]) throw Error(`未知或重复参数: ${arg}`);
    options[match[1]!] = match[2]!;
  }
  if (!options.manifest) throw Error('必须提供 --manifest=<名单.json>；--help 查看用法');
  const manifestFile = resolve(options.manifest),
    input = await realpath(resolve(options.input ?? dirname(manifestFile)));
  const out = resolve(options.out ?? 'outputs/playtest-study');
  const [manifestRaw, protocolRaw, contentRaw] = await Promise.all([
    readBounded(manifestFile),
    readBounded(resolve(options.protocol ?? 'docs/playtest/protocol.json')),
    readBounded(resolve(options.content ?? 'src/content/levels/L01-L07.json')),
  ]);
  const manifest = manifestSchema.parse(manifestRaw.value),
    protocol = protocolSchema.parse(protocolRaw.value);
  const pack = contentPackSchema.parse(contentRaw.value),
    validation = validateContent(pack);
  if (!validation.ok) throw Error('内容语义校验失败');
  const exports: Record<string, unknown> = Object.create(null),
    sources: { file: string; sha256: string }[] = [];
  for (const file of manifest.participants.flatMap((p) => p.exports).sort()) {
    const full = resolve(input, file);
    let actual: string;
    try {
      actual = await realpath(full);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    const rel = relative(input, actual);
    if (rel.startsWith('..') || isAbsolute(rel)) throw Error(`导出路径越界: ${file}`);
    const data = await readBounded(actual);
    exports[file] = data.value;
    sources.push({ file, sha256: data.sha256 });
  }
  const summary = aggregatePlaytests({
    manifest,
    protocol,
    exports,
    pack,
    contentSha256: contentRaw.sha256,
  });
  // 校验成功才创建新目录；拒绝覆盖历史报告，不触碰源文件。
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  await writeFile(
    resolve(out, 'summary.json'),
    JSON.stringify(
      {
        ...summary,
        provenance: {
          manifestSha256: manifestRaw.sha256,
          protocolSha256: protocolRaw.sha256,
          sources,
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(resolve(out, 'report.md'), renderReport(summary));
  await writeFile(
    resolve(out, 'review-budget.json'),
    JSON.stringify(auditReviews(contentRaw.value, protocol.maxReviewCharacters), null, 2) + '\n',
  );
  console.log(
    `${summary.studyStatus}: ${summary.cohort.recorded}/${summary.cohort.enrolled} 人有首局；报告 ${out}`,
  );
  if (options.requireGates && Object.values(summary.gates).some((v) => v !== 'pass'))
    process.exitCode = 2;
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
