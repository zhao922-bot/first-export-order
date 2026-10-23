import { pack } from './economy';
import { procurementGame, produce, finishProcurement } from './procurement';
import { decide, type NegotiationGame } from './negotiation';
import { declarationSource } from '../../src/engine/slice/logistics';
export function enterLogistics(game: NegotiationGame) {
  game.choose('continue_logistics');
  game.advance();
  game.advance();
}
export function logisticsGame(
  payment = 'tt',
  term = 'fob',
  supplier = 'cup_500_verified',
  quantity = 2000,
  content = pack,
  seed = 'procurement.normal',
) {
  const game = procurementGame(
    supplier,
    payment,
    term,
    quantity,
    'customer_c',
    seed,
    'amend',
    content,
  );
  produce(game);
  finishProcurement(game);
  enterLogistics(game);
  return game;
}
export function selectLogistics(game: NegotiationGame, plan = 'steady', insurance = 'basic') {
  decide(game, 'plan_' + plan);
  decide(
    game,
    'insurance_' + (game.session.snapshot.order.incoterm === 'CIF' ? insurance : 'buyer'),
  );
}
export function declaration(game: NegotiationGame, correct = true) {
  const source = declarationSource(game.session, pack);
  for (const fieldId of pack.logistics!.declarationFields.map((f) => f.id)) {
    if (correct) game.act({ type: 'editDeclaration', fieldId, value: source[fieldId] });
    game.act({ type: 'checkDeclaration', fieldId, checked: true });
  }
  decide(game, 'declaration_submit');
}
export function bookLogistics(game: NegotiationGame, plan = 'steady', insurance = 'basic') {
  selectLogistics(game, plan, insurance);
  declaration(game);
  decide(game, 'logistics_book');
}
/** 领域边界夹具：明确设置已取得的承运反馈；统一调度另由 events.test 的真实种子覆盖。 */
export function forceLogisticsRisk(
  game: ReturnType<typeof logisticsGame>,
  risk: 'none' | 'customs' | 'rollover',
) {
  const s = structuredClone(game.session);
  s.logistics!.risk = risk;
  s.logistics!.riskResolved = risk === 'none';
  Object.assign(s.snapshot.order.flags, {
    logisticsCustoms: risk === 'customs',
    logisticsRollover: risk === 'rollover',
    logisticsClear: risk === 'none',
    logisticsRiskResolved: risk === 'none',
  });
  game.restore(s);
}
export function dispatchLogistics(
  game: ReturnType<typeof logisticsGame>,
  risk: 'none' | 'customs' | 'rollover' = 'none',
) {
  decide(game, 'logistics_dispatch');
  forceLogisticsRisk(game, risk);
}
export function clearLogisticsRisk(game: NegotiationGame, resolution = 'standard') {
  if (game.session.snapshot.story.nodeId === 'L06.delivery') return;
  if (game.session.logistics!.riskResolved) {
    game.choose('risk_clear');
    game.advance();
  } else
    decide(
      game,
      (game.session.logistics!.risk === 'customs' ? 'customs_' : 'rollover_') + resolution,
    );
}
export function finishLogistics(game: NegotiationGame) {
  decide(game, 'logistics_deliver');
}
