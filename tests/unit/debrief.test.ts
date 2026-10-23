import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import { fullGame, endingBoundary } from '../fixtures/debrief';
import { createSliceSession, sliceSessionSchema } from '../../src/engine/slice/session';
import { reduceSlice, type SliceAction } from '../../src/engine/slice/reducer';
import {
  debriefScoring,
  decisionEvidence,
  validateFrozenEnding,
} from '../../src/engine/debrief/runtime';
import { scoreEvidence } from '../../src/engine/debrief/evidence';
import { buildEndingView, buildKnowledgeView } from '../../src/app/debriefView';
import { resolveEnding } from '../../src/engine/economy/ending';
import { rankDecisions } from '../../src/engine/economy/score';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import { enterNegotiation, toContract, decide } from '../fixtures/negotiation';
const act = (s: ReturnType<typeof createSliceSession>, action: SliceAction) =>
  reduceSlice(s, pack, {
    id: 'test.' + (s.snapshot.revision + 1),
    revision: s.snapshot.revision,
    action,
  });
describe('正式结局、证据与复购', () => {
  it.each(['excellent', 'breakeven', 'tuition', 'bankrupt'] as const)(
    'E11 %s 经真实结算节点冻结，账本不变',
    (kind) => {
      const before = endingBoundary(kind),
        s = act(before, { type: 'advance' });
      expect(s.snapshot.story.nodeId).toBe('L07.complete');
      expect(s.ending!.result.kind).toBe(kind);
      expect(s.snapshot.journal).toEqual(before.snapshot.journal);
      expect(s.ending!.result.finalCashCnyFen).toBe(s.snapshot.player.cashCnyFen);
      expect(() => validateFrozenEnding(s, pack)).not.toThrow();
      expect(buildEndingView(s, pack)!.title).toBe(
        pack.endings.find((e) => e.kind === kind)!.title,
      );
      expect(() => act(s, { type: 'advance' })).toThrow('冻结');
      const last = s.snapshot.story.appliedCommandIds.at(-1)!;
      expect(reduceSlice(s, pack, { id: last, revision: 0, action: { type: 'advance' } })).toBe(s);
    },
  );
  it('信誉 79 / 80、零利润及保护前现金负值不越界', () => {
    expect(act(endingBoundary('excellent', 79), { type: 'advance' }).ending!.result.kind).toBe(
      'breakeven',
    );
    expect(act(endingBoundary('breakeven', 100), { type: 'advance' }).ending!.result.kind).toBe(
      'breakeven',
    );
    const first = endingBoundary('bankrupt');
    first.snapshot.player.rescueUsed = false;
    const protectedState = act(first, { type: 'advance' });
    expect(protectedState.ending).toBeNull();
    expect(protectedState.snapshot.player.cashCnyFen).toBe(-1);
  });
  it('从选品到七关真实决策都有评分证据，优秀结局自然可达', () => {
    const s = fullGame().session;
    expect(s.ending!.result.kind).toBe('excellent');
    expect(s.snapshot.player.reputation).toBeGreaterThanOrEqual(80);
    expect(s.ending!.result.repeatIntent).toEqual({ unlocked: true, customerId: 'customer_c' });
    expect(
      new Set(s.snapshot.story.decisionLog.filter((d) => d.evidence.length).map((d) => d.stage)),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(s.ending!.result.scores.risk).toBe(100);
    expect(s.ending!.result.scores.compliance).toBe(100);
    expect(s.ending!.result.replayDecisionIds).toHaveLength(3);
    const replay = buildEndingView(s, pack)!.replay;
    expect(new Set(replay.map((r) => r.familyId)).size).toBe(3);
    expect(new Set(replay.map((r) => r.stage)).size).toBe(3);
    expect(replay.every((r) => r.beforeText && r.alternative)).toBe(true);
  });
  it('提前丢单保留已发生费用，未完成必经项为零，练习退出不结算', () => {
    const g = inquiryGame();
    completeInquiries(g);
    enterNegotiation(g);
    toContract(g);
    decide(g, 'contract_cancel');
    expect(g.session.ending!.result.kind).toBe('tuition');
    expect(g.session.ending!.result.profitCnyFen).toBe(-20000);
    const compliance = scoreEvidence(g.session.snapshot, debriefScoring(pack), 'compliance');
    expect(compliance.opportunities.find((o) => o.id === 'tax')).toMatchObject({
      earned: 0,
      attempts: 0,
    });
    expect(compliance.score).toBeLessThan(100);
    const fresh = createSliceSession(pack, 'fresh');
    expect(fresh.ending).toBeNull();
    const practice = createSliceSession(pack, 'practice', true);
    practice.snapshot.story.nodeId = 'slice.done';
    expect(practice.ending).toBeNull();
  });
  it('L/C 专属项仅在 L/C 分母中，未触发事件不扣分', () => {
    const s = createSliceSession(pack, 'routes');
    s.snapshot.order.payment = 'TT';
    const tt = scoreEvidence(s.snapshot, debriefScoring(pack), 'compliance');
    expect(tt.opportunities.map((o) => o.id)).not.toContain('lc_soft');
    s.snapshot.order.payment = 'LC_SIGHT';
    expect(scoreEvidence(s.snapshot, debriefScoring(pack), 'compliance').possible).toBe(
      tt.possible + 4,
    );
    expect(
      scoreEvidence(s.snapshot, debriefScoring(pack), 'risk').opportunities.map((o) => o.id),
    ).not.toContain('incident');
  });
  it('证据重试不能刷信誉，错误后最高一分，报价辅导独立计一分', () => {
    const s = createSliceSession(pack, 'evidence');
    const push = (choice: string) => {
      const evidence = decisionEvidence(s, pack, 'L05.funding', choice);
      s.snapshot.story.decisionLog.push({
        id: 'd' + s.snapshot.story.decisionLog.length,
        nodeId: 'L05.funding',
        choiceId: choice,
        stage: 5,
        sequence: s.snapshot.story.decisionLog.length,
        deltas: { cashCnyFen: 0, profitCnyFen: 0, reputation: 0, trust: 0, days: 0 },
        evidence,
        consequenceText: 'test',
        counterfactualReviewId: null,
      });
      return evidence;
    };
    expect(push('funding_screenshot')[0]!.earned).toBe(0);
    s.snapshot.order.flags.fundingVerified = true;
    expect(push('funding_verify')[0]!.earned).toBe(1);
    expect(s.snapshot.player.reputation).toBe(61);
    expect(push('funding_verify')[0]!.earned).toBe(1);
    expect(s.snapshot.player.reputation).toBe(61);
    s.guided = true;
    expect(decisionEvidence(s, pack, 'L03.final-check', 'quote.correct')[0]!.earned).toBe(1);
  });
  it('E 客户复购有双门槛；普通真实客户无需分数门槛，骗子和未收款不可解锁', () => {
    const s = endingBoundary('excellent');
    s.snapshot.order.customerId = 'customer_e';
    s.snapshot.order.flags.customerIsPotential = true;
    s.snapshot.player.trustByCustomer.customer_e = 100;
    const cfg = debriefScoring(pack);
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(false);
    s.snapshot.story.decisionLog = [
      {
        id: 'evidence',
        nodeId: 'L07.tax',
        choiceId: 'tax_verify',
        stage: 7,
        sequence: 0,
        deltas: { cashCnyFen: 0, profitCnyFen: 0, reputation: 0, trust: 0, days: 0 },
        evidence: pack.rubrics.map((r) => ({ rubricId: r.id, earned: 2, possible: 2 })),
        consequenceText: 'test',
        counterfactualReviewId: null,
      },
    ];
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(true);
    const marks = s.snapshot.story.decisionLog[0]!.evidence;
    for (const m of marks)
      if (pack.rubrics.find((r) => r.id === m.rubricId)!.dimension === 'compliance') m.earned = 0;
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(false);
    s.snapshot.order.flags.customerIsPotential = false;
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(true);
    s.snapshot.order.flags.customerIsFraud = true;
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(false);
    s.snapshot.order.status = 'shipped';
    expect(resolveEnding(s.snapshot, cfg).repeatIntent.unlocked).toBe(false);
  });
  it('回放使用明确的同类 id 与重大风险标记，未到达不伪造', () => {
    const s = fullGame().session,
      ds = s.snapshot.story.decisionLog;
    const first = { ...ds[0]!, familyId: 'same', majorRisk: false },
      second = { ...ds[1]!, familyId: 'same', majorRisk: true };
    expect(rankDecisions([first, second], 10000000, 30)).toEqual([second.id]);
    const empty = act(endingBoundary('tuition'), { type: 'advance' });
    expect(buildEndingView(empty, pack)!.replay).toHaveLength(0);
  });
  it('本地结算恢复拒绝篡改的成绩、时点及遗失结算', () => {
    const s = act(endingBoundary('excellent'), { type: 'advance' });
    const modified = structuredClone(s);
    modified.ending!.result.scores.risk = 100;
    expect(() => validateFrozenEnding(modified, pack)).toThrow('证据');
    modified.ending = s.ending;
    modified.snapshot.gameDay++;
    expect(() => validateFrozenEnding(modified, pack)).toThrow('状态');
    modified.ending = null;
    expect(() => validateFrozenEnding(modified, pack)).toThrow('缺少');
  });
});
describe('24 词条知识图鉴', () => {
  it('自动接触、本局参数插值、前置关系与三种状态', () => {
    const g = inquiryGame();
    expect(g.session.snapshot.player.learnedTermIds).toContain('g01_moq');
    const cards = buildKnowledgeView(g.session, pack);
    expect(cards).toHaveLength(24);
    expect(cards.every((c) => !c.example.includes('{{'))).toBe(true);
    expect(cards.find((c) => c.id === 'g01_moq')!.status).toBe('接触');
    expect(cards.find((c) => c.id === 'g12_lc')!.status).toBe('未解锁');
    expect(cards.find((c) => c.id === 'g05_rebate')!.prerequisites.map((t) => t.id)).toContain(
      'g03_tax_price',
    );
    expect(buildKnowledgeView(null, pack).every((c) => c.status === '未解锁')).toBe(true);
  });
  it.each(pack.debrief!.quizzes.map((q) => [q.termId, q.answerId]))(
    '%s 自愿查阅与迁移题正确后掌握；反复操作不加经营分',
    (termId, answerId) => {
      let s = act(endingBoundary('excellent'), { type: 'advance' });
      const frozen = structuredClone(s.ending),
        journal = structuredClone(s.snapshot.journal),
        rep = s.snapshot.player.reputation;
      s = act(s, { type: 'openTerm', termId });
      s = act(s, { type: 'openTerm', termId });
      expect(s.snapshot.player.learnedTermIds).toEqual([termId]);
      const wrong = pack
        .debrief!.quizzes.find((q) => q.termId === termId)!
        .options.find((o) => o.id !== answerId)!.id;
      s = act(s, { type: 'answerTerm', termId, answerId: wrong });
      expect(s.snapshot.player.masteredTermIds).toEqual([]);
      s = act(s, { type: 'answerTerm', termId, answerId });
      s = act(s, { type: 'answerTerm', termId, answerId });
      expect(s.snapshot.player.masteredTermIds).toEqual([termId]);
      expect(s.learning.events).toHaveLength(2);
      expect(s.snapshot.player.reputation).toBe(rep);
      expect(s.snapshot.journal).toEqual(journal);
      expect(s.ending).toEqual(frozen);
      expect(() =>
        validateFrozenEnding(sliceSessionSchema.parse(JSON.parse(JSON.stringify(s))), pack),
      ).not.toThrow();
    },
  );
  it('拒绝无效词条和答案，原状态不变', () => {
    const s = createSliceSession(pack, 'invalid');
    expect(() => act(s, { type: 'openTerm', termId: 'missing' })).toThrow('不存在');
    expect(() => act(s, { type: 'answerTerm', termId: 'g01_moq', answerId: 'missing' })).toThrow(
      '不存在',
    );
    expect(s.learning.events).toEqual([]);
    expect(s.snapshot.player.masteredTermIds).toEqual([]);
  });
});
