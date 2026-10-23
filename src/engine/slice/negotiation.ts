import type { ContentPack, CashflowItem, PaymentMethod, Incoterm } from '../../domain/types';
import type { SliceSession } from './session';
import { D, toMinorUnits, assertMinor } from '../economy/decimal';
import { calculateExwQuote, invoiceTotal } from '../economy/quote';
import { rebate } from '../economy/tax';
import { collectionDueDay, forecastCashflow, splitPayment } from '../economy/cashflow';

export const negotiationParameter = (pack: ContentPack, id: string) =>
  String(pack.parameters[id]!.value);
const amount = (pack: ContentPack, id: string) => new D(negotiationParameter(pack, id));

export function beginNegotiation(session: SliceSession, pack: ContentPack): void {
  if (!session.accepted || !session.snapshot.order.quote || !session.snapshot.order.customerId)
    throw new RangeError('请先校核完整报价并确认客户');
  if (session.negotiation) return;
  session.negotiation = {
    offerId: null,
    quantity: session.quoteInput.quantity,
    discountRate: '0',
    depositRatio: negotiationParameter(pack, 'customerDeposit'),
    confirmations: [],
  };
  session.snapshot.order.status = 'negotiating';
}

function draft(session: SliceSession) {
  if (!session.negotiation || session.snapshot.order.status !== 'negotiating')
    throw new RangeError('当前不在可修改的谈判阶段');
  return session.negotiation;
}
function clearConfirmation(session: SliceSession): void {
  session.negotiation!.confirmations = [];
  session.snapshot.order.flags.contractReady = false;
}
export function applyOffer(session: SliceSession, pack: ContentPack, offerId: string): void {
  const value = draft(session),
    state = session.snapshot;
  const offer = pack.negotiation!.offers.find((o) => o.id === offerId);
  if (!offer) throw new RangeError('未知议价方案');
  const profile = pack.negotiation!.profiles.find((p) => p.customerId === state.order.customerId)!;
  const moq = pack.suppliers.find((s) => s.id === state.order.supplierId)?.moq ?? 1;
  const quantity = Math.max(
    moq,
    new D(session.quoteInput.quantity)
      .mul(amount(pack, offer.quantityRatioParam))
      .floor()
      .toNumber(),
  );
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError('议价数量越界');
  Object.assign(value, {
    offerId,
    quantity,
    discountRate: negotiationParameter(pack, offer.discountParam ?? profile.openingDiscountParam),
    depositRatio: D.max(
      negotiationParameter(pack, offer.depositRatioParam),
      String(state.order.flags.eventMinimumDepositRatio || '0'),
    ).toFixed(),
  });
  Object.assign(state.order.flags, {
    round1Done: true,
    round2Done: false,
    round3Done: false,
    requiresDeposit:
      offer.requiresDeposit || Number(state.order.flags.eventMinimumDepositRatio || '0') > 0,
    lcReviewed: false,
    lcSoftAccepted: false,
  });
  state.order.payment = null;
  state.order.incoterm = null;
  state.order.namedPlace = null;
  clearConfirmation(session);
}
export function selectPayment(session: SliceSession, payment: PaymentMethod): void {
  draft(session);
  const order = session.snapshot.order;
  if (!order.flags.round1Done) throw new RangeError('先完成价格与数量这一轮');
  if (order.flags.requiresDeposit && payment !== 'TT')
    throw new RangeError('该让价以提高定金为条件；请先重新议价');
  order.payment = payment;
  Object.assign(order.flags, {
    round2Done: true,
    round3Done: false,
    lcReviewed: false,
    lcSoftAccepted: false,
  });
  order.incoterm = null;
  order.namedPlace = null;
  clearConfirmation(session);
}
export function termPlace(session: SliceSession, pack: ContentPack, term: Incoterm): string {
  if (term === 'CIF' && session.snapshot.story.sampledParameters.destination)
    return String(session.snapshot.story.sampledParameters.destination);
  return negotiationParameter(pack, pack.negotiation!.terms.find((t) => t.id === term)!.placeParam);
}
export function selectTerms(session: SliceSession, pack: ContentPack, term: Incoterm): void {
  draft(session);
  const order = session.snapshot.order;
  if (!order.flags.round2Done || !order.payment) throw new RangeError('先完成付款保障这一轮');
  if (order.payment === 'LC_SIGHT' && !order.flags.lcReviewed)
    throw new RangeError('L/C 必须先处理软条款');
  order.incoterm = term;
  order.namedPlace = termPlace(session, pack, term);
  order.flags.round3Done = true;
  clearConfirmation(session);
}

/** 从已校核的报价生成条件报价。FOB 货值议价后，CIF 另按新数量分摊运保。 */
export function negotiationProjection(
  session: SliceSession,
  pack: ContentPack,
  paymentOverride?: PaymentMethod,
  termOverride?: Incoterm,
) {
  const value = session.negotiation;
  if (!value || !session.snapshot.order.quote) throw new RangeError('尚未进入谈判');
  const state = session.snapshot,
    input = session.quoteInput;
  const payment = paymentOverride ?? state.order.payment ?? 'TT';
  const term = termOverride ?? state.order.incoterm ?? 'FOB';
  const q = value.quantity,
    multiplier = new D(1)
      .minus(value.discountRate)
      .mul(new D(1).minus(String(state.order.flags.eventDiscountRate || '0')));
  const eligible = term !== 'EXW' && input.rebateEligible;
  const factory = amount(pack, 'factoryUnitCost').mul(q);
  const domestic = term === 'EXW' ? factory : new D(input.domesticTotalCny);
  const fob = new D(session.snapshot.order.quote!.fobUnitUsdRaw).mul(multiplier);
  let raw = fob;
  if (term === 'CIF')
    raw = fob
      .plus(new D(input.oceanTotalUsd).div(q))
      .div(new D(1).minus(new D(input.insuranceCoverageFactor).mul(input.insuranceRate)));
  if (term === 'EXW') {
    const exw = calculateExwQuote({
      taxInclusiveUnitCny: input.taxInclusiveUnitCny,
      quantity: q,
      vatRate: input.vatRate,
      rebateRate: input.rebateRate,
      rebateEligible: false,
      fxCnyPerUsd: input.fxCnyPerUsd,
      costMarkupRate: input.costMarkupRate,
      factoryDeliveryTotalCny: factory.toFixed(),
    });
    if (!exw.ok) throw new RangeError('EXW 报价参数无效');
    raw = new D(exw.value).mul(multiplier);
  }
  const unitUsd = raw.toFixed(2),
    invoiceUsdCent = invoiceTotal(unitUsd, q);
  const invoiceCnyFen = toMinorUnits(new D(invoiceUsdCent).div(100).mul(input.fxCnyPerUsd));
  const purchase = toMinorUnits(new D(input.taxInclusiveUnitCny).mul(q));
  const rebateFen = eligible ? toMinorUnits(rebate(input).mul(q)) : 0;
  const oceanFen =
    term === 'CIF' ? toMinorUnits(new D(input.oceanTotalUsd).mul(input.fxCnyPerUsd)) : 0;
  const insuranceUsdCent =
    term === 'CIF'
      ? toMinorUnits(
          new D(invoiceUsdCent)
            .div(100)
            .mul(input.insuranceCoverageFactor)
            .mul(input.insuranceRate),
        )
      : 0;
  const convert = (cents: number) => toMinorUnits(new D(cents).div(100).mul(input.fxCnyPerUsd));
  const insuranceFen = convert(insuranceUsdCent);
  const bankFen =
    payment === 'LC_SIGHT'
      ? toMinorUnits(
          amount(pack, 'lcFixedFee').plus(
            new D(invoiceCnyFen).div(100).mul(amount(pack, 'lcRate')),
          ),
        )
      : payment === 'TT'
        ? toMinorUnits(amount(pack, 'bankFee'))
        : toMinorUnits(amount(pack, 'oaFee'));
  const expenseFen = toMinorUnits(domestic) + oceanFen + insuranceFen + bankFen;
  const projectedMarginFen = invoiceCnyFen - purchase + rebateFen - expenseFen;
  assertMinor(projectedMarginFen);
  assertMinor(state.player.cumulativeProfitCnyFen + projectedMarginFen);
  const customer = splitPayment(invoiceUsdCent, payment === 'TT' ? value.depositRatio : '0');
  const supplier = splitPayment(
    purchase,
    negotiationParameter(
      pack,
      pack.suppliers.find((s) => s.id === state.order.supplierId)?.depositRatioParam ?? 'deposit',
    ),
  );
  const startDay = state.order.signedDay ?? state.gameDay;
  const deliveryDay = collectionDueDay(
    startDay,
    Number(pack.parameters.negotiationDeliveryDay!.value),
  );
  const collectionDay =
    payment === 'OA_60'
      ? collectionDueDay(deliveryDay, Number(pack.parameters.oaDays!.value))
      : deliveryDay + Number(pack.parameters.collectionLagDays!.value);
  const items: CashflowItem[] = [];
  const add = (id: string, dueDay: number, direction: 'in' | 'out', amountCnyFen: number) =>
    items.push({ id, dueDay, direction, amountCnyFen, certainty: 'forecast', sourceId: id });
  // D 无可验证付款承诺；资金预览只列出支出，不将截图或承诺当收入。
  if (!state.order.flags.customerIsFraud && payment === 'TT')
    add('customerDeposit', startDay, 'in', convert(customer.deposit));
  add('supplierDeposit', startDay + 1, 'out', supplier.deposit);
  add('supplierBalance', deliveryDay - 1, 'out', supplier.balance);
  add('domestic', deliveryDay - 1, 'out', toMinorUnits(domestic));
  if (term === 'CIF') {
    add('ocean', deliveryDay - 1, 'out', oceanFen);
    add('insurance', deliveryDay - 1, 'out', insuranceFen);
  }
  add('bank', deliveryDay - 1, 'out', bankFen);
  if (!state.order.flags.customerIsFraud) {
    add('customerBalance', collectionDay, 'in', convert(customer.balance));
    if (eligible)
      add('rebate', collectionDay + Number(pack.parameters.rebateLagDays!.value), 'in', rebateFen);
  }
  return {
    payment,
    term,
    place: termPlace(session, pack, term),
    quantity: q,
    unitUsd,
    invoiceUsdCent,
    invoiceCnyFen,
    customerDepositUsdCent: customer.deposit,
    insuranceUsdCent,
    bankFen,
    rebateFen,
    projectedMarginFen,
    projectedTotalProfitFen: state.player.cumulativeProfitCnyFen + projectedMarginFen,
    deliveryDay,
    collectionDay,
    forecast: forecastCashflow(state, items),
    eligible,
  };
}

export function confirmContractField(
  session: SliceSession,
  pack: ContentPack,
  id: string,
  checked: boolean,
): void {
  const value = draft(session);
  if (!pack.negotiation!.checklist.some((c) => c.id === id)) throw new RangeError('未知合同核对项');
  value.confirmations = value.confirmations.filter((c) => c !== id);
  if (checked) value.confirmations.push(id);
  session.snapshot.order.flags.contractReady = pack.negotiation!.checklist.every((c) =>
    value.confirmations.includes(c.id),
  );
}
export function signContract(session: SliceSession, pack: ContentPack): void {
  const value = draft(session),
    order = session.snapshot.order;
  if (
    !session.accepted ||
    !order.flags.round1Done ||
    !order.flags.round2Done ||
    !order.flags.round3Done ||
    !order.payment ||
    !order.incoterm ||
    !order.namedPlace
  )
    throw new RangeError('三轮谈判与条款尚未完成');
  if (!pack.negotiation!.checklist.every((c) => value.confirmations.includes(c.id)))
    throw new RangeError('请逐项核对合同与风险');
  if (order.payment === 'LC_SIGHT' && !order.flags.lcReviewed)
    throw new RangeError('L/C 软条款尚未处理');
  if (order.flags.customerIsFraud && !order.flags.fraudFeePaid)
    throw new RangeError('异常客户尚未完成风险处理');
  const result = negotiationProjection(session, pack);
  order.quantity = value.quantity;
  order.contractUnitUsd = result.unitUsd;
  order.invoiceUsdCent = result.invoiceUsdCent;
  order.taxEligibility = result.eligible ? 'eligible' : 'ineligible';
  order.signedDay = session.snapshot.gameDay;
  order.deliveryDueDay = collectionDueDay(
    order.signedDay,
    Number(pack.parameters.contractDeliveryDays!.value),
  );
  order.remainingDeliveryDays = Number(pack.parameters.contractDeliveryDays!.value);
  order.collectionDueDay = null;
  order.status = 'contracted';
  order.flags.procurementAvailable = Boolean(order.productId && order.supplierId);
  order.flags.agreedDepositRatio = order.payment === 'TT' ? value.depositRatio : '0';
}
