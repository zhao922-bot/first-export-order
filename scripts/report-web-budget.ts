import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { presentation } from '../src/content/presentation';
type Chunk = { file: string; isEntry?: boolean; imports?: string[]; dynamicImports?: string[] };
const root = resolve(process.argv[2] ?? 'dist');
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8')) as Record<
  string,
  Chunk
>;
const entry = Object.keys(manifest).find((id) => manifest[id]!.isEntry)!;
const initial = new Set<string>();
function visit(id: string) {
  if (initial.has(id)) return;
  initial.add(id);
  for (const dependency of manifest[id]!.imports ?? []) visit(dependency);
}
visit(entry);
const files = [...initial].map((id) => {
  const file = manifest[id]!.file;
  const bytes = readFileSync(resolve(root, file));
  return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const initialJsBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const initialJsGzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, 0);
const portraits = presentation.optimizedAtlases.map(({ source, webp, delivery }) => ({
  source,
  webp,
  delivery,
  pngBytes: statSync(resolve(root, source)).size,
  webpBytes: statSync(resolve(root, webp)).size,
  deliveryBytes: statSync(resolve(root, delivery)).size,
}));
const report = {
  initialJsBytes,
  initialJsGzipBytes,
  files,
  lazyEntries: Object.keys(manifest).filter((id) => !initial.has(id)),
  portraits,
};
const destination = process.argv[3] ?? 'outputs/experience-polish';
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'budget.json'), JSON.stringify(report, null, 2) + '\n');
if (initialJsBytes > 300_000 || initialJsGzipBytes > 110_000)
  throw new Error('首屏 JS 超出本轮预算（含所有静态依赖）');
for (const portrait of portraits)
  if (
    portrait.webpBytes > portrait.pngBytes * 0.7 ||
    portrait.deliveryBytes > 320_000 ||
    portrait.deliveryBytes > portrait.webpBytes * 0.25
  )
    throw new Error('角色资源超出预算');
console.log(
  `首屏 JS（含静态依赖）${initialJsBytes} B，gzip ${initialJsGzipBytes} B；延迟入口 ${report.lazyEntries.length} 个；角色交付资源预算通过。`,
);
