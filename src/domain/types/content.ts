import type { z } from 'zod';
import type { contentPackSchema, contentManifestSchema } from '../schemas/content';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type ContentPack = z.infer<typeof contentPackSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
