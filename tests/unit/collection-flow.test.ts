import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import {
  collectionGame,
  openDocuments,
  correctDocuments,
  acceptDocuments,
  collect,
  verifyTax,
  finishCollection,
  enterCollection,
} from '../fixtures/collection';
import { decide, enterNegotiation, toContract, sign } from '../fixtures/negotiation';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import { enterProcurement, produce, finishProcurement } from '../fixtures/procurement';
import {
  enterLogistics,
  bookLogistics,
  dispatchLogistics,
  clearLogisticsRisk,
  finishLogistics,
} from '../fixtures/logistics';
import {
  accountBalance,
  validateJournal,
  projectLedger,
  transfer,
} from '../../src/engine/economy/ledger';
import {
  beginCollection,
  collectionRule,
  documentPuzzle,
  documentSource,
} from '../../src/engine/slice/collection';
import { evaluateDocument } from '../../src/engine/puzzles/documentEvaluator';
import { buildCollectionView } from '../../src/app/collectionView';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { sliceSessionSchema } from '../../src/engine/slice/session';
import { validateContent } from '../../src/content/validation';
import { stageRoute } from '../../src/app/stageRoute';
describe('第 7 关：单据、收汇与退税', () => {
  it.each(['tt', 'lc', 'oa'].flatMap((p) => ['exw', 'fob', 'cif'].map((t) => [p, t] as const)))(
    '%s × %s 完整结算且不重复收入/交付罚款',
    (payment, term) => {
      const g = collectionGame(payment, term),
        before = structuredClone(g.session.snapshot);
      expect(g.session.collection!.receivedUsdCent).toBe(0);
      acceptDocuments(g);
      collect(g);
      finishCollection(g);
      const s = g.session.snapshot,
        v = g.session.collection!;
      expect(s.story.nodeId).toBe('L07.complete');
      expect(s.order.status).toBe('collected');
      expect(v.closed).toBe(true);
      expect(accountBalance(s.journal, 'receivable')).toBe(0);
      expect(accountBalance(s.journal, 'taxReceivable')).toBe(0);
      expect(accountBalance(s.journal, 'sales')).toBe(accountBalance(before.journal, 'sales'));
      expect(s.order.deliveryCompletedDay).toBe(before.order.deliveryCompletedDay);
      expect(s.order.remainingDeliveryDays).toBe(before.order.remainingDeliveryDays);
      expect(s.order.overdueDaysCharged).toBe(before.order.overdueDaysCharged);
      expect(v.taxEligible).toBe(term !== 'exw');
      expect(v.rebateReceivedFen > 0).toBe(term !== 'exw');
      expect(v.receivedUsdCent + g.session.procurement!.customerReceivedUsdCent).toBe(
        s.order.invoiceUsdCent,
      );
      expect(projectLedger(s.journal)).toEqual({
        cashCnyFen: s.player.cashCnyFen,
        cumulativeProfitCnyFen: s.player.cumulativeProfitCnyFen,
      });
      expect(s.story.rngState.parameters).toEqual(before.story.rngState.parameters);
      expect(s.story.rngState.documents).toEqual(before.story.rngState.documents);
      expect(s.story.eventWindows.filter((window) => window.stage === 7)).toHaveLength(1);
      validateJournal(s.journal);
      expect(sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)))).toEqual(g.session);
    },
  );
  it('真实七关交接：沿用产品、合同和账本，不重建订单', () => {
    const g = inquiryGame('collection.full');
    completeInquiries(g);
    enterNegotiation(g);
    toContract(g);
    sign(g);
    const id = g.session.snapshot.order.id;
    enterProcurement(g);
    produce(g);
    finishProcurement(g);
    enterLogistics(g);
    bookLogistics(g);
    dispatchLogistics(g);
    clearLogisticsRisk(g);
    finishLogistics(g);
    enterCollection(g);
    acceptDocuments(g);
    collect(g);
    finishCollection(g);
    expect(g.session.snapshot.order.id).toBe(id);
    expect(stageRoute(7)).toBe('/documents');
    expect(new Set(g.session.snapshot.story.decisionLog.map((d) => d.stage))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7]),
    );
  });
  it('找错反馈区分漏报、误报和改错；首轮不泄露定位提示，二轮后逐项指导', () => {
    const g = collectionGame();
    openDocuments(g);
    expect(
      buildCollectionView(g.session, pack)!
        .documents.flatMap((d) => d.fields)
        .every((f) => f.hint === ''),
    ).toBe(true);
    g.act({ type: 'markDocument', fieldId: 'invoice.product', marked: true });
    g.act({ type: 'correctDocument', fieldId: 'invoice.product', value: '错误产品' });
    g.act({ type: 'markDocument', fieldId: 'invoice.quantity', marked: true });
    g.act({ type: 'correctDocument', fieldId: 'invoice.quantity', value: 'NaN' });
    decide(g, 'documents_submit');
    expect(g.session.collection).toMatchObject({
      omissions: ['packing.weight', 'bl.cartons', 'origin.country'],
      falsePositives: ['invoice.product'],
      wrongCorrections: ['invoice.quantity'],
    });
    expect(() => g.choose('documents_accept')).toThrow('不可用');
    g.choose('documents_retry');
    g.advance();
    decide(g, 'documents_submit');
    g.choose('documents_retry');
    g.advance();
    expect(
      buildCollectionView(g.session, pack)!
        .documents.flatMap((d) => d.fields)
        .filter((f) => f.hint),
    ).toHaveLength(4);
    g.act({ type: 'markDocument', fieldId: 'invoice.product', marked: false });
    correctDocuments(g);
    expect(g.session.collection!.documentsValid).toBe(true);
  });
  it('L/C 额外收货人不符点不能用普通题答案绕过', () => {
    const g = collectionGame('lc');
    openDocuments(g);
    const source = documentSource(g.session, pack),
      puzzle = documentPuzzle(g.session, pack);
    const marks = puzzle.faults
      .filter((f) => f.fieldPath !== 'consignee')
      .map((f) => f.documentId + '.' + f.fieldPath);
    const corrections = Object.fromEntries(
      puzzle.faults.map((f) => [f.documentId + '.' + f.fieldPath, source[f.expectedFrom]!]),
    );
    expect(evaluateDocument(puzzle, marks, corrections, source)).toMatchObject({
      correct: false,
      missed: ['bl.consignee'],
    });
    corrections['bl.consignee'] = '客户仓库';
    expect(
      evaluateDocument(puzzle, [...marks, 'bl.consignee'], corrections, source).wrongCorrections,
    ).toEqual(['bl.consignee']);
  });
  it('T/T 银行核验与首次危险尝试不入账；回到催收不重复收费', () => {
    const g = collectionGame();
    acceptDocuments(g);
    const before = structuredClone(g.session.snapshot);
    decide(g, 'tt_verify');
    decide(g, 'tt_release');
    expect(g.session.snapshot.journal).toEqual(before.journal);
    expect(g.session.collection!.released).toBe(false);
    expect(g.session.snapshot.player.rescueUsed).toBe(true);
    g.choose('tt_reconsider');
    g.advance();
    decide(g, 'tt_chase');
    expect(g.session.snapshot.player.cashCnyFen - before.player.cashCnyFen).toBe(
      accountBalance(before.journal, 'receivable'),
    );
    expect(g.session.snapshot.player.cumulativeProfitCnyFen).toBe(
      before.player.cumulativeProfitCnyFen,
    );
    expect(g.session.collection!.bankFeeFen).toBe(0);
  });
  it('重复无款放单确认为坏账，不能伪造已收款或退税', () => {
    const g = collectionGame();
    acceptDocuments(g);
    decide(g, 'tt_verify');
    const before = structuredClone(g.session.snapshot);
    decide(g, 'tt_release');
    g.choose('tt_reconsider');
    g.advance();
    decide(g, 'tt_release');
    expect(g.session.collection!.badDebtFen).toBe(accountBalance(before.journal, 'receivable'));
    expect(g.session.snapshot.player.cashCnyFen).toBe(before.player.cashCnyFen);
    expect(g.session.snapshot.player.cumulativeProfitCnyFen).toBe(
      before.player.cumulativeProfitCnyFen - accountBalance(before.journal, 'receivable'),
    );
    g.choose('loss_continue');
    g.advance();
    finishCollection(g);
    expect(g.session.collection!.taxEligible).toBe(false);
    expect(g.session.snapshot.order.status).toBe('shipped');
    expect(buildCollectionView(g.session, pack)!.ending.kind).toBe('tuition');
  });
  it('L/C 交单超期须先取得银行确认；资金不足整笔回滚', () => {
    const g = collectionGame('lc');
    acceptDocuments(g);
    const late = structuredClone(g.session);
    late.snapshot.gameDay = late.logistics!.shipmentDay! + 22;
    g.restore(late);
    decide(g, 'lc_present');
    expect(g.session.collection!.bankStatus).toBe('discrepancy');
    expect(() => g.choose('lc_collect')).toThrow('不可用');
    const ready = structuredClone(g.session),
      poor = structuredClone(ready);
    poor.snapshot.journal.push({
      id: 'fee',
      commandId: 'fee',
      sourceNodeId: 'L07.lc',
      gameDay: poor.snapshot.gameDay,
      description: '已发生费用夹具',
      postings: transfer('expense', 'cash', poor.snapshot.player.cashCnyFen - 100),
    });
    Object.assign(poor.snapshot.player, projectLedger(poor.snapshot.journal));
    g.restore(poor);
    expect(() => g.choose('lc_amend')).toThrow('现金不足');
    expect(g.session).toEqual(poor);
    g.restore(ready);
    decide(g, 'lc_amend');
    decide(g, 'lc_collect');
    expect(g.session.collection!.bankFeeFen).toBe(12000);
    expect(g.session.collection!.exchangeGainFen).toBeLessThan(0);
  });
  it('OA 到期不等于到账，部分到账保留余额，核销没有现金流入', () => {
    const content = structuredClone(pack);
    content.collection!.oaScenarios = [
      content.collection!.oaScenarios.find((s) => s.id === 'oa_partial_loss')!,
    ];
    const g = collectionGame('oa', 'fob', 'cup_500_verified', 2000, content);
    acceptDocuments(g);
    const before = structuredClone(g.session.snapshot);
    decide(g, 'oa_due');
    expect(g.session.snapshot.gameDay).toBe(before.order.collectionDueDay);
    expect(g.session.snapshot.journal).toEqual(before.journal);
    decide(g, 'oa_chase');
    const partial = structuredClone(g.session.snapshot);
    expect(g.session.collection!.receivedUsdCent).toBe(408000);
    expect(g.session.collection!.outstandingUsdCent).toBe(408000);
    expect(accountBalance(partial.journal, 'receivable')).toBe(2937600);
    expect(() => g.choose('oa_writeoff')).toThrow('不可用');
    decide(g, 'oa_recover');
    const beforeWriteoff = structuredClone(g.session.snapshot);
    decide(g, 'oa_writeoff');
    expect(g.session.snapshot.player.cashCnyFen).toBe(beforeWriteoff.player.cashCnyFen);
    expect(g.session.collection!.badDebtFen).toBe(1468800);
    finishCollection(g);
    expect(g.session.collection!.rebateReceivedFen).toBe(0);
  });
  it('退税两阶段：合格核验只产生应收与利润，退库只变现金', () => {
    const g = collectionGame();
    acceptDocuments(g);
    collect(g);
    const before = structuredClone(g.session.snapshot);
    verifyTax(g);
    expect(g.session.collection!.rebateAccruedFen).toBe(446018);
    expect(g.session.snapshot.player.cashCnyFen).toBe(before.player.cashCnyFen);
    expect(
      g.session.snapshot.player.cumulativeProfitCnyFen - before.player.cumulativeProfitCnyFen,
    ).toBe(446018);
    const profit = g.session.snapshot.player.cumulativeProfitCnyFen;
    decide(g, 'tax_receive');
    expect(g.session.snapshot.player.cumulativeProfitCnyFen).toBe(profit);
    expect(g.session.snapshot.player.cashCnyFen - before.player.cashCnyFen).toBe(446018);
    expect(accountBalance(g.session.snapshot.journal, 'taxReceivable')).toBe(0);
  });
  it('不齐全供应商凭证不能通过勾选取得退税', () => {
    const g = collectionGame('tt', 'fob', 'cup_500_budget');
    acceptDocuments(g);
    collect(g);
    for (const f of pack.collection!.taxEvidence)
      g.act({ type: 'assessTax', fieldId: f.id, answer: 'verified' });
    decide(g, 'tax_verify');
    expect(g.session.collection!.taxErrors).toContain('purchase');
    expect(g.session.snapshot.order.taxEligibility).toBe('pending');
    g.choose('tax_retry');
    g.advance();
    finishCollection(g);
    expect(g.session.collection!.taxEligible).toBe(false);
    expect(accountBalance(g.session.snapshot.journal, 'taxReceivable')).toBe(0);
  });
  it('EXW 买方装船核验仅建立事实及账期，不提前确认退税或重复收入', () => {
    const g = collectionGame('oa', 'exw'),
      before = structuredClone(g.session.snapshot);
    expect(() => g.choose('documents_start')).toThrow('不可用');
    decide(g, 'buyer_shipment');
    expect(g.session.logistics!.shipmentDay).toBe(before.order.deliveryCompletedDay! + 5);
    expect(g.session.snapshot.order.collectionDueDay).toBe(g.session.logistics!.shipmentDay! + 60);
    expect(g.session.snapshot.journal).toEqual(before.journal);
    expect(g.session.snapshot.order.taxEligibility).toBe('pending');
  });
  it('未知字段、越阶段、已结清和重复命令不可重复入账', () => {
    const g = collectionGame();
    expect(() =>
      g.act({ type: 'markDocument', fieldId: 'invoice.quantity', marked: true }),
    ).toThrow('不能修改');
    openDocuments(g);
    expect(() => g.act({ type: 'markDocument', fieldId: 'unknown', marked: true })).toThrow('未知');
    correctDocuments(g);
    g.choose('documents_accept');
    g.advance();
    decide(g, 'tt_verify');
    const before = g.session;
    const command = {
      id: 'same.receive',
      revision: before.snapshot.revision,
      action: { type: 'choose' as const, choiceId: 'tt_chase' },
    };
    const next = reduceSlice(before, pack, command);
    expect(reduceSlice(next, pack, command)).toBe(next);
    expect(() => reduceSlice(next, pack, { ...command, id: 'stale' })).toThrow('过期');
    expect(() =>
      collectionRule(structuredClone(before), pack, 'collection.taxReceive', 'outofstage'),
    ).toThrow('节点');
    g.restore(next);
    g.advance();
    g.advance();
    finishCollection(g);
    expect(() => g.act({ type: 'assessTax', fieldId: 'purchase', answer: 'verified' })).toThrow(
      '不能操作',
    );
    const missing = structuredClone(g.session);
    missing.collection = null;
    missing.snapshot.order.flags.logisticsComplete = false;
    expect(() => beginCollection(missing)).toThrow('先完成');
  });
  it.each([
    (p: typeof pack) => {
      p.collection!.oaScenarios[0]!.firstRatio = '1.01';
    },
    (p: typeof pack) => {
      p.collection!.collectionFxFactor = '0';
    },
    (p: typeof pack) => {
      p.collection!.lcPuzzleId = p.collection!.puzzleId;
    },
    (p: typeof pack) => {
      p.documentTemplates[0]!.fields[0]!.sourcePath = 'unknown';
    },
    (p: typeof pack) => {
      p.collection!.taxEvidence[0]!.id = 'receipt';
    },
    (p: typeof pack) => {
      const d = p.puzzles.find((p) => p.kind === 'document')!;
      if (d.kind === 'document') d.puzzle.faults[0]!.fieldPath = 'unknown';
    },
    (p: typeof pack) => {
      p.nodes.find((n) => n.id === 'L07.payment')!.stage = 6;
    },
  ])('非法单据或收汇配置拒绝 %#', (mutate) => {
    const modified = structuredClone(pack);
    mutate(modified);
    expect(validateContent(modified).ok).toBe(false);
  });
});
