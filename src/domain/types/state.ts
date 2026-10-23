import type { z } from 'zod';
import type {
  playerStateSchema,
  orderStateSchema,
  storyProgressSchema,
  journalEntrySchema,
  accountSchema,
  decisionRecordSchema,
  eventWindowRecordSchema,
  gameSnapshotSchema,
  recoveryCheckpointSchema,
} from '../schemas/state';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type PlayerState = z.infer<typeof playerStateSchema>;
export type OrderState = z.infer<typeof orderStateSchema>;
export type StoryProgress = z.infer<typeof storyProgressSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type Account = z.infer<typeof accountSchema>;
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;
export type EventWindowRecord = z.infer<typeof eventWindowRecordSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
export type RecoveryCheckpoint = z.infer<typeof recoveryCheckpointSchema>;
