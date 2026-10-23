import { CashShortfall } from '../rules/cashShortfall';
import { evaluateDocument } from '../puzzles/documentEvaluator';
import type { ContentPack } from '../../domain/types';
import { collectionStateSchema, taxEvidenceIds } from '../../domain/schemas/collection';
import type { SliceSession } from './session';
import { declarationSource, logisticsQuote } from './logistics';
import { D, toMinorUnits } from '../economy/decimal';
import { calculateCollection } from '../economy/collection';
import { rebate } from '../economy/tax';
import { collectionDueDay } from '../economy/cashflow';
import { businessDraw } from '../story/businessRandom';
import {
  accountBalance,
  appendJournal,
  projectLedger,
  transfer,
  type Posting,
} from '../economy/ledger';
export type CollectionAction =
  | { type: 'markDocument'; fieldId: string; marked: boolean }
  | { type: 'correctDocument'; fieldId: string; value: string }
  | { type: 'assessTax'; fieldId: (typeof taxEvidenceIds)[number]; answer: 'verified' | 'missing' };
export function documentPuzzle(session: SliceSession, pack: ContentPack) {
  const id =
    session.snapshot.order.payment === 'LC_SIGHT'
      ? pack.collection!.lcPuzzleId
      : pack.collection!.puzzleId;
  const puzzle = pack.puzzles.find((p) => p.id === id);
  if (puzzle?.kind !== 'document') throw new RangeError('单据题配置缺失');
  return puzzle.puzzle;
}
export function documentSource(session: SliceSession, pack: ContentPack): Record<string, string> {
  const o = session.snapshot.order;
  const shipping = logisticsQuote(session, pack, session.logistics!.forwarderId!);
  return {
    ...declarationSource(session, pack),
    term: o.incoterm + ' ' + o.namedPlace,
    cartons: String(shipping.cartons),
    weight: shipping.weight,
    buyer: pack.customers.find((c) => c.id === o.customerId)!.name,
    seller: '启航贸易（教学企业）',
    country: '中国',
    consignee:
      o.payment === 'LC_SIGHT'
        ? 'TO ORDER OF ISSUING BANK'
        : pack.customers.find((c) => c.id === o.customerId)!.name,
    shipment: String(session.logistics!.shipmentDay ?? '尚无装船证据'),
  };
}
export function beginCollection(session: SliceSession): void {
  if (session.collection) return;
  const o = session.snapshot.order;
  if (
    !session.logistics ||
    !o.flags.logisticsComplete ||
    !['shipped', 'delivered'].includes(o.status) ||
    o.deliveryCompletedDay === null
  )
    throw new RangeError('必须先完成约定交付');
  session.collection = collectionStateSchema.parse({
    enteredDay: session.snapshot.gameDay,
    marks: [],
    corrections: {},
    attempts: 0,
    omissions: [],
    falsePositives: [],
    wrongCorrections: [],
    documentsValid: false,
    buyerShipmentVerified: false,
    bankStatus: 'unchecked',
    presented: false,
    collectionClosed: false,
    released: false,
    riskyAttempts: 0,
    oaScenarioId: null,
    oaRoll: null,
    oaFirstChecked: false,
    oaRecoveryAttempted: false,
    outstandingUsdCent: o.invoiceUsdCent! - session.procurement!.customerReceivedUsdCent,
    receivedUsdCent: 0,
    exchangeGainFen: 0,
    bankFeeFen: 0,
    badDebtFen: 0,
    taxAnswers: {},
    taxErrors: [],
    taxReviewed: false,
    taxEligible: false,
    rebateAccruedFen: 0,
    rebateReceivedFen: 0,
    closed: false,
  });
  o.taxEligibility = 'pending';
  o.flags.collectionShipmentReady = session.logistics.shipmentDay !== null;
}
function active(session: SliceSession) {
  if (
    !session.collection ||
    session.snapshot.story.stage !== 7 ||
    session.collection.closed ||
    session.feedback
  )
    throw new RangeError('当前不能操作单据与收汇');
  return session.collection;
}
export function collectionAction(
  session: SliceSession,
  pack: ContentPack,
  action: CollectionAction,
): void {
  const v = active(session),
    node = session.snapshot.story.nodeId;
  if (action.type === 'assessTax') {
    if (
      node !== 'L07.tax' ||
      v.taxReviewed ||
      !taxEvidenceIds.includes(action.fieldId) ||
      !['verified', 'missing'].includes(action.answer)
    )
      throw new RangeError('当前不能修改退税判断');
    v.taxAnswers[action.fieldId] = action.answer;
    return;
  }
  if (node !== 'L07.documents' || v.documentsValid) throw new RangeError('当前不能修改单据');
  const puzzle = documentPuzzle(session, pack);
  const known = pack.documentTemplates
    .filter((t) => puzzle.templateIds.includes(t.id))
    .flatMap((t) => t.fields.map((f) => t.id + '.' + f.id));
  if (!known.includes(action.fieldId)) throw new RangeError('未知单据字段');
  if (action.type === 'markDocument') {
    v.marks = v.marks.filter((id) => id !== action.fieldId);
    if (action.marked) v.marks.push(action.fieldId);
    else delete v.corrections[action.fieldId];
  } else {
    if (action.value.length > 200 || !v.marks.includes(action.fieldId))
      throw new RangeError('先标记需要修改的字段');
    v.corrections[action.fieldId] = action.value;
  }
}
export function taxEvidence(
  session: SliceSession,
  pack: ContentPack,
): Record<(typeof taxEvidenceIds)[number], boolean> {
  const supplier = pack.suppliers.find((s) => s.id === session.snapshot.order.supplierId);
  return {
    purchase:
      !!supplier &&
      supplier.credentials.every((c) => c.status === 'verified') &&
      !session.procurement!.documentsMissing,
    export: session.snapshot.order.incoterm !== 'EXW' && session.logistics!.shipmentDay !== null,
    receipt: session.collection!.collectionClosed && session.collection!.badDebtFen === 0,
    consistency: session.collection!.documentsValid,
  };
}
const ruleNodes: Record<string, string> = {
  buyerShipment: 'L07.source',
  documents: 'L07.documents',
  ttVerify: 'L07.payment',
  ttChase: 'L07.tt',
  riskyRelease: 'L07.tt',
  lcPresent: 'L07.payment',
  lcAmend: 'L07.lc',
  lcCollect: 'L07.lc',
  oaDue: 'L07.payment',
  oaChase: 'L07.oa',
  oaRecover: 'L07.balance',
  oaWriteoff: 'L07.balance',
  taxVerify: 'L07.tax',
  taxReceive: 'L07.tax.gate',
  finish: 'L07.tax.gate',
};
export const collectionRules = Object.keys(ruleNodes).map((id) => 'collection.' + id);
export function collectionRule(
  session: SliceSession,
  pack: ContentPack,
  rule: string,
  commandId: string,
): void {
  const v = active(session),
    state = session.snapshot,
    o = state.order,
    c = pack.collection!;
  const action = rule.replace('collection.', '');
  if (ruleNodes[action] !== state.story.nodeId)
    throw new RangeError('单据收汇规则与当前节点不匹配');
  const postings: Posting[] = [];
  let description = '',
    foreign: { currency: 'USD'; cents: number; fxCnyPerUsd: string } | undefined;
  const advance = (days: number) => {
    state.gameDay += days;
  }; // 已完成交付，收汇等待不重新累计交付逾期。
  const expense = (amount: number) => {
    if (state.player.cashCnyFen < amount)
      throw new CashShortfall(amount - state.player.cashCnyFen, '现金不足，无法支付新增费用');
    postings.push(...transfer('expense', 'cash', amount));
  };
  const requirePayment = (payment: string) => {
    if (o.payment !== payment || !v.documentsValid || v.collectionClosed)
      throw new RangeError('付款方式或单据状态不符合收汇条件');
  };
  const receive = (cents: number, fee: number, factor: string) => {
    if (cents <= 0 || cents > v.outstandingUsdCent) throw new RangeError('到账金额超出剩余应收');
    const outstandingBook = accountBalance(state.journal, 'receivable');
    const book =
      cents === v.outstandingUsdCent
        ? outstandingBook
        : new D(outstandingBook).mul(cents).div(v.outstandingUsdCent).toDecimalPlaces(0).toNumber();
    const rate = new D(session.quoteInput.fxCnyPerUsd)
      .mul(factor)
      .mul(String(o.flags.eventCollectionFxFactor || '1'))
      .toFixed();
    const result = calculateCollection(cents, rate, book, fee);
    if (state.player.cashCnyFen + result.cashFen < 0)
      throw new CashShortfall(-(state.player.cashCnyFen + result.cashFen), '到账不足支付银行费用');
    postings.push(...result.postings);
    foreign = { currency: 'USD', cents, fxCnyPerUsd: rate };
    v.outstandingUsdCent -= cents;
    v.receivedUsdCent += cents;
    v.exchangeGainFen += result.exchangeGainFen;
    v.bankFeeFen += fee;
    v.bankStatus = v.outstandingUsdCent === 0 ? 'settled' : 'partial';
    if (!v.outstandingUsdCent) {
      v.collectionClosed = true;
      v.released = true;
      o.status = 'collected';
    }
  };
  const writeoff = () => {
    const amount = accountBalance(state.journal, 'receivable');
    if (amount <= 0 || v.collectionClosed) throw new RangeError('没有可核销的应收');
    postings.push(...transfer('expense', 'receivable', amount));
    v.badDebtFen += amount;
    v.outstandingUsdCent = 0;
    v.bankStatus = 'loss';
    v.collectionClosed = true;
  };
  if (action === 'buyerShipment') {
    if (o.incoterm !== 'EXW' || session.logistics!.shipmentDay !== null)
      throw new RangeError('无需重复核验买方装船');
    session.logistics!.shipmentDay = o.deliveryCompletedDay! + c.buyerShipmentDays;
    state.gameDay = Math.max(state.gameDay, session.logistics!.shipmentDay);
    o.collectionDueDay =
      o.payment === 'OA_60'
        ? collectionDueDay(session.logistics!.shipmentDay, Number(pack.parameters.oaDays!.value))
        : null;
    o.status = 'shipped';
    v.buyerShipmentVerified = true;
    o.flags.collectionShipmentReady = true;
  } else if (action === 'documents') {
    if (!o.flags.collectionShipmentReady || v.documentsValid)
      throw new RangeError('先核验装船来源，不能重复提交已通过单据');
    const puzzle = documentPuzzle(session, pack),
      source = documentSource(session, pack);
    const result = evaluateDocument(puzzle, v.marks, v.corrections, source);
    v.omissions = result.missed;
    v.falsePositives = result.falsePositive;
    v.wrongCorrections = result.wrongCorrections;
    v.attempts++;
    v.documentsValid =
      !v.omissions.length && !v.falsePositives.length && !v.wrongCorrections.length;
    o.flags.collectionDocsValid = v.documentsValid;
  } else if (action === 'ttVerify') {
    requirePayment('TT');
    if (v.bankStatus !== 'unchecked') throw new RangeError('已核验过银行记录');
    v.bankStatus = 'pending';
  } else if (action === 'ttChase') {
    requirePayment('TT');
    if (v.bankStatus !== 'pending') throw new RangeError('先核验收款银行');
    advance(c.ttDays);
    receive(v.outstandingUsdCent, 0, '1');
    description = 'T/T 尾款实际到账，冲减应收';
  } else if (action === 'riskyRelease') {
    requirePayment('TT');
    if (v.bankStatus !== 'pending') throw new RangeError('先核验收款记录');
    v.riskyAttempts++;
    state.player.criticalMistakeCount++;
    if (v.riskyAttempts === 1) state.player.rescueUsed = true;
    else {
      writeoff();
      v.released = true;
      state.player.reputation = Math.max(0, state.player.reputation - 15);
      description = '重复按无效截图放单，剩余尾款确认为坏账';
    }
  } else if (action === 'lcPresent') {
    requirePayment('LC_SIGHT');
    if (v.presented) throw new RangeError('不能重复交单');
    v.presented = true;
    v.bankStatus =
      state.gameDay > session.logistics!.shipmentDay! + c.presentationDays
        ? 'discrepancy'
        : 'ready';
    advance(c.lcDays);
  } else if (action === 'lcAmend') {
    requirePayment('LC_SIGHT');
    if (v.bankStatus !== 'discrepancy') throw new RangeError('当前没有待处理信用证不符点');
    expense(c.amendmentFeeFen);
    advance(c.amendmentDays);
    v.bankStatus = 'ready';
    description = '取得银行确认展期并支付改单费';
  } else if (action === 'lcCollect') {
    requirePayment('LC_SIGHT');
    if (!v.presented || v.bankStatus !== 'ready') throw new RangeError('银行尚未确认可结算');
    receive(v.outstandingUsdCent, c.lcBankFeeFen, c.collectionFxFactor);
    description = '信用证银行实际结算，记录汇差与新增手续费';
  } else if (action === 'oaDue') {
    requirePayment('OA_60');
    if (v.bankStatus !== 'unchecked' || o.collectionDueDay === null)
      throw new RangeError('缺少实际装船账期或已办理到期核验');
    state.gameDay = Math.max(state.gameDay, o.collectionDueDay);
    // 只在实际到期核验事务中锁定情境，不因查看、刷新或重放而重抽。
    v.oaRoll = businessDraw(state.story.seed, 'oa:' + o.id + ':' + o.customerId);
    const total = c.oaScenarios.reduce((sum, s) => sum + s.weight, 0);
    let remaining = v.oaRoll * total;
    const scenario = c.oaScenarios.find((s) => {
      remaining -= s.weight;
      return remaining < 0;
    })!;
    v.oaScenarioId = scenario.id;
    state.story.drawCount++;
    v.bankStatus = 'pending';
  } else if (action === 'oaChase') {
    requirePayment('OA_60');
    if (
      v.bankStatus !== 'pending' ||
      v.oaFirstChecked ||
      o.collectionDueDay === null ||
      state.gameDay < o.collectionDueDay
    )
      throw new RangeError('尚未到催收阶段');
    const scenario = c.oaScenarios.find((s) => s.id === v.oaScenarioId);
    if (!scenario) throw new RangeError('缺少已锁定 OA 情境');
    advance(scenario.firstDays);
    const cents = new D(v.outstandingUsdCent)
      .mul(scenario.firstRatio)
      .toDecimalPlaces(0)
      .toNumber();
    if (cents) receive(cents, c.oaBankFeeFen, c.collectionFxFactor);
    v.oaFirstChecked = true;
    description = 'OA 首次银行核验实际到账，冲减对应应收';
  } else if (action === 'oaRecover' || action === 'oaWriteoff') {
    requirePayment('OA_60');
    if (!v.oaFirstChecked || !['pending', 'partial'].includes(v.bankStatus))
      throw new RangeError('没有核验后的待处理余额');
    const scenario = c.oaScenarios.find((s) => s.id === v.oaScenarioId);
    if (!scenario) throw new RangeError('缺少已锁定 OA 情境');
    if (action === 'oaRecover') {
      if (v.oaRecoveryAttempted) throw new RangeError('本次后续调查已完成，不能重复生成回款');
      advance(scenario.recoveryDays);
      const cents = new D(v.outstandingUsdCent)
        .mul(scenario.recoveryRatio)
        .toDecimalPlaces(0)
        .toNumber();
      if (cents) receive(cents, v.receivedUsdCent === 0 ? c.oaBankFeeFen : 0, c.collectionFxFactor);
      v.oaRecoveryAttempted = true;
      description = 'OA 后续银行核验实际到账，未收部分继续保留应收';
    } else {
      if (!v.oaRecoveryAttempted || !scenario.lossEvidence.trim())
        throw new RangeError('须取得无可回收来源的核验材料，不能按催收次数核销');
      writeoff();
      description = 'OA 经核验损失材料并确认后核销剩余应收，无现金流入';
    }
  } else if (action === 'taxVerify') {
    if (!v.collectionClosed || v.taxReviewed)
      throw new RangeError('先完成收汇处置，退税核验不可重复');
    const evidence = taxEvidence(session, pack);
    v.taxErrors = taxEvidenceIds.filter(
      (id) => v.taxAnswers[id] !== (evidence[id] ? 'verified' : 'missing'),
    );
    if (!v.taxErrors.length) {
      v.taxReviewed = true;
      v.taxEligible = Object.values(evidence).every(Boolean);
      o.taxEligibility = v.taxEligible ? 'eligible' : 'ineligible';
      if (v.taxEligible) {
        v.rebateAccruedFen = toMinorUnits(
          rebate({ ...session.quoteInput, rebateEligible: true }).mul(o.quantity),
        );
        postings.push(...transfer('taxReceivable', 'expense', v.rebateAccruedFen));
        description = '退税材料核验合格，确认应收退税（尚未到账）';
      }
    }
  } else if (action === 'taxReceive') {
    if (!v.taxReviewed || !v.taxEligible || v.rebateReceivedFen)
      throw new RangeError('未确认合格退税，或已办理退库');
    advance(c.rebateDays);
    v.rebateReceivedFen = v.rebateAccruedFen;
    postings.push(...transfer('cash', 'taxReceivable', v.rebateReceivedFen));
    description = '实际退库到账，冲减应收退税，不重复确认利润';
    v.closed = true;
  } else if (action === 'finish') {
    if (!v.taxReviewed || v.taxEligible || !v.collectionClosed)
      throw new RangeError('退税核验和收汇处置尚未完成');
    v.closed = true;
  } else throw new RangeError('未知收汇规则');
  Object.assign(o.flags, {
    collectionMoneyClosed: v.collectionClosed,
    collectionLcDiscrepancy: v.bankStatus === 'discrepancy',
    collectionBankReady: v.bankStatus === 'ready',
    collectionTaxReviewed: v.taxReviewed,
    collectionTaxEligible: v.taxEligible,
    oaFirstChecked: v.oaFirstChecked,
    oaRecoveryAttempted: v.oaRecoveryAttempted,
    oaLossSupported:
      v.oaRecoveryAttempted &&
      Boolean(c.oaScenarios.find((s) => s.id === v.oaScenarioId)?.lossEvidence.trim()),
  });
  if (postings.length) {
    state.journal = appendJournal(state.journal, [
      {
        id: commandId + '.collection',
        commandId,
        sourceNodeId: state.story.nodeId,
        gameDay: state.gameDay,
        description,
        postings,
        ...(foreign ? { foreignMoney: foreign } : {}),
      },
    ]);
    Object.assign(state.player, projectLedger(state.journal));
  }
}
