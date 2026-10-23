import { pack } from './economy';
import {
  logisticsGame,
  bookLogistics,
  dispatchLogistics,
  clearLogisticsRisk,
  finishLogistics,
} from './logistics';
import { decide, type NegotiationGame } from './negotiation';
import { documentPuzzle, documentSource, taxEvidence } from '../../src/engine/slice/collection';
export function enterCollection(game: NegotiationGame) {
  game.choose('continue_collection');
  game.advance();
  game.advance();
}
export function collectionGame(
  payment = 'tt',
  term = 'fob',
  supplier = 'cup_500_verified',
  quantity = 2000,
  content = pack,
  seed = 'procurement.normal',
) {
  const game = logisticsGame(payment, term, supplier, quantity, content, seed);
  bookLogistics(game);
  dispatchLogistics(game);
  clearLogisticsRisk(game);
  finishLogistics(game);
  enterCollection(game);
  return game;
}
export function openDocuments(game: NegotiationGame) {
  if (!game.session.snapshot.order.flags.collectionShipmentReady) decide(game, 'buyer_shipment');
  game.choose('documents_start');
  game.advance();
}
export function correctDocuments(game: NegotiationGame) {
  const source = documentSource(game.session, pack),
    puzzle = documentPuzzle(game.session, pack);
  for (const f of puzzle.faults) {
    const fieldId = f.documentId + '.' + f.fieldPath;
    game.act({ type: 'markDocument', fieldId, marked: true });
    game.act({ type: 'correctDocument', fieldId, value: source[f.expectedFrom]! });
  }
  decide(game, 'documents_submit');
}
export function acceptDocuments(game: NegotiationGame) {
  openDocuments(game);
  correctDocuments(game);
  game.choose('documents_accept');
  game.advance();
}
export function collect(game: NegotiationGame, writeoff = false) {
  switch (game.session.snapshot.order.payment) {
    case 'TT':
      decide(game, 'tt_verify');
      decide(game, 'tt_chase');
      break;
    case 'LC_SIGHT':
      decide(game, 'lc_present');
      if (game.session.collection!.bankStatus === 'discrepancy') decide(game, 'lc_amend');
      decide(game, 'lc_collect');
      break;
    case 'OA_60':
      decide(game, 'oa_due');
      decide(game, 'oa_chase');
      if (!game.session.collection!.collectionClosed) decide(game, 'oa_recover');
      decide(
        game,
        game.session.collection!.collectionClosed && !writeoff ? 'oa_complete' : 'oa_writeoff',
      );
      break;
  }
}
export function verifyTax(game: NegotiationGame) {
  for (const f of pack.collection!.taxEvidence)
    game.act({
      type: 'assessTax',
      fieldId: f.id,
      answer: taxEvidence(game.session, pack)[f.id] ? 'verified' : 'missing',
    });
  decide(game, 'tax_verify');
}
export function finishCollection(game: NegotiationGame) {
  verifyTax(game);
  decide(game, game.session.collection!.taxEligible ? 'tax_receive' : 'tax_ineligible');
}
