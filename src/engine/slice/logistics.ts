import { CashShortfall } from '../rules/cashShortfall';
import type { ContentPack, JournalEntry } from '../../domain/types';
import { declarationIds, logisticsStateSchema } from '../../domain/schemas/logistics';
import type { SliceSession } from './session';
import { D, toMinorUnits } from '../economy/decimal';
import { calculateFreight } from '../economy/freight';
import { accrueDeadline } from '../economy/deadline';
import { collectionDueDay } from '../economy/cashflow';
import {
  accountBalance,
  appendJournal,
  projectLedger,
  shipmentPostings,
  transfer,
  type Posting,
} from '../economy/ledger';
import { negotiationParameter, termPlace } from './negotiation';
type Field = (typeof declarationIds)[number];
export type LogisticsAction =
  | { type: 'editDeclaration'; fieldId: Field; value: string }
  | { type: 'checkDeclaration'; fieldId: Field; checked: boolean };
const param = (pack: ContentPack, id: string) => negotiationParameter(pack, id);
const day = (pack: ContentPack, id: string) => Number(param(pack, id));
const fen = (pack: ContentPack, id: string) => toMinorUnits(param(pack, id));
export function declarationSource(session: SliceSession, pack: ContentPack): Record<Field, string> {
  const o = session.snapshot.order;
  return {
    product: pack.products.find((p) => p.id === o.productId)!.name,
    quantity: String(o.quantity),
    amount: new D(o.invoiceUsdCent!).div(100).toFixed(2),
    term: o.incoterm!,
    origin: o.incoterm === 'EXW' ? o.namedPlace! : termPlace(session, pack, 'FOB'),
    destination: o.incoterm === 'CIF' ? o.namedPlace! : termPlace(session, pack, 'CIF'),
  };
}
export function beginLogistics(session: SliceSession, pack: ContentPack): void {
  if (session.logistics) return;
  const o = session.snapshot.order;
  if (
    o.status !== 'ready' ||
    !session.procurement?.inspectionAccepted ||
    !o.flags.procurementComplete
  )
    throw new RangeError('必须完成第 5 关验收入库和供应商付款');
  const source = declarationSource(session, pack);
  session.logistics = logisticsStateSchema.parse({
    enteredDay: session.snapshot.gameDay,
    forwarderId: null,
    insurance: null,
    declarationDraft: { ...source, quantity: String(o.quantity + 100) },
    declarationChecks: [],
    declarationErrors: [],
    booked: false,
    dispatched: false,
    risk: null,
    riskResolved: false,
    resolution: null,
    readyDay: null,
    shipmentDay: null,
    domesticPaidFen: 0,
    oceanPaidFen: 0,
    insurancePaidFen: 0,
    incidentPaidFen: 0,
    penaltyPaidFen: 0,
    held: false,
  });
  o.flags.logisticsCif = o.incoterm === 'CIF';
  o.flags.logisticsNonCif = o.incoterm !== 'CIF';
}
function active(session: SliceSession) {
  if (
    !session.logistics ||
    session.snapshot.story.stage !== 6 ||
    session.snapshot.order.status !== 'ready' ||
    session.logistics.held
  )
    throw new RangeError('当前不在可操作的物流阶段');
  return session.logistics;
}
export function logisticsAction(
  session: SliceSession,
  pack: ContentPack,
  action: LogisticsAction,
): void {
  const v = active(session),
    node = pack.nodes.find((n) => n.id === session.snapshot.story.nodeId)!;
  if (
    !node.tags.includes('declaration_check') ||
    session.feedback ||
    v.booked ||
    !declarationIds.includes(action.fieldId)
  )
    throw new RangeError('当前不能修改申报核对');
  if (action.type === 'editDeclaration') {
    if (action.value.length > 200) throw new RangeError('字段过长');
    v.declarationDraft[action.fieldId] = action.value;
    v.declarationChecks = v.declarationChecks.filter((id) => id !== action.fieldId);
  } else {
    v.declarationChecks = v.declarationChecks.filter((id) => id !== action.fieldId);
    if (action.checked) v.declarationChecks.push(action.fieldId);
  }
  Object.assign(session.snapshot.order.flags, {
    declarationReady: declarationIds.every((id) => v.declarationChecks.includes(id)),
    declarationValid: false,
    declarationInvalid: false,
  });
}
/** 柜数、币种及合同保险金额仅在引擎计算，组件不另算价格。 */
export function logisticsQuote(
  session: SliceSession,
  pack: ContentPack,
  forwarderId: string,
  insurance = session.logistics?.insurance ?? 'basic',
) {
  const config = pack.logistics!,
    order = session.snapshot.order,
    input = session.quoteInput;
  const option = config.plans.find((p) => p.forwarderId === forwarderId);
  const forwarder = pack.forwarders.find((p) => p.id === forwarderId);
  if (!option || !forwarder) throw new RangeError('未知货代');
  const product = pack.products.find((p) => p.id === order.productId)!;
  const cartons = Math.ceil(order.quantity / product.unitsPerCarton);
  const volume = new D(product.cartonCbm).mul(cartons);
  const weight = new D(product.weightKg)
    .mul(order.quantity)
    .plus(new D(param(pack, config.cartonTareKgParam)).mul(cartons));
  const freight = calculateFreight({
    quantity: order.quantity,
    totalCbm: volume.toFixed(),
    totalWeightKg: weight.toFixed(),
    usableCbm: param(pack, config.capacityCbmParam),
    usableWeightKg: param(pack, config.capacityKgParam),
    // 货代以参考航线报柜价；沿用第 3 关已选航线/自定义海运参数的比例，附加费另列。
    containerRateUsd: new D(param(pack, forwarder.priceParam))
      .mul(input.oceanTotalUsd)
      .div(param(pack, 'quote_oceanTotalUsd'))
      .toFixed(),
    surchargesUsd: param(pack, option.surchargeParam),
  });
  if (!freight.ok) throw new RangeError('柜量或运费无效');
  const oceanUsdCent = toMinorUnits(freight.value.totalUsd);
  const convert = (cents: number) => toMinorUnits(new D(cents).div(100).mul(input.fxCnyPerUsd));
  const exportFen = toMinorUnits(
    new D(input.domesticTotalCny).mul(param(pack, option.domesticRatioParam)),
  );
  const domesticFen =
    order.incoterm === 'EXW'
      ? toMinorUnits(new D(param(pack, 'factoryUnitCost')).mul(order.quantity))
      : exportFen;
  // 最低保险金额为合同额 110%；扩展保障只提高费率，不改变合同价或风险转移点。
  const factor = D.max(input.insuranceCoverageFactor, '1.1');
  const rate = new D(input.insuranceRate).plus(
    insurance === 'extended' ? param(pack, config.extendedRateParam) : 0,
  );
  const insuredUsdCent = toMinorUnits(new D(order.invoiceUsdCent!).div(100).mul(factor));
  const insuranceUsdCent = toMinorUnits(
    new D(order.invoiceUsdCent!).div(100).mul(factor).mul(rate),
  );
  const sellerOceanFen = order.incoterm === 'CIF' ? convert(oceanUsdCent) : 0;
  const sellerInsuranceFen = order.incoterm === 'CIF' ? convert(insuranceUsdCent) : 0;
  return {
    cartons,
    volume: volume.toFixed(3),
    weight: weight.toFixed(2),
    containerCount: freight.value.containerCount,
    oceanUsdCent,
    oceanFen: convert(oceanUsdCent),
    domesticFen,
    exportFen,
    sellerOceanFen,
    sellerInsuranceFen,
    insuranceUsdCent,
    insuredUsdCent,
    insuranceRate: rate.toFixed(),
    coverageFactor: factor.toFixed(),
    totalFen: domesticFen + sellerOceanFen + sellerInsuranceFen,
  };
}
export function logisticsTimeline(
  session: SliceSession,
  pack: ContentPack,
  id = session.logistics!.forwarderId!,
) {
  const v = session.logistics!,
    c = pack.logistics!,
    forwarder = pack.forwarders.find((p) => p.id === id)!;
  const option = c.plans.find((p) => p.forwarderId === id)!;
  const cutoff = v.enteredDay + forwarder.cutoffDay;
  const ready = v.readyDay ?? v.enteredDay + day(pack, c.preparationDaysParam);
  const missed = Math.max(0, Math.ceil((ready - cutoff) / day(pack, c.nextSailingDaysParam)));
  const rollover =
    v.resolution === 'wait'
      ? day(pack, c.rolloverDaysParam)
      : v.resolution === 'priority'
        ? day(pack, c.priorityDaysParam)
        : 0;
  const sailing =
    v.enteredDay + forwarder.sailingDay + missed * day(pack, c.nextSailingDaysParam) + rollover;
  const delivery =
    session.snapshot.order.incoterm === 'EXW' ? v.enteredDay + option.pickupDays : sailing;
  return {
    cutoff,
    ready,
    missed,
    sailing,
    delivery,
    arrival: sailing + forwarder.transitDays,
    overdue: Math.max(0, delivery - session.snapshot.order.deliveryDueDay!),
  };
}
export function logisticsResolution(session: SliceSession, pack: ContentPack, resolution: string) {
  const c = pack.logistics!,
    risk = session.logistics!.risk;
  let feeFen: number,
    days = 0,
    buyerExtraFen = 0;
  if (risk === 'customs' && ['standard', 'expedite'].includes(resolution)) {
    days = day(pack, resolution === 'standard' ? c.customsDaysParam : c.expeditedDaysParam);
    feeFen = fen(pack, resolution === 'standard' ? c.customsFeeParam : c.expeditedFeeParam);
  } else if (risk === 'rollover' && ['wait', 'priority'].includes(resolution)) {
    const extra = fen(pack, c.priorityOceanFeeParam);
    feeFen =
      resolution === 'wait'
        ? fen(pack, c.storageFeeParam)
        : fen(pack, c.priorityCoordinationFeeParam) +
          (session.snapshot.order.incoterm === 'CIF' ? extra : 0);
    buyerExtraFen =
      resolution === 'priority' && session.snapshot.order.incoterm === 'FOB' ? extra : 0;
  } else throw new RangeError('不适用的物流处置');
  const projected = structuredClone(session);
  projected.logistics!.resolution = resolution as NonNullable<
    SliceSession['logistics']
  >['resolution'];
  if (risk === 'customs') projected.logistics!.readyDay = session.snapshot.gameDay + days;
  const timeline = logisticsTimeline(projected, pack);
  const penaltyFen =
    Math.max(0, timeline.overdue - session.snapshot.order.overdueDaysCharged) *
    fen(pack, c.dailyPenaltyParam);
  return { feeFen, days, buyerExtraFen, timeline, penaltyFen };
}
export function logisticsRule(
  session: SliceSession,
  pack: ContentPack,
  rule: string,
  commandId: string,
  argument?: string,
): void {
  const v = active(session),
    state = session.snapshot,
    o = state.order,
    c = pack.logistics!;
  const batch: JournalEntry[] = [];
  let cash = state.player.cashCnyFen;
  const post = (description: string, postings: Posting[]) => {
    cash += postings
      .filter((p) => p.account === 'cash')
      .reduce((sum, p) => sum + (p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen), 0);
    if (cash < 0)
      throw new CashShortfall(-cash, '现金不足，未来应收和退税不能付款；可调整未订方案或暂停出运');
    batch.push({
      id: commandId + '.logistics.' + batch.length,
      commandId,
      sourceNodeId: state.story.nodeId,
      gameDay: state.gameDay,
      description,
      postings,
    });
  };
  const expense = (description: string, amount: number) => {
    if (amount) post(description, transfer('expense', 'cash', amount));
  };
  const advanceTo = (nextDay: number) => {
    const result = accrueDeadline(
      state,
      Math.max(state.gameDay, nextDay),
      fen(pack, c.dailyPenaltyParam),
      day(pack, c.dailyReputationParam),
    );
    state.gameDay = Math.max(state.gameDay, nextDay);
    expense('原合同交期新增逾期费用（教学条款）', result.penaltyFen);
    v.penaltyPaidFen += result.penaltyFen;
    state.player.reputation = Math.max(0, state.player.reputation - result.reputationLoss);
    o.overdueDaysCharged = result.totalOverdueDays;
    o.remainingDeliveryDays = result.remainingDays;
  };
  if (rule === 'logistics.plan') {
    if (v.booked || !c.plans.some((p) => p.forwarderId === argument))
      throw new RangeError('不能选择此货代');
    v.forwarderId = argument!;
    v.insurance = null;
    v.declarationChecks = [];
    v.declarationErrors = [];
    Object.assign(o.flags, {
      logisticsPlan: true,
      insuranceReady: false,
      declarationReady: false,
      declarationValid: false,
      declarationInvalid: false,
    });
  } else if (rule === 'logistics.insurance') {
    if (
      !v.forwarderId ||
      v.booked ||
      !(o.incoterm === 'CIF' ? ['basic', 'extended'] : ['buyer']).includes(argument!)
    )
      throw new RangeError('保险选择必须符合已签术语');
    v.insurance = argument as typeof v.insurance;
    o.flags.insuranceReady = true;
  } else if (rule === 'logistics.declaration') {
    if (!v.insurance || v.booked || !declarationIds.every((id) => v.declarationChecks.includes(id)))
      throw new RangeError('先逐项核对核心字段');
    const source = declarationSource(session, pack);
    v.declarationErrors = declarationIds.filter((id) => {
      const value = v.declarationDraft[id].trim();
      if (id === 'amount') return !/^\d+(\.\d{1,2})?$/.test(value) || !new D(value).eq(source[id]);
      return value !== source[id];
    });
    o.flags.declarationValid = v.declarationErrors.length === 0;
    o.flags.declarationInvalid = !o.flags.declarationValid;
  } else if (rule === 'logistics.book') {
    if (v.booked || !v.forwarderId || !v.insurance || !o.flags.declarationValid)
      throw new RangeError('申报数据与保险未核对，不能订舱/确认协同');
    const quote = logisticsQuote(session, pack, v.forwarderId);
    expense(o.incoterm === 'EXW' ? 'EXW 工厂交付准备费' : '出口段服务与港杂费', quote.domesticFen);
    expense('CIF 海运费及附加费', quote.sellerOceanFen);
    expense('CIF 保险已投保（教学保单）', quote.sellerInsuranceFen);
    v.domesticPaidFen = quote.domesticFen;
    v.oceanPaidFen = quote.sellerOceanFen;
    v.insurancePaidFen = quote.sellerInsuranceFen;
    v.booked = true;
    o.flags.logisticsBooked = true;
  } else if (rule === 'logistics.dispatch') {
    if (!v.booked || v.dispatched) throw new RangeError('应先确认方案，不能重复准备运输');
    v.risk = 'none';
    if (o.incoterm !== 'EXW') {
      advanceTo(v.enteredDay + day(pack, c.preparationDaysParam));
    }
    v.readyDay = state.gameDay;
    v.dispatched = true;
    v.riskResolved = v.risk === 'none';
    state.story.sampledParameters.logisticsRisk = v.risk;
    Object.assign(o.flags, {
      logisticsDispatched: true,
      logisticsCustoms: false,
      logisticsRollover: false,
      logisticsClear: v.risk === 'none',
      logisticsRiskResolved: v.riskResolved,
    });
  } else if (rule === 'logistics.resolve') {
    if (!v.dispatched || v.riskResolved) throw new RangeError('没有待处理的物流异常');
    const result = logisticsResolution(session, pack, argument!);
    if (v.risk === 'customs') {
      expense('依法配合查验及场站材料服务费', result.feeFen);
      advanceTo(state.gameDay + result.days);
      v.readyDay = state.gameDay;
    } else
      expense(
        argument === 'wait' ? '甩柜后的约定堆存费' : '改配舱位及出口协同费（按术语承担）',
        result.feeFen,
      );
    v.incidentPaidFen += result.feeFen;
    v.resolution = argument as typeof v.resolution;
    v.riskResolved = true;
    o.flags.logisticsRiskResolved = true;
    Object.assign(o.flags, {
      logisticsCustoms: false,
      logisticsRollover: false,
      logisticsClear: true,
    });
  } else if (rule === 'logistics.deliver') {
    if (!v.booked || !v.dispatched || !v.riskResolved || !o.flags.declarationValid)
      throw new RangeError('尚未具备交付条件');
    advanceTo(logisticsTimeline(session, pack).delivery);
    const inventory = accountBalance(state.journal, 'inventory');
    if (inventory !== session.procurement!.purchaseTotalFen)
      throw new RangeError('库存与本单采购金额不一致');
    const revenue = toMinorUnits(
      new D(o.invoiceUsdCent!).div(100).mul(session.quoteInput.fxCnyPerUsd),
    );
    // 本关确认交付、收入与成本；税款仍待第 7 关完整证据和收汇条件核验。
    post(
      '已核验交付记录：确认销售收入和库存成本（无现金到账）',
      shipmentPostings(revenue, inventory, 0, false),
    );
    const advance = 0 - accountBalance(state.journal, 'customerAdvance');
    if (advance > revenue) throw new RangeError('预收款大于合同收入');
    if (advance)
      post(
        '将已收客户定金抵减应收款，不重复确认收入',
        transfer('customerAdvance', 'receivable', advance),
      );
    o.deliveryCompletedDay = state.gameDay;
    if (o.incoterm === 'EXW') o.status = 'delivered';
    else {
      o.status = 'shipped';
      v.shipmentDay = state.gameDay;
      if (o.payment === 'OA_60')
        o.collectionDueDay = collectionDueDay(state.gameDay, day(pack, 'oaDays'));
    }
    o.flags.logisticsComplete = true;
  } else if (rule === 'logistics.hold') {
    v.held = true;
  } else throw new RangeError('未实现的物流规则');
  if (batch.length) {
    state.journal = appendJournal(state.journal, batch);
    Object.assign(state.player, projectLedger(state.journal));
  }
}
