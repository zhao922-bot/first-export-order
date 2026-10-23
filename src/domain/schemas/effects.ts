import { z } from 'zod';
import {
  idSchema,
  scalarSchema,
  decimalTextSchema,
  nonnegativeIntSchema,
  positiveIntSchema,
} from './common';

export const literalSchema = z.strictObject({ kind: z.literal('literal'), value: scalarSchema });
export const referenceSchema = z.strictObject({
  kind: z.literal('ref'),
  scope: z.enum(['state', 'config', 'input', 'result']),
  path: idSchema,
});
/** 条件求值不得消耗随机数。 */
export const conditionValueSchema = z.discriminatedUnion('kind', [literalSchema, referenceSchema]);
export const valueExprSchema = z.discriminatedUnion('kind', [
  literalSchema,
  referenceSchema,
  z
    .strictObject({
      kind: z.literal('randomInt'),
      min: z.number().int().safe(),
      max: z.number().int().safe(),
      drawKey: idSchema,
    })
    .refine((range) => range.min <= range.max, '随机区间顺序错误'),
  z.strictObject({
    kind: z.literal('randomDecimal'),
    min: decimalTextSchema,
    max: decimalTextSchema,
    step: decimalTextSchema,
    drawKey: idSchema,
  }),
]);
export const conditionSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.enum(['all', 'any']),
    get conditions(): z.ZodArray<typeof conditionSchema> {
      return z.array(conditionSchema);
    },
  }),
  z.strictObject({
    op: z.literal('not'),
    get condition(): typeof conditionSchema {
      return conditionSchema;
    },
  }),
  z.strictObject({
    op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
    left: conditionValueSchema,
    right: conditionValueSchema,
  }),
  z.strictObject({
    op: z.literal('in'),
    left: conditionValueSchema,
    right: z.array(conditionValueSchema).min(1),
  }),
  z.strictObject({ op: z.literal('exists'), value: conditionValueSchema }),
  z.strictObject({
    op: z.literal('flag'),
    path: idSchema,
    equals: scalarSchema,
  }),
]);
export const effectSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('adjust'),
    target: idSchema,
    value: valueExprSchema,
    clamp: z
      .strictObject({ min: z.number().finite(), max: z.number().finite() })
      .refine((range) => range.min <= range.max, '钳制范围顺序错误')
      .optional(),
  }),
  z.strictObject({ op: z.literal('set'), target: idSchema, value: valueExprSchema }),
  z.strictObject({ op: z.literal('advanceDays'), value: valueExprSchema, reason: idSchema }),
  z.strictObject({
    op: z.literal('rule'),
    ruleId: idSchema,
    args: z.record(idSchema, valueExprSchema),
  }),
  z.strictObject({ op: z.literal('unlockTerm'), termId: idSchema }),
  z.strictObject({
    op: z.literal('recordEvidence'),
    rubricId: idSchema,
    earned: nonnegativeIntSchema.max(2),
  }),
  z.strictObject({
    op: z.literal('if'),
    when: conditionSchema,
    get then(): z.ZodArray<typeof effectSchema> {
      return z.array(effectSchema);
    },
    get else(): z.ZodArray<typeof effectSchema> {
      return z.array(effectSchema);
    },
  }),
]);
export const scheduledActionSchema = z.strictObject({
  id: idSchema,
  dueGameDay: nonnegativeIntSchema,
  effectListId: idSchema,
  status: z.enum(['pending', 'applied']),
});
export const flagDefinitionSchema = z.strictObject({
  id: idSchema,
  valueType: z.enum(['string', 'number', 'boolean']),
  description: z.string(),
});
export const rubricSchema = z.strictObject({
  id: idSchema,
  dimension: z.enum(['risk', 'professionalism', 'relationship', 'compliance']),
  opportunityId: idSchema,
  mandatory: z.boolean(),
  maxPoints: positiveIntSchema.max(2),
  evidenceNodeIds: z.array(idSchema),
  title: z.string().optional(),
  paymentMethods: z
    .array(z.enum(['TT', 'LC_SIGHT', 'OA_60']))
    .min(1)
    .optional(),
});
