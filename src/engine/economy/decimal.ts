import Decimal from 'decimal.js';
import type { z } from 'zod';
import type { NumericResult, NumericError } from '../../domain/types';
/** 独立十进制上下文；中间精度 28 位，最终金额四舍五入到分。 */
export const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export class NumericFault extends Error {
  readonly code: NumericError['code'];
  readonly field: string;
  constructor(code: NumericError['code'], field: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}
export function toMinorUnits(value: Decimal.Value): number {
  const result = new D(value).mul(100).toDecimalPlaces(0).toNumber();
  assertMinor(result);
  return result;
}
export function assertMinor(value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError('必须是安全整数分');
}
export function checked<I, O>(
  schema: z.ZodType<I>,
  input: unknown,
  run: (value: I) => O,
): NumericResult<O> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]!.path[0]);
    const codes: Record<string, NumericError['code']> = {
      quantity: 'INVALID_QUANTITY',
      fxCnyPerUsd: 'INVALID_FX',
      vatRate: 'INVALID_RATE',
      rebateRate: 'INVALID_RATE',
      insuranceRate: 'INVALID_RATE',
      insuranceCoverageFactor: 'INVALID_RATE',
      costMarkupRate: 'INVALID_RATE',
    };
    return { ok: false, error: { code: codes[field] ?? 'OUT_OF_RANGE', field } };
  }
  try {
    return { ok: true, value: run(parsed.data) };
  } catch (error) {
    if (error instanceof NumericFault)
      return { ok: false, error: { code: error.code, field: error.field } };
    if (error instanceof RangeError)
      return { ok: false, error: { code: 'OUT_OF_RANGE', field: 'amount' } };
    throw error;
  }
}
export function bounded(value: Decimal): string {
  toMinorUnits(value);
  return value.toFixed();
}
