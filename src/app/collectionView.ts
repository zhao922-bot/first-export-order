import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import { documentPuzzle, documentSource, taxEvidence } from '../engine/slice/collection';
import { accountBalance } from '../engine/economy/ledger';
import { rankDecisions } from '../engine/economy/score';
import { logisticsQuote } from '../engine/slice/logistics';
import { teachingText } from '../content/teachingText';
const money = (fen: number, currency = 'CNY') =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(fen / 100);
export function buildCollectionView(session: SliceSession, pack: ContentPack) {
  if (!session.collection || session.snapshot.story.stage !== 7) return null;
  const v = session.collection,
    state = session.snapshot,
    o = state.order,
    c = pack.collection!;
  const source = documentSource(session, pack),
    puzzle = documentPuzzle(session, pack);
  const title = (key: string) => {
    const [doc, field] = key.split('.'),
      t = pack.documentTemplates.find((t) => t.id === doc);
    return t?.title + ' / ' + t?.fields.find((f) => f.id === field)?.label;
  };
  const guidance = v.attempts >= puzzle.maxAttemptsBeforeGuidance;
  const actual = taxEvidence(session, pack);
  const insurance =
    o.incoterm === 'CIF' ? logisticsQuote(session, pack, session.logistics!.forwarderId!) : null;
  const kind = session.ending?.result.kind;
  const oa = c.oaScenarios.find((s) => s.id === v.oaScenarioId);
  const replay = rankDecisions(
    state.story.decisionLog,
    Math.max(1, -accountBalance(state.journal, 'capital')),
    Math.max(1, o.deliveryDueDay! - o.signedDay!),
  );
  return {
    documents: pack.documentTemplates
      .filter((t) => puzzle.templateIds.includes(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        fields: t.fields.map((f) => {
          const key = t.id + '.' + f.id,
            fault = puzzle.faults.find((x) => x.documentId === t.id && x.fieldPath === f.id);
          return {
            key,
            label: f.label,
            value: String(fault?.mutation ?? source[f.sourcePath]),
            marked: v.marks.includes(key),
            correction: v.corrections[key] ?? '',
            hint:
              guidance && fault
                ? fault.explanation + ' 核验源值：' + source[fault.expectedFrom]
                : '',
          };
        }),
      })),
    sources: pack.documentTemplates
      .flatMap((t) => t.fields)
      .filter((f, i, all) => all.findIndex((x) => x.sourcePath === f.sourcePath) === i)
      .map((f) => ({ id: f.sourcePath, label: f.label, value: source[f.sourcePath] })),
    attempt: v.attempts,
    valid: v.documentsValid,
    guidance,
    omissions: v.omissions.map(title),
    falsePositives: v.falsePositives.map(title),
    wrongCorrections: v.wrongCorrections.map(title),
    payment: o.payment!,
    insurance: insurance
      ? `CIF 保险金额 ${money(insurance.insuredUsdCent, 'USD')}，已付保费 ${money(session.logistics!.insurancePaidFen)}。${teachingText(pack.logistics!.insuranceCopy[session.logistics!.insurance === 'extended' ? 'extended' : 'basic'], pack)}`
      : '',
    message: c.messages[o.payment!],
    lcTerms: `交单期限：装船后 ${c.presentationDays} 天；新增结算手续费 ${money(c.lcBankFeeFen)}；本场景结算汇率为报价汇率 × ${c.collectionFxFactor}。`,
    oaTerms: `回款比例和等待时间以本案核验记录为准；首笔实际到账时计收银行费 ${money(c.oaBankFeeFen)}。未到账不扣收款手续费。`,
    oaEvidence: !v.oaFirstChecked
      ? '尚无首次到期核验结果。'
      : v.oaRecoveryAttempted
        ? oa!.recoveryEvidence + ' ' + oa!.lossEvidence
        : oa!.firstEvidence,
    taxMessage: c.messages.tax,
    exwMessage: o.incoterm === 'EXW' ? c.messages.exw : '',
    shipment: session.logistics!.shipmentDay,
    due: o.collectionDueDay,
    bankStatus: {
      unchecked: '尚未向银行核验',
      pending: '未到账，待催收',
      discrepancy: '信用证交单超期，待银行确认修改',
      ready: '银行确认可以结算',
      partial: '部分到账，余额未结清',
      settled: '全部款项实际到账',
      loss: '应收已止损核销，存在坏账',
    }[v.bankStatus],
    received: money(v.receivedUsdCent, 'USD'),
    outstanding: money(v.outstandingUsdCent, 'USD'),
    receivable: money(accountBalance(state.journal, 'receivable')),
    gain: money(v.exchangeGainFen),
    fee: money(v.bankFeeFen),
    badDebt: money(v.badDebtFen),
    rebateAccrued: money(v.rebateAccruedFen),
    rebateReceived: money(v.rebateReceivedFen),
    taxReceivable: money(accountBalance(state.journal, 'taxReceivable')),
    taxFields: c.taxEvidence.map((f) => ({
      ...f,
      source: actual[f.id] ? '本批记录齐备' : '本批记录缺失或不满足',
      answer: v.taxAnswers[f.id] ?? '',
      error: v.taxErrors.includes(f.id),
    })),
    taxReviewed: v.taxReviewed,
    taxEligible: v.taxEligible,
    closed: v.closed,
    ending: pack.endings.find((e) => e.kind === kind) ?? {
      id: 'pending',
      kind: null,
      title: '等待正式结算',
      text: '请先完成收汇与退税核验。',
    },
    cash: money(state.player.cashCnyFen),
    profit: money(state.player.cumulativeProfitCnyFen),
    replay: replay
      .map((id) => state.story.decisionLog.find((d) => d.id === id)!)
      .map((d) => ({
        id: d.id,
        stage: d.stage,
        text: d.consequenceText,
        profit: money(d.deltas.profitCnyFen),
        cash: money(d.deltas.cashCnyFen),
      })),
    unsettled: (
      [
        'inventory',
        'supplierAdvance',
        'customerAdvance',
        'receivable',
        'payable',
        'taxReceivable',
      ] as const
    )
      .filter((id) => accountBalance(state.journal, id) !== 0)
      .map((id) => ({ id, amount: money(accountBalance(state.journal, id)) })),
    journal: state.journal
      .filter((e) => e.sourceNodeId.startsWith('L07.'))
      .map((e) => ({ id: e.id, day: e.gameDay, text: e.description })),
  };
}
export type CollectionView = NonNullable<ReturnType<typeof buildCollectionView>>;
