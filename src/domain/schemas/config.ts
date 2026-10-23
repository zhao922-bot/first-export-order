import { z } from 'zod';
import {
  idSchema,
  parameterSchema,
  scoreSchema,
  positiveIntSchema,
  nonnegativeIntSchema,
  unsignedDecimalSchema,
  moneyMinorSchema,
  parameterOf,
} from './common';
import { effectSchema, flagDefinitionSchema, rubricSchema } from './effects';

export const economyConfigSchema = z.record(idSchema, parameterSchema);
export const balanceConfigSchema = z.strictObject({
  initialReputation: scoreSchema,
  deliveryDays: positiveIntSchema,
  rescueLimit: z.literal(1),
  perStageEventCap: positiveIntSchema,
  perRunEventCap: positiveIntSchema,
});
export const scoringConfigSchema = z.strictObject({
  targetReturnOnCost: parameterOf(unsignedDecimalSchema),
  minimumScoreBasisCnyFen: parameterOf(moneyMinorSchema.positive()),
  excellentReputation: scoreSchema,
  rubrics: z.array(rubricSchema),
});
export const runtimeConfigSchema = z.strictObject({
  schemaVersion: z.literal(2),
  maxAutomaticTransitions: positiveIntSchema,
  maxDslDepth: positiveIntSchema.max(8),
  maxExpandedEffects: positiveIntSchema.max(64),
  maxSaveBytes: positiveIntSchema,
  maxTelemetryEvents: nonnegativeIntSchema,
});
export const systemEffectsSchema = z.record(idSchema, z.array(effectSchema));
export const flagsConfigSchema = z.array(flagDefinitionSchema);
