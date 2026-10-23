import { z } from 'zod';

/** ID 和路径是数据，不接受原型链键、代码或 URL。 */
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/)
  .refine(
    (value) =>
      !value.split(/[.:]/).some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)),
    '禁止使用原型链键',
  );
export const textSchema = z.string().min(1).max(4000);
export const decimalTextSchema = z
  .string()
  .max(48)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, '必须是有限十进制字符串');
export const unsignedDecimalSchema = decimalTextSchema.refine(
  (value) => !value.startsWith('-'),
  '不得为负',
);
export const moneyMinorSchema = z.number().int().safe();
export const nonnegativeIntSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const positiveIntSchema = nonnegativeIntSchema.min(1);
export const scoreSchema = z.number().int().min(0).max(100);
export const probabilitySchema = unsignedDecimalSchema.refine(
  (value) => Number(value) <= 1,
  '概率不得超过 1',
);
export const stageSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export const scalarSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const incotermSchema = z.enum(['EXW', 'FOB', 'CIF']);
export const paymentMethodSchema = z.enum(['TT', 'LC_SIGHT', 'OA_60']);
export const teachingNoteSchema = z.literal('教学算例参数，可配置');
export const idListSchema = z.array(idSchema);
export const fieldPathSchema = idSchema;

export function parameterOf<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value,
    unit: textSchema,
    teachingOnly: z.literal(true),
    note: teachingNoteSchema,
    reviewStatus: z.enum(['draft', 'approved']),
  });
}
export const parameterSchema = parameterOf(scalarSchema);
