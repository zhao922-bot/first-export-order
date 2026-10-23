import { pack } from './economy';
import { createSliceSession, type SliceSession } from '../../src/engine/slice/session';
import { reduceSlice, type SliceAction } from '../../src/engine/slice/reducer';
import { calculateQuote } from '../../src/engine/economy/quote';
import type { InquiryGame } from './inquiry';
export interface NegotiationGame extends InquiryGame {
  act(action: SliceAction): SliceSession;
}
export function enterNegotiation(game: NegotiationGame) {
  const quote = calculateQuote(game.session.quoteInput);
  if (!quote.ok) throw new Error('fixture quote');
  game.act({
    type: 'submit',
    answers: {
      rebateUnitCny: quote.value.rebateUnitCny,
      fobCostUnitCny: quote.value.fobCostUnitCny,
      rateBasis: 'costMarkup',
      fobUnitUsd: quote.value.fobUnitUsdQuoted,
      cifUnitUsd: quote.value.cifUnitUsdQuoted,
    },
  });
  game.advance();
  game.advance();
  game.choose('continue_negotiation');
  game.advance();
  game.advance();
}
export function negotiationGame(customerId = 'customer_c', quantity = 5000) {
  let session = createSliceSession(pack, 'negotiation.test', true),
    count = 0;
  session.snapshot.order.customerId = customerId;
  session.snapshot.player.trustByCustomer[customerId] = pack.customers.find(
    (c) => c.id === customerId,
  )!.initialTrust.min;
  session.snapshot.order.flags.customerIsFraud = customerId === 'customer_d';
  const act = (action: SliceAction) =>
    (session = reduceSlice(session, pack, {
      id: 'negotiation.command.' + ++count,
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
    restore: (value: SliceSession) => {
      session = value;
    },
  };
  if (quantity !== 5000)
    act({
      type: 'configure',
      input: { ...session.quoteInput, quantity, domesticTotalCny: String(quantity * 0.7) },
    });
  enterNegotiation(game);
  return game;
}
export function decide(game: InquiryGame, choice: string) {
  game.choose(choice);
  game.advance();
  game.advance();
}
export function toContract(
  game: NegotiationGame,
  payment = 'tt',
  term = 'fob',
  offer = 'hold',
  amendment = 'amend',
) {
  decide(game, 'offer_' + offer);
  decide(game, 'payment_' + payment);
  if (payment === 'lc') decide(game, 'lc_' + amendment);
  decide(game, 'terms_' + term);
  game.choose('counterparty_continue');
  game.advance();
}
export function confirmAll(game: NegotiationGame) {
  for (const field of pack.negotiation!.checklist)
    game.act({ type: 'confirmContract', fieldId: field.id, checked: true });
}
export function sign(game: NegotiationGame) {
  confirmAll(game);
  decide(game, 'contract_sign');
}
