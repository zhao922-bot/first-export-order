import { quoteAnswersSchema } from '../../domain/schemas/economy';
import type { QuoteInput, QuoteAnswers, QuoteEvaluation, QuoteResult } from '../../domain/types';
import { D } from '../economy/decimal';
import { calculateQuote } from '../economy/quote';
export type AnswerField = keyof QuoteAnswers;
export const answerFields: AnswerField[] = [
  'rebateUnitCny',
  'fobCostUnitCny',
  'rateBasis',
  'fobUnitUsd',
  'cifUnitUsd',
];
export function expectedAnswers(result: QuoteResult): QuoteAnswers {
  return {
    rebateUnitCny: result.rebateUnitCny,
    fobCostUnitCny: result.fobCostUnitCny,
    rateBasis: 'costMarkup',
    fobUnitUsd: result.fobUnitUsdQuoted,
    cifUnitUsd: result.cifUnitUsdQuoted,
  };
}
/** 中间值允许填写到分（误差 < 0.005），最终单价必须等于按分舍入的报价。 */
export function evaluateQuote(
  input: QuoteInput,
  answers: QuoteAnswers,
  fields: readonly AnswerField[] = answerFields,
): QuoteEvaluation {
  const calculation = calculateQuote(input);
  if (!calculation.ok) throw new RangeError('报价配置无效：' + calculation.error.field);
  const expected = expectedAnswers(calculation.value);
  const errors: QuoteEvaluation['fieldErrors'] = [];
  for (const field of fields) {
    const parsed = quoteAnswersSchema.shape[field].safeParse(answers[field]);
    if (!parsed.success) {
      errors.push({ field, code: 'FORMAT', message: '请填写有效数字，使用小数点，不带币种符号。' });
      continue;
    }
    const correct =
      field === 'rateBasis'
        ? answers[field] === 'costMarkup'
        : new D(answers[field])
            .minus(expected[field])
            .abs()
            .lt(field.endsWith('UnitUsd') ? '0.0000001' : '0.005');
    if (!correct)
      errors.push({ field, code: 'VALUE', message: '该项还未通过校核，请检查口径与单位。' });
  }
  if (!errors.length)
    return { correct: true, errorCode: null, resultId: 'quote.correct', fieldErrors: [] };
  let errorCode: NonNullable<QuoteEvaluation['errorCode']> = 'OTHER_QUOTE_ERROR';
  const hasFormat = errors.some((error) => error.code === 'FORMAT');
  if (!hasFormat) {
    const noRebate = calculateQuote({ ...input, rebateEligible: false });
    const wrongMargin = new D(calculation.value.fobCostUnitCny)
      .div(input.fxCnyPerUsd)
      .div(new D(1).minus(input.costMarkupRate));
    const duplicate = new D(calculation.value.fobCostUnitCny)
      .plus(new D(input.domesticTotalCny).div(input.quantity))
      .div(input.fxCnyPerUsd)
      .mul(new D(1).plus(input.costMarkupRate));
    if (
      input.rebateEligible &&
      new D(calculation.value.rebateUnitCny).gt(0) &&
      (new D(answers.rebateUnitCny).eq(0) ||
        (noRebate.ok && new D(answers.fobUnitUsd).eq(noRebate.value.fobUnitUsdQuoted)))
    )
      errorCode = 'REBATE_OMITTED';
    else if (
      answers.rateBasis === 'salesMargin' ||
      (wrongMargin.isFinite() && new D(answers.fobUnitUsd).eq(wrongMargin.toFixed(2)))
    )
      errorCode = 'MARGIN_AS_MARKUP';
    else if (
      new D(input.domesticTotalCny).gt(0) &&
      new D(answers.fobUnitUsd).eq(duplicate.toFixed(2))
    )
      errorCode = 'DOMESTIC_DUPLICATED';
  }
  return { correct: false, errorCode, resultId: 'quote.' + errorCode, fieldErrors: errors };
}
