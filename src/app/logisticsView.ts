import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import {
  declarationSource,
  logisticsQuote,
  logisticsTimeline,
  logisticsResolution,
} from '../engine/slice/logistics';
import { teachingText } from '../content/teachingText';
import { accountBalance } from '../engine/economy/ledger';
import { toMinorUnits } from '../engine/economy/decimal';
const money = (n: number, currency = 'CNY') =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(n / 100);
export function buildLogisticsView(session: SliceSession, pack: ContentPack) {
  if (!session.logistics || session.snapshot.story.stage !== 6) return null;
  const value = session.logistics,
    state = session.snapshot,
    order = state.order,
    config = pack.logistics!;
  const source = declarationSource(session, pack),
    term = order.incoterm!;
  const plans = config.plans.map((option) => {
    const forwarder = pack.forwarders.find((f) => f.id === option.forwarderId)!;
    const quote = logisticsQuote(session, pack, forwarder.id),
      timeline = logisticsTimeline(session, pack, forwarder.id);
    return {
      id: forwarder.id,
      name: forwarder.name,
      description: teachingText(option.description, pack),
      selected: value.forwarderId === forwarder.id,
      choiceId: 'plan_' + forwarder.id.replace('forwarder_', ''),
      ...quote,
      ...timeline,
      sellerCost: money(quote.totalFen),
      domestic: money(quote.domesticFen),
      ocean: money(quote.oceanUsdCent, 'USD'),
      insurance: money(quote.sellerInsuranceFen),
      buyerCost: money(
        term === 'CIF' ? 0 : quote.oceanFen + (term === 'EXW' ? quote.exportFen : 0),
      ),
      risk:
        term === 'EXW'
          ? '买方提货协同，卖方不执行出口异常事件'
          : '查验、甩柜与目的港预警由同一事件窗口评估，本关最多一次',
      afterCost: money(state.player.cashCnyFen - (value.booked ? 0 : quote.totalFen)),
    };
  });
  const selected = plans.find((p) => p.id === value.forwarderId);
  const options =
    value.risk === 'customs'
      ? ['standard', 'expedite']
      : value.risk === 'rollover'
        ? ['wait', 'priority']
        : [];
  const names: Record<string, string> = {
    standard: '常规查验',
    expedite: '加急材料协同',
    wait: '等待下一班',
    priority: '改配舱位',
  };
  return {
    term,
    plans,
    selected,
    responsibility: teachingText(config.responsibilities[term], pack),
    fields: config.declarationFields.map((f) => ({
      ...f,
      source: source[f.id],
      value: value.declarationDraft[f.id],
      checked: value.declarationChecks.includes(f.id),
      error: value.declarationErrors.includes(f.id),
    })),
    insuranceOptions: (term === 'CIF'
      ? (['basic', 'extended'] as const)
      : (['buyer'] as const)
    ).map((id) => ({
      id,
      copy: teachingText(config.insuranceCopy[id], pack),
      selected: value.insurance === id,
      premium: selected
        ? money(logisticsQuote(session, pack, selected.id, id).sellerInsuranceFen)
        : '',
      amount:
        selected && term === 'CIF'
          ? money(logisticsQuote(session, pack, selected.id, id).insuredUsdCent, 'USD')
          : '',
    })),
    booked: value.booked,
    complete: order.flags.logisticsComplete === true,
    held: value.held,
    riskText: value.risk
      ? teachingText(config.riskCopy[value.risk], pack)
      : '尚未取得本批承运反馈；选择方案和刷新不会抽取异常。',
    riskOptions: value.riskResolved
      ? []
      : options.map((id) => {
          const r = logisticsResolution(session, pack, id);
          return {
            id,
            name: names[id],
            cost: money(r.feeFen),
            buyerExtra: money(r.buyerExtraFen),
            delivery: r.timeline.delivery,
            missed: r.timeline.missed,
            penalty: money(r.penaltyFen),
            afterCost: money(state.player.cashCnyFen - r.feeFen - r.penaltyFen),
          };
        }),
    deadline:
      order.deliveryCompletedDay !== null
        ? `已于第 ${order.deliveryCompletedDay} 天完成约定交付；交期已冻结`
        : `原合同截止第 ${order.deliveryDueDay} 天，当前剩余 ${order.remainingDeliveryDays} 天`,
    dailyPenalty: money(toMinorUnits(String(pack.parameters[config.dailyPenaltyParam]!.value))),
    dailyReputation: pack.parameters[config.dailyReputationParam]!.value,
    expectedPenalty: selected
      ? money(
          Math.max(0, selected.overdue - order.overdueDaysCharged) *
            toMinorUnits(String(pack.parameters[config.dailyPenaltyParam]!.value)),
        )
      : '',
    destination: source.destination,
    origin: source.origin,
    collection:
      order.collectionDueDay !== null
        ? `OA 实际装船第 ${value.shipmentDay} 天 + ${pack.parameters.oaDays!.value} 天，到期为第 ${order.collectionDueDay} 天；尚未收款。`
        : term === 'EXW' && order.payment === 'OA_60'
          ? 'OA 账期按装船计算；当前只有工厂交付记录，须取得买方实际装船证据后才能建立到期日。'
          : '本关没有收到客户尾款；收款及单据核验在后续关卡。',
    receivable: money(accountBalance(state.journal, 'receivable')),
    inventory: money(accountBalance(state.journal, 'inventory')),
    paid: money(
      value.domesticPaidFen +
        value.oceanPaidFen +
        value.insurancePaidFen +
        value.incidentPaidFen +
        value.penaltyPaidFen,
    ),
    journal: state.journal
      .filter((e) => e.sourceNodeId.startsWith('L06.'))
      .map((e) => ({
        id: e.id,
        day: e.gameDay,
        text: e.description,
        cash: money(
          e.postings
            .filter((p) => p.account === 'cash')
            .reduce((s, p) => s + (p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen), 0),
        ),
      })),
  };
}
export type LogisticsView = NonNullable<ReturnType<typeof buildLogisticsView>>;
