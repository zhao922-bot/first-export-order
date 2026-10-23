import type { z } from 'zod';
import type {
  gameCommandSchema,
  dispatchResultSchema,
  restoreResultSchema,
  transitionResultSchema,
} from '../schemas/commands';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type GameCommand = z.infer<typeof gameCommandSchema>;
export type DispatchResult = z.infer<typeof dispatchResultSchema>;
export type RestoreResult = z.infer<typeof restoreResultSchema>;
export type TransitionResult = z.infer<typeof transitionResultSchema>;
