import { z } from 'zod';
import { quoteInputSchema, exwQuoteInputSchema } from '../../domain/schemas/economy';
import { unsignedDecimalSchema } from '../../domain/schemas/common';
import type { QuoteInput, QuoteResult, ExwQuoteInput, NumericResult } from '../../domain/types';
import { D, checked, bounded, NumericFault, toMinorUnits } from './decimal';
import { rebate } from './tax';
/** F02/F03/F06/F07：CIF 使用未舍入 FOB，外显合同价最后统一舍入。 */
export function calculateQuote(input: QuoteInput): NumericResult<QuoteResult> {
  return checked(quoteInputSchema, input, (v) => {
    const r = rebate(v),
      net = new D(v.taxInclusiveUnitCny).minus(r);
    const domestic = new D(v.domesticTotalCny).div(v.quantity),
      cost = net.plus(domestic);
    const fob = cost.div(v.fxCnyPerUsd).mul(new D(1).plus(v.costMarkupRate));
    const ai = new D(v.insuranceCoverageFactor).mul(v.insuranceRate);
    if (ai.gte(1)) throw new NumericFault('INSURANCE_DENOMINATOR', 'insuranceRate');
    const cif = fob.plus(new D(v.oceanTotalUsd).div(v.quantity)).div(new D(1).minus(ai));
    const fq = fob.toFixed(2),
      cq = cif.toFixed(2);
    toMinorUnits(new D(cq).mul(v.quantity));
    const [
      rebateUnitCny,
      netPurchaseUnitCny,
      domesticUnitCny,
      fobCostUnitCny,
      fobUnitUsdRaw,
      cifUnitUsdRaw,
    ] = [r, net, domestic, cost, fob, cif].map(bounded) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      rebateUnitCny,
      netPurchaseUnitCny,
      domesticUnitCny,
      fobCostUnitCny,
      fobUnitUsdRaw,
      cifUnitUsdRaw,
      fobUnitUsdQuoted: fq,
      cifUnitUsdQuoted: cq,
      insuranceTotalUsd: new D(cq).mul(v.quantity).mul(ai).toFixed(2),
      steps: [
        {
          formulaId: 'F01',
          inputs: { P: v.taxInclusiveUnitCny, v: v.vatRate, r: v.rebateRate },
          output: rebateUnitCny,
        },
        {
          formulaId: 'F02',
          inputs: {
            P: v.taxInclusiveUnitCny,
            R: rebateUnitCny,
            D: v.domesticTotalCny,
            Q: String(v.quantity),
          },
          output: fobCostUnitCny,
        },
        {
          formulaId: 'F03',
          inputs: { B: fobCostUnitCny, E: v.fxCnyPerUsd, m: v.costMarkupRate },
          output: fobUnitUsdRaw,
        },
        {
          formulaId: 'F06',
          inputs: {
            FOB: fobUnitUsdRaw,
            F: v.oceanTotalUsd,
            Q: String(v.quantity),
            a: v.insuranceCoverageFactor,
            i: v.insuranceRate,
          },
          output: cifUnitUsdRaw,
        },
      ],
    };
  });
}
const rateSchema = z.strictObject({ costMarkupRate: unsignedDecimalSchema });
/** F04：两种合法口径之间的换算，不应把同一百分比直接替换。 */
export function costMarkupToMargin(markup: string): NumericResult<string> {
  return checked(rateSchema, { costMarkupRate: markup }, (v) =>
    bounded(new D(v.costMarkupRate).div(new D(1).plus(v.costMarkupRate))),
  );
}
export function marginToCostMarkup(margin: string): NumericResult<string> {
  return checked(rateSchema, { costMarkupRate: margin }, (v) => {
    if (new D(v.costMarkupRate).gte(1)) throw new NumericFault('INVALID_RATE', 'costMarkupRate');
    return bounded(new D(v.costMarkupRate).div(new D(1).minus(v.costMarkupRate)));
  });
}
/** F08：EXW 仅分摊卖方实际承担的工厂交付费用。 */
export function calculateExwQuote(input: ExwQuoteInput): NumericResult<string> {
  return checked(exwQuoteInputSchema, input, (v) =>
    bounded(
      new D(v.taxInclusiveUnitCny)
        .minus(rebate(v))
        .plus(new D(v.factoryDeliveryTotalCny).div(v.quantity))
        .div(v.fxCnyPerUsd)
        .mul(new D(1).plus(v.costMarkupRate)),
    ),
  );
}
export function invoiceTotal(unitUsd: string, quantity: number): number {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !new D(unitUsd).isFinite() ||
    new D(unitUsd).isNegative()
  )
    throw new RangeError('发票参数无效');
  return toMinorUnits(new D(unitUsd).toDecimalPlaces(2).mul(quantity));
}
