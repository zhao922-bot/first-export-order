import { describe, expect, it } from 'vitest';
import { eventPack, pack } from '../fixtures/economy';
import { eventBoundary, eventDriver, fullEventRun } from '../fixtures/events';
import { sliceSessionSchema, createSliceSession } from '../../src/engine/slice/session';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { drawEvent, eventWeight } from '../../src/engine/story/events';
import { seedRngState } from '../../src/engine/story/rng';
import { evaluateCondition } from '../../src/engine/story/conditions';
import {
  openEventWindow,
  validateEventState,
  eventOptionPreview,
} from '../../src/engine/slice/events';
import { validateContent } from '../../src/content/validation';
import { projectLedger, validateJournal, transfer } from '../../src/engine/economy/ledger';
import { calculateQuote } from '../../src/engine/economy/quote';
import { negotiationProjection } from '../../src/engine/slice/negotiation';
import { collectionRule } from '../../src/engine/slice/collection';
import { buildEndingView } from '../../src/app/debriefView';

const ids = eventPack.events.map((e) => e.id);
describe('EVT-01 十二事件与统一调度', () => {
  it('完整内容、每项两种有代价选择与林姐复盘可校验', () => {
    expect(validateContent(eventPack)).toMatchObject({ ok: true });
    expect(ids).toEqual(Array.from({ length: 12 }, (_, n) => 'e' + String(n + 1).padStart(2, '0')));
    expect(eventPack.eventEconomy!.every((e) => e.options.length >= 2)).toBe(true);
  });
  it.each(
    ids.flatMap((id) =>
      eventPack.eventEconomy!.find((e) => e.eventId === id)!.options.map((o) => [id, o.choiceId]),
    ),
  )('%s / %s：真实后果、复盘、回流与命令幂等', (id, choiceId) => {
    const { session, content } = eventBoundary(id!);
    const g = eventDriver(session, content);
    g.advance();
    const event = content.events.find((e) => e.id === id)!;
    expect(g.session.snapshot.story.pendingEvent?.eventId).toBe(id);
    expect(g.session.snapshot.story.nodeId).toBe(event.choiceNodeId);
    const pending = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)));
    validateEventState(pending, content);
    const rng = structuredClone(pending.snapshot.story.rngState);
    const returnId = pending.snapshot.story.pendingEvent!.returnNodeId;
    const before = structuredClone(g.session);
    const cmd = {
      id: 'outcome.once',
      revision: g.session.snapshot.revision,
      action: { type: 'choose', choiceId: choiceId! } as const,
    };
    const after = reduceSlice(g.session, content, cmd);
    expect(reduceSlice(after, content, cmd)).toBe(after);
    expect(() => reduceSlice(after, content, { ...cmd, id: 'stale' })).toThrow('过期');
    expect(after.snapshot.story.decisionLog.at(-1)!.before).toBeDefined();
    expect(after.snapshot.gameDay >= before.snapshot.gameDay).toBe(true);
    expect(after.snapshot.player.cashCnyFen).toBeGreaterThan(0);
    expect(after.snapshot).not.toEqual(before.snapshot);
    validateJournal(after.snapshot.journal);
    expect(projectLedger(after.snapshot.journal)).toMatchObject({
      cashCnyFen: after.snapshot.player.cashCnyFen,
      cumulativeProfitCnyFen: after.snapshot.player.cumulativeProfitCnyFen,
    });
    g.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(after))));
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe(event.reviewNodeId);
    expect(g.session.snapshot.story.pendingEvent).not.toBeNull();
    const journal = structuredClone(g.session.snapshot.journal);
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe(returnId);
    expect(g.session.snapshot.story.pendingEvent).toBeNull();
    expect(g.session.snapshot.journal).toEqual(journal);
    expect(g.session.snapshot.story.rngState).toEqual(rng);
    const returned = structuredClone(g.session);
    openEventWindow(g.session, content, pending.snapshot.story.eventWindows.at(-1)!.anchorNodeId);
    expect(g.session).toEqual(returned);
  });
  it('空池不耗随机数；未触发窗口保存空结果，刷新/重入不重抽', () => {
    const { session, content, anchor } = eventBoundary('e02');
    session.snapshot.order.incoterm = 'FOB';
    const before = structuredClone(session.snapshot.story);
    openEventWindow(session, content, anchor);
    expect(session.snapshot.story.rngState).toEqual(before.rngState);
    expect(session.snapshot.story.eventWindows.at(-1)?.eventId).toBeNull();
    const no = eventBoundary('e01');
    no.content.eventScheduling!.windowProbability = '0';
    const g = eventDriver(no.session, no.content);
    g.advance();
    const saved = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)));
    expect(saved.snapshot.story.eventWindows.at(-1)?.probabilityRoll).not.toBeNull();
    openEventWindow(saved, no.content, no.anchor);
    expect(saved).toEqual(g.session);
  });
  it('前置条件、互斥、关卡上限、全局上限在抽数前过滤', () => {
    const { session, content } = eventBoundary('e08');
    const window = content.eventScheduling!.windows.find((w) => w.nodeId === 'L06.risk')!;
    session.snapshot.story.triggeredEventIds = ['e03'];
    const before = structuredClone(session.snapshot.story.rngState);
    expect(drawEvent(content, session.snapshot, window).event).toBeNull();
    expect(session.snapshot.story.rngState).toEqual(before);
    session.snapshot.story.triggeredEventIds = [];
    session.snapshot.story.eventWindows.push({
      id: 'prior.window',
      stage: 6,
      anchorNodeId: 'L06.gate',
      status: 'resolved',
      eventId: 'e02',
      probabilityRoll: null,
      selectedWeight: '7',
    });
    expect(drawEvent(content, session.snapshot, window).event).toBeNull();
    session.snapshot.story.eventWindows = [3, 4, 5].map((stage) => ({
      id: 'cap.' + stage,
      stage: stage as 3 | 4 | 5,
      anchorNodeId: 'test',
      eventId: 'e0' + stage,
      status: 'resolved' as const,
      probabilityRoll: null,
      selectedWeight: null,
    }));
    expect(drawEvent(content, session.snapshot, window).event).toBeNull();
    expect(session.snapshot.story.rngState).toEqual(before);
  });
  it('权重使用同一抽签，客户/供应商专属权重可配置', () => {
    const s = createSliceSession(eventPack, 'weights').snapshot;
    s.order.customerId = 'customer_b';
    const e = eventPack.events.find((e) => e.id === 'e06')!;
    expect(eventWeight(e, s, eventPack)).toBe(e.weight + e.exclusiveWeightBonus);
    s.order.customerId = 'customer_e';
    expect(eventWeight(e, s, eventPack)).toBe(e.weight);
  });
  it.each(['event.lc.0', 'event.lc.1', 'event.lc.2'])(
    'L/C %s 强制首审证、不耗事件抽数且只出现一次',
    (seed) => {
      const { session, content } = eventBoundary('e11', seed);
      content.eventScheduling!.windowProbability = '0';
      const before = structuredClone(session.snapshot.story.rngState.events),
        g = eventDriver(session, content);
      g.advance();
      expect(g.session.snapshot.story.pendingEvent?.eventId).toBe('e11');
      expect(g.session.snapshot.story.rngState.events).toEqual(before);
      g.choose('lc_amend');
      g.advance();
      g.advance();
      expect(g.session.snapshot.story.triggeredEventIds.filter((id) => id === 'e11')).toHaveLength(
        1,
      );
      expect(g.session.snapshot.order.flags.lcReviewed).toBe(true);
    },
  );
  it('现金极低时不抽不可负担的坏事件，处置失败原子回滚', () => {
    const { session, content } = eventBoundary('e03');
    session.snapshot.journal.push({
      id: 'lowcash',
      commandId: 'lowcash',
      sourceNodeId: 'L06.book.review',
      gameDay: session.snapshot.gameDay,
      description: '低余额边界夹具',
      postings: transfer('expense', 'cash', session.snapshot.player.cashCnyFen - 100),
    });
    Object.assign(session.snapshot.player, projectLedger(session.snapshot.journal));
    const g = eventDriver(session, content);
    const rng = structuredClone(session.snapshot.story.rngState.events);
    g.advance();
    expect(g.session.snapshot.story.pendingEvent).toBeNull();
    expect(g.session.snapshot.story.rngState.events).toEqual(rng);
    const b = eventBoundary('e04');
    const normal = eventDriver(b.session, b.content);
    normal.advance();
    const broken = structuredClone(b.content);
    broken.parameters['economy.events.e04.e04ExpediteFee']!.value = '1000000';
    const original = structuredClone(normal.session);
    expect(() =>
      reduceSlice(normal.session, broken, {
        id: 'too.high',
        revision: original.snapshot.revision,
        action: { type: 'choose', choiceId: 'e04_expedite' },
      }),
    ).toThrow('现金不足');
    expect(normal.session).toEqual(original);
  });
  it('±1.5% 按种子固定；重报会重算报价，持有风险到收款才入账', () => {
    let up = false,
      down = false;
    for (let i = 0; i < 20; i++) {
      const b = eventBoundary('e01', 'fx.' + i),
        g = eventDriver(b.session, b.content);
      g.advance();
      const f = Number(g.session.snapshot.story.sampledParameters.eventFxFactor);
      up ||= f === 1.015;
      down ||= f === 0.985;
      const cash = g.session.snapshot.player.cashCnyFen;
      g.choose('e01_reprice');
      const q = calculateQuote(g.session.quoteInput);
      expect(q.ok && q.value).toEqual(g.session.snapshot.order.quote);
      expect(g.session.snapshot.player.cashCnyFen).toBe(cash);
    }
    expect([up, down]).toEqual([true, true]);
    const b = eventBoundary('e07');
    b.content.eventScheduling!.windows.find((w) => w.nodeId === 'L07.payment')!.eventIds = ['e01'];
    const g = eventDriver(b.session, b.content);
    g.advance();
    const factor = Number(g.session.snapshot.story.sampledParameters.eventFxFactor);
    g.choose('e01_hold');
    g.advance();
    g.advance();
    collectionRule(g.session, b.content, 'collection.ttVerify', 'bank.verify');
    g.session.snapshot.story.nodeId = 'L07.tt';
    const before = g.session.snapshot.player.cashCnyFen,
      outstanding = g.session.collection!.outstandingUsdCent;
    collectionRule(g.session, b.content, 'collection.ttChase', 'bank.chase');
    expect(g.session.snapshot.player.cashCnyFen - before).toBe(
      Math.round(outstanding * Number(g.session.quoteInput.fxCnyPerUsd) * factor),
    );
  });
  it('CIF 涨价只追加本方运费，价格竞争改变实际合同报价而非伪造费用', () => {
    const b = eventBoundary('e02'),
      g = eventDriver(b.session, b.content);
    g.advance();
    const ev = b.content.events.find((e) => e.id === 'e02')!,
      op = b.content.eventEconomy!.find((e) => e.eventId === 'e02')!.options[0]!;
    const cost = eventOptionPreview(g.session, b.content, ev, op).costFen;
    expect(cost).toBeGreaterThan(0);
    const cash = g.session.snapshot.player.cashCnyFen;
    g.choose(op.choiceId);
    expect(g.session.snapshot.player.cashCnyFen).toBe(cash - cost);
    const p = eventBoundary('e06'),
      h = eventDriver(p.session, p.content);
    h.advance();
    const before = negotiationProjection(h.session, p.content).unitUsd,
      ledger = structuredClone(h.session.snapshot.journal);
    h.choose('e06_reprice');
    expect(Number(negotiationProjection(h.session, p.content).unitUsd)).toBeLessThan(
      Number(before),
    );
    expect(h.session.snapshot.journal).toEqual(ledger);
  });
  it('条件全操作不耗随机数，数值比较不把空值当零', () => {
    const s = createSliceSession(pack, 'condition').snapshot;
    const ref = { kind: 'ref', scope: 'state', path: 'order.signedDay' } as const;
    const before = structuredClone(s.story.rngState);
    expect(evaluateCondition({ op: 'not', condition: { op: 'exists', value: ref } }, s, pack)).toBe(
      true,
    );
    expect(
      evaluateCondition({ op: 'gte', left: ref, right: { kind: 'literal', value: 0 } }, s, pack),
    ).toBe(false);
    expect(s.story.rngState).toEqual(before);
  });
  it.each(['repro.0', 'repro.1', 'repro.2', 'repro.3'])(
    '完整七关 %s 固定序列、上限、可冻结复盘',
    (seed) => {
      const a = fullEventRun(seed),
        b = fullEventRun(seed);
      expect(a).toEqual(b);
      expect(a.ending).not.toBeNull();
      expect(a.snapshot.story.triggeredEventIds.length).toBeLessThanOrEqual(3);
      expect(new Set(a.snapshot.story.triggeredEventIds).size).toBe(
        a.snapshot.story.triggeredEventIds.length,
      );
      validateEventState(a, eventPack);
      validateJournal(a.snapshot.journal);
      expect(buildEndingView(a, eventPack)?.replay.every((d) => d.before)).toBe(true);
    },
  );
  it('事件流 v2 的连续抽数按权重覆盖尾部事件，固定种子保留黄金序列', () => {
    const source = createSliceSession(eventPack, 'weights.distribution').snapshot;
    source.story.stage = 7;
    source.order.customerId = 'customer_c';
    Object.assign(source.order.flags, {
      logisticsDispatched: true,
      logisticsComplete: true,
      collectionMoneyClosed: false,
    });
    const window = eventPack.eventScheduling!.windows.find((w) => w.nodeId === 'L07.payment')!;
    let selected = 0,
      tail = 0;
    for (let i = 0; i < 2000; i++) {
      const state = structuredClone(source);
      state.story.rngState.events = seedRngState('distribution.weights.' + i, 'events');
      const event = drawEvent(eventPack, state, window).event;
      if (event) selected++;
      if (event?.id === 'e12') tail++;
    }
    expect(selected / 2000).toBeGreaterThan(0.6);
    expect(selected / 2000).toBeLessThan(0.7);
    expect(tail / selected).toBeGreaterThan(0.25);
    expect(tail / selected).toBeLessThan(0.36);
    expect(fullEventRun('repro.0').snapshot.story.triggeredEventIds).toEqual(['e03']);
  });
  it('重复改谈 L/C 复用已经处置的审证结果，不重复抽签或收取改单费', () => {
    const b = eventBoundary('e11'),
      g = eventDriver(b.session, b.content);
    g.advance();
    g.choose('lc_amend');
    g.advance();
    g.advance();
    const cost = g.session.snapshot.player.cashCnyFen;
    const decide = (id: string) => {
      g.choose(id);
      g.advance();
      g.advance();
    };
    decide('terms_fob');
    g.choose('counterparty_continue');
    g.advance();
    g.choose('contract_reprice');
    g.advance();
    decide('offer_hold');
    decide('payment_lc');
    expect(g.session.snapshot.story.nodeId).toBe('L04.terms');
    expect(g.session.snapshot.story.pendingEvent).toBeNull();
    expect(g.session.snapshot.player.cashCnyFen).toBe(cost);
    expect(g.session.snapshot.story.triggeredEventIds).toEqual(['e11']);
    expect(g.session.snapshot.order.flags.lcReviewed).toBe(true);
  });
  it('内容拒绝无效权重、代价、回流、次数、缺失事件与损坏存档', () => {
    for (const change of [
      (p: typeof eventPack) => {
        p.events[0]!.weight = 0;
      },
      (p: typeof eventPack) => {
        p.eventScheduling!.windows[0]!.returnNodeId = 'missing';
      },
      (p: typeof eventPack) => {
        p.eventEconomy![0]!.options[0]!.extraDays = 999;
      },
      (p: typeof eventPack) => {
        p.eventEconomy![0]!.options[0]!.amountCnyParam = 'missing';
      },
      (p: typeof eventPack) => {
        p.eventScheduling!.perRunEventCap = 0;
      },
      (p: typeof eventPack) => {
        p.events.pop();
      },
    ]) {
      const p = structuredClone(eventPack);
      change(p);
      expect(validateContent(p).ok).toBe(false);
    }
    const b = eventBoundary('e04'),
      g = eventDriver(b.session, b.content);
    g.advance();
    const s = structuredClone(g.session);
    s.snapshot.story.pendingEvent!.returnNodeId = 'L07.complete';
    expect(() => validateEventState(s, b.content)).toThrow('无效');
  });
});
