import { z } from 'zod';
import { idSchema, textSchema, nonnegativeIntSchema, moneyMinorSchema } from './common';
export const declarationIds = [
  'product',
  'quantity',
  'amount',
  'term',
  'origin',
  'destination',
] as const;
export const logisticsContentSchema = z.strictObject({
  plans: z
    .array(
      z.strictObject({
        forwarderId: idSchema,
        description: textSchema,
        domesticRatioParam: idSchema,
        surchargeParam: idSchema,
        pickupDays: z.number().int().min(1).max(30),
        customsRiskParam: idSchema,
        rolloverRiskParam: idSchema,
      }),
    )
    .length(3),
  declarationFields: z.array(z.strictObject({ id: z.enum(declarationIds), label: textSchema })),
  responsibilities: z.strictObject({ EXW: textSchema, FOB: textSchema, CIF: textSchema }),
  riskCopy: z.strictObject({ none: textSchema, customs: textSchema, rollover: textSchema }),
  insuranceCopy: z.strictObject({ basic: textSchema, extended: textSchema, buyer: textSchema }),
  capacityCbmParam: idSchema,
  capacityKgParam: idSchema,
  cartonTareKgParam: idSchema,
  preparationDaysParam: idSchema,
  nextSailingDaysParam: idSchema,
  extendedRateParam: idSchema,
  customsDaysParam: idSchema,
  customsFeeParam: idSchema,
  expeditedDaysParam: idSchema,
  expeditedFeeParam: idSchema,
  rolloverDaysParam: idSchema,
  storageFeeParam: idSchema,
  priorityDaysParam: idSchema,
  priorityOceanFeeParam: idSchema,
  priorityCoordinationFeeParam: idSchema,
  dailyPenaltyParam: idSchema,
  dailyReputationParam: idSchema,
});
export const logisticsStateSchema = z.strictObject({
  enteredDay: nonnegativeIntSchema,
  forwarderId: idSchema.nullable(),
  insurance: z.enum(['basic', 'extended', 'buyer']).nullable(),
  declarationDraft: z.record(z.enum(declarationIds), z.string().max(200)),
  declarationChecks: z.array(z.enum(declarationIds)),
  declarationErrors: z.array(z.enum(declarationIds)),
  booked: z.boolean(),
  dispatched: z.boolean(),
  risk: z.enum(['none', 'customs', 'rollover']).nullable(),
  riskResolved: z.boolean(),
  resolution: z.enum(['standard', 'expedite', 'wait', 'priority']).nullable(),
  readyDay: nonnegativeIntSchema.nullable(),
  shipmentDay: nonnegativeIntSchema.nullable(),
  domesticPaidFen: moneyMinorSchema.nonnegative(),
  oceanPaidFen: moneyMinorSchema.nonnegative(),
  insurancePaidFen: moneyMinorSchema.nonnegative(),
  incidentPaidFen: moneyMinorSchema.nonnegative(),
  penaltyPaidFen: moneyMinorSchema.nonnegative(),
  held: z.boolean(),
});
export type LogisticsState = z.infer<typeof logisticsStateSchema>;
