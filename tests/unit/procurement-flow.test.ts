import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import {
  procurementGame,
  acceptPi,
  checkFunding,
  verifyFunding,
  produce,
  assess,
  clearInspection,
  finishProcurement,
  enterProcurement,
} from '../fixtures/procurement';
import {
  decide,
  enterNegotiation,
  toContract,
  sign,
  negotiationGame,
} from '../fixtures/negotiation';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import { procurementRule, beginProcurement } from '../../src/engine/slice/procurement';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { sliceSessionSchema } from '../../src/engine/slice/session';
import { accountBalance, validateJournal } from '../../src/engine/economy/ledger';
import { validateContent } from '../../src/content/validation';
import { buildProcurementView } from '../../src/app/procurementView';

describe('第 5 关 PI、资金核验、备货验货', () => {
  it.each(['tt', 'lc', 'oa'].flatMap((p) => ['exw', 'fob', 'cif'].map((t) => [p, t] as const)))(
    '%s × %s 可备货入库，交付和收汇没有提前发生',
    (payment, term) => {
      const game = procurementGame('cup_500_verified', payment, term);
      const signed = game.session.snapshot.order.signedDay,
        due = game.session.snapshot.order.deliveryDueDay;
      produce(game);
      finishProcurement(game);
      const state = game.session.snapshot,
        value = game.session.procurement!;
      expect(state.story.nodeId).toBe('L05.complete');
      expect(state.order).toMatchObject({
        status: 'ready',
        signedDay: signed,
        deliveryDueDay: due,
        deliveryCompletedDay: null,
        collectionDueDay: null,
      });
      expect(state.order.remainingDeliveryDays).toBe(due! - state.gameDay);
      expect(accountBalance(state.journal, 'supplierAdvance')).toBe(0);
      expect(accountBalance(state.journal, 'inventory')).toBe(5600000);
      expect(accountBalance(state.journal, 'sales')).toBe(0);
      expect(accountBalance(state.journal, 'taxReceivable')).toBe(0);
      expect(accountBalance(state.journal, 'receivable')).toBe(0);
      expect(accountBalance(state.journal, 'customerAdvance')).toBe(0 - value.customerAdvanceFen);
      expect(value.supplierDepositFen + value.supplierBalanceFen).toBe(5600000);
      expect(value.customerReceivedUsdCent > 0).toBe(payment === 'tt');
      expect(state.scheduled).toEqual([]);
      validateJournal(state.journal);
    },
  );
  it('第 1→2→3→4→5 整体交接复用已签记录、客户与供应商', () => {
    const game = inquiryGame('procurement.full');
    completeInquiries(game);
    enterNegotiation(game);
    toContract(game);
    sign(game);
    const before = structuredClone(game.session.snapshot);
    enterProcurement(game);
    produce(game);
    finishProcurement(game);
    expect(game.session.snapshot.order).toMatchObject({
      productId: before.order.productId,
      supplierId: before.order.supplierId,
      customerId: before.order.customerId,
      signedDay: before.order.signedDay,
      deliveryDueDay: before.order.deliveryDueDay,
      invoiceUsdCent: before.order.invoiceUsdCent,
    });
    expect(
      game.session.snapshot.story.decisionLog.slice(0, before.story.decisionLog.length),
    ).toEqual(before.story.decisionLog);
    expect(game.session.snapshot.story.stage).toBe(5);
  });
  it('黄金 T/T：客户预收、供应商预付和库存分别入账，采购不计销售费用', () => {
    const game = procurementGame();
    acceptPi(game);
    verifyFunding(game);
    expect(game.session.procurement!.customerReceivedUsdCent).toBe(244800);
    expect(game.session.snapshot.player).toMatchObject({
      cashCnyFen: 11732560,
      cumulativeProfitCnyFen: -30000,
    });
    expect(accountBalance(game.session.snapshot.journal, 'customerAdvance')).toBe(-1762560);
    decide(game, 'supplier_deposit');
    expect(game.session.snapshot.player.cashCnyFen).toBe(10052560);
    expect(accountBalance(game.session.snapshot.journal, 'supplierAdvance')).toBe(1680000);
    expect(game.session.snapshot.player.cumulativeProfitCnyFen).toBe(-30000);
    game.choose('production_wait');
    game.advance();
    expect(game.session.procurement!.qualityIssue).toBe(false);
    finishProcurement(game);
    expect(game.session.snapshot.player).toMatchObject({
      cashCnyFen: 6132560,
      cumulativeProfitCnyFen: -30000,
    });
    expect(game.session.procurement!.supplierBalanceFen).toBe(3920000);
    expect(buildProcurementView(game.session, pack)!.amounts.balance).toBe(0);
  });
  it('L/C 与 OA 不收预付款；仅 L/C 按合同实际金额确认银行费', () => {
    const lc = procurementGame('cup_500_verified', 'lc');
    acceptPi(lc);
    verifyFunding(lc);
    expect(lc.session.procurement).toMatchObject({ customerAdvanceFen: 0, bankFeeFen: 103501 });
    expect(lc.session.snapshot.player.cashCnyFen).toBe(9876499); // L04 改单 200 元 + 本次银行费 1035.01 元
    const oa = procurementGame('cup_500_verified', 'oa');
    acceptPi(oa);
    verifyFunding(oa);
    expect(oa.session.procurement).toMatchObject({ customerAdvanceFen: 0, bankFeeFen: 0 });
    expect(oa.session.snapshot.player.cashCnyFen).toBe(10000000);
    expect(oa.session.snapshot.order.collectionDueDay).toBeNull();
  });
  it('供应商不收整额定金时，从总额减已付防止尾款舍入丢分', () => {
    const game = procurementGame('cup_500_verified', 'tt', 'fob', 2001);
    produce(game);
    finishProcurement(game);
    const p = game.session.procurement!;
    expect(p.supplierDepositFen).toBe(1680840);
    expect(p.supplierBalanceFen).toBe(3921960);
    expect(p.supplierDepositFen + p.supplierBalanceFen).toBe(5602800);
  });
  it('PI 七项门槛、取消勾选与刷新保存；不允许重签或提前付供应商', () => {
    const game = procurementGame();
    expect(() => game.choose('pi_accept')).toThrow('不可用');
    expect(() => procurementRule(game.session, pack, 'procurement.payDeposit', 'early')).toThrow(
      '未核验',
    );
    for (const f of pack.procurement!.piFields)
      game.act({ type: 'confirmPi', fieldId: f.id, checked: true });
    game.act({ type: 'confirmPi', fieldId: 'amount', checked: false });
    expect(() => game.choose('pi_accept')).toThrow('不可用');
    game.act({ type: 'confirmPi', fieldId: 'amount', checked: true });
    game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(game.session)) as unknown));
    expect(game.session.procurement!.piConfirmations).toHaveLength(7);
    const before = game.session.snapshot.order.signedDay;
    decide(game, 'pi_accept');
    expect(game.session.snapshot.order.signedDay).toBe(before);
    expect(() => game.act({ type: 'confirmPi', fieldId: 'amount', checked: false })).toThrow(
      '不能修改',
    );
    expect(() => game.choose('funding_verify')).toThrow('不可用');
  });
  it('截图误判不产生资金事实，复盘后可以重新核验', () => {
    const game = procurementGame();
    acceptPi(game);
    const before = structuredClone(game.session.snapshot);
    decide(game, 'funding_screenshot');
    expect(game.session.snapshot.journal).toEqual(before.journal);
    expect(game.session.snapshot.order.flags.fundingVerified).toBe(false);
    verifyFunding(game);
    expect(game.session.procurement!.fundingResult).toBe('VERIFIED');
  });
  it('L04 接受的软条款在 L05 阻止付款，修改后重新核对才能开工', () => {
    const game = procurementGame(
      'cup_500_verified',
      'lc',
      'cif',
      2000,
      'customer_c',
      'lc.soft',
      'accept',
    );
    acceptPi(game);
    verifyFunding(game);
    expect(game.session.procurement!.fundingResult).toBe('SOFT');
    expect(() => game.choose('supplier_deposit')).toThrow('不可用');
    game.choose('funding_return');
    game.advance();
    decide(game, 'funding_lc_repair');
    expect(game.session.procurement!.fundingChecks).toEqual([]);
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(() => game.choose('funding_verify')).toThrow('不可用');
    verifyFunding(game);
    decide(game, 'supplier_deposit');
    expect(game.session.snapshot.order.status).toBe('producing');
  });
  it('过期 L/C 或 D 的伪造材料不能产生预收款、采购付款或免费通过', () => {
    const expired = procurementGame('cup_500_verified', 'lc');
    acceptPi(expired);
    expired.session.snapshot.gameDay = expired.session.procurement!.lcExpiryDay + 1;
    verifyFunding(expired);
    expect(expired.session.procurement!.fundingResult).toBe('EXPIRED');
    expect(() => expired.choose('supplier_deposit')).toThrow('不可用');
    const fraud = procurementGame('cup_500_verified', 'tt', 'fob', 2000, 'customer_d');
    acceptPi(fraud);
    const before = structuredClone(fraud.session.snapshot.journal);
    verifyFunding(fraud);
    expect(fraud.session.procurement!.fundingResult).toBe('IDENTITY');
    expect(fraud.session.snapshot.journal).toEqual(before);
    expect(() => fraud.choose('supplier_deposit')).toThrow('不可用');
    decide(fraud, 'procurement_cancel');
    expect(fraud.session.snapshot.player).toMatchObject({
      cashCnyFen: 9800000,
      cumulativeProfitCnyFen: -200000,
    });
  });
  it('供应商定金不足时原子回滚，已发生的客户核验不被撤销', () => {
    const game = procurementGame('cup_500_verified', 'oa', 'fob', 100000);
    acceptPi(game);
    verifyFunding(game);
    const before = structuredClone(game.session);
    expect(() => game.choose('supplier_deposit')).toThrow('现金不足');
    expect(game.session).toEqual(before);
    decide(game, 'procurement_cancel');
    expect(game.session.snapshot.player.cashCnyFen).toBe(10000000);
  });
  it('客户实际到账之后，后续尾款不足不能抹去已收款；可终止并按事实退款', () => {
    const game = procurementGame('cup_500_verified', 'tt', 'fob', 10000);
    produce(game);
    clearInspection(game);
    const before = structuredClone(game.session);
    expect(() => game.choose('supplier_balance')).toThrow('现金不足');
    expect(game.session).toEqual(before);
    decide(game, 'procurement_cancel');
    expect(game.session.procurement).toMatchObject({
      customerAdvanceFen: 8812800,
      supplierRefundFen: 3360000,
      cancellationLossFen: 5040000,
      customerRefundFen: 8812800,
    });
    expect(game.session.snapshot.player).toMatchObject({
      cashCnyFen: 4930000,
      cumulativeProfitCnyFen: -5070000,
    });
    expect(accountBalance(game.session.snapshot.journal, 'supplierAdvance')).toBe(0);
    expect(accountBalance(game.session.snapshot.journal, 'customerAdvance')).toBe(0);
  });
  it('终止现金不足退款时保留客户负债，不能靠取消产生免费退款或负现金', () => {
    const game = procurementGame('cup_500_verified', 'tt', 'fob', 100000);
    produce(game);
    decide(game, 'procurement_cancel');
    expect(game.session.snapshot.player.cashCnyFen).toBe(0);
    expect(game.session.procurement).toMatchObject({
      customerAdvanceFen: 88128000,
      customerRefundFen: 47698000,
      cancellationLossFen: 50400000,
    });
    expect(accountBalance(game.session.snapshot.journal, 'customerAdvance')).toBe(-40430000);
  });
  it('未生产终止只确认约定损失，剩余定金退款与客户退款独立记账', () => {
    const game = procurementGame();
    acceptPi(game);
    verifyFunding(game);
    decide(game, 'supplier_deposit');
    decide(game, 'procurement_cancel');
    expect(game.session.procurement).toMatchObject({
      supplierRefundFen: 1344000,
      cancellationLossFen: 336000,
    });
    expect(game.session.snapshot.player).toMatchObject({
      cashCnyFen: 9634000,
      cumulativeProfitCnyFen: -366000,
    });
    expect(accountBalance(game.session.snapshot.journal, 'inventory')).toBe(0);
  });
  it.each(['cup_500_budget', 'tws_budget', 'yoga_budget'])(
    '%s 已确认批次异常：返工与补检各自有代价',
    (supplier) => {
      const content = structuredClone(pack);
      content.suppliers.find((s) => s.id === supplier)!.qualityRisk = '1';
      const game = procurementGame(
        supplier,
        'tt',
        'fob',
        2000,
        'customer_c',
        'run.supplier.case.0',
        'amend',
        content,
      );
      produce(game);
      const initialDay = game.session.snapshot.gameDay,
        initialCash = game.session.snapshot.player.cashCnyFen;
      expect(buildProcurementView(game.session, pack)).toMatchObject({
        qualityUnresolved: false,
        documentsUnresolved: false,
      });
      expect(() =>
        game.act({ type: 'assessInspection', itemId: 'material', answer: 'pass' }),
      ).toThrow('先阅读');
      assess(game, true);
      expect(buildProcurementView(game.session, pack)).toMatchObject({
        qualityUnresolved: true,
        documentsUnresolved: true,
      });
      expect(game.session.procurement!.inspectionErrors).toEqual([
        'material',
        'packaging',
        'documents',
      ]);
      expect(() => game.choose('inspection_accept')).toThrow('不可用');
      game.choose('inspection_retry');
      game.advance();
      assess(game);
      decide(game, 'inspection_supplement');
      expect(game.session.procurement!.qualityIssue).toBe(true);
      expect(game.session.procurement!.documentsMissing).toBe(false);
      expect(game.session.procurement!.viewedEvidence).toEqual([]);
      expect(game.session.snapshot.order.flags.inspectionReady).toBe(false);
      assess(game);
      decide(game, 'inspection_rework');
      assess(game);
      decide(game, 'inspection_accept');
      expect(game.session.snapshot.gameDay - initialDay).toBe(6);
      expect(game.session.snapshot.player.cashCnyFen).toBe(initialCash - 90000);
      expect(game.session.procurement!.inspectionRevision).toBe(3);
      expect(game.session.snapshot.order.taxEligibility).toBe('ineligible');
      expect(accountBalance(game.session.snapshot.journal, 'taxReceivable')).toBe(0);
    },
  );
  it('备货初始化不判质量异常，凭证缺口独立保留', () => {
    const copy = structuredClone(pack);
    const game = procurementGame('cup_500_budget');
    const before = structuredClone(game.session.snapshot.story);
    const supplier = copy.suppliers.find((item) => item.id === 'cup_500_budget')!;
    supplier.qualityRisk = '0';
    supplier.delayRisk = '1';
    game.session.procurement = null;
    beginProcurement(game.session, copy);
    expect(game.session.procurement).toMatchObject({
      qualityIssue: false,
      qualityRoll: null,
      delayIssue: false,
      documentsMissing: true,
    });
    expect(game.session.snapshot.story.rngState).toEqual(before.rngState);
    expect(game.session.snapshot.story.drawCount).toBe(before.drawCount);
  });
  it('可靠供应商初始化不重抽；延期和售后异常统一由事件窗口承担', () => {
    const game = procurementGame();
    const before = structuredClone(game.session);
    game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(before))));
    beginProcurement(game.session, pack);
    buildProcurementView(game.session, pack);
    expect(game.session.procurement).toMatchObject({
      qualityIssue: false,
      delayIssue: false,
      documentsMissing: false,
    });
    expect(game.session.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
    expect(game.session.snapshot.story.drawCount).toBe(before.snapshot.story.drawCount);
  });
  it('实际到账、定金、生产、处置和尾款的命令重放不重复，旧 revision 拒绝', () => {
    const game = procurementGame(
      'cup_500_budget',
      'tt',
      'fob',
      2000,
      'customer_c',
      'run.supplier.case.0',
    );
    acceptPi(game);
    checkFunding(game);
    const replay = (choiceId: string) => {
      const command = {
        id: 'once.' + choiceId,
        revision: game.session.snapshot.revision,
        action: { type: 'choose', choiceId } as const,
      };
      const first = reduceSlice(game.session, pack, command);
      const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(first)) as unknown);
      expect(reduceSlice(restored, pack, command)).toEqual(first);
      expect(() => reduceSlice(first, pack, { ...command, id: 'stale.' + choiceId })).toThrow(
        '过期',
      );
      game.restore(first);
      game.advance();
    };
    replay('funding_verify');
    game.advance();
    replay('supplier_deposit');
    game.advance();
    replay('production_wait');
    assess(game);
    replay('inspection_rework');
    game.advance();
    assess(game);
    replay('inspection_supplement');
    game.advance();
    assess(game);
    decide(game, 'inspection_accept');
    replay('supplier_balance');
    game.advance();
    expect(() => procurementRule(game.session, pack, 'procurement.payBalance', 'again')).toThrow(
      '可操作',
    );
  });
  it('独立报价缺少产品供应商，不能捏造 PI 或采购；非法阶段与配置被拒绝', () => {
    const game = negotiationGame();
    toContract(game);
    sign(game);
    expect(() => game.choose('continue_procurement')).toThrow('不可用');
    expect(() => beginProcurement(game.session, pack)).toThrow('产品');
    const invalid = (change: (p: typeof pack) => void) => {
      const copy = structuredClone(pack);
      change(copy);
      expect(validateContent(copy).ok).toBe(false);
    };
    invalid((p) => {
      p.nodes.find((n) => n.id === 'L05.pi')!.stage = 6;
    });
    invalid((p) => {
      p.procurement!.piFields.pop();
    });
    invalid((p) => {
      p.procurement!.inspectionProfiles[0]!.productId = 'missing';
    });
    invalid((p) => {
      p.procurement!.inspectionProfiles[0]!.items.pop();
    });
    invalid((p) => {
      p.parameters.reworkFee!.value = '-1';
    });
    invalid((p) => {
      p.parameters.refundAfterProduction!.value = '1.1';
    });
    invalid((p) => {
      p.parameters.productionDays!.value = 0;
    });
    invalid((p) => {
      const n = p.nodes.find((n) => n.id === 'L04.price')!;
      if (n.type === 'choice')
        n.choices[0]!.effects = [{ op: 'rule', ruleId: 'procurement.payDeposit', args: {} }];
    });
    expect(validateContent(pack).ok).toBe(true);
  });
});
