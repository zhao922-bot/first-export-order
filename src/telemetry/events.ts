import { z } from 'zod';
export const phaseSchema = z.enum(['pre', 'post']);
export type Phase = z.infer<typeof phaseSchema>;
export const assessmentSchema = z.strictObject({
  status: z.enum(['pending', 'completed', 'skipped', 'unavailable']),
  answers: z.record(z.string(), z.strictObject({ optionId: z.string(), correct: z.boolean() })),
});
export const runSchema = z.strictObject({
  runId: z.string(),
  seedHash: z.string(),
  contentVersion: z.string(),
  configVersion: z.string(),
  started: z.boolean(),
  mode: z.enum(['full', 'practice', 'imported']),
  startedAt: z.number(),
  lastSeen: z.number(),
  activeMs: z.number().nonnegative(),
  stageMs: z.record(z.string(), z.number().nonnegative()),
  entered: z.array(z.number()),
  completed: z.array(z.number()),
  ending: z
    .strictObject({
      kind: z.string(),
      completion: z.string(),
      scores: z.record(z.string(), z.number()),
    })
    .nullable(),
  restarted: z.enum(['during', 'after']).nullable(),
  counts: z.record(z.string(), z.number().nonnegative()),
  pre: assessmentSchema,
  post: assessmentSchema,
});
export type PlaytestRun = z.infer<typeof runSchema>;
export const eventSchema = z.strictObject({
  eventId: z.string(),
  runId: z.string(),
  sessionId: z.string(),
  eventName: z.string(),
  timestamp: z.string(),
  activeElapsedMs: z.number(),
  stage: z.number(),
  nodeId: z.string(),
  seedHash: z.string(),
  contentVersion: z.string(),
  configVersion: z.string(),
  schemaVersion: z.literal(1),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type TelemetryEvent = z.infer<typeof eventSchema>;
export const telemetrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  runs: z.array(runSchema).max(100),
  events: z.array(eventSchema).max(2000),
  droppedEvents: z.number().int().nonnegative(),
  capacityReached: z.boolean(),
});
export type TelemetryData = z.infer<typeof telemetrySchema>;
