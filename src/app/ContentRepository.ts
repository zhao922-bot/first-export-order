import { parseContent } from '../content/validation';
import type { ContentPack } from '../domain/types';

export interface ContentRepository {
  parse(input: unknown, source: string): ContentPack;
}
/** 仅提供验证入口；不会在解析过程中执行剧情。 */
export const contentRepository: ContentRepository = { parse: parseContent };
