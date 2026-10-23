import { pack } from './economy';
import { createSliceSession, type SliceSession } from '../../src/engine/slice/session';
import { reduceSlice, type SliceAction } from '../../src/engine/slice/reducer';

export interface InquiryGame {
  readonly session: SliceSession;
  choose(id: string): SliceSession;
  advance(): SliceSession;
}
export function inquiryGame(seed = 'inquiry.test', firstRun = true) {
  let session = createSliceSession(pack, seed, false, false, firstRun);
  let count = 0;
  const act = (action: SliceAction) =>
    (session = reduceSlice(session, pack, {
      id: seed + '.command.' + ++count,
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
  game.choose('select_cup_500');
  game.advance();
  game.choose('select_cup_500_verified');
  game.advance();
  game.advance();
  game.choose('verify_cup_500');
  game.advance();
  game.advance();
  return game;
}
export function resolveInquiry(
  game: InquiryGame,
  role: 'buyer' | 'competitor' | 'fraud',
  guess = role,
  reply = 'safe',
  keepFraud = false,
) {
  game.choose('open_' + role);
  game.advance();
  game.choose('classify_' + role + '_' + guess);
  game.advance();
  game.advance();
  game.choose('reply_' + role + '_' + reply);
  game.advance();
  game.advance();
  if (role === 'fraud') {
    game.choose(keepFraud ? 'fraud_keep' : 'fraud_stop');
    game.advance();
  }
}
export function finishInquiries(
  game: InquiryGame,
  customerId = String(game.session.snapshot.order.flags.inquiryBuyerId),
) {
  game.choose('finish_inquiries');
  game.advance();
  game.choose('lead_' + customerId);
  game.advance();
  game.advance();
}
export function completeInquiries(game: InquiryGame) {
  for (const role of ['buyer', 'competitor', 'fraud'] as const) resolveInquiry(game, role);
  finishInquiries(game);
}
