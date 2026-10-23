import { describe, expect, it } from 'vitest';
import { eventPack } from '../fixtures/economy';
import { simulateRun, seedFor, strategies } from '../../scripts/balance/simulation';
import { summarize, validateCoverage } from '../../scripts/balance/report';
import { cashCsv, compact } from '../../scripts/balance/artifacts';

describe('真实业务平衡报告口径', () => {
  it('OA 部分坏账：核销结案不能记作收齐款，收益分布仍纳入该亏损样本', () => {
    const run = simulateRun(eventPack, seedFor(0), 'aggressive');
    const c = run.collection!;
    expect(run.error).toBeNull();
    expect(c.scenarioId).toBe('oa_partial_loss');
    expect(c.closed).toBe(true);
    expect(c.fullyCollected).toBe(false);
    expect(c.badDebtFen).toBeGreaterThan(0);
    expect(c.initialUsdCent).toBe(c.receivedUsdCent + c.outstandingUsdCent + c.writtenOffUsdCent);
    expect(c.writtenOffUsdCent).toBe(c.initialUsdCent / 4);
    const report = summarize([run]).aggressive!;
    expect(report.oa.scenarios.oa_partial_loss).toMatchObject({ count: 1, total: 1 });
    expect(report.oa.closedWithLoss).toBe(1);
    expect(report.fullyCollected.count).toBe(0);
    expect(report.collectionClosedReturnOnCost.median).toBe(run.profitFen / run.costFen);
    expect(report.collectionClosedReturnOnCost.median).toBeLessThan(0);
    expect(run.quality).toMatchObject({ credentialsVerified: false, initialIssue: false });
  });
  it('采购现金不足未进入 OA 回款时，不把该种子当成 OA 未付款情境', () => {
    const run = simulateRun(eventPack, seedFor(4), 'aggressive');
    const report = summarize([run]).aggressive!;
    expect(report.oa.selected).toBe(1);
    expect(report.oa.reachedCollection).toBe(0);
    expect(report.oa.sampled).toBe(0);
    expect(report.oa.scenarios.oa_default).toMatchObject({ count: 0, total: 0, rate: null });
    expect(run.collection).toBeNull();
    expect(report.firstFailureNodes).toEqual({ 'L05.balance': 1 });
    expect(report.warningReasons.forecast_cash_gap).toBe(1);
  });
  it('返工成功仍统计原始质量异常，核验资料不能覆盖批次事实', () => {
    const config = structuredClone(eventPack);
    config.suppliers.find((s) => s.id === 'cup_500_verified')!.qualityRisk = '1';
    const run = simulateRun(config, seedFor(0), 'cautious');
    expect(run.error).toBeNull();
    expect(run.quality).toMatchObject({
      initialIssue: true,
      reworked: true,
      unresolved: false,
      credentialsVerified: true,
    });
    const quality = summarize([run]).cautious!.quality;
    expect(quality.initialIssues).toMatchObject({ count: 1, total: 1 });
    expect(quality.bySupplier.cup_500_verified).toMatchObject({ configuredRisk: '1', produced: 1 });
    expect(quality.byCredentials.verified!.initialIssues.count).toBe(1);
    expect(quality.byCredentials.informationGap!.produced).toBe(0);
  });
  it('无现金变动的 OA 等待也进入现金时序，跨关数据与逐笔谷底一致', () => {
    const run = simulateRun(eventPack, seedFor(0), 'aggressive');
    expect(run.cashTimeline[0]).toMatchObject({ action: 'initial', cashFen: 10000000, day: 0 });
    const dueIndex = run.cashTimeline.findIndex((p) => p.action === 'oa_due');
    expect(dueIndex).toBeGreaterThan(0);
    const due = run.cashTimeline[dueIndex]!,
      before = run.cashTimeline[dueIndex - 1]!;
    expect(due.day).toBeGreaterThan(before.day);
    expect(due.cashFen).toBe(before.cashFen);
    expect(Math.min(...run.cashTimeline.map((p) => p.cashFen))).toBe(run.minimumCashFen);
    expect(Math.min(...run.stageCash.map((p) => p.minimumFen))).toBe(run.minimumCashFen);
    expect(run.stageCash.map((p) => p.stage)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(run.stageCash.at(-1)!.exitFen).toBe(run.cashFen);
    expect(cashCsv([run])).toContain('"oa_due"');
  });
  it('不同种子没有到达的事件窗口不进入分母，同关窗口分别统计', () => {
    const complete = simulateRun(eventPack, seedFor(0), 'cautious');
    const stopped = simulateRun(eventPack, seedFor(1), 'cautious', { maxCommands: 1 });
    const report = summarize([complete, stopped]).cautious!;
    expect(report.runs).toBe(2);
    expect(report.eventWindows['event.window.6.L06.gate']!.reached).toBe(1);
    expect(report.eventWindows['event.window.6.L06.risk']!.reached).toBe(1);
    expect(report.quality.produced).toBe(1);
    expect(report.stageCash['7']!.reached).toBe(1);
  });
  it('首次内部算错不改变同种子经营事实、账本结果和事件', () => {
    const clean = simulateRun(eventPack, seedFor(2), 'cautious');
    const mistake = simulateRun(eventPack, seedFor(2), 'cautious', { firstQuoteMistake: true });
    for (const field of [
      'cashFen',
      'profitFen',
      'minimumCashFen',
      'day',
      'eventWindows',
      'quality',
      'collection',
      'stageCash',
      'ending',
      'completion',
    ] as const)
      expect(mistake[field]).toEqual(clean[field]);
  });
  it('严格检查种子区间、策略、探针和遥测版本，不能用旧报表冒充新分布', () => {
    const base = compact(simulateRun(eventPack, seedFor(0), 'cautious', { maxCommands: 1 }));
    const runs = strategies.map((strategy) => ({ ...base, strategy }));
    expect(() => validateCoverage(runs, 0, 1)).not.toThrow();
    expect(() => validateCoverage(runs.slice(1), 0, 1)).toThrow('incomplete');
    expect(() => validateCoverage([...runs, runs[0]!], 0, 1)).toThrow('duplicate');
    expect(() => validateCoverage(runs, 1, 1)).toThrow('unexpected');
    expect(() => validateCoverage([{ ...base, telemetryVersion: 2 }], 0, 1, true)).toThrow(
      'Telemetry',
    );
    expect(() => validateCoverage([base], 0, 1, true)).not.toThrow();
    expect(() => validateCoverage([base, base], 0, 2, true)).toThrow('duplicate');
  });
});

describe('0.10 完整千种子批次的代表性回归', () => {
  it.each([
    [1, 'oa_full', 1, false],
    [3, 'oa_delayed', 1, true],
    [0, 'oa_partial_loss', 0.75, true],
    [17, 'oa_default', 0, true],
  ] as const)('激进 %i：锁定 %s 的实际收款和费用', (index, scenarioId, ratio, recovery) => {
    const run = simulateRun(eventPack, seedFor(index), 'aggressive');
    expect(run.error).toBeNull();
    expect(run.terminalNodeId).toBe('L07.complete');
    expect(run.collection).toMatchObject({ scenarioId, recoveryAttempted: recovery, closed: true });
    const c = run.collection!;
    expect(c.receivedUsdCent).toBe(c.initialUsdCent * ratio);
    expect(c.writtenOffUsdCent).toBe(c.initialUsdCent - c.receivedUsdCent);
    expect(c.fullyCollected).toBe(ratio === 1);
    expect(c.bankFeeFen).toBe(ratio === 0 ? 0 : eventPack.collection!.oaBankFeeFen);
  });
  it.each([
    ['cautious', 253, 2915968],
    ['aggressive', 469, 500],
  ] as const)('%s %i：真实返工和交付支出后的现金谷底可回放', (strategy, index, minimum) => {
    const run = simulateRun(eventPack, seedFor(index), strategy);
    expect(run.error).toBeNull();
    expect(run.minimumCashFen).toBe(minimum);
    expect(run.minimumCashNode).toBe('L06.delivery');
    expect(run.quality).toMatchObject({ initialIssue: true, reworked: true, unresolved: false });
    expect(run.collection?.fullyCollected).toBe(true);
    expect(run.cashTimeline.every((p) => p.cashFen >= 0)).toBe(true);
  });
  it('稳妥 0165：保本标签仍可能已收齐且盈利，不能按标签误报亏损', () => {
    const run = simulateRun(eventPack, seedFor(165), 'cautious');
    expect(run.ending).toBe('breakeven');
    expect(run.completion).toBe('completed');
    expect(run.profitFen).toBeGreaterThan(0);
    expect(run.collection?.fullyCollected).toBe(true);
    expect(summarize([run]).cautious!.profitable.count).toBe(1);
  });
  // 完整 650 命令探针在覆盖率采样下超过默认 5 秒；保留全部步骤与业务断言。
  it('乱选 0348：650 次命令仍在内部纠错，不可虚构成丢单或收费', { timeout: 15000 }, () => {
    const run = simulateRun(eventPack, seedFor(348), 'random');
    expect(run.error).toBeNull();
    expect(run.ending).toBeNull();
    expect(run.terminalNodeId).toBe('L03.hint.cost');
    expect(run.completion).toBe('incomplete');
    expect(run.cashFen).toBe(10000000);
    expect(run.profitFen).toBe(0);
    expect(run.failures).toContainEqual({
      nodeId: 'L03.hint.cost',
      stage: 3,
      reason: 'command_limit',
      realized: false,
    });
  });
});
