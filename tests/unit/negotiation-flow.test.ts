import { describe, expect, it } from 'vitest';
import { pack } from '../fixtures/economy';
import {
  negotiationGame,
  decide,
  toContract,
  confirmAll,
  sign,
  enterNegotiation,
} from '../fixtures/negotiation';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import {
  negotiationProjection,
  selectPayment,
  selectTerms,
  signContract,
  beginNegotiation,
  applyOffer,
} from '../../src/engine/slice/negotiation';
import { sliceSessionSchema, createSliceSession } from '../../src/engine/slice/session';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { validateContent } from '../../src/content/validation';
import { buildNegotiationView } from '../../src/app/negotiationView';

describe('第 4 关三轮谈判、风险与签约', () => {
  const combinations = ['tt', 'lc', 'oa'].flatMap((payment) =>
    ['exw', 'fob', 'cif'].map((term) => [payment, term] as const),
  );
  it.each(combinations)('%s × %s 可经三轮与核对签约，收款采购仍不发生', (payment, term) => {
    const game = negotiationGame('customer_c', 2000);
    toContract(game, payment, term);
    const before = structuredClone(game.session.snapshot);
    expect(before.order.signedDay).toBeNull();
    expect(before.order.remainingDeliveryDays).toBeNull();
    expect(game.session.snapshot.order.flags.lcReviewed).toBe(payment === 'lc');
    expect(negotiationProjection(game.session, pack).forecast.minimumCashCnyFen).toBeGreaterThan(0);
    sign(game);
    const state = game.session.snapshot;
    expect(state.story.nodeId).toBe('L04.complete');
    expect(state.order).toMatchObject({
      status: 'contracted',
      quantity: 2000,
      signedDay: state.gameDay,
      deliveryDueDay: state.gameDay + 30,
      remainingDeliveryDays: 30,
      collectionDueDay: null,
      deliveryCompletedDay: null,
    });
    expect(state.order.incoterm).toBe(term.toUpperCase());
    expect(state.order.payment).toBe(
      ({ tt: 'TT', lc: 'LC_SIGHT', oa: 'OA_60' } as const)[payment as 'tt' | 'lc' | 'oa'],
    );
    expect(state.order.namedPlace).toBeTruthy();
    expect(state.order.invoiceUsdCent).toBe(
      Math.round(Number(state.order.contractUnitUsd) * 100) * 2000,
    );
    expect(state.journal).toEqual(before.journal);
    expect(state.player.cashCnyFen).toBe(before.player.cashCnyFen);
    expect(state.player.cumulativeProfitCnyFen).toBe(before.player.cumulativeProfitCnyFen);
    expect(state.scheduled).toEqual([]);
    expect(
      state.story.decisionLog.filter((d) =>
        ['L04.price', 'L04.payment', 'L04.terms'].includes(d.nodeId),
      ),
    ).toHaveLength(3);
    expect(() => applyOffer(game.session, pack, 'hold')).toThrow('可修改');
  });
  it('第 1→2→3→4 完整交接保留供应商、客户、报价与询盘决策', () => {
    const game = inquiryGame('inquiry.seed.2', false);
    completeInquiries(game);
    const before = structuredClone(game.session.snapshot);
    enterNegotiation(game);
    toContract(game);
    sign(game);
    expect(game.session.snapshot.order.customerId).toBe('customer_b');
    expect(game.session.snapshot.order.supplierId).toBe(before.order.supplierId);
    expect(game.session.snapshot.order.productId).toBe(before.order.productId);
    expect(
      game.session.snapshot.story.decisionLog.slice(0, before.story.decisionLog.length),
    ).toEqual(before.story.decisionLog);
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(game.session.snapshot.player.cumulativeProfitCnyFen).toBe(-20000);
  });
  it('B 首轮 30% 压价可拒绝；直接跟价会暴露亏损', () => {
    const game = negotiationGame('customer_b');
    expect(buildNegotiationView(game.session, pack)?.clientText).toContain('30%');
    decide(game, 'offer_match');
    expect(game.session.negotiation!.discountRate).toBe('0.30');
    const discounted = negotiationProjection(game.session, pack);
    expect(discounted.unitUsd).toBe('2.86');
    expect(discounted.projectedMarginFen).toBeLessThan(0);
    expect(buildNegotiationView(game.session, pack)?.warnings.join()).toContain('预计亏损');
    game.choose('payment_reprice');
    game.advance();
    decide(game, 'offer_hold');
    expect(negotiationProjection(game.session, pack).unitUsd).toBe('4.08');
    expect(game.session.snapshot.player.cashCnyFen).toBe(10000000);
  });
  it('保价减量受 MOQ 约束；放量不暗中削成可支付数量', () => {
    const game = negotiationGame('customer_c', 2000);
    game.session.snapshot.order.supplierId = 'cup_500_budget';
    decide(game, 'offer_small');
    expect(game.session.negotiation!.quantity).toBe(2000);
    game.choose('payment_reprice');
    game.advance();
    decide(game, 'offer_bulk');
    expect(game.session.negotiation!.quantity).toBe(2200);
    expect(game.session.quoteInput.quantity).toBe(2000);
  });
  it('让价换 50% 定金，不能套用无定金付款；返工清空旧轮次与确认', () => {
    const game = negotiationGame();
    decide(game, 'offer_secured');
    expect(game.session.negotiation!.depositRatio).toBe('0.5');
    expect(() => game.choose('payment_oa')).toThrow('不可用');
    expect(() => game.choose('payment_lc')).toThrow('不可用');
    expect(() => selectPayment(game.session, 'OA_60')).toThrow('定金');
    decide(game, 'payment_tt');
    decide(game, 'terms_fob');
    game.choose('counterparty_continue');
    game.advance();
    confirmAll(game);
    expect(game.session.snapshot.order.flags.contractReady).toBe(true);
    game.choose('contract_reprice');
    game.advance();
    decide(game, 'offer_hold');
    expect(game.session.negotiation!.confirmations).toEqual([]);
    expect(game.session.snapshot.order.flags).toMatchObject({
      round1Done: true,
      round2Done: false,
      round3Done: false,
      contractReady: false,
    });
    expect(game.session.snapshot.order.payment).toBeNull();
    expect(game.session.snapshot.order.incoterm).toBeNull();
  });
  it('跳过报价、轮次、软条款或核对项都不能签约', () => {
    expect(() => beginNegotiation(createSliceSession(pack, 'unquoted', true), pack)).toThrow(
      '报价',
    );
    const game = negotiationGame();
    expect(() => signContract(game.session, pack)).toThrow('三轮');
    expect(() => selectPayment(game.session, 'TT')).toThrow('价格');
    expect(() => selectTerms(game.session, pack, 'FOB')).toThrow('付款');
    expect(() => game.act({ type: 'confirmContract', fieldId: 'risk', checked: true })).toThrow(
      '当前',
    );
    decide(game, 'offer_hold');
    decide(game, 'payment_lc');
    expect(game.session.snapshot.story.nodeId).toBe('L04.lc.soft');
    expect(() => selectTerms(game.session, pack, 'CIF')).toThrow('软条款');
    decide(game, 'lc_amend');
    decide(game, 'terms_fob');
    game.choose('counterparty_continue');
    game.advance();
    expect(() => game.choose('contract_sign')).toThrow('不可用');
    expect(() => signContract(game.session, pack)).toThrow('逐项核对');
    expect(() => game.act({ type: 'confirmContract', fieldId: 'invented', checked: true })).toThrow(
      '未知',
    );
  });
  it('L/C 改单费用与准备日实际入账，重复命令/刷新不再次收费', () => {
    const game = negotiationGame();
    decide(game, 'offer_hold');
    decide(game, 'payment_lc');
    const command = {
      id: 'lc.one',
      revision: game.session.snapshot.revision,
      action: { type: 'choose', choiceId: 'lc_amend' } as const,
    };
    const first = reduceSlice(game.session, pack, command);
    expect(first.snapshot.player.cashCnyFen).toBe(9980000);
    expect(first.snapshot.player.cumulativeProfitCnyFen).toBe(-20000);
    expect(first.snapshot.gameDay).toBe(3);
    expect(first.snapshot.order.signedDay).toBeNull();
    const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(first)) as unknown);
    expect(reduceSlice(restored, pack, command)).toEqual(first);
    game.restore(restored);
    game.advance();
    game.advance();
    expect(game.session.snapshot.order.flags).toMatchObject({
      lcReviewed: true,
      lcSoftAccepted: false,
    });
  });
  it('接受 L/C 软条款留下未解决风险，可经明示确认签约', () => {
    const game = negotiationGame();
    toContract(game, 'lc', 'fob', 'hold', 'accept');
    expect(game.session.snapshot.order.flags.lcSoftAccepted).toBe(true);
    expect(game.session.snapshot.player.cashCnyFen).toBe(10000000);
    expect(buildNegotiationView(game.session, pack)?.warnings.join()).toContain('软条款');
    sign(game);
    expect(game.session.snapshot.order.flags.lcSoftAccepted).toBe(true);
    expect(game.session.snapshot.order.signedDay).toBe(1);
  });
  it('支付能力不足时不标记已改单、不推进日期且不污染账本', () => {
    const game = negotiationGame();
    decide(game, 'offer_hold');
    decide(game, 'payment_lc');
    const copy = structuredClone(pack);
    copy.parameters.lcAmendFee!.value = '100001';
    const before = structuredClone(game.session);
    expect(() =>
      reduceSlice(game.session, copy, {
        id: 'cannot.pay',
        revision: game.session.snapshot.revision,
        action: { type: 'choose', choiceId: 'lc_amend' },
      }),
    ).toThrow('现金不足');
    expect(game.session).toEqual(before);
  });
  it('金标准资金复算：T/T、L/C、OA 不把应收或退税提前计现金', () => {
    const game = negotiationGame();
    decide(game, 'offer_hold');
    const tt = negotiationProjection(game.session, pack, 'TT', 'FOB');
    expect(tt).toMatchObject({
      unitUsd: '4.08',
      invoiceUsdCent: 2040000,
      invoiceCnyFen: 14688000,
      customerDepositUsdCent: 612000,
      rebateFen: 1115044,
      bankFen: 30000,
      projectedMarginFen: 1423044,
    });
    expect(tt.forecast.minimumCashCnyFen).toBe(26400);
    const lc = negotiationProjection(game.session, pack, 'LC_SIGHT', 'FOB');
    expect(lc.bankFen).toBe(138752);
    expect(lc.forecast.minimumCashCnyFen).toBe(-4488752);
    const oa = negotiationProjection(game.session, pack, 'OA_60', 'FOB');
    expect(oa.collectionDay).toBe(80);
    expect(oa.forecast.minimumCashCnyFen).toBe(-4350000);
    expect(oa.forecast.items.some((i) => i.id === 'customerDeposit')).toBe(false);
    expect(oa.forecast.items.find((i) => i.id === 'rebate')!.dueDay).toBe(100);
    expect(game.session.snapshot.order.collectionDueDay).toBeNull();
    expect(game.session.snapshot.journal).toHaveLength(1);
  });
  it('CIF 按合同单价总额计保费；FOB/EXW 不扣本方海运，EXW 缺证不减退税', () => {
    const game = negotiationGame();
    decide(game, 'offer_hold');
    const cif = negotiationProjection(game.session, pack, 'TT', 'CIF');
    expect(cif).toMatchObject({
      unitUsd: '4.68',
      invoiceUsdCent: 2340000,
      insuranceUsdCent: 15444,
      projectedMarginFen: 1419847,
    });
    const exw = negotiationProjection(game.session, pack, 'TT', 'EXW');
    expect(exw).toMatchObject({
      unitUsd: '4.35',
      rebateFen: 0,
      insuranceUsdCent: 0,
      eligible: false,
      projectedMarginFen: 1530000,
    });
    for (const term of ['EXW', 'FOB'] as const)
      expect(
        negotiationProjection(game.session, pack, 'TT', term).forecast.items.some(
          (i) => i.id === 'ocean' || i.id === 'insurance',
        ),
      ).toBe(false);
    expect(game.session.quoteInput.rebateEligible).toBe(true);
  });
  it.each(['reject', 'pay_stop', 'pay_continue'])(
    'D 异常收费路径 %s 记录实际支出并可止损',
    (path) => {
      const game = negotiationGame('customer_d', 2000);
      decide(game, 'offer_hold');
      decide(game, 'payment_tt');
      decide(game, 'terms_fob');
      expect(game.session.snapshot.story.nodeId).toBe('L04.counterparty');
      if (path === 'reject') decide(game, 'fraud_reject');
      else {
        decide(game, 'fraud_pay');
        expect(game.session.snapshot.player.cashCnyFen).toBe(9800000);
        expect(game.session.snapshot.player.cumulativeProfitCnyFen).toBe(-200000);
        expect(game.session.snapshot.order.flags.fraudFeePaid).toBe(true);
        if (path === 'pay_stop') decide(game, 'fraud_exit');
        else {
          game.choose('fraud_continue');
          game.advance();
          sign(game);
        }
      }
      expect(game.session.snapshot.story.nodeId).toBe(
        path === 'pay_continue' ? 'L04.complete' : 'L04.cancelled',
      );
      expect(game.session.snapshot.order.status).toBe(
        path === 'pay_continue' ? 'contracted' : 'cancelled',
      );
      expect(game.session.snapshot.player.cashCnyFen).toBe(path === 'reject' ? 10000000 : 9800000);
      expect(
        negotiationProjection(game.session, pack).forecast.items.every(
          (i) => i.direction === 'out',
        ),
      ).toBe(true);
      expect(game.session.snapshot.scheduled).toEqual([]);
    },
  );
  it('核对清单刷新保存；未全部确认不可签、签后不可改单，重复签约幂等', () => {
    const game = negotiationGame();
    toContract(game);
    confirmAll(game);
    game.act({ type: 'confirmContract', fieldId: 'risk', checked: false });
    expect(() => game.choose('contract_sign')).toThrow('不可用');
    game.act({ type: 'confirmContract', fieldId: 'risk', checked: true });
    game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(game.session)) as unknown));
    const command = {
      id: 'sign.once',
      revision: game.session.snapshot.revision,
      action: { type: 'choose', choiceId: 'contract_sign' } as const,
    };
    const signed = reduceSlice(game.session, pack, command);
    expect(reduceSlice(signed, pack, command)).toEqual(signed);
    expect(() => reduceSlice(signed, pack, { ...command, id: 'stale' })).toThrow('过期');
    expect(() => selectPayment(signed, 'OA_60')).toThrow('可修改');
    expect(() => signContract(signed, pack)).toThrow('可修改');
    expect(game.session.snapshot.order.status).toBe('negotiating');
  });
  it('同一付款轮返工不能无限刷信任，已花准备费不抹去', () => {
    const game = negotiationGame();
    toContract(game, 'lc');
    confirmAll(game);
    const trust = game.session.snapshot.player.trustByCustomer.customer_c!;
    game.choose('contract_reprice');
    game.advance();
    toContract(game, 'tt');
    expect(game.session.snapshot.player.trustByCustomer.customer_c).toBe(trust);
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
  });
  it('JSON 控制议价与风险文案；非法第 5 关、客户、参数、规则均拒绝', () => {
    const invalid = (mutate: (copy: typeof pack) => void) => {
      const copy = structuredClone(pack);
      mutate(copy);
      expect(validateContent(copy).ok).toBe(false);
    };
    invalid((p) => {
      p.nodes.find((n) => n.id === 'L04.price')!.stage = 5;
    });
    invalid((p) => {
      p.negotiation!.profiles[0]!.customerId = 'missing';
    });
    invalid((p) => {
      p.negotiation!.offers[0]!.quantityRatioParam = 'missing';
    });
    invalid((p) => {
      p.parameters.lcAmendFee!.value = '-1';
    });
    invalid((p) => {
      p.parameters.securedDeposit!.value = '1.0000001';
    });
    invalid((p) => {
      const node = p.nodes.find((n) => n.type === 'calc')!;
      if (node.type === 'calc')
        node.results[0]!.effects.push({ op: 'rule', ruleId: 'contract.sign', args: {} });
    });
    invalid((p) => {
      p.negotiation!.terms[0]!.placeParam = 'missing';
    });
    invalid((p) => {
      p.negotiation!.checklist[1]!.id = p.negotiation!.checklist[0]!.id;
    });
    invalid((p) => {
      const n = p.nodes.find((n) => n.id === 'L04.price')!;
      if (n.type === 'choice')
        n.choices[0]!.effects = [
          {
            op: 'rule',
            ruleId: 'negotiation.offer',
            args: { offerId: { kind: 'literal', value: 'made_up' } },
          },
        ];
    });
    const copy = structuredClone(pack);
    copy.parameters.openingB!.value = '0.20';
    const game = negotiationGame('customer_b');
    applyOffer(game.session, copy, 'match');
    expect(game.session.negotiation!.discountRate).toBe('0.20');
    expect(buildNegotiationView(game.session, copy)?.clientText).toContain('20%');
    expect(validateContent(pack).ok).toBe(true);
  });
});
