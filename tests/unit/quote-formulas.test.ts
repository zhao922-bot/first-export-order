import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { golden, note } from '../fixtures/economy';
import { D, toMinorUnits, checked, NumericFault } from '../../src/engine/economy/decimal';
import { calculateRebate } from '../../src/engine/economy/tax';
import {
  calculateQuote,
  calculateExwQuote,
  costMarkupToMargin,
  marginToCostMarkup,
  invoiceTotal,
} from '../../src/engine/economy/quote';
import { calculateFreight } from '../../src/engine/economy/freight';
import { evaluateQuote } from '../../src/engine/puzzles/quoteEvaluator';
import type { NumericResult, QuoteAnswers } from '../../src/domain/types';
export function ok<T>(result: NumericResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
const answer: QuoteAnswers = {
  rebateUnitCny: '2.23',
  fobCostUnitCny: '26.47',
  rateBasis: 'costMarkup',
  fobUnitUsd: '4.08',
  cifUnitUsd: '4.68',
};
describe(note + ' · F01–F08/N01–N10/N17/N18', () => {
  it('N01–N03 独立高精度黄金值、保险等式与费用边界', () => {
    const q = ok(calculateQuote(golden));
    expect(
      new D(q.rebateUnitCny)
        .minus('2.230088495575221238938053097')
        .abs()
        .lt('0.00000000000000000000000001'),
    ).toBe(true);
    expect(
      new D(q.netPurchaseUnitCny)
        .minus('25.76991150442477876106194690')
        .abs()
        .lt('0.0000000000000000000000001'),
    ).toBe(true);
    expect(Number(q.fobCostUnitCny)).toBeCloseTo(26.46991150442478, 12);
    expect(q.domesticUnitCny).toBe('0.7');
    expect(q.fobUnitUsdQuoted).toBe('4.08');
    expect(Number(q.fobUnitUsdRaw)).toBeCloseTo(4.08077802359882, 13);
    expect(new D(q.cifUnitUsdRaw).minus('4.6816770924087176').abs().lt('1e-13')).toBe(true);
    expect(q.cifUnitUsdQuoted).toBe('4.68');
    expect(q.insuranceTotalUsd).toBe('154.44');
    expect(
      new D(q.cifUnitUsdRaw).mul('.9934').minus(q.fobUnitUsdRaw).minus('.57').abs().lt('1e-25'),
    ).toBe(true);
    expect(q.steps.map((s) => s.formulaId)).toEqual(['F01', 'F02', 'F03', 'F06']);
  });
  it('N17 发票按外显合同价，禁止 raw×Q；HALF_UP', () => {
    expect(invoiceTotal('4.68', 5000)).toBe(2340000);
    expect(invoiceTotal('4.6816770924087', 5000)).toBe(2340000);
    expect(invoiceTotal('4.685', 3)).toBe(1407);
    expect(toMinorUnits('1.005')).toBe(101);
    expect(toMinorUnits('-1.005')).toBe(-101);
  });
  it.each([0, -1, 1.5, NaN, Infinity])('N07 无效数量 %s 返回结构化错误', (quantity) => {
    expect(calculateQuote({ ...golden, quantity })).toEqual({
      ok: false,
      error: { code: 'INVALID_QUANTITY', field: 'quantity' },
    });
  });
  it.each(['0', '-1', 'NaN', 'Infinity', 'x'])('N07 无效汇率 %s', (fxCnyPerUsd) => {
    expect(calculateQuote({ ...golden, fxCnyPerUsd })).toEqual({
      ok: false,
      error: { code: 'INVALID_FX', field: 'fxCnyPerUsd' },
    });
  });
  it.each([
    { vatRate: '-1' },
    { rebateRate: '.20' },
    { rebateRate: '0.20' },
    { insuranceRate: '-0.1' },
    { costMarkupRate: '-0.1' },
    { insuranceCoverageFactor: '-1' },
    { taxInclusiveUnitCny: '-2' },
  ])('N08 拒绝非法参数 %o', (change) => {
    expect(calculateQuote({ ...golden, ...change }).ok).toBe(false);
  });
  it('N08 保险分母与金额上界', () => {
    expect(
      calculateQuote({ ...golden, insuranceCoverageFactor: '2', insuranceRate: '0.5' }),
    ).toEqual({ ok: false, error: { code: 'INSURANCE_DENOMINATOR', field: 'insuranceRate' } });
    expect(
      calculateQuote({ ...golden, insuranceCoverageFactor: '3', insuranceRate: '0.5' }).ok,
    ).toBe(false);
    expect(calculateQuote({ ...golden, taxInclusiveUnitCny: '90071992547410' }).ok).toBe(false);
    expect(() => toMinorUnits('90071992547410')).toThrow(RangeError);
  });
  it('N18 资格为零与 EXW 边界，无港杂/海运费隐性输入', () => {
    const tax = {
      taxInclusiveUnitCny: '28',
      vatRate: '0.13',
      rebateRate: '0.09',
      rebateEligible: true,
    };
    expect(Number(ok(calculateRebate(tax)))).toBeCloseTo(2.23008849557522, 13);
    expect(ok(calculateRebate({ ...tax, rebateEligible: false }))).toBe('0');
    expect(calculateRebate({ ...tax, rebateRate: '0.14' }).ok).toBe(false);
    const exw = {
      ...tax,
      quantity: 5000,
      fxCnyPerUsd: '7.20',
      costMarkupRate: '0.11',
      factoryDeliveryTotalCny: '0',
    };
    expect(Number(ok(calculateExwQuote(exw)))).toBeCloseTo(3.972861356932153, 12);
    expect(Number(ok(calculateExwQuote({ ...exw, rebateEligible: false })))).toBeCloseTo(
      4.316666666666666,
      12,
    );
    expect(ok(calculateQuote({ ...golden, rebateEligible: false })).fobUnitUsdQuoted).toBe('4.42');
  });
  it('F04 两种口径合法且往返一致，零值与无效分母', () => {
    const margin = ok(costMarkupToMargin('0.11'));
    expect(Number(margin)).toBeCloseTo(0.0990990990990991, 14);
    expect(Number(ok(marginToCostMarkup(margin)))).toBeCloseTo(0.11, 14);
    expect(ok(costMarkupToMargin('0'))).toBe('0');
    expect(ok(marginToCostMarkup('0'))).toBe('0');
    expect(marginToCostMarkup('1').ok).toBe(false);
    expect(marginToCostMarkup('1.1').ok).toBe(false);
    expect(costMarkupToMargin('-1').ok).toBe(false);
  });
  it('N10 汇率上下浮动 1.5% 的方向', () => {
    expect(
      Number(ok(calculateQuote({ ...golden, fxCnyPerUsd: '7.308' })).fobUnitUsdRaw),
    ).toBeLessThan(4.08077802359882);
    expect(
      Number(ok(calculateQuote({ ...golden, fxCnyPerUsd: '7.092' })).fobUnitUsdRaw),
    ).toBeGreaterThan(4.08077802359882);
  });
  it('checked 返回已知领域错误并传播编程错误', () => {
    expect(
      checked(z.string(), 'x', () => {
        throw new NumericFault('INVALID_RATE', 'vatRate');
      }).ok,
    ).toBe(false);
    expect(() =>
      checked(z.string(), 'x', () => {
        throw new TypeError('bug');
      }),
    ).toThrow('bug');
  });
  it.each([
    ['-1', 1],
    ['Infinity', 1],
    ['1', 0],
    ['1', 1.2],
    ['NaN', 1],
  ])('发票拒绝非法参数 %s / %s', (price, quantity) => {
    expect(() => invoiceTotal(String(price), Number(quantity))).toThrow();
  });
});
describe('F05/N09 整柜运输', () => {
  const input = {
    quantity: 1000,
    totalCbm: '60',
    totalWeightKg: '10000',
    usableCbm: '60',
    usableWeightKg: '20000',
    containerRateUsd: '2800',
    surchargesUsd: '50',
  };
  it('边界进位与单件成本', () => {
    expect(ok(calculateFreight(input))).toEqual({
      containerCount: 1,
      totalUsd: '2850',
      unitUsd: '2.85',
    });
    expect(ok(calculateFreight({ ...input, quantity: 2000 })).unitUsd).toBe('1.425');
    expect(ok(calculateFreight({ ...input, totalCbm: '60.001' })).containerCount).toBe(2);
    expect(ok(calculateFreight({ ...input, totalWeightKg: '20001' })).containerCount).toBe(2);
  });
  it.each([
    { usableCbm: '0' },
    { usableWeightKg: '0' },
    { totalCbm: '0', totalWeightKg: '0' },
    { totalCbm: '9007199254740992000' },
    { containerRateUsd: '90071992547410' },
    { quantity: 0 },
  ])('拒绝非法/溢出运输参数 %o', (change) => {
    expect(calculateFreight({ ...input, ...change }).ok).toBe(false);
  });
});
describe('N04–N06 报价诊断', () => {
  it('正确答案；中间值允许四舍五入，最终单价严守分', () => {
    expect(evaluateQuote(golden, answer).correct).toBe(true);
    expect(evaluateQuote(golden, { ...answer, fobUnitUsd: '4.084' }).correct).toBe(false);
  });
  it('漏退税、口径误用、重复国内费分别定位', () => {
    expect(
      evaluateQuote(golden, { ...answer, rebateUnitCny: '0', fobUnitUsd: '4.42' }).errorCode,
    ).toBe('REBATE_OMITTED');
    expect(evaluateQuote(golden, { ...answer, fobUnitUsd: '4.13' }).errorCode).toBe(
      'MARGIN_AS_MARKUP',
    );
    expect(evaluateQuote(golden, { ...answer, rateBasis: 'salesMargin' }).errorCode).toBe(
      'MARGIN_AS_MARKUP',
    );
    expect(evaluateQuote(golden, { ...answer, fobUnitUsd: '4.19' }).errorCode).toBe(
      'DOMESTIC_DUPLICATED',
    );
    expect(evaluateQuote(golden, { ...answer, cifUnitUsd: '8' }).errorCode).toBe(
      'OTHER_QUOTE_ERROR',
    );
  });
  it('无资格零退税不误判；格式错误不当成业务误区', () => {
    expect(
      evaluateQuote({ ...golden, rebateEligible: false }, { ...answer, rebateUnitCny: '0' }, [
        'rebateUnitCny',
      ]).correct,
    ).toBe(true);
    expect(evaluateQuote(golden, { ...answer, rebateUnitCny: '' }).fieldErrors[0]?.code).toBe(
      'FORMAT',
    );
    expect(() => evaluateQuote({ ...golden, quantity: 0 }, answer)).toThrow('配置无效');
  });
});
