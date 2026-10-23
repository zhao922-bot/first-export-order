import { z } from 'zod';
import {
  idSchema,
  idListSchema,
  moneyMinorSchema,
  scoreSchema,
  nonnegativeIntSchema,
  decimalTextSchema,
  scalarSchema,
  incotermSchema,
  paymentMethodSchema,
  stageSchema,
} from './common';
import { quoteResultSchema } from './economy';
import { scheduledActionSchema } from './effects';

export const eventWindowRecordSchema = z.strictObject({
  id: idSchema,
  stage: stageSchema,
  anchorNodeId: idSchema,
  status: z.enum(['pending', 'resolved']),
  eventId: idSchema.nullable(),
  probabilityRoll: decimalTextSchema.nullable(),
  selectedWeight: decimalTextSchema.nullable(),
});

export const playerStateSchema = z.strictObject({
  cashCnyFen: moneyMinorSchema.describe('现金科目投影，允许负数；不得由 UI 写入'),
  cumulativeProfitCnyFen: moneyMinorSchema.describe('已确认利润，不等于现金增量'),
  reputation: scoreSchema,
  trustByCustomer: z.record(idSchema, scoreSchema),
  learnedTermIds: idListSchema,
  masteredTermIds: idListSchema,
  criticalMistakeCount: nonnegativeIntSchema,
  rescueUsed: z.boolean(),
});
export const orderStateSchema = z.strictObject({
  id: idSchema,
  productId: idSchema.nullable(),
  supplierId: idSchema.nullable(),
  customerId: idSchema.nullable(),
  quantity: nonnegativeIntSchema,
  incoterm: incotermSchema.nullable(),
  namedPlace: z.string().nullable(),
  payment: paymentMethodSchema.nullable(),
  quote: quoteResultSchema.nullable(),
  contractUnitUsd: decimalTextSchema.nullable(),
  invoiceUsdCent: moneyMinorSchema.nonnegative().nullable(),
  status: z.enum([
    'draft',
    'negotiating',
    'contracted',
    'producing',
    'ready',
    'delivered',
    'shipped',
    'collected',
    'cancelled',
  ]),
  signedDay: nonnegativeIntSchema.nullable(),
  deliveryDueDay: nonnegativeIntSchema.nullable(),
  deliveryCompletedDay: nonnegativeIntSchema.nullable(),
  collectionDueDay: nonnegativeIntSchema.nullable(),
  remainingDeliveryDays: z.number().int().nullable(),
  overdueDaysCharged: nonnegativeIntSchema,
  taxEligibility: z.enum(['pending', 'eligible', 'ineligible']),
  flags: z.record(idSchema, scalarSchema),
});
export const decisionRecordSchema = z.strictObject({
  id: idSchema,
  nodeId: idSchema,
  choiceId: idSchema,
  stage: stageSchema,
  sequence: nonnegativeIntSchema,
  deltas: z.strictObject({
    cashCnyFen: moneyMinorSchema,
    profitCnyFen: moneyMinorSchema,
    reputation: z.number().int(),
    trust: z.number().int(),
    days: z.number().int(),
  }),
  evidence: z.array(
    z.strictObject({
      rubricId: idSchema,
      earned: nonnegativeIntSchema,
      possible: nonnegativeIntSchema,
    }),
  ),
  consequenceText: z.string(),
  counterfactualReviewId: idSchema.nullable(),
  familyId: idSchema.optional(),
  majorRisk: z.boolean().optional(),
  before: z
    .strictObject({
      cashCnyFen: moneyMinorSchema,
      profitCnyFen: moneyMinorSchema,
      reputation: scoreSchema,
      trust: scoreSchema,
      day: nonnegativeIntSchema,
    })
    .optional(),
});
const rngWord = z.number().int().min(0).max(0xffffffff);
const rngStateSchema = z
  .tuple([rngWord, rngWord, rngWord, rngWord])
  .refine((state) => state.some((word) => word !== 0), '随机状态不能全零');
export const storyProgressSchema = z.strictObject({
  stage: stageSchema,
  nodeId: idSchema,
  visitIndex: nonnegativeIntSchema,
  seed: z.string().min(1),
  rngVersion: nonnegativeIntSchema,
  rngState: z.strictObject({
    parameters: rngStateSchema,
    events: rngStateSchema,
    documents: rngStateSchema,
  }),
  drawCount: nonnegativeIntSchema,
  sampledParameters: z.record(idSchema, scalarSchema),
  completedNodeIds: idListSchema,
  appliedCommandIds: idListSchema,
  triggeredEventIds: idListSchema,
  eventWindows: z.array(eventWindowRecordSchema),
  pendingEvent: z
    .strictObject({ eventId: idSchema, windowId: idSchema, returnNodeId: idSchema })
    .nullable(),
  puzzleDrafts: z.record(idSchema, z.record(idSchema, scalarSchema)),
  pendingFeedback: z.strictObject({ sourceId: idSchema, reviewNodeId: idSchema }).nullable(),
  decisionLog: z.array(decisionRecordSchema),
});
export const accountSchema = z.enum([
  'cash',
  'capital',
  'sales',
  'expense',
  'inventory',
  'supplierAdvance',
  'customerAdvance',
  'receivable',
  'payable',
  'taxReceivable',
]);
export const journalEntrySchema = z.strictObject({
  id: idSchema,
  commandId: idSchema,
  sourceNodeId: idSchema,
  gameDay: nonnegativeIntSchema,
  description: z.string(),
  postings: z
    .array(
      z.strictObject({
        account: accountSchema,
        side: z.enum(['debit', 'credit']),
        amountCnyFen: moneyMinorSchema.nonnegative(),
      }),
    )
    .min(2),
  foreignMoney: z
    .strictObject({
      currency: z.literal('USD'),
      cents: moneyMinorSchema.nonnegative(),
      fxCnyPerUsd: decimalTextSchema,
    })
    .optional(),
});
const snapshotShape = {
  revision: nonnegativeIntSchema,
  runId: idSchema,
  gameDay: nonnegativeIntSchema,
  player: playerStateSchema,
  order: orderStateSchema,
  story: storyProgressSchema,
  journal: z.array(journalEntrySchema),
  scheduled: z.array(scheduledActionSchema),
};
export const recoveryCheckpointSchema = z.strictObject(snapshotShape);
export const gameSnapshotSchema = z.strictObject({
  ...snapshotShape,
  rescueCheckpoint: z
    .strictObject({ snapshotRevision: nonnegativeIntSchema, checkpointId: idSchema })
    .nullable(),
});
