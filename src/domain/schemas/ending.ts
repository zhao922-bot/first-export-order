import { z } from 'zod';
import { idSchema, idListSchema, scoreSchema, moneyMinorSchema, textSchema } from './common';

export const endingKindSchema = z.enum(['excellent', 'breakeven', 'tuition', 'bankrupt']);
export const scoresSchema = z.strictObject({
  profit: scoreSchema,
  risk: scoreSchema,
  professionalism: scoreSchema,
  relationship: scoreSchema,
  compliance: scoreSchema,
});
export const endingResultSchema = z.strictObject({
  kind: endingKindSchema,
  completion: z.enum(['completed', 'lost_order', 'bankrupt']),
  subtitle: z.string(),
  profitCnyFen: moneyMinorSchema,
  finalCashCnyFen: moneyMinorSchema,
  scores: scoresSchema,
  learnedTermIds: idListSchema,
  masteredTermIds: idListSchema,
  replayDecisionIds: idListSchema.max(3),
  repeatIntent: z.strictObject({ unlocked: z.boolean(), customerId: idSchema.nullable() }),
  scoreEvidenceIds: idListSchema,
  unsettledItems: idListSchema,
});
export const endingDefinitionSchema = z.strictObject({
  id: idSchema,
  kind: endingKindSchema,
  title: textSchema,
  text: textSchema,
});
