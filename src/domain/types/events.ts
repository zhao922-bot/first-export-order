import type { z } from 'zod';
import type {
  gameEventSchema,
  eventReviewSchema,
  eventWindowConfigSchema,
  eventSchedulingSchema,
  eventEconomySchema,
} from '../schemas/events';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type GameEvent = z.infer<typeof gameEventSchema>;
export type EventReview = z.infer<typeof eventReviewSchema>;
export type EventWindowConfig = z.infer<typeof eventWindowConfigSchema>;
export type EventScheduling = z.infer<typeof eventSchedulingSchema>;
export type EventEconomy = z.infer<typeof eventEconomySchema>;
