import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import { negotiationProjection, applyOffer } from '../engine/slice/negotiation';
import { currentNode, matches } from '../engine/slice/reducer';
import { teachingText } from '../content/teachingText';
const money = (fen: number, currency = 'CNY') =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(fen / 100);

export function buildNegotiationView(session: SliceSession, pack: ContentPack) {
  if (!session.negotiation || session.snapshot.story.stage !== 4) return null;
  const state = session.snapshot,
    node = currentNode(pack, session),
    profile = pack.negotiation!.profiles.find((p) => p.customerId === state.order.customerId)!;
  const projection = negotiationProjection(session, pack);
  const round = node.tags.includes('round_price')
    ? 1
    : node.tags.includes('round_payment')
      ? 2
      : node.tags.includes('round_terms')
        ? 3
        : 0;
  const clientText =
    round === 1
      ? profile.pricePrompt
      : round === 2
        ? profile.paymentPrompt
        : round === 3
          ? profile.termsPrompt
          : '';
  const choices =
    node.type === 'choice'
      ? node.choices
          .map((c) => {
            let detail = '';
            const effect = c.effects.find(
              (e) => e.op === 'rule' && e.ruleId.startsWith('negotiation.'),
            );
            if (
              effect?.op === 'rule' &&
              effect.ruleId === 'negotiation.offer' &&
              effect.args.offerId?.kind === 'literal'
            ) {
              const candidate = structuredClone(session);
              applyOffer(candidate, pack, String(effect.args.offerId.value));
              const quote = negotiationProjection(candidate, pack);
              detail = `${quote.quantity} 件 · FOB USD ${quote.unitUsd}/件 · 条件成立时预计单笔贡献 ${money(quote.projectedMarginFen)} · 预计最低现金 ${money(quote.forecast.minimumCashCnyFen)}`;
            }
            if (
              effect?.op === 'rule' &&
              effect.ruleId === 'negotiation.terms' &&
              effect.args.incoterm?.kind === 'literal'
            ) {
              const termId = effect.args.incoterm.value;
              const term = pack.negotiation!.terms.find((t) => t.id === termId)!;
              const quote = negotiationProjection(session, pack, undefined, term.id);
              detail = `${term.id} ${quote.place} · USD ${quote.unitUsd}/件\n${term.explanation}`;
            }
            return {
              ...c,
              label: teachingText(c.label, pack),
              enabled: matches(c.when, session, pack),
              detail,
            };
          })
          .filter((c) => node.id !== 'L04.counterparty' || c.enabled)
      : [];
  const payments = pack.negotiation!.payments.map((p) => {
    const quote = negotiationProjection(session, pack, p.id);
    return {
      ...p,
      explanation: teachingText(p.explanation, pack),
      minimum: money(quote.forecast.minimumCashCnyFen),
      bank: money(quote.bankFen),
      deposit: money(quote.customerDepositUsdCent, 'USD'),
      collectionDay: quote.collectionDay,
    };
  });
  return {
    round,
    clientText: teachingText(clientText, pack),
    choices,
    payments,
    projection,
    checklist: pack.negotiation!.checklist,
    rounds: [1, 2, 3].map((r) => ({
      label: ['价格与数量', '付款保障', '术语与地点'][r - 1]!,
      done: state.order.flags['round' + r + 'Done'] === true,
    })),
    warnings: [
      ...(projection.projectedMarginFen < 0
        ? ['当前条件下预计亏损；可返回第一轮守价、缩量或重谈。']
        : []),
      ...(projection.forecast.gapDay !== null
        ? ['预计资金出现缺口；未来应收与退税无法支付今天的支出。']
        : []),
      ...(state.order.flags.lcSoftAccepted
        ? ['仍接受买方控制的软条款，存在无法相符交单风险。']
        : []),
      ...(state.order.flags.customerIsFraud
        ? ['对方身份及收款人未核验：资金预览不计入 D 的承诺或截图。']
        : []),
      ...(state.order.flags.competitorPricingLeaked
        ? ['前期已向同行泄露供应商和底价，对方可据此低价竞争；请用成本与证据守住底线。']
        : []),
      ...(state.order.flags.buyerPricingLeaked
        ? ['此前已向买家泄露底价，继续让价可能进一步侵蚀利润。']
        : []),
    ],
    depositPercent: new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(
      Number(session.negotiation.depositRatio),
    ),
    deadlineDays: Number(pack.parameters.contractDeliveryDays!.value),
  };
}
export type NegotiationView = NonNullable<ReturnType<typeof buildNegotiationView>>;
