import type { z } from 'zod';
import type {
  quoteInputSchema,
  quoteResultSchema,
  exwQuoteInputSchema,
  freightInputSchema,
  freightResultSchema,
  quoteAnswersSchema,
  quoteEvaluationSchema,
  cashflowItemSchema,
  cashflowForecastSchema,
  numericErrorSchema,
} from '../schemas/economy';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type QuoteResult = z.infer<typeof quoteResultSchema>;
export type ExwQuoteInput = z.infer<typeof exwQuoteInputSchema>;
export type FreightInput = z.infer<typeof freightInputSchema>;
export type FreightResult = z.infer<typeof freightResultSchema>;
export type QuoteAnswers = z.infer<typeof quoteAnswersSchema>;
export type QuoteEvaluation = z.infer<typeof quoteEvaluationSchema>;
export type CashflowItem = z.infer<typeof cashflowItemSchema>;
export type CashflowForecast = z.infer<typeof cashflowForecastSchema>;
export type NumericError = z.infer<typeof numericErrorSchema>;
export type NumericResult<T> = { ok: true; value: T } | { ok: false; error: NumericError };
