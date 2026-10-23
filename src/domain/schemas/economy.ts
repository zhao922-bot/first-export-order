import { z } from 'zod';
import {
  decimalTextSchema,
  unsignedDecimalSchema,
  positiveIntSchema,
  moneyMinorSchema,
  idSchema,
  nonnegativeIntSchema,
  probabilitySchema,
} from './common';

export const quoteInputSchema = z.strictObject({
  taxInclusiveUnitCny: unsignedDecimalSchema,
  quantity: positiveIntSchema,
  vatRate: probabilitySchema,
  rebateRate: probabilitySchema,
  rebateEligible: z.boolean(),
  domesticTotalCny: unsignedDecimalSchema,
  fxCnyPerUsd: unsignedDecimalSchema.refine((value) => Number(value) > 0, '汇率必须为正'),
  costMarkupRate: unsignedDecimalSchema,
  oceanTotalUsd: unsignedDecimalSchema,
  insuranceCoverageFactor: unsignedDecimalSchema,
  insuranceRate: probabilitySchema,
});
export const exwQuoteInputSchema = quoteInputSchema
  .pick({
    taxInclusiveUnitCny: true,
    quantity: true,
    vatRate: true,
    rebateRate: true,
    rebateEligible: true,
    fxCnyPerUsd: true,
    costMarkupRate: true,
  })
  .extend({ factoryDeliveryTotalCny: unsignedDecimalSchema });
export const quoteResultSchema = z.strictObject({
  rebateUnitCny: decimalTextSchema,
  netPurchaseUnitCny: decimalTextSchema,
  domesticUnitCny: decimalTextSchema,
  fobCostUnitCny: decimalTextSchema,
  fobUnitUsdRaw: decimalTextSchema,
  cifUnitUsdRaw: decimalTextSchema,
  fobUnitUsdQuoted: decimalTextSchema,
  cifUnitUsdQuoted: decimalTextSchema,
  insuranceTotalUsd: decimalTextSchema,
  steps: z.array(
    z.strictObject({
      formulaId: idSchema,
      inputs: z.record(idSchema, decimalTextSchema),
      output: decimalTextSchema,
    }),
  ),
});
export const freightInputSchema = z.strictObject({
  quantity: positiveIntSchema,
  totalCbm: unsignedDecimalSchema,
  totalWeightKg: unsignedDecimalSchema,
  usableCbm: unsignedDecimalSchema,
  usableWeightKg: unsignedDecimalSchema,
  containerRateUsd: unsignedDecimalSchema,
  surchargesUsd: unsignedDecimalSchema,
});
export const freightResultSchema = z.strictObject({
  containerCount: positiveIntSchema,
  totalUsd: decimalTextSchema,
  unitUsd: decimalTextSchema,
});
export const quoteAnswersSchema = z.strictObject({
  rebateUnitCny: decimalTextSchema,
  fobCostUnitCny: decimalTextSchema,
  fobUnitUsd: decimalTextSchema,
  cifUnitUsd: decimalTextSchema,
  rateBasis: z.enum(['costMarkup', 'salesMargin']),
});
export const quoteErrorCodeSchema = z.enum([
  'REBATE_OMITTED',
  'MARGIN_AS_MARKUP',
  'DOMESTIC_DUPLICATED',
  'OTHER_QUOTE_ERROR',
]);
export const quoteEvaluationSchema = z.strictObject({
  correct: z.boolean(),
  errorCode: quoteErrorCodeSchema.nullable(),
  resultId: idSchema,
  fieldErrors: z.array(z.strictObject({ field: idSchema, code: idSchema, message: z.string() })),
});
export const cashflowItemSchema = z.strictObject({
  id: idSchema,
  dueDay: nonnegativeIntSchema,
  direction: z.enum(['in', 'out']),
  amountCnyFen: moneyMinorSchema.nonnegative(),
  certainty: z.enum(['confirmed', 'forecast']),
  sourceId: idSchema,
});
export const cashflowForecastSchema = z.strictObject({
  minimumCashCnyFen: moneyMinorSchema,
  gapDay: nonnegativeIntSchema.nullable(),
  items: z.array(cashflowItemSchema),
});
export const numericErrorSchema = z.strictObject({
  code: z.enum([
    'INVALID_QUANTITY',
    'INVALID_RATE',
    'INVALID_FX',
    'INSURANCE_DENOMINATOR',
    'OUT_OF_RANGE',
  ]),
  field: idSchema,
});
