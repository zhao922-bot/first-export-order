import { describe, expect, it } from 'vitest';
import { eventPack, pack } from '../fixtures/economy';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { sliceSessionSchema } from '../../src/engine/slice/session';
import { simulateRun, policyQuote, seedFor, strategies } from '../../scripts/balance/simulation';
import { summarize, wilson, quantiles } from '../../scripts/balance/report';

describe('固定种子策略平衡与失败种子回归', () => {
  it.each([0, 1, 2])('稳妥种子 %i：三种产品实际七关收齐款、正利润、正现金谷底', (index) => {
    const run = simulateRun(eventPack, seedFor(index), 'cautious');
    expect(run.error).toBeNull();
    expect(run.stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(run.ending).toBe('excellent');
    expect(run.returnOnCost).toBeGreaterThan(0.03);
    expect(run.returnOnCost).toBeLessThan(0.12);
    expect(run.minimumCashFen).toBeGreaterThan(0);
    expect(run.cashTimeline.at(-1)!.cashFen).toBe(run.cashFen);
    expect(run.cashFen - 10000000).toBe(run.profitFen);
    expect(run.eventIds.length).toBeLessThanOrEqual(3);
  });
  it.each(strategies)('%s 同种子重放逐笔现金、事件和决策一致，原内容不被改写', (strategy) => {
    const original = JSON.stringify(eventPack),
      first = simulateRun(eventPack, seedFor(2), strategy);
    expect(simulateRun(eventPack, seedFor(2), strategy)).toEqual(first);
    expect(JSON.stringify(eventPack)).toBe(original);
  });
  it('激进 0004：真实尾款缺口后终止采购，拒绝付款不污染现金', () => {
    const run = simulateRun(eventPack, seedFor(4), 'aggressive');
    expect(run.error).toBeNull();
    expect(run.failures).toContainEqual({
      nodeId: 'L05.balance',
      stage: 5,
      reason: 'actual_cash_gap',
      realized: true,
    });
    expect(run.terminalNodeId).toBe('L05.cancelled');
    expect(run.ending).toBe('tuition');
    expect(run.minimumCashFen).toBeGreaterThanOrEqual(0);
    expect(run.decisionTrace.some((d) => d.choiceId === 'procurement_cancel')).toBe(true);
  });
  it.each([0, 40])('历史激进种子 %i：真实因果变化后仍无模拟错误和负现金', (index) => {
    const run = simulateRun(eventPack, seedFor(index), 'aggressive');
    expect(run.error).toBeNull();
    expect(['completed', 'lost_order']).toContain(run.completion);
    expect(run.minimumCashFen).toBeGreaterThanOrEqual(0);
    expect(run.cashTimeline.at(-1)!.cashFen).toBe(run.cashFen);
  });
  it('乱选旧种子不再因内部算错次数进入报价丢单', () => {
    const run = simulateRun(eventPack, seedFor(0), 'random');
    expect(run.error).toBeNull();
    expect(run.terminalNodeId).not.toBe('L03.lost');
    expect(run.maxStage).toBeGreaterThan(3);
  });
  it.each([0, 1, 2])('稳妥但首次算错 %i：保护后仍能真实完成七关', (index) => {
    const run = simulateRun(eventPack, seedFor(index), 'cautious', { firstQuoteMistake: true });
    expect(run.error).toBeNull();
    expect(run.completion).toBe('completed');
    expect(run.minimumCashFen).toBeGreaterThanOrEqual(0);
    expect(run.decisionTrace.some((d) => d.choiceId === 'quote.MARGIN_AS_MARKUP')).toBe(true);
  });
  it('步数上限记为未完成，不能冒充四类结局或经营翻车', () => {
    const run = simulateRun(eventPack, seedFor(0), 'cautious', { maxCommands: 1 });
    const report = summarize([run]).cautious!;
    expect(run.ending).toBeNull();
    expect(run.completion).toBe('incomplete');
    expect(Object.values(report.endings).every((v) => v.count === 0)).toBe(true);
    expect(report.adverse.count).toBe(0);
  });
  it('主动取消不能充当反复无视报价纠错的统计证据', () => {
    const base = simulateRun(eventPack, seedFor(0), 'cautious', { maxCommands: 1 });
    const report = summarize([
      {
        ...base,
        strategy: 'random',
        ending: 'tuition',
        completion: 'lost_order',
        terminalNodeId: 'L04.cancelled',
        maxStage: 4,
      },
    ]).random!;
    expect(report.earlyLoss.count).toBe(1);
    expect(report.repeatedQuoteLoss.count).toBe(0);
  });
  it('常见误解由参数独立构造，未把成本加成和销售毛利混为一谈', () => {
    const input = { ...eventPack.parameters };
    expect(input.quote_costMarkupRate!.value).toBe('0.11');
    const game = inquiryGame();
    completeInquiries(game);
    expect(policyQuote(game.session.quoteInput, 'omitRebate').rebateUnitCny).toBe('0.00');
    expect(policyQuote(game.session.quoteInput, 'salesMargin').rateBasis).toBe('salesMargin');
    expect(policyQuote(game.session.quoteInput, 'doubleDomestic').fobUnitUsd).not.toBe(
      policyQuote(game.session.quoteInput, 'cost').fobUnitUsd,
    );
  });
});

describe('内部核算与业务后果分离', () => {
  it('格式错误和连续多次数值错误均不发报价、不扣现金、不损伤客户关系', () => {
    const g = inquiryGame();
    completeInquiries(g);
    const before = structuredClone(g.session.snapshot);
    expect(before.player.cashCnyFen).toBe(9980000);
    g.act({ type: 'submit', answers: { rebateUnitCny: '' } });
    g.act({ type: 'submit', answers: policyQuote(g.session.quoteInput, 'salesMargin') });
    g.advance();
    g.advance();
    for (let n = 0; n < 8; n++) {
      const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)));
      const cmd = {
        id: 'internal.' + n,
        revision: restored.snapshot.revision,
        action: { type: 'submit', answers: { rateBasis: 'salesMargin' } } as const,
      };
      const result = reduceSlice(restored, pack, cmd);
      expect(reduceSlice(result, pack, cmd)).toBe(result);
      g.act(cmd.action);
      g.advance();
      g.advance();
      expect(g.session.snapshot.order.status).toBe('draft');
      expect(g.session.ending).toBeNull();
    }
    expect(g.session.snapshot.journal).toEqual(before.journal);
    expect(g.session.snapshot.player).toEqual(before.player);
    expect(g.session.snapshot.gameDay).toBe(before.gameDay);
    expect(g.session.snapshot.story.rngState).toEqual(before.story.rngState);
  });
  it('95% Wilson 区间包含零样本和全成功边界，分位数定义明确', () => {
    expect(wilson(0, 0)).toMatchObject({ rate: null, low: null, high: null });
    expect(wilson(0, 1000).low).toBe(0);
    expect(wilson(0, 1000).high).toBeCloseTo(0.0038267585, 8);
    expect(wilson(1000, 1000).high).toBe(1);
    expect(wilson(1000, 1000).low).toBeCloseTo(0.9961732415, 8);
    expect(quantiles([4, 1, 2, 3])).toMatchObject({ n: 4, min: 1, median: 2.5, max: 4 });
    expect(quantiles([]).median).toBeNull();
  });
});
