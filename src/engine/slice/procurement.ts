import { CashShortfall } from '../rules/cashShortfall';
import type { ContentPack, JournalEntry } from '../../domain/types';
import type { SliceSession } from './session';
import {
  inspectionItemIds,
  procurementStateSchema,
  type ProcurementState,
} from '../../domain/schemas/procurement';
import { D, toMinorUnits } from '../economy/decimal';
import { appendJournal, projectLedger, transfer, type Posting } from '../economy/ledger';
import { splitPayment } from '../economy/cashflow';
import { accrueDeadline } from '../economy/deadline';
import { negotiationParameter } from './negotiation';
import { businessDraw } from '../story/businessRandom';

type ItemId = (typeof inspectionItemIds)[number];
export type ProcurementAction =
  | { type: 'confirmPi'; fieldId: string; checked: boolean }
  | { type: 'checkFunding'; fieldId: string; checked: boolean }
  | { type: 'viewEvidence'; itemId: ItemId }
  | { type: 'assessInspection'; itemId: ItemId; answer: 'pass' | 'issue' };
const numberParameter = (pack: ContentPack, id: string) => Number(negotiationParameter(pack, id));
const moneyParameter = (pack: ContentPack, id: string) =>
  toMinorUnits(negotiationParameter(pack, id));
const answers = (): ProcurementState['inspectionAnswers'] => ({
  material: 'unanswered',
  quantity: 'unanswered',
  specification: 'unanswered',
  packaging: 'unanswered',
  documents: 'unanswered',
});

export function beginProcurement(session: SliceSession, pack: ContentPack): void {
  const state = session.snapshot,
    order = state.order;
  if (
    order.status !== 'contracted' ||
    !order.productId ||
    !order.supplierId ||
    order.signedDay === null
  )
    throw new RangeError('需要第 1 关的产品、供应商和第 4 关已签合同');
  if (session.procurement) return;
  const supplier = pack.suppliers.find((s) => s.id === order.supplierId)!;
  if (supplier.productId !== order.productId) throw new RangeError('供应商与产品不匹配');
  const missing = supplier.credentials.some((c) => c.status !== 'verified');
  session.procurement = procurementStateSchema.parse({
    piConfirmations: [],
    fundingChecks: [],
    fundingResult: 'NONE',
    customerReceivedUsdCent: 0,
    customerAdvanceFen: 0,
    customerRefundFen: 0,
    bankFeeFen: 0,
    purchaseTotalFen: toMinorUnits(
      new D(session.quoteInput.taxInclusiveUnitCny).mul(order.quantity),
    ),
    supplierDepositFen: 0,
    supplierBalanceFen: 0,
    supplierRefundFen: 0,
    cancellationLossFen: 0,
    // 信息缺口与实际不合格分开；生产完成后才形成本批检验记录。
    qualityIssue: false,
    qualityRoll: null,
    delayIssue: false,
    documentsMissing: missing,
    productionDone: false,
    reworked: false,
    supplemented: false,
    inspectionRevision: 0,
    viewedEvidence: [],
    inspectionAnswers: answers(),
    inspectionErrors: [],
    inspectionAccepted: false,
    lcExpiryDay: order.signedDay + numberParameter(pack, pack.procurement!.lcValidityDaysParam),
  });
  state.story.sampledParameters.inspectionDelay = session.procurement.delayIssue;
}
function active(session: SliceSession): ProcurementState {
  if (
    !session.procurement ||
    session.snapshot.story.stage !== 5 ||
    !['contracted', 'producing'].includes(session.snapshot.order.status)
  )
    throw new RangeError('当前不在可操作的备货阶段');
  return session.procurement;
}
function toggle(list: string[], id: string, checked: boolean) {
  const next = list.filter((item) => item !== id);
  if (checked) next.push(id);
  return next;
}
export function procurementAction(
  session: SliceSession,
  pack: ContentPack,
  action: ProcurementAction,
): void {
  const value = active(session),
    node = pack.nodes.find((n) => n.id === session.snapshot.story.nodeId)!;
  if (session.feedback) throw new RangeError('请先查看后果');
  if (action.type === 'confirmPi') {
    if (
      !node.tags.includes('pi_confirmation') ||
      session.snapshot.order.flags.piAccepted ||
      !pack.procurement!.piFields.some((f) => f.id === action.fieldId)
    )
      throw new RangeError('当前不能修改此 PI 确认项');
    value.piConfirmations = toggle(
      value.piConfirmations,
      action.fieldId,
      action.checked,
    ) as typeof value.piConfirmations;
    session.snapshot.order.flags.piReady = pack.procurement!.piFields.every((f) =>
      value.piConfirmations.includes(f.id),
    );
  } else if (action.type === 'checkFunding') {
    if (
      !node.tags.includes('funding_check') ||
      session.snapshot.order.flags.fundingVerified ||
      !pack.procurement!.fundingChecks.some((f) => f.id === action.fieldId)
    )
      throw new RangeError('当前不能修改资金核验项');
    value.fundingChecks = toggle(value.fundingChecks, action.fieldId, action.checked);
    session.snapshot.order.flags.fundingChecksReady = pack.procurement!.fundingChecks.every((f) =>
      value.fundingChecks.includes(f.id),
    );
  } else {
    if (
      !node.tags.includes('inspection_check') ||
      !value.productionDone ||
      !inspectionItemIds.includes(action.itemId)
    )
      throw new RangeError('当前不能核对验货证据');
    if (action.type === 'viewEvidence') {
      if (!value.viewedEvidence.includes(action.itemId)) value.viewedEvidence.push(action.itemId);
    } else {
      if (!value.viewedEvidence.includes(action.itemId)) throw new RangeError('请先阅读该项证据');
      value.inspectionAnswers[action.itemId] = action.answer;
      session.snapshot.order.flags.inspectionCorrect = false;
    }
    session.snapshot.order.flags.inspectionReady = inspectionItemIds.every(
      (id) => value.viewedEvidence.includes(id) && value.inspectionAnswers[id] !== 'unanswered',
    );
  }
}
export function inspectionExpected(value: ProcurementState, id: ItemId): 'pass' | 'issue' {
  return (
    id === 'documents'
      ? value.documentsMissing
      : ['material', 'packaging'].includes(id) && value.qualityIssue
  )
    ? 'issue'
    : 'pass';
}
export function procurementAmounts(session: SliceSession, pack: ContentPack) {
  const value = session.procurement!;
  const supplier = pack.suppliers.find((s) => s.id === session.snapshot.order.supplierId)!;
  const split = splitPayment(
    value.purchaseTotalFen,
    negotiationParameter(pack, supplier.depositRatioParam),
  );
  return {
    deposit: split.deposit,
    balance: value.purchaseTotalFen - value.supplierDepositFen - value.supplierBalanceFen,
    total: value.purchaseTotalFen,
  };
}
/** 实际核验使用已锁定合同额；不能重用签约前的资金时间轴，避免重复计入过去流水。 */
export function fundingAmounts(session: SliceSession, pack: ContentPack) {
  const order = session.snapshot.order;
  if (order.invoiceUsdCent === null || !order.payment)
    throw new RangeError('缺少已签合同金额或付款条件');
  const invoiceCnyFen = toMinorUnits(
    new D(order.invoiceUsdCent).div(100).mul(session.quoteInput.fxCnyPerUsd),
  );
  const depositUsdCent =
    order.payment === 'TT'
      ? splitPayment(order.invoiceUsdCent, String(order.flags.agreedDepositRatio)).deposit
      : 0;
  const bankFen =
    order.payment === 'LC_SIGHT'
      ? toMinorUnits(
          new D(negotiationParameter(pack, 'lcFixedFee')).plus(
            new D(invoiceCnyFen).div(100).mul(negotiationParameter(pack, 'lcRate')),
          ),
        )
      : order.payment === 'TT' && depositUsdCent > 0
        ? moneyParameter(pack, 'bankFee')
        : order.payment === 'OA_60'
          ? moneyParameter(pack, 'oaFee')
          : 0;
  return { depositUsdCent, bankFen };
}
export function cancellationAmounts(session: SliceSession, pack: ContentPack) {
  const value = session.procurement!,
    config = pack.procurement!;
  const ratio = negotiationParameter(
    pack,
    value.productionDone ? config.refundAfterProductionParam : config.refundBeforeProductionParam,
  );
  const supplierRefundFen = toMinorUnits(new D(value.supplierDepositFen).div(100).mul(ratio));
  const lossFen = value.supplierDepositFen - supplierRefundFen;
  const customerRefundFen = Math.min(
    value.customerAdvanceFen,
    session.snapshot.player.cashCnyFen + supplierRefundFen,
  );
  return {
    ratio,
    supplierRefundFen,
    lossFen,
    customerRefundFen,
    unpaidRefundFen: value.customerAdvanceFen - customerRefundFen,
  };
}
/** 每个业务事实只执行一次；所有流水作为同一 reducer 事务中的批次整体提交。 */
export function procurementRule(
  session: SliceSession,
  pack: ContentPack,
  rule: string,
  commandId: string,
  resolution?: string,
): void {
  const value = active(session),
    state = session.snapshot,
    order = state.order,
    config = pack.procurement!;
  const batch: JournalEntry[] = [];
  let available = state.player.cashCnyFen;
  const post = (
    description: string,
    postings: Posting[],
    foreignMoney?: JournalEntry['foreignMoney'],
  ) => {
    const cashDelta = postings
      .filter((p) => p.account === 'cash')
      .reduce((sum, p) => sum + (p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen), 0);
    if (available + cashDelta < 0)
      throw new CashShortfall(
        -(available + cashDelta),
        '现金不足；不能使用未来应收或退税付款，可停止采购并核对退款',
      );
    available += cashDelta;
    batch.push({
      id: commandId + '.procurement.' + batch.length,
      commandId,
      sourceNodeId: state.story.nodeId,
      gameDay: state.gameDay,
      description,
      postings,
      ...(foreignMoney ? { foreignMoney } : {}),
    });
  };
  const expense = (description: string, fen: number) => {
    if (fen) post(description, transfer('expense', 'cash', fen));
  };
  const advanceDays = (days: number) => {
    const result = accrueDeadline(state, state.gameDay + days);
    state.gameDay += days;
    order.remainingDeliveryDays = result.remainingDays;
  };
  const resetInspection = () => {
    value.inspectionRevision++;
    value.viewedEvidence = [];
    value.inspectionAnswers = answers();
    value.inspectionErrors = [];
    value.inspectionAccepted = false;
    Object.assign(order.flags, {
      inspectionReady: false,
      inspectionCorrect: false,
      inspectionNeedsFix: value.qualityIssue || value.documentsMissing,
      qualityUnresolved: value.qualityIssue,
      documentsUnresolved: value.documentsMissing,
    });
  };
  if (rule === 'procurement.acceptPi') {
    if (
      order.flags.piAccepted ||
      !config.piFields.every((f) => value.piConfirmations.includes(f.id))
    )
      throw new RangeError('PI 必须逐项确认且不能重复接受');
    order.flags.piAccepted = true;
  } else if (rule === 'procurement.verifyFunding') {
    if (
      !order.flags.piAccepted ||
      order.flags.fundingVerified ||
      !config.fundingChecks.every((f) => value.fundingChecks.includes(f.id))
    )
      throw new RangeError('先核对 PI 和资金证据，已核验事实不重复入账');
    value.fundingResult = order.flags.customerIsFraud
      ? 'IDENTITY'
      : order.payment === 'LC_SIGHT' && order.flags.lcSoftAccepted
        ? 'SOFT'
        : order.payment === 'LC_SIGHT' && state.gameDay > value.lcExpiryDay
          ? 'EXPIRED'
          : 'VERIFIED';
    if (value.fundingResult === 'VERIFIED') {
      const funds = fundingAmounts(session, pack);
      if (order.payment === 'TT' && funds.depositUsdCent > 0) {
        value.customerReceivedUsdCent = funds.depositUsdCent;
        value.customerAdvanceFen = toMinorUnits(
          new D(value.customerReceivedUsdCent).div(100).mul(session.quoteInput.fxCnyPerUsd),
        );
        post(
          '已核验模拟银行流水：客户 T/T 定金',
          transfer('cash', 'customerAdvance', value.customerAdvanceFen),
          {
            currency: 'USD',
            cents: value.customerReceivedUsdCent,
            fxCnyPerUsd: session.quoteInput.fxCnyPerUsd,
          },
        );
      }
      value.bankFeeFen = funds.bankFen;
      expense('本次收款或信用证核验的银行费用（教学参数）', value.bankFeeFen);
      order.flags.fundingVerified = true;
    }
  } else if (rule === 'procurement.repairLc') {
    if (
      !order.flags.piAccepted ||
      order.payment !== 'LC_SIGHT' ||
      !order.flags.lcSoftAccepted ||
      order.flags.fundingVerified
    )
      throw new RangeError('当前没有待处理的信用证软条款');
    expense('信用证修改准备费（教学参数）', moneyParameter(pack, 'lcAmendFee'));
    advanceDays(numberParameter(pack, config.lcRepairDaysParam));
    order.flags.lcSoftAccepted = false;
    order.flags.lcReviewed = true;
    value.fundingResult = 'NONE';
    value.fundingChecks = [];
    order.flags.fundingChecksReady = false;
  } else if (rule === 'procurement.payDeposit') {
    if (!order.flags.piAccepted || !order.flags.fundingVerified || order.flags.supplierDepositPaid)
      throw new RangeError('资金保障未核验或供应商定金已经支付');
    const amount = procurementAmounts(session, pack).deposit;
    post('供应商采购定金，暂记预付款', transfer('supplierAdvance', 'cash', amount));
    value.supplierDepositFen = amount;
    order.flags.supplierDepositPaid = true;
    order.status = 'producing';
  } else if (rule === 'procurement.produce') {
    if (!order.flags.supplierDepositPaid || value.productionDone)
      throw new RangeError('应先付供应商定金，生产不能重复推进');
    const supplier = pack.suppliers.find((s) => s.id === order.supplierId)!;
    advanceDays(Math.max(numberParameter(pack, config.productionDaysParam), supplier.leadDays));
    value.qualityRoll = businessDraw(state.story.seed, 'quality:' + order.id + ':' + supplier.id);
    value.qualityIssue = new D(value.qualityRoll).lt(supplier.qualityRisk);
    state.story.sampledParameters.inspectionQuality = value.qualityIssue;
    state.story.drawCount++;
    value.productionDone = true;
    resetInspection();
  } else if (rule === 'procurement.inspect') {
    if (
      !value.productionDone ||
      !inspectionItemIds.every(
        (id) => value.viewedEvidence.includes(id) && value.inspectionAnswers[id] !== 'unanswered',
      )
    )
      throw new RangeError('先逐项阅读证据并完成判断');
    value.inspectionErrors = inspectionItemIds.filter(
      (id) => value.inspectionAnswers[id] !== inspectionExpected(value, id),
    );
    order.flags.inspectionCorrect = value.inspectionErrors.length === 0;
    order.flags.inspectionNeedsFix = value.qualityIssue || value.documentsMissing;
  } else if (rule === 'procurement.resolve') {
    if (!order.flags.inspectionCorrect || !value.productionDone || value.inspectionAccepted)
      throw new RangeError('先正确识别本批异常再处置');
    if (resolution === 'rework' && value.qualityIssue) {
      expense('不合格材质与包装返工费（教学参数）', moneyParameter(pack, config.reworkFeeParam));
      advanceDays(numberParameter(pack, config.reworkDaysParam));
      value.qualityIssue = false;
      value.reworked = true;
    } else if (resolution === 'supplement' && value.documentsMissing) {
      expense(
        '同批次发票与合规资料补检核验费（教学参数）',
        moneyParameter(pack, config.supplementFeeParam),
      );
      advanceDays(numberParameter(pack, config.supplementDaysParam));
      value.documentsMissing = false;
      value.supplemented = true;
    } else throw new RangeError('该处置不适用或已经完成');
    // 费用本身不产生合格结果；本教学分支包含补发资料/返工报告，必须重新核对该版证据。
    resetInspection();
  } else if (rule === 'procurement.acceptInspection') {
    if (
      !order.flags.inspectionCorrect ||
      value.qualityIssue ||
      value.documentsMissing ||
      value.inspectionAccepted
    )
      throw new RangeError('必须解决异常并复验，不能仅凭勾选放行');
    value.inspectionAccepted = true;
    order.flags.inspectionAccepted = true;
  } else if (rule === 'procurement.payBalance') {
    if (
      !value.inspectionAccepted ||
      !order.flags.supplierDepositPaid ||
      order.flags.procurementComplete
    )
      throw new RangeError('未验收不能付尾款，完成后不能重复付款');
    const balance = procurementAmounts(session, pack).balance;
    post('验收采购入库并付供应商尾款，尚未对客交付', [
      ...transfer('inventory', 'supplierAdvance', value.supplierDepositFen),
      ...transfer('inventory', 'cash', balance),
    ]);
    value.supplierBalanceFen = balance;
    order.status = 'ready';
    order.flags.procurementComplete = true;
    // 补齐证据也不提前确认税款应收；实际出口、收汇与最终核验属于后续关卡。
  } else if (rule === 'procurement.cancel') {
    const cancellation = cancellationAmounts(session, pack);
    value.supplierRefundFen = cancellation.supplierRefundFen;
    value.cancellationLossFen = cancellation.lossFen;
    if (value.supplierDepositFen)
      post('模拟终止协议：退还部分供应商定金、其余确认损失', [
        ...transfer('cash', 'supplierAdvance', value.supplierRefundFen),
        ...transfer('expense', 'supplierAdvance', value.cancellationLossFen),
      ]);
    value.customerRefundFen = cancellation.customerRefundFen;
    if (value.customerRefundFen)
      post(
        '退还客户预收款；未付部分仍为负债',
        transfer('customerAdvance', 'cash', value.customerRefundFen),
      );
    order.status = 'cancelled';
  } else throw new RangeError('未实现的备货规则');
  if (batch.length) {
    state.journal = appendJournal(state.journal, batch);
    Object.assign(state.player, projectLedger(state.journal));
  }
}
