import { z } from 'zod';
import { idSchema, nonnegativeIntSchema, decimalTextSchema, scalarSchema } from './common';
import { gameSnapshotSchema, journalEntrySchema } from './state';

const base = { commandId: idSchema, expectedRevision: nonnegativeIntSchema, nodeId: idSchema };
export const gameCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('choose'), choiceId: idSchema }),
  z.strictObject({
    ...base,
    type: z.literal('submitQuote'),
    answers: z.record(idSchema, decimalTextSchema),
  }),
  z.strictObject({
    ...base,
    type: z.literal('submitPuzzle'),
    selectedFieldIds: z.array(idSchema),
    corrections: z.record(idSchema, scalarSchema),
  }),
  z.strictObject({ ...base, type: z.literal('continue') }),
  z.strictObject({ ...base, type: z.literal('useRescue') }),
]);
export const dispatchResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    revision: nonnegativeIntSchema,
    feedbackId: idSchema,
    saveStatus: z.enum(['saved', 'memoryOnly']),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum(['STALE_REVISION', 'INVALID_INPUT', 'CONTENT_ERROR']),
    message: z.string(),
  }),
]);
export const restoreResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), migratedFrom: nonnegativeIntSchema.nullable() }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum(['CORRUPT', 'FUTURE_VERSION', 'CONTENT_MISMATCH']),
    recoverable: z.boolean(),
  }),
]);
export const transitionResultSchema = z.strictObject({
  snapshot: gameSnapshotSchema,
  journalAdded: z.array(journalEntrySchema),
  feedbackId: idSchema,
});
