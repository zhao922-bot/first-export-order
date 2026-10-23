import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { contentManifestSchema } from '../src/domain/schemas/content';
import { parseContent } from '../src/content/validation';
import { parseOnboarding } from '../src/content/onboarding';
import { parsePresentation } from '../src/content/presentation';
import type { ContentPack } from '../src/domain/types';

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `${path}#/: JSON 读取失败：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--file' || !args[1])
      throw new Error('用法：pnpm content:validate [--file 文件.json]');
    const file = resolve(args[1]);
    const pack = parseContent(await readJson(file), file);
    console.log(`内容校验通过：${pack.nodes.length} 个节点（${pack.mode}）`);
    return;
  }
  const root = await realpath(resolve('src/content'));
  const manifestFile = resolve(root, 'manifest.json');
  const raw = await readJson(manifestFile);
  const parsed = contentManifestSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${manifestFile}#/: ${parsed.error.message}`);
  const manifest = parsed.data;
  if (new Set(manifest.packs).size !== manifest.packs.length)
    throw new Error('manifest.json#/packs: 内容包重复登记');
  const declared = new Set([
    'manifest.json',
    ...manifest.packs,
    ...(manifest.onboarding ? [manifest.onboarding] : []),
    ...(manifest.presentation ? [manifest.presentation] : []),
  ]);
  const scan = async (dir: string): Promise<void> => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`${path}#/: 内容目录不接受符号链接`);
      if (item.isDirectory()) await scan(path);
      else if (
        item.name.endsWith('.json') &&
        !declared.has(relative(root, path).split(sep).join('/'))
      )
        throw new Error(`${path}#/: 未在 manifest 登记的 JSON 文件`);
    }
  };
  await scan(root);
  const globalIds = new Set<string>();
  let nodes = 0;
  const packs: ContentPack[] = [];
  for (const name of manifest.packs) {
    const file = await realpath(resolve(root, name));
    if (!file.startsWith(root + sep)) throw new Error(`${name}#/: 路径超出内容目录`);
    const pack = parseContent(await readJson(file), `src/content/${name}`);
    packs.push(pack);
    if (pack.contentVersion !== manifest.contentVersion || pack.mode !== manifest.mode)
      throw new Error(`${name}#/: 内容版本或模式与 manifest 不匹配`);
    for (const node of pack.nodes) {
      if (globalIds.has(node.id)) throw new Error(`${name}#/nodes: 跨包重复节点 id：${node.id}`);
      globalIds.add(node.id);
    }
    nodes += pack.nodes.length;
  }
  if (manifest.onboarding) {
    const guide = parseOnboarding(await readJson(resolve(root, manifest.onboarding)), packs);
    console.log(
      `新手引导校验通过：${guide.overview.length} 项界面说明、${guide.rules.length} 条情境提示`,
    );
  }
  if (manifest.presentation) {
    const visuals = parsePresentation(await readJson(resolve(root, manifest.presentation)), packs);
    await readFile(resolve('public', visuals.atlas));
    await readFile(resolve('public', visuals.mentor.atlas));
    await readFile(resolve('public', visuals.customers.atlas));
    for (const atlas of visuals.optimizedAtlases) {
      await readFile(resolve('public', atlas.webp));
      await readFile(resolve('public', atlas.delivery));
    }
    console.log(
      `演出配置校验通过：${visuals.actors.length} 位角色、${visuals.stages.length} 个场景、${visuals.mentor.expressions.length} 种林姐表情，图集存在`,
    );
  }
  console.log(
    `内容校验通过：${manifest.packs.length} 个内容包，${nodes} 个节点；模式 ${manifest.mode}`,
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
