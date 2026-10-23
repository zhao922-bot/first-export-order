import type { z } from 'zod';
import type {
  idSchema,
  decimalTextSchema,
  moneyMinorSchema,
  stageSchema,
  incotermSchema,
  paymentMethodSchema,
  scalarSchema,
  teachingNoteSchema,
  parameterSchema,
} from '../schemas/common';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type Id = z.infer<typeof idSchema>;
export type DecimalText = z.infer<typeof decimalTextSchema>;
export type CnyFen = z.infer<typeof moneyMinorSchema>;
export type UsdCent = z.infer<typeof moneyMinorSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Incoterm = z.infer<typeof incotermSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type Scalar = z.infer<typeof scalarSchema>;
export type TeachingNote = z.infer<typeof teachingNoteSchema>;
export type EvaluatedValue = Scalar | Scalar[];
export type Parameter<T extends Scalar = Scalar> = Omit<
  z.infer<typeof parameterSchema>,
  'value'
> & { value: T };
