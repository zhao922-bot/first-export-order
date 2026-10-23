import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import {
  logisticsGame,
  selectLogistics,
  declaration,
  bookLogistics,
  dispatchLogistics,
  clearLogisticsRisk,
  finishLogistics,
  enterLogistics,
} from '../fixtures/logistics';
import { produce, finishProcurement, enterProcurement } from '../fixtures/procurement';
import { decide, enterNegotiation, toContract, sign } from '../fixtures/negotiation';
import { inquiryGame, completeInquiries } from '../fixtures/inquiry';
import {
  beginLogistics,
  logisticsQuote,
  logisticsTimeline,
  logisticsRule,
  logisticsResolution,
} from '../../src/engine/slice/logistics';
import {
  accountBalance,
  validateJournal,
  projectLedger,
  transfer,
} from '../../src/engine/economy/ledger';
import { accrueDeadline } from '../../src/engine/economy/deadline';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { sliceSessionSchema } from '../../src/engine/slice/session';
import { buildLogisticsView } from '../../src/app/logisticsView';
import { validateContent } from '../../src/content/validation';
import { stageRoute } from '../../src/app/stageRoute';

describe('第 6 关物流、责任与实际交付', () => {
  it.each(['tt', 'lc', 'oa'].flatMap((p) => ['exw', 'fob', 'cif'].map((t) => [p, t] as const)))(
    '%s × %s 可完成，费用与交付口径不同',
    (payment, term) => {
      const game = logisticsGame(payment, term),
        signed = game.session.snapshot.order.signedDay,
        due = game.session.snapshot.order.deliveryDueDay;
      bookLogistics(game);
      dispatchLogistics(game);
      clearLogisticsRisk(game);
      const cash = game.session.snapshot.player.cashCnyFen;
      finishLogistics(game);
      const s = game.session.snapshot,
        v = game.session.logistics!;
      expect(s.story.nodeId).toBe('L06.complete');
      expect(s.order.signedDay).toBe(signed);
      expect(s.order.deliveryDueDay).toBe(due);
      expect(s.order.status).toBe(term === 'exw' ? 'delivered' : 'shipped');
      expect(v.shipmentDay).toBe(term === 'exw' ? null : s.gameDay);
      expect(s.order.collectionDueDay).toBe(
        payment === 'oa' && term !== 'exw' ? s.gameDay + 60 : null,
      );
      expect(s.player.cashCnyFen).toBe(cash);
      expect(s.scheduled).toEqual([]);
      expect(accountBalance(s.journal, 'inventory')).toBe(0);
      expect(accountBalance(s.journal, 'customerAdvance')).toBe(0);
      expect(accountBalance(s.journal, 'receivable')).toBeGreaterThan(0);
      expect(accountBalance(s.journal, 'sales')).toBeLessThan(0);
      expect(accountBalance(s.journal, 'taxReceivable')).toBe(0);
      expect(v.oceanPaidFen > 0).toBe(term === 'cif');
      expect(v.insurancePaidFen > 0).toBe(term === 'cif');
      expect(v.domesticPaidFen).toBe(term === 'exw' ? 40000 : 140000);
      const future = accrueDeadline(s, s.gameDay + 90, 10000, 1);
      expect(future.penaltyFen).toBe(0);
      expect(future.remainingDays).toBe(s.order.remainingDeliveryDays);
      validateJournal(s.journal);
    },
  );
  it('六关整体交接，合同、产品、客户和库存成本沿用', () => {
    const game = inquiryGame('logistics.full');
    completeInquiries(game);
    enterNegotiation(game);
    toContract(game);
    sign(game);
    enterProcurement(game);
    produce(game);
    finishProcurement(game);
    const original = structuredClone(game.session.snapshot.order);
    enterLogistics(game);
    selectLogistics(game);
    declaration(game);
    decide(game, 'logistics_book');
    decide(game, 'logistics_dispatch');
    clearLogisticsRisk(game, game.session.logistics!.risk === 'rollover' ? 'wait' : 'standard');
    finishLogistics(game);
    expect(game.session.snapshot.order).toMatchObject({
      productId: original.productId,
      supplierId: original.supplierId,
      customerId: original.customerId,
      invoiceUsdCent: original.invoiceUsdCent,
      deliveryDueDay: original.deliveryDueDay,
    });
    expect(game.session.snapshot.story.stage).toBe(6);
    expect(stageRoute(6)).toBe('/logistics');
    expect(pack.nodes.find((n) => n.id === 'L06.complete')?.type).toBe('choice');
  });
  it('FOB 独立黄金账本：定金抵应收，出运没有新现金，不重复费用', () => {
    const game = logisticsGame();
    bookLogistics(game);
    dispatchLogistics(game);
    clearLogisticsRisk(game);
    finishLogistics(game);
    const s = game.session.snapshot;
    expect(s.player.cashCnyFen).toBe(5992560);
    expect(s.player.cumulativeProfitCnyFen).toBe(105200);
    expect(accountBalance(s.journal, 'receivable')).toBe(4112640);
    expect(accountBalance(s.journal, 'sales')).toBe(-5875200);
    expect(game.session.logistics!.oceanPaidFen).toBe(0);
    expect(game.session.logistics!.insurancePaidFen).toBe(0);
  });
  it('CIF 柜费含附加费，保险只按锁定发票额，升级不改合同价', () => {
    const game = logisticsGame('tt', 'cif'),
      s = structuredClone(game.session);
    s.snapshot.order.invoiceUsdCent = 1234567;
    const basic = logisticsQuote(s, pack, 'forwarder_steady', 'basic'),
      extended = logisticsQuote(s, pack, 'forwarder_steady', 'extended');
    expect(basic).toMatchObject({
      cartons: 84,
      containerCount: 1,
      oceanUsdCent: 300000,
      sellerOceanFen: 2160000,
      insuranceUsdCent: 8148,
      sellerInsuranceFen: 58666,
      insuredUsdCent: 1358024,
    });
    expect(extended).toMatchObject({ insuranceUsdCent: 12222, sellerInsuranceFen: 87998 });
    expect(s.snapshot.order.invoiceUsdCent).toBe(1234567);
    s.quoteInput.oceanTotalUsd = '3420';
    expect(logisticsQuote(s, pack, 'forwarder_steady').oceanUsdCent).toBe(357000);
    s.quoteInput.insuranceCoverageFactor = '1.0';
    expect(logisticsQuote(s, pack, 'forwarder_steady').coverageFactor).toBe('1.1');
  });
  it.each(['cup_500_verified', 'tws_verified', 'yoga_verified'])(
    '%s 柜数按体积或重量进位，整箱包装计毛重',
    (supplier) => {
      const game = logisticsGame('tt', 'cif', supplier, 1000),
        s = structuredClone(game.session);
      s.snapshot.order.quantity = 30000;
      const p = pack.products.find((p) => p.id === s.snapshot.order.productId)!;
      const q = logisticsQuote(s, pack, 'forwarder_steady');
      const cartons = Math.ceil(30000 / p.unitsPerCarton);
      expect(q.containerCount).toBe(
        Math.ceil(
          Math.max(
            (cartons * Number(p.cartonCbm)) / 28,
            (30000 * Number(p.weightKg) + cartons) / 26000,
          ),
        ),
      );
      const heavy = structuredClone(pack);
      heavy.parameters.shipCapacityKg!.value = '1000';
      expect(logisticsQuote(s, heavy, 'forwarder_steady').containerCount).toBeGreaterThan(
        q.containerCount,
      );
    },
  );
  it('申报须先核对，错误可修正，修改自动清除该项确认且刷新保持', () => {
    const game = logisticsGame();
    selectLogistics(game);
    expect(() => game.choose('declaration_submit')).toThrow('不可用');
    declaration(game, false);
    expect(game.session.logistics!.declarationErrors).toEqual(['quantity']);
    expect(() => game.choose('logistics_book')).toThrow('不可用');
    game.choose('declaration_retry');
    game.advance();
    game.act({ type: 'editDeclaration', fieldId: 'quantity', value: '2000' });
    expect(game.session.logistics!.declarationChecks).not.toContain('quantity');
    game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(game.session))));
    game.act({ type: 'checkDeclaration', fieldId: 'quantity', checked: true });
    decide(game, 'declaration_submit');
    expect(game.session.snapshot.order.flags.declarationValid).toBe(true);
    expect(() => logisticsRule(game.session, pack, 'logistics.deliver', 'early')).toThrow(
      '交付条件',
    );
  });
  it('CIF 跳过保险进入复盘，无支付且不能订舱；FOB 不允许强制买卖方保险', () => {
    const game = logisticsGame('tt', 'cif');
    decide(game, 'plan_steady');
    const journal = structuredClone(game.session.snapshot.journal);
    decide(game, 'insurance_skip');
    expect(game.session.snapshot.journal).toEqual(journal);
    expect(game.session.logistics!.insurance).toBeNull();
    expect(() => logisticsRule(game.session, pack, 'logistics.book', 'bad')).toThrow('保险');
    decide(game, 'insurance_extended');
    expect(game.session.logistics!.insurance).toBe('extended');
    const fob = logisticsGame();
    decide(fob, 'plan_steady');
    expect(() => logisticsRule(fob.session, pack, 'logistics.insurance', 'bad', 'basic')).toThrow(
      '术语',
    );
  });
  it('查验可选常规或加急，费用与时间可见；加急仍不免查', () => {
    const normal = logisticsGame(),
      fast = logisticsGame();
    for (const g of [normal, fast]) {
      bookLogistics(g);
      dispatchLogistics(g, 'customs');
    }
    const before = normal.session.snapshot.gameDay,
      cash = normal.session.snapshot.player.cashCnyFen;
    expect(buildLogisticsView(normal.session, pack)!.riskOptions).toHaveLength(2);
    clearLogisticsRisk(normal, 'standard');
    clearLogisticsRisk(fast, 'expedite');
    expect(normal.session.snapshot.gameDay - before).toBe(2);
    expect(fast.session.snapshot.gameDay - before).toBe(1);
    expect(normal.session.snapshot.player.cashCnyFen).toBe(cash - 30000);
    expect(fast.session.snapshot.player.cashCnyFen).toBe(cash - 50000);
    expect(normal.session.logistics!.risk).toBe('customs');
  });
  it('快班错过截关顺延，便宜晚班可真实逾期，罚费和信誉只扣一次', () => {
    const game = logisticsGame();
    bookLogistics(game, 'fast');
    dispatchLogistics(game, 'customs');
    clearLogisticsRisk(game, 'standard');
    expect(logisticsTimeline(game.session, pack).missed).toBe(1);
    expect(logisticsTimeline(game.session, pack).delivery).toBe(
      game.session.logistics!.enteredDay + 11,
    );
    const late = logisticsGame();
    bookLogistics(late, 'economy');
    dispatchLogistics(late, 'rollover');
    clearLogisticsRisk(late, 'wait');
    const projected = logisticsTimeline(late.session, pack),
      cash = late.session.snapshot.player.cashCnyFen,
      rep = late.session.snapshot.player.reputation;
    expect(projected.overdue).toBe(7);
    finishLogistics(late);
    expect(late.session.snapshot.player.cashCnyFen).toBe(cash - 70000);
    expect(late.session.snapshot.player.reputation).toBe(rep - 7);
    expect(late.session.snapshot.order.overdueDaysCharged).toBe(7);
    expect(accrueDeadline(late.session.snapshot, 99, 10000, 1).penaltyFen).toBe(0);
  });
  it.each(['fob', 'cif'])('甩柜改配 %s 的主运价差归属正确', (term) => {
    const game = logisticsGame('tt', term);
    bookLogistics(game);
    dispatchLogistics(game, 'rollover');
    const preview = logisticsResolution(game.session, pack, 'priority'),
      before = game.session.snapshot.player.cashCnyFen;
    expect(preview.feeFen).toBe(term === 'cif' ? 100000 : 20000);
    expect(preview.buyerExtraFen).toBe(term === 'fob' ? 80000 : 0);
    clearLogisticsRisk(game, 'priority');
    expect(game.session.snapshot.player.cashCnyFen).toBe(before - preview.feeFen);
    expect(logisticsTimeline(game.session, pack).delivery).toBe(
      game.session.logistics!.enteredDay + 8,
    );
  });
  it('尚未抽样不泄露风险，刷新不重抽且独立事件流不改变参数流', () => {
    const game = logisticsGame();
    bookLogistics(game);
    const parameterRng = structuredClone(game.session.snapshot.story.rngState.parameters),
      draws = game.session.snapshot.story.drawCount;
    expect(game.session.logistics!.risk).toBeNull();
    dispatchLogistics(game, 'customs');
    const state = structuredClone(game.session);
    game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(state))));
    expect(game.session.snapshot.story.drawCount).toBe(draws + 1);
    expect(game.session.snapshot.story.rngState.parameters).toEqual(parameterRng);
    expect(() => logisticsRule(game.session, pack, 'logistics.dispatch', 'again')).toThrow('重复');
    expect(game.session.snapshot.story.rngState).toEqual(state.snapshot.story.rngState);
  });
  it('订舱、异常、交付命令幂等，过期命令拒绝，不能重复确认收入', () => {
    const game = logisticsGame();
    selectLogistics(game);
    declaration(game);
    const replay = (choiceId: string) => {
      const command = {
        id: 'replay.' + choiceId,
        revision: game.session.snapshot.revision,
        action: { type: 'choose', choiceId } as const,
      };
      const value = reduceSlice(game.session, pack, command);
      expect(reduceSlice(value, pack, command)).toBe(value);
      expect(() => reduceSlice(value, pack, { ...command, id: command.id + '.stale' })).toThrow(
        '过期',
      );
      game.restore(value);
      game.advance();
      game.advance();
    };
    replay('logistics_book');
    dispatchLogistics(game, 'customs');
    replay('customs_standard');
    replay('logistics_deliver');
    expect(() => logisticsRule(game.session, pack, 'logistics.deliver', 'duplicate')).toThrow(
      '可操作',
    );
  });
  it('现金不足订舱整笔回滚，可以暂停且保留库存与客户预收款', () => {
    const game = logisticsGame('oa', 'cif');
    selectLogistics(game);
    declaration(game);
    const s = structuredClone(game.session);
    s.snapshot.journal.push({
      id: 'fixture.expense',
      commandId: 'fixture.expense',
      sourceNodeId: 'L05.complete',
      gameDay: s.snapshot.gameDay,
      description: '已发生独立准备费夹具',
      postings: transfer('expense', 'cash', s.snapshot.player.cashCnyFen - 100),
    });
    Object.assign(s.snapshot.player, projectLedger(s.snapshot.journal));
    game.restore(s);
    expect(() => game.choose('logistics_book')).toThrow('现金不足');
    expect(game.session).toEqual(s);
    decide(game, 'logistics_hold');
    expect(game.session.snapshot.story.nodeId).toBe('L06.held');
    expect(accountBalance(game.session.snapshot.journal, 'inventory')).toBe(5600000);
    expect(game.session.snapshot.order.deliveryCompletedDay).toBeNull();
    expect(accountBalance(game.session.snapshot.journal, 'sales')).toBe(0);
  });
  it('已超期备货交接继续原计时，不漏掉第 5 关已发生的逾期', () => {
    const game = logisticsGame();
    const s = structuredClone(game.session);
    s.snapshot.gameDay = 35;
    s.snapshot.order.remainingDeliveryDays = -5;
    s.logistics!.enteredDay = 35;
    game.restore(s);
    bookLogistics(game);
    dispatchLogistics(game);
    expect(game.session.snapshot.order.overdueDaysCharged).toBe(7);
    clearLogisticsRisk(game);
    finishLogistics(game);
    expect(game.session.snapshot.order.overdueDaysCharged).toBe(12);
    expect(game.session.logistics!.penaltyPaidFen).toBe(120000);
  });
  it('推进/查验资金不足整笔回滚，已付服务费、时钟和随机状态不被部分提交', () => {
    for (const phase of ['dispatch', 'resolve']) {
      const game = logisticsGame();
      bookLogistics(game);
      if (phase === 'resolve') dispatchLogistics(game, 'customs');
      const state = structuredClone(game.session);
      if (phase === 'dispatch') {
        state.snapshot.gameDay = 35;
        state.logistics!.enteredDay = 35;
        state.snapshot.order.remainingDeliveryDays = -5;
      }
      state.snapshot.journal.push({
        id: 'fixture.lowcash',
        commandId: 'fixture.lowcash',
        sourceNodeId: 'L06.book.review',
        gameDay: state.snapshot.gameDay,
        description: '已发生费用夹具',
        postings: transfer('expense', 'cash', state.snapshot.player.cashCnyFen - 100),
      });
      Object.assign(state.snapshot.player, projectLedger(state.snapshot.journal));
      game.restore(state);
      expect(() =>
        game.choose(phase === 'dispatch' ? 'logistics_dispatch' : 'customs_standard'),
      ).toThrow('现金不足');
      expect(game.session).toEqual(state);
      decide(game, 'logistics_hold');
      expect(game.session.snapshot.order.status).toBe('ready');
      expect(game.session.logistics!.held).toBe(true);
    }
  });
  it('物流规则跨阶段及非法配置被拒绝，未入库不能进入物流', () => {
    const game = logisticsGame();
    const s = structuredClone(game.session);
    s.logistics = null;
    s.snapshot.order.status = 'producing';
    expect(() => beginLogistics(s, pack)).toThrow('验收入库');
    for (const mutate of [
      (p: typeof pack) => {
        p.nodes.find((n) => n.id === 'L06.plan')!.stage = 7;
      },
      (p: typeof pack) => {
        p.logistics!.declarationFields.pop();
      },
      (p: typeof pack) => {
        p.forwarders[0]!.cutoffDay = p.forwarders[0]!.sailingDay;
      },
      (p: typeof pack) => {
        p.parameters.shipCustoms_steady!.value = '0.9';
        p.parameters.shipRollover_steady!.value = '0.9';
      },
      (p: typeof pack) => {
        p.parameters.shipCapacityCbm!.value = '0';
      },
      (p: typeof pack) => {
        p.parameters.shipDailyPenalty!.value = '-1';
      },
      (p: typeof pack) => {
        p.parameters.shipExpediteDays!.value = 0;
      },
      (p: typeof pack) => {
        p.logistics!.plans[0]!.forwarderId = 'missing';
      },
      (p: typeof pack) => {
        const n = p.nodes.find((n) => n.id === 'L06.plan')!;
        n.onEnterEffects = [{ op: 'rule', ruleId: 'logistics.confirm', args: {} }];
      },
    ]) {
      const p = structuredClone(pack);
      mutate(p);
      expect(validateContent(p).ok).toBe(false);
    }
    expect(validateContent(pack).ok).toBe(true);
  });
});
