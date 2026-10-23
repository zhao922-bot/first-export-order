import { z } from 'zod';
import { idSchema, parameterSchema, nonnegativeIntSchema } from './common';
import { gameSnapshotSchema, recoveryCheckpointSchema } from './state';

export const saveEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(2),
  engineVersion: z.string().min(1),
  contentVersion: z.string().min(1),
  configVersion: z.string().min(1),
  contentHash: z.string().min(1),
  runId: idSchema,
  slotId: idSchema,
  revision: nonnegativeIntSchema,
  savedAt: z.iso.datetime(),
  payload: gameSnapshotSchema,
  checkpoints: z
    .record(idSchema, recoveryCheckpointSchema)
    .refine((items) => Object.keys(items).length <= 1, '最多一个恢复检查点'),
  parameters: z.record(idSchema, parameterSchema),
  checksum: z.string().min(1),
});
