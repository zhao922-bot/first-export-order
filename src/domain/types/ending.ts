import type { z } from 'zod';
import type { endingResultSchema, endingDefinitionSchema } from '../schemas/ending';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type EndingResult = z.infer<typeof endingResultSchema>;
export type EndingDefinition = z.infer<typeof endingDefinitionSchema>;
