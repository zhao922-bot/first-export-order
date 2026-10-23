import { z } from 'zod';
import {
  idSchema,
  textSchema,
  positiveIntSchema,
  probabilitySchema,
  incotermSchema,
  paymentMethodSchema,
} from './common';

export const negotiationContentSchema = z.strictObject({
  profiles: z.array(
    z.strictObject({
      customerId: idSchema,
      openingDiscountParam: idSchema,
      pricePrompt: textSchema,
      paymentPrompt: textSchema,
      termsPrompt: textSchema,
    }),
  ),
  offers: z.array(
    z.strictObject({
      id: idSchema,
      quantityRatioParam: idSchema,
      discountParam: idSchema.nullable(),
      depositRatioParam: idSchema,
      requiresDeposit: z.boolean(),
    }),
  ),
  payments: z.array(
    z.strictObject({ id: paymentMethodSchema, label: textSchema, explanation: textSchema }),
  ),
  terms: z.array(
    z.strictObject({ id: incotermSchema, placeParam: idSchema, explanation: textSchema }),
  ),
  checklist: z.array(z.strictObject({ id: idSchema, label: textSchema })).min(6),
});
export const negotiationDraftSchema = z.strictObject({
  offerId: idSchema.nullable(),
  quantity: positiveIntSchema,
  discountRate: probabilitySchema,
  depositRatio: probabilitySchema,
  confirmations: z.array(idSchema),
});
export type NegotiationDraft = z.infer<typeof negotiationDraftSchema>;
