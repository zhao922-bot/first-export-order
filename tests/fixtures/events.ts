import type { ContentPack } from '../../src/domain/types';
import { createSliceSession, type SliceSession } from '../../src/engine/slice/session';
import { reduceSlice, type SliceAction } from '../../src/engine/slice/reducer';
import { seedRngState } from '../../src/engine/story/rng';
import { calculateQuote } from '../../src/engine/economy/quote';
import { eventPack, pack } from './economy';
import { negotiationGame, decide, enterNegotiation, toContract, sign } from './negotiation';
import {
  procurementGame,
  acceptPi,
  verifyFunding,
  enterProcurement,
  produce,
  finishProcurement,
} from './procurement';
import {
  logisticsGame,
  selectLogistics,
  declaration,
  bookLogistics,
  dispatchLogistics,
  enterLogistics,
  clearLogisticsRisk,
  finishLogistics,
} from './logistics';
import {
  collectionGame,
  acceptDocuments,
  enterCollection,
  collect,
  finishCollection,
} from './collection';
import { completeInquiries } from './inquiry';

/** EVT 领域边界：前序事实均由旧有业务命令取得，仅把剧情停在窗口前。 */
export function eventBoundary(eventId: string, seed = 'event.boundary') {
  let session: SliceSession;
  if (['e01', 'e09'].includes(eventId)) {
    session = createSliceSession(pack, seed, true);
    Object.assign(session.snapshot.order, { productId: 'cup_500', supplierId: 'cup_500_verified' });
    const q = calculateQuote(session.quoteInput);
    if (!q.ok) throw new Error('quote');
    session = reduceSlice(session, pack, {
      id: 'prepare.quote',
      revision: session.snapshot.revision,
      action: {
        type: 'submit',
        answers: {
          rebateUnitCny: q.value.rebateUnitCny,
          fobCostUnitCny: q.value.fobCostUnitCny,
          rateBasis: 'costMarkup',
          fobUnitUsd: q.value.fobUnitUsdQuoted,
          cifUnitUsd: q.value.cifUnitUsdQuoted,
        },
      },
    });
    session = reduceSlice(session, pack, {
      id: 'prepare.review',
      revision: session.snapshot.revision,
      action: { type: 'advance' },
    });
    session.feedback = { text: '报价已核验', nextNodeId: 'L03.handoff' };
  } else if (['e06', 'e11'].includes(eventId)) {
    const g = negotiationGame('customer_c', 2000);
    Object.assign(g.session.snapshot.order, {
      productId: 'cup_500',
      supplierId: 'cup_500_verified',
    });
    decide(g, 'offer_hold');
    g.choose(eventId === 'e11' ? 'payment_lc' : 'payment_tt');
    g.advance();
    session = structuredClone(g.session);
  } else if (['e04', 'e05'].includes(eventId)) {
    const g = procurementGame();
    acceptPi(g);
    verifyFunding(g);
    decide(g, 'supplier_deposit');
    session = structuredClone(g.session);
    session.snapshot.story.nodeId = 'L05.deposit.review';
  } else if (eventId === 'e02') {
    const g = logisticsGame('tt', 'cif');
    selectLogistics(g);
    declaration(g);
    session = structuredClone(g.session);
    session.snapshot.story.nodeId = 'L06.declaration.review';
  } else if (['e03', 'e08'].includes(eventId)) {
    const g = logisticsGame();
    bookLogistics(g);
    dispatchLogistics(g);
    session = structuredClone(g.session);
    session.snapshot.story.nodeId = 'L06.risk.review';
  } else {
    const g = collectionGame();
    acceptDocuments(g);
    session = structuredClone(g.session);
    session.feedback = { text: '已核对单据源记录', nextNodeId: 'L07.payment' };
  }
  const stage = session.snapshot.story.stage;
  session.snapshot.story.eventWindows = session.snapshot.story.eventWindows.filter(
    (w) => w.stage < stage,
  );
  session.snapshot.story.triggeredEventIds = session.snapshot.story.eventWindows.flatMap((w) =>
    w.eventId ? [w.eventId] : [],
  );
  session.snapshot.story.pendingEvent = null;
  session.snapshot.story.pendingFeedback = null;
  session.snapshot.story.seed = seed;
  session.snapshot.story.rngState.events = seedRngState(seed, 'events');
  const content = structuredClone(eventPack);
  content.eventScheduling!.windowProbability = '1';
  const anchor =
    eventId === 'e11'
      ? 'L04.lc.soft'
      : eventId === 'e06'
        ? 'L04.terms'
        : eventId === 'e02'
          ? 'L06.gate'
          : ['e03', 'e08'].includes(eventId)
            ? 'L06.risk'
            : ['e04', 'e05'].includes(eventId)
              ? 'L05.production'
              : ['e01', 'e09'].includes(eventId)
                ? 'L03.handoff'
                : 'L07.payment';
  content.eventScheduling!.windows.find((w) => w.nodeId === anchor)!.eventIds = [eventId];
  return { session, content, anchor };
}
export function eventDriver(source: SliceSession, content: ContentPack = eventPack) {
  let session = source;
  const act = (action: SliceAction) =>
    (session = reduceSlice(session, content, {
      id: 'event.command.' + session.snapshot.revision,
      revision: session.snapshot.revision,
      action,
    }));
  return {
    get session() {
      return session;
    },
    act,
    choose: (choiceId: string) => act({ type: 'choose', choiceId }),
    advance: () => act({ type: 'advance' }),
    restore: (s: SliceSession) => {
      session = s;
    },
  };
}
/** 使用生产内容、实际七关命令及事件选项，无注入现金或成绩。 */
export function fullEventRun(seed: string, payment = 'tt', term = 'fob') {
  const raw = eventDriver(createSliceSession(eventPack, seed));
  const settle = () => {
    const pending = raw.session.snapshot.story.pendingEvent;
    if (!pending) return;
    const event = eventPack.events.find((e) => e.id === pending.eventId)!;
    if (event.useNodeEffects) return; // L/C 由当前路线显式选择改单或接受。
    const options = eventPack.eventEconomy!.find((e) => e.eventId === pending.eventId)!.options;
    const option = options.find((o) => !o.riskFlag) ?? options[0]!;
    raw.choose(option.choiceId);
    raw.advance();
    raw.advance();
  };
  const g = {
    get session() {
      return raw.session;
    },
    act: (a: SliceAction) => {
      const s = raw.act(a);
      settle();
      return s;
    },
    choose: (id: string) => {
      raw.choose(id);
      settle();
      return raw.session;
    },
    advance: () => {
      raw.advance();
      settle();
      return raw.session;
    },
  };
  g.choose('select_cup_500');
  g.advance();
  g.choose('select_cup_500_verified');
  g.advance();
  g.advance();
  g.choose('verify_cup_500');
  g.advance();
  g.advance();
  completeInquiries(g);
  enterNegotiation(g);
  toContract(g, payment, term);
  sign(g);
  enterProcurement(g);
  produce(g);
  finishProcurement(g);
  enterLogistics(g);
  bookLogistics(g); // dispatchLogistics fixture injects no-event feedback; full run uses actual commands instead.
  decide(g, 'logistics_dispatch');
  clearLogisticsRisk(g);
  finishLogistics(g);
  enterCollection(g);
  acceptDocuments(g);
  collect(g);
  finishCollection(g);
  return g.session;
}
