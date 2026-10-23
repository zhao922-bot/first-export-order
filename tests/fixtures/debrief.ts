import { entry } from './economy';
import { inquiryGame, completeInquiries } from './inquiry';
import { enterNegotiation, toContract, sign } from './negotiation';
import { enterProcurement, produce, finishProcurement } from './procurement';
import {
  enterLogistics,
  bookLogistics,
  dispatchLogistics,
  clearLogisticsRisk,
  finishLogistics,
} from './logistics';
import { enterCollection, acceptDocuments, collect, finishCollection } from './collection';
import { sliceSessionSchema, type SliceSession } from '../../src/engine/slice/session';
import { projectLedger, transfer } from '../../src/engine/economy/ledger';
import type { EndingResult } from '../../src/domain/types';
export function fullGame(payment = 'tt') {
  const game = inquiryGame('debrief.full');
  completeInquiries(game);
  enterNegotiation(game);
  toContract(game, payment);
  sign(game);
  enterProcurement(game);
  produce(game);
  finishProcurement(game);
  enterLogistics(game);
  bookLogistics(game);
  dispatchLogistics(game);
  clearLogisticsRisk(game);
  finishLogistics(game);
  enterCollection(game);
  acceptDocuments(game);
  collect(game);
  finishCollection(game);
  return game;
}
let boundaryTemplate: SliceSession | undefined;
/** E11 专用：完整业务结构配合人工边界账本；不冒充真实策略可达的盈亏结果。 */
export function endingBoundary(kind: EndingResult['kind'], reputation = 80) {
  boundaryTemplate ??= fullGame().session;
  const s = structuredClone(boundaryTemplate);
  s.ending = null;
  s.feedback = null;
  s.snapshot.story.decisionLog = [];
  s.snapshot.player.learnedTermIds = [];
  s.snapshot.player.masteredTermIds = [];
  s.learning = { answers: {}, events: [] };
  const capital = 10_000_000,
    cost = kind === 'bankrupt' ? 10_000_001 : 9_000_000;
  const sales =
    kind === 'bankrupt'
      ? 0
      : kind === 'tuition'
        ? 8_999_999
        : kind === 'breakeven'
          ? 9_000_000
          : 9_900_000;
  s.snapshot.journal = [
    entry('boundary.capital', transfer('cash', 'capital', capital)),
    entry('boundary.cost', transfer('expense', 'cash', cost)),
    entry('boundary.sale', transfer('cash', 'sales', sales)),
  ];
  Object.assign(s.snapshot.player, projectLedger(s.snapshot.journal), {
    reputation,
    rescueUsed: kind === 'bankrupt',
    criticalMistakeCount: kind === 'bankrupt' ? 2 : 0,
  });
  Object.assign(s.snapshot.order, {
    status: kind === 'bankrupt' ? 'cancelled' : 'collected',
    customerId: 'customer_c',
    payment: 'TT',
  });
  s.snapshot.player.trustByCustomer.customer_c = 80;
  Object.assign(s.snapshot.story, { nodeId: 'L07.finish.review', stage: 7 });
  return sliceSessionSchema.parse(s);
}
