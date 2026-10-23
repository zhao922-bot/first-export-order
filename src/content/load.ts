import { contentManifestSchema } from '../domain/schemas/content';
import { contentRepository } from '../app/ContentRepository';
import type { ContentPack } from '../domain/types';

const files = import.meta.glob<unknown>('./**/*.json', { eager: true, import: 'default' });
/** 运行时也必须验证，不依赖构建时检查的结果。 */
export function loadValidatedContent(): ContentPack[] {
  const manifest = contentManifestSchema.parse(files['./manifest.json']);
  return manifest.packs.map((path) => {
    const pack = contentRepository.parse(files[`./${path}`], path);
    if (pack.contentVersion !== manifest.contentVersion || pack.mode !== manifest.mode)
      throw new Error('内容包版本或模式不匹配');
    return pack;
  });
}
