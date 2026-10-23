import type { z } from 'zod';
import type {
  valueExprSchema,
  conditionSchema,
  effectSchema,
  scheduledActionSchema,
  flagDefinitionSchema,
  rubricSchema,
} from '../schemas/effects';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type ValueExpr = z.infer<typeof valueExprSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type ScheduledAction = z.infer<typeof scheduledActionSchema>;
export type FlagDefinition = z.infer<typeof flagDefinitionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
