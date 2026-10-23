import { describe, it, expect } from 'vitest';
import { snapshot, scoring, entry, note } from '../fixtures/economy';
import { clamp, computeScores, rankDecisions } from '../../src/engine/economy/score';
import { resolveEnding, requiresRecovery } from '../../src/engine/economy/ending';
import { transfer } from '../../src/engine/economy/ledger';
import type { DecisionRecord, Rubric } from '../../src/domain/types';
const rubric = (id: string, dimension: Rubric['dimension'], mandatory = true): Rubric => ({
  id,
  dimension,
  opportunityId: id,
  mandatory,
  maxPoints: 2,
  evidenceNodeIds: [],
});
const decision = (id: string, stage: DecisionRecord['stage'] = 1, profit = 0): DecisionRecord => ({
  id,
  nodeId: 'test',
  choiceId: id,
  stage,
  sequence: 0,
  deltas: { cashCnyFen: 0, profitCnyFen: profit, reputation: 0, trust: 0, days: 0 },
  evidence: [],
  consequenceText: '',
  counterfactualReviewId: null,
});
describe(note + ' · F17–F18/N15–N16', () => {
  it('同一机会跨 rubric 取最后证据，配置顺序不能覆盖实际顺序', () => {
    const s = snapshot();
    const d = decision('grouped');
    d.evidence = [
      { rubricId: 'original', earned: 0, possible: 2 },
      { rubricId: 'guided', earned: 2, possible: 2 },
    ];
    s.story.decisionLog = [d];
    const original = { ...rubric('original', 'professionalism'), opportunityId: 'quote' };
    const guided = { ...rubric('guided', 'professionalism'), opportunityId: 'quote' };
    expect(computeScores(s, { ...scoring, rubrics: [guided, original] }).professionalism).toBe(50);
    expect(computeScores(s, { ...scoring, rubrics: [original, guided] }).professionalism).toBe(50);
  });
  it('钳制评分不钳制现金，拒绝不合理边界', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(110, 0, 100)).toBe(100);
    expect(clamp(50, 0, 100)).toBe(50);
    expect(() => clamp(NaN, 0, 100)).toThrow();
    expect(() => clamp(1, 100, 0)).toThrow();
  });
  it('利润按成本口径，与资本、预付款无关；亏损/零基数', () => {
    const s = snapshot();
    expect(computeScores(s, scoring)).toEqual({
      profit: 0,
      risk: 0,
      professionalism: 0,
      relationship: 0,
      compliance: 0,
    });
    s.journal.push(entry('expense', transfer('expense', 'cash', 100000)));
    s.player.cumulativeProfitCnyFen = 5000;
    expect(computeScores(s, scoring).profit).toBe(50);
    s.player.cumulativeProfitCnyFen = -1;
    expect(computeScores(s, scoring).profit).toBe(0);
    s.player.cumulativeProfitCnyFen = 20000;
    expect(computeScores(s, scoring).profit).toBe(100);
  });
  it('证据计分：必经未做零分、未走选修不进分母、辅导封顶一分', () => {
    const s = snapshot();
    const d = decision('d');
    d.evidence = [
      { rubricId: 'r', earned: 2, possible: 2 },
      { rubricId: 'p', earned: 1, possible: 2 },
      { rubricId: 'c', earned: 2, possible: 2 },
      { rubricId: 'rel', earned: 2, possible: 2 },
    ];
    s.story.decisionLog = [d];
    const config = {
      ...scoring,
      rubrics: [
        rubric('r', 'risk'),
        rubric('missing', 'risk'),
        rubric('optional', 'risk', false),
        rubric('p', 'professionalism'),
        rubric('c', 'compliance', false),
        rubric('rel', 'relationship'),
      ],
    };
    s.order.customerId = 'buyer';
    s.player.trustByCustomer.buyer = 80;
    expect(computeScores(s, config)).toMatchObject({
      risk: 50,
      professionalism: 50,
      compliance: 100,
      relationship: 86,
    });
    const retry = decision('retry');
    retry.evidence = [{ rubricId: 'r', earned: 2, possible: 2 }];
    s.story.decisionLog.push(retry);
    expect(computeScores(s, config).risk).toBe(25);
    s.order.flags.customerIsFraud = true;
    expect(computeScores(s, config).relationship).toBe(30);
    s.order.flags.customerIsFraud = false;
    s.order.customerId = 'missing';
    expect(computeScores(s, config).relationship).toBe(30);
  });
  it('N15 首次致命与第二重大错误、无负现金钳制', () => {
    const s = snapshot();
    s.player.cashCnyFen = -1;
    expect(requiresRecovery(s)).toBe(true);
    expect(() => resolveEnding(s, scoring)).toThrow('纠错');
    s.player.rescueUsed = true;
    expect(requiresRecovery(s)).toBe(true);
    s.player.criticalMistakeCount = 2;
    expect(requiresRecovery(s)).toBe(false);
    expect(resolveEnding(s, scoring)).toMatchObject({
      kind: 'bankrupt',
      completion: 'bankrupt',
      finalCashCnyFen: -1,
    });
  });
  it.each([
    [-1, 80, 'collected', 'tuition'],
    [0, 80, 'collected', 'breakeven'],
    [1, 79, 'collected', 'breakeven'],
    [1, 80, 'collected', 'excellent'],
    [1, 80, 'cancelled', 'breakeven'],
  ] as const)('N16 利润%s/信誉%s/状态%s => %s', (profit, reputation, status, kind) => {
    const s = snapshot();
    s.player.cumulativeProfitCnyFen = profit;
    s.player.reputation = reputation;
    s.order.status = status;
    s.order.customerId = 'buyer';
    expect(resolveEnding(s, scoring).kind).toBe(kind);
    if (profit > 0 && kind === 'breakeven')
      expect(resolveEnding(s, scoring).subtitle).toContain('修复');
  });
  it('复购只允许真实客户；潜力客户有平均分与合规双门槛，披露未结项目', () => {
    const s = snapshot();
    s.player.cumulativeProfitCnyFen = 100;
    s.player.reputation = 80;
    s.order.status = 'collected';
    s.order.customerId = 'buyer';
    expect(resolveEnding(s, scoring).repeatIntent.unlocked).toBe(true);
    s.order.customerId = null;
    expect(resolveEnding(s, scoring).repeatIntent.unlocked).toBe(false);
    s.order.customerId = 'buyer';
    s.order.flags.customerIsFraud = true;
    expect(resolveEnding(s, scoring).repeatIntent.unlocked).toBe(false);
    s.order.flags.customerIsFraud = false;
    s.order.flags.customerIsPotential = true;
    expect(resolveEnding(s, scoring).repeatIntent.unlocked).toBe(false);
    const config = {
      ...scoring,
      rubrics: [
        rubric('r', 'risk'),
        rubric('p', 'professionalism'),
        rubric('c', 'compliance'),
        rubric('rel', 'relationship'),
      ],
    };
    const d = decision('good');
    d.evidence = config.rubrics.map((r) => ({ rubricId: r.id, earned: 2, possible: 2 }));
    s.story.decisionLog = [d];
    s.player.trustByCustomer.buyer = 100;
    s.order.deliveryDueDay = 30;
    s.order.signedDay = 1;
    expect(resolveEnding(s, config).repeatIntent.unlocked).toBe(true);
    d.evidence.find((e) => e.rubricId === 'c')!.earned = 0;
    expect(resolveEnding(s, config).repeatIntent.unlocked).toBe(false);
    s.journal.push(entry('uncollected', transfer('receivable', 'sales', 100)));
    expect(resolveEnding(s, config).unsettledItems).toContain('receivable');
    expect(resolveEnding(s, config).scoreEvidenceIds).toEqual(['r', 'p', 'c', 'rel']);
  });
  it('回放金额无量纲化，优先跨关、同类最多一个、少于三条如实展示', () => {
    const a = decision('quote.first', 3, 500),
      b = decision('quote.second', 3, 1000),
      c = decision('supplier', 1, 200),
      d = decision('sample', 1, 10),
      e = decision('other', 1, 1);
    expect(rankDecisions([a, b, c, d, e], 1000, 30)).toEqual([
      'quote.second',
      'supplier',
      'sample',
    ]);
    expect(rankDecisions([a, c], 1000, 30, ['supplier'])).toEqual(['supplier', 'quote.first']);
    expect(rankDecisions([a], 1000, 30)).toEqual(['quote.first']);
    const tied = decision('tied', 1, 500);
    tied.sequence = 1;
    expect(rankDecisions([tied, a], 1000, 30)).toEqual(['quote.first', 'tied']);
    expect(() => rankDecisions([], 0, 1)).toThrow();
    expect(() => rankDecisions([], 1, 0)).toThrow();
  });
});
