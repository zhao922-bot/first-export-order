import { describe, it, expect } from 'vitest';
import { snapshot, entry, note } from '../fixtures/economy';
import {
  transfer,
  appendJournal,
  projectLedger,
  shipmentPostings,
  accountBalance,
  validateJournal,
} from '../../src/engine/economy/ledger';
import {
  splitPayment,
  forecastCashflow,
  holdingCost,
  collectionDueDay,
} from '../../src/engine/economy/cashflow';
import { calculateCollection } from '../../src/engine/economy/collection';
import { accrueDeadline } from '../../src/engine/economy/deadline';
import type { CashflowItem, JournalEntry } from '../../src/domain/types';
describe(note + ' · F09–F16/N11–N14', () => {
  it('N11 定金尾款恒等，分币种不混账', () => {
    expect(splitPayment(1001, '0.30')).toEqual({ deposit: 300, balance: 701 });
    expect(splitPayment(1001, '0.50')).toEqual({ deposit: 501, balance: 500 });
    expect(splitPayment(1001, '0')).toEqual({ deposit: 0, balance: 1001 });
    expect(splitPayment(1001, '1')).toEqual({ deposit: 1001, balance: 0 });
  });
  it.each([
    [-1, '0.3'],
    [1, '-0.1'],
    [1, '1.1'],
    [1, 'Infinity'],
    [1.5, '0.3'],
  ])('付款非法参数 %s/%s', (amount, ratio) => {
    expect(() => splitPayment(Number(amount), String(ratio))).toThrow();
  });
  it('N13 全账务流程；采购/税款现金时点与利润分开', () => {
    let entries: JournalEntry[] = [entry('capital', transfer('cash', 'capital', 10000000))];
    const add = (id: string, p: JournalEntry['postings']) => {
      entries = appendJournal(entries, [entry(id, p)]);
    };
    add('sample', transfer('expense', 'cash', 20000));
    add('customerDeposit', transfer('cash', 'customerAdvance', 1762560));
    add('supplierDeposit', transfer('supplierAdvance', 'cash', 1680000));
    expect(projectLedger(entries)).toEqual({
      cashCnyFen: 10062560,
      cumulativeProfitCnyFen: -20000,
    });
    add('supplierBalance', transfer('supplierAdvance', 'cash', 3920000));
    add('finishedGoods', transfer('inventory', 'supplierAdvance', 5600000));
    add('domestic', transfer('expense', 'cash', 140000));
    add('bank', transfer('expense', 'cash', 30000));
    expect(projectLedger(entries).cashCnyFen).toBe(5972560);
    add('shipment', shipmentPostings(5875200, 5600000, 446018, true));
    add('offsetDeposit', transfer('customerAdvance', 'receivable', 1762560));
    expect(projectLedger(entries).cumulativeProfitCnyFen).toBe(531218);
    add('collection', calculateCollection(571200, '7.20', 4112640, 0).postings);
    expect(projectLedger(entries).cashCnyFen).toBe(10085200);
    add('taxReceived', transfer('cash', 'taxReceivable', 446018));
    expect(projectLedger(entries)).toEqual({
      cashCnyFen: 10531218,
      cumulativeProfitCnyFen: 531218,
    });
    for (const a of [
      'inventory',
      'supplierAdvance',
      'customerAdvance',
      'receivable',
      'taxReceivable',
    ] as const)
      expect(accountBalance(entries, a)).toBe(0);
    expect(() => validateJournal(entries)).not.toThrow();
    expect(() => shipmentPostings(1, 1, 1, false)).toThrow('无资格');
    expect(() => shipmentPostings(1, 1, 2, true)).toThrow('超过采购成本');
    expect(shipmentPostings(1, 1, 0, false)).toHaveLength(6);
  });
  it('N14 幂等重发；恢复后仍不重复现金、利润', () => {
    const batch = [entry('expense', transfer('expense', 'cash', 20000), 'cmd')];
    const first = appendJournal(snapshot().journal, batch);
    expect(appendJournal(first, batch)).toBe(first);
    expect(appendJournal(structuredClone(first), batch)).toEqual(first);
    expect(appendJournal(first, [])).toBe(first);
    expect(() =>
      appendJournal(first, [...batch, entry('other', transfer('cash', 'capital', 1))]),
    ).toThrow('整体重放');
    expect(() =>
      appendJournal(first, [entry('expense', transfer('expense', 'cash', 1), 'newCommand')]),
    ).toThrow('重复 journal');
  });
  it('拒绝不平账、负数和汇总溢出', () => {
    expect(() =>
      validateJournal([
        entry('bad', [
          { account: 'cash', side: 'debit', amountCnyFen: 1 },
          { account: 'capital', side: 'credit', amountCnyFen: 2 },
        ]),
      ]),
    ).toThrow('借贷不平');
    expect(() => transfer('cash', 'capital', -1)).toThrow();
    expect(() =>
      accountBalance(
        [
          entry('a', transfer('cash', 'capital', Number.MAX_SAFE_INTEGER)),
          entry('b', transfer('cash', 'capital', 1)),
        ],
        'cash',
      ),
    ).toThrow();
    const entries = [
      entry('sale', transfer('cash', 'sales', 1)),
      entry('refund', transfer('sales', 'cash', 1)),
      entry('cost', transfer('expense', 'cash', 1)),
      entry('rebate', transfer('cash', 'expense', 1)),
    ];
    expect(projectLedger(entries)).toEqual({ cashCnyFen: 0, cumulativeProfitCnyFen: 0 });
  });
  it('N10/F12 汇兑损益方向、手续费及零差额', () => {
    expect(calculateCollection(10000, '7.308', 72000, 300)).toMatchObject({
      cashFen: 72780,
      exchangeGainFen: 1080,
    });
    expect(calculateCollection(10000, '7.092', 72000, 300)).toMatchObject({
      cashFen: 70620,
      exchangeGainFen: -1080,
    });
    expect(calculateCollection(10000, '7.2', 72000, 0).exchangeGainFen).toBe(0);
    const result = calculateCollection(10000, '7.308', 72000, 300);
    expect(projectLedger([entry('receive', result.postings)]).cumulativeProfitCnyFen).toBe(780);
  });
  it.each([
    [-1, '7.2', 0, 0],
    [1, '0', 0, 0],
    [1, 'NaN', 0, 0],
    [1, '7.2', -1, 0],
    [1, '7.2', 0, -1],
    [1, '-1', 0, 0],
    [1.2, '7.2', 0, 0],
  ])('收汇非法参数 %o', (usd, fx, book, fee) => {
    expect(() => calculateCollection(Number(usd), String(fx), Number(book), Number(fee))).toThrow();
  });
  it('N12 到期当天/次日/重发/交付后冻结，F14 只入一次费用', () => {
    const s = snapshot();
    s.order.deliveryDueDay = 10;
    expect(accrueDeadline(s, 10).newOverdueDays).toBe(0);
    const late = accrueDeadline(s, 11, 10000, 2);
    expect(late).toMatchObject({
      remainingDays: -1,
      totalOverdueDays: 1,
      newOverdueDays: 1,
      penaltyFen: 10000,
      reputationLoss: 2,
    });
    expect(projectLedger([entry('late', late.postings)])).toEqual({
      cashCnyFen: -10000,
      cumulativeProfitCnyFen: -10000,
    });
    s.order.overdueDaysCharged = 1;
    expect(accrueDeadline(s, 11).newOverdueDays).toBe(0);
    s.order.deliveryCompletedDay = 11;
    expect(accrueDeadline(s, 71).newOverdueDays).toBe(0);
    s.order.deliveryDueDay = null;
    expect(accrueDeadline(s, 71).remainingDays).toBeNull();
  });
  it.each([
    [0, -1, 0],
    [-1, 0, 0],
    [1.5, 0, 0],
    [1, 0, -1],
    [1, 0, 1.5],
  ])('无效交期输入 %s/%s/%s', (next, fee, rep) => {
    expect(() => accrueDeadline(snapshot(), next, fee, rep)).toThrow();
  });
  it('F15 同日有确认到账、付款、预测到账，按稳定顺序找缺口', () => {
    const s = snapshot();
    s.player.cashCnyFen = 100;
    const flow = (
      id: string,
      day: number,
      dir: 'in' | 'out',
      amount: number,
      certainty: 'confirmed' | 'forecast',
    ): CashflowItem => ({
      id,
      dueDay: day,
      direction: dir,
      amountCnyFen: amount,
      certainty,
      sourceId: 'test',
    });
    const items = [
      flow('forecast', 2, 'in', 500, 'forecast'),
      flow('out', 2, 'out', 400, 'confirmed'),
      flow('confirmed', 2, 'in', 200, 'confirmed'),
      flow('later', 3, 'out', 200, 'confirmed'),
    ];
    const before = structuredClone(items);
    expect(forecastCashflow(s, items)).toMatchObject({ minimumCashCnyFen: -100, gapDay: 2 });
    expect(forecastCashflow(s, items).items.map((i) => i.id)).toEqual([
      'confirmed',
      'out',
      'forecast',
      'later',
    ]);
    expect(items).toEqual(before);
    expect(
      forecastCashflow(s, [
        flow('b', 0, 'in', 1, 'confirmed'),
        flow('a', 0, 'in', 2, 'confirmed'),
      ]).items.map((i) => i.id),
    ).toEqual(['a', 'b']);
    expect(forecastCashflow(s, []).gapDay).toBeNull();
    s.player.cashCnyFen = -100;
    expect(forecastCashflow(s, []).gapDay).toBe(0);
    expect(() => forecastCashflow(s, [items[0]!, items[0]!])).toThrow('重复');
    s.gameDay = 4;
    expect(() => forecastCashflow(s, items)).toThrow('过去');
  });
  it('F16 账期与占用成本不自动入账', () => {
    expect(collectionDueDay(15, 60)).toBe(75);
    expect(holdingCost(1000000, '0.12', 60, 360, true)).toBe(20000);
    expect(holdingCost(1000000, '0.12', 60, 360, false)).toBe(0);
  });
  it.each([
    [-1, '0.1', 1, 360],
    [1, '-1', 1, 360],
    [1, 'NaN', 1, 360],
    [1, '0.1', -1, 360],
    [1, '0.1', 1.5, 360],
    [1, '0.1', 1, 0],
    [1, '0.1', 1, 1.5],
  ])('非法占用参数 %o', (p, r, d, y) => {
    expect(() => holdingCost(Number(p), String(r), Number(d), Number(y), true)).toThrow();
  });
  it.each([
    [-1, 1],
    [1, -1],
    [1.5, 1],
    [1, 1.5],
    [Number.MAX_SAFE_INTEGER, 1],
  ])('非法账期 %s/%s', (day, term) => {
    expect(() => collectionDueDay(day, term)).toThrow();
  });
});
