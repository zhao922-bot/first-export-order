import type { ContentPack, GameSnapshot } from '../../domain/types';
import { nextRandom } from '../story/rng';

/** 抽取一次并保存：刷新、重读邮件和复盘都不重新抽签。 */
export function prepareInquiries(pack: ContentPack, state: GameSnapshot, firstRun: boolean): void {
  if (state.story.sampledParameters.inquiryBuyerId) return;
  const draw = () => {
    const result = nextRandom(state.story.rngState.parameters);
    state.story.rngState.parameters = result.state;
    state.story.drawCount++;
    return result.value;
  };
  const buyers = pack.customers.filter((c) => c.persona !== 'fraud');
  const buyer = firstRun
    ? buyers.find((c) => c.id === pack.parameters.firstBuyerId!.value)!
    : buyers[Math.floor(draw() * buyers.length)]!;
  const inbox = pack.inquiries.filter((i) => i.senderRole !== 'buyer' || i.customerId === buyer.id);
  for (let i = inbox.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    [inbox[i], inbox[j]] = [inbox[j]!, inbox[i]!];
  }
  for (const inquiry of inbox) {
    const customer = pack.customers.find((c) => c.id === inquiry.customerId);
    if (customer)
      state.player.trustByCustomer[customer.id] =
        customer.initialTrust.min +
        Math.floor(draw() * (customer.initialTrust.max - customer.initialTrust.min + 1));
  }
  state.order.customerId = buyer.id;
  state.order.flags.inquiryBuyerId = buyer.id;
  state.story.sampledParameters.inquiryBuyerId = buyer.id;
  state.story.sampledParameters.inboxOrder = inbox.map((i) => i.id).join(',');
}

export function inquiryInbox(pack: ContentPack, state: GameSnapshot) {
  const ids = String(state.story.sampledParameters.inboxOrder ?? '').split(',');
  return ids.flatMap((id) => {
    const inquiry = pack.inquiries.find((i) => i.id === id);
    return inquiry ? [inquiry] : [];
  });
}
