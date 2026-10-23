import { describe, it, expect } from 'vitest';
import { pack, snapshot } from '../fixtures/economy';
import { seedRngState, nextRandom, createSeededRng } from '../../src/engine/story/rng';
import { quoteScenario, sampleQuoteScenario } from '../../src/engine/slice/scenario';
import { calculateQuote } from '../../src/engine/economy/quote';
import { createSliceSession, sliceSessionSchema } from '../../src/engine/slice/session';
import { buildQuoteCashflow } from '../../src/engine/slice/preview';
import { teachingText } from '../../src/content/teachingText';
describe('抽样和报价预览', () => {
  it('xoshiro128** 已知向量、原地不变、三条随机流分离', () => {
    const input: [number, number, number, number] = [1, 2, 3, 4];
    expect(nextRandom(input)).toEqual({ value: 11520 / 4294967296, state: [7, 0, 1026, 12288] });
    expect(input).toEqual([1, 2, 3, 4]);
    expect(seedRngState('seed', 'parameters')).not.toEqual(seedRngState('seed', 'events'));
    const a = createSeededRng('seed'),
      b = createSeededRng('seed');
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
    expect(() => nextRandom([0, 0, 0, 0])).toThrow();
    expect(() => nextRandom([-1, 2, 3, 4])).toThrow();
  });
  it('三组独立参考数值：数量、港口、汇率不同，FOB/CIF 均可校核', () => {
    // 参考数值以 .NET Decimal 28 位精度独立复算，未调用被测函数产生预期。
    const expected = [
      [5000, '4.13', '4.66'],
      [6000, '4.04', '4.60'],
      [4000, '4.17', '4.95'],
    ];
    [1, 2, 3].forEach((variant, i) => {
      const input = quoteScenario(pack, null, variant);
      const result = calculateQuote(input);
      if (!result.ok) throw new Error('invalid');
      expect([
        input.quantity,
        result.value.fobUnitUsdQuoted,
        result.value.cifUnitUsdQuoted,
      ]).toEqual(expected[i]);
    });
  });
  it('固定种子复现，抽样结果与状态可保存；九供应商都满足 MOQ 与资金约束', () => {
    const variants = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const session = createSliceSession(pack, 'test.seed.' + i, true, true);
      variants.add(Number(session.snapshot.story.sampledParameters.variant));
      expect(createSliceSession(pack, 'test.seed.' + i, true, true)).toEqual(session);
      const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(session)) as unknown);
      expect(restored.snapshot.story.rngState).toEqual(session.snapshot.story.rngState);
      expect(restored.quoteInput).toEqual(session.quoteInput);
      expect(restored.snapshot.story.drawCount).toBe(1);
    }
    expect(variants).toEqual(new Set([1, 2, 3]));
    for (const supplier of pack.suppliers)
      for (const variant of [1, 2, 3]) {
        const input = quoteScenario(pack, supplier.id, variant);
        expect(input.quantity).toBeGreaterThanOrEqual(supplier.moq);
        expect(
          input.quantity * Number(input.taxInclusiveUnitCny) + Number(input.domesticTotalCny) + 500,
        ).toBeLessThanOrEqual(100000);
      }
    const state = snapshot();
    const oldEvents = state.story.rngState.events;
    sampleQuoteScenario(pack, state);
    expect(state.story.rngState.events).toEqual(oldEvents);
    expect(() => quoteScenario(pack, null, 4)).toThrow();
    expect(() => quoteScenario(pack, 'cup_500_verified', 1, 1)).toThrow('MOQ');
  });
  it('现金流预览复算计划示例，不修改账本和当前现金', () => {
    const state = snapshot();
    state.player.cashCnyFen = 9980000;
    const input = quoteScenario(pack, 'cup_500_verified');
    const before = structuredClone(state);
    const preview = buildQuoteCashflow(input, state, pack);
    expect(preview.minimumCashCnyFen).toBe(5972560);
    expect(preview.gapDay).toBeNull();
    expect(preview.items.every((i) => i.certainty === 'forecast')).toBe(true);
    expect(state).toEqual(before);
    expect(
      state.player.cashCnyFen +
        preview.items.reduce(
          (sum, i) => sum + (i.direction === 'in' ? i.amountCnyFen : -i.amountCnyFen),
          0,
        ),
    ).toBe(10531218);
    const zero = buildQuoteCashflow({ ...input, rebateEligible: false }, state, pack);
    expect(zero.items.find((i) => i.id === 'rebate')?.amountCnyFen).toBe(0);
    expect(() => buildQuoteCashflow({ ...input, quantity: 0 }, state, pack)).toThrow();
  });
  it('文案由参数插值，不硬编码费用，不执行 HTML', () => {
    expect(teachingText('核验费 ¥{{sampleFee}}', pack)).toBe('核验费 ¥200');
    expect(() => teachingText('{{missing}}', pack)).toThrow('未声明');
  });
});
