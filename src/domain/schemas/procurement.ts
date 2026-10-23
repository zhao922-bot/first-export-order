import { z } from 'zod';
import { idSchema, textSchema, moneyMinorSchema, nonnegativeIntSchema } from './common';

export const piFieldIds = [
  'parties',
  'product',
  'quantity',
  'amount',
  'terms',
  'payment',
  'delivery',
] as const;
export const inspectionItemIds = [
  'material',
  'quantity',
  'specification',
  'packaging',
  'documents',
] as const;
export const procurementContentSchema = z.strictObject({
  piFields: z.array(z.strictObject({ id: z.enum(piFieldIds), label: textSchema })),
  fundingChecks: z.array(z.strictObject({ id: idSchema, label: textSchema })).min(3),
  fundingEvidence: z.strictObject({
    tt: textSchema,
    lc: textSchema,
    oa: textSchema,
    fraud: textSchema,
  }),
  fundingMessages: z.strictObject({
    NONE: textSchema,
    VERIFIED: textSchema,
    IDENTITY: textSchema,
    SOFT: textSchema,
    EXPIRED: textSchema,
  }),
  inspectionProfiles: z.array(
    z.strictObject({
      productId: idSchema,
      items: z.array(
        z.strictObject({
          id: z.enum(inspectionItemIds),
          label: textSchema,
          good: textSchema,
          bad: textSchema,
        }),
      ),
    }),
  ),
  productionDaysParam: idSchema,
  delayDaysParam: idSchema,
  reworkFeeParam: idSchema,
  reworkDaysParam: idSchema,
  supplementFeeParam: idSchema,
  supplementDaysParam: idSchema,
  lcValidityDaysParam: idSchema,
  lcRepairDaysParam: idSchema,
  refundBeforeProductionParam: idSchema,
  refundAfterProductionParam: idSchema,
});
export const procurementStateSchema = z.strictObject({
  piConfirmations: z.array(z.enum(piFieldIds)),
  fundingChecks: z.array(idSchema),
  fundingResult: z.enum(['NONE', 'VERIFIED', 'IDENTITY', 'SOFT', 'EXPIRED']),
  customerReceivedUsdCent: moneyMinorSchema.nonnegative(),
  customerAdvanceFen: moneyMinorSchema.nonnegative(),
  customerRefundFen: moneyMinorSchema.nonnegative(),
  bankFeeFen: moneyMinorSchema.nonnegative(),
  purchaseTotalFen: moneyMinorSchema.nonnegative(),
  supplierDepositFen: moneyMinorSchema.nonnegative(),
  supplierBalanceFen: moneyMinorSchema.nonnegative(),
  supplierRefundFen: moneyMinorSchema.nonnegative(),
  cancellationLossFen: moneyMinorSchema.nonnegative(),
  qualityIssue: z.boolean(),
  qualityRoll: z.number().min(0).lt(1).nullable(),
  delayIssue: z.boolean(),
  documentsMissing: z.boolean(),
  productionDone: z.boolean(),
  reworked: z.boolean(),
  supplemented: z.boolean(),
  inspectionRevision: nonnegativeIntSchema,
  viewedEvidence: z.array(z.enum(inspectionItemIds)),
  inspectionAnswers: z.record(z.enum(inspectionItemIds), z.enum(['unanswered', 'pass', 'issue'])),
  inspectionErrors: z.array(z.enum(inspectionItemIds)),
  inspectionAccepted: z.boolean(),
  lcExpiryDay: nonnegativeIntSchema,
});
export type ProcurementState = z.infer<typeof procurementStateSchema>;
