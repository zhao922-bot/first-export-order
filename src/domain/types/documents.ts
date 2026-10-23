import type { z } from 'zod';
import type {
  documentPuzzleSchema,
  documentTemplateSchema,
  puzzleDefinitionSchema,
} from '../schemas/documents';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type DocumentPuzzle = z.infer<typeof documentPuzzleSchema>;
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export type PuzzleDefinition = z.infer<typeof puzzleDefinitionSchema>;
