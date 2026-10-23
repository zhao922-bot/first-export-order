import { z } from 'zod';
import {
  idSchema,
  idListSchema,
  textSchema,
  unsignedDecimalSchema,
  probabilitySchema,
  positiveIntSchema,
  nonnegativeIntSchema,
  scoreSchema,
  paymentMethodSchema,
} from './common';

export const productSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: textSchema,
  unit: z.literal('piece'),
  attributes: z.record(idSchema, textSchema),
  vatRateParam: idSchema,
  rebateRateParam: idSchema,
  dimensionsCm: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  weightKg: unsignedDecimalSchema,
  unitsPerCarton: positiveIntSchema,
  cartonCbm: unsignedDecimalSchema,
  complianceProfileIds: idListSchema,
  riskTags: idListSchema,
  supplierIds: idListSchema.length(3),
});
export const supplierSchema = z.strictObject({
  id: idSchema,
  productId: idSchema,
  name: textSchema,
  taxInclusiveUnitPriceParam: idSchema,
  moq: positiveIntSchema,
  leadDays: positiveIntSchema,
  depositRatioParam: idSchema,
  credentials: z.array(
    z.strictObject({ id: idSchema, status: z.enum(['verified', 'pending', 'missing']) }),
  ),
  qualityRisk: probabilitySchema,
  delayRisk: probabilitySchema,
  riskEventIds: idListSchema,
  negotiationStyle: textSchema,
});
const dialogueBudgetSchema = z.strictObject({
  lines: nonnegativeIntSchema,
  chars: nonnegativeIntSchema,
});
export const customerSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  identity: textSchema,
  market: textSchema,
  persona: z.enum(['precise', 'bargainer', 'novice', 'fraud', 'potential']),
  tags: z.array(textSchema),
  initialTrust: z
    .strictObject({ min: scoreSchema, max: scoreSchema })
    .refine((range) => range.min <= range.max, '信任最小值大于最大值'),
  bargainingStyle: textSchema,
  exclusiveEventIds: idListSchema,
  preferredPayments: z.array(paymentMethodSchema).min(1),
  allowedPorts: idListSchema,
  dialogueBudget: dialogueBudgetSchema,
});
export const mentorSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  identity: textSchema,
  age: positiveIntSchema,
  experienceYears: nonnegativeIntSchema,
  tags: z.array(textSchema),
  initialTrust: z.null(),
  bargainingStyle: z.null(),
  exclusiveEventIds: idListSchema,
  dialogueBudget: dialogueBudgetSchema,
});
export const inquirySchema = z
  .strictObject({
    id: idSchema,
    senderRole: z.enum(['buyer', 'competitor', 'fraud']),
    customerId: idSchema.nullable(),
    subject: textSchema,
    body: textSchema,
    signalTags: idListSchema,
    requestedQuantity: positiveIntSchema,
    replyNodeId: idSchema,
  })
  .refine(
    (inquiry) =>
      inquiry.senderRole === 'competitor'
        ? inquiry.customerId === null
        : inquiry.customerId !== null,
    '真实买家/诈骗询盘必须引用客户，同行不得创建客户',
  );
export const glossarySchema = z.strictObject({
  id: idSchema,
  title: textSchema,
  plainDefinition: textSchema,
  triggerNodeIds: idListSchema,
  exampleTemplate: textSchema,
  pitfall: textSchema,
  prerequisiteIds: idListSchema,
  sourceRefs: z.array(z.url()),
  reviewStatus: z.enum(['draft', 'approved']),
});
export const forwarderSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  priceParam: idSchema,
  sailingDay: nonnegativeIntSchema,
  cutoffDay: nonnegativeIntSchema,
  transitDays: positiveIntSchema,
  portId: idSchema,
});
