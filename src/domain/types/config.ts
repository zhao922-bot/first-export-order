import type { z } from 'zod';
import type {
  economyConfigSchema,
  balanceConfigSchema,
  scoringConfigSchema,
  runtimeConfigSchema,
} from '../schemas/config';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type EconomyConfig = z.infer<typeof economyConfigSchema>;
export type BalanceConfig = z.infer<typeof balanceConfigSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
