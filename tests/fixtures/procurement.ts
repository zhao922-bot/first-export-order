import { pack } from './economy';
import { createSliceSession, type SliceSession } from '../../src/engine/slice/session';
import { reduceSlice, type SliceAction } from '../../src/engine/slice/reducer';
import { quoteScenario } from '../../src/engine/slice/scenario';
import { inspectionExpected } from '../../src/engine/slice/procurement';
import { inspectionItemIds } from '../../src/domain/schemas/procurement';
import { decide, enterNegotiation, toContract, sign, type NegotiationGame } from './negotiation';
export function procurementGame(
  supplierId = 'cup_500_verified',
  payment = 'tt',
  term = 'fob',
  quantity = 2000,
  customerId = 'customer_c',
  seed = 'procurement.normal',
  lc = 'amend',
  content = pack,
) {
  let session = createSliceSession(content, seed, true),
    count = 0;
  const supplier = content.suppliers.find((s) => s.id === supplierId)!;
  Object.assign(session.snapshot.order, {
    productId: supplier.productId,
    supplierId,
    customerId,
    quantity,
  });
  session.snapshot.order.flags.customerIsFraud = customerId === 'customer_d';
  session.snapshot.player.trustByCustomer[customerId] = 50;
  session.quoteInput = {
    ...quoteScenario(content, supplierId),
    quantity,
    domesticTotalCny: String(quantity * 0.7),
  };
  const act = (action: SliceAction) =>
    (session = reduceSlice(session, content, {
      id: seed + '.step.' + ++count,
      revision: session.snapshot.revision,
      action,
    }));
  const game = {
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
  enterNegotiation(game);
  if (customerId === 'customer_d') {
    decide(game, 'offer_hold');
    decide(game, 'payment_' + payment);
    if (payment === 'lc') decide(game, 'lc_' + lc);
    decide(game, 'terms_' + term);
    decide(game, 'fraud_pay');
    game.choose('fraud_continue');
    game.advance();
  } else toContract(game, payment, term, 'hold', lc);
  sign(game);
  enterProcurement(game);
  return game;
}
export function enterProcurement(game: NegotiationGame) {
  game.choose('continue_procurement');
  game.advance();
  game.advance();
}
export function acceptPi(game: NegotiationGame) {
  for (const f of pack.procurement!.piFields)
    game.act({ type: 'confirmPi', fieldId: f.id, checked: true });
  decide(game, 'pi_accept');
}
export function checkFunding(game: NegotiationGame) {
  for (const f of pack.procurement!.fundingChecks)
    game.act({ type: 'checkFunding', fieldId: f.id, checked: true });
}
export function verifyFunding(game: NegotiationGame) {
  checkFunding(game);
  decide(game, 'funding_verify');
}
export function produce(game: NegotiationGame) {
  acceptPi(game);
  verifyFunding(game);
  decide(game, 'supplier_deposit');
  game.choose('production_wait');
  game.advance();
}
export function assess(game: NegotiationGame, allPass = false) {
  for (const itemId of inspectionItemIds) {
    game.act({ type: 'viewEvidence', itemId });
    game.act({
      type: 'assessInspection',
      itemId,
      answer: allPass ? 'pass' : inspectionExpected(game.session.procurement!, itemId),
    });
  }
  decide(game, 'inspection_submit');
}
export function clearInspection(game: NegotiationGame) {
  assess(game);
  if (game.session.procurement!.qualityIssue) {
    decide(game, 'inspection_rework');
    assess(game);
  }
  if (game.session.procurement!.documentsMissing) {
    decide(game, 'inspection_supplement');
    assess(game);
  }
  decide(game, 'inspection_accept');
}
export function finishProcurement(game: NegotiationGame) {
  clearInspection(game);
  decide(game, 'supplier_balance');
}
