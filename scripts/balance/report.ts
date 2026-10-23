import { strategies, telemetryVersion, seedFor, type BalanceRun } from './simulation';
export type SummaryRun = Omit<BalanceRun, 'cashTimeline' | 'decisionTrace'>;

export function wilson(successes: number, total: number) {
  if (!total) return { count: successes, total, rate: null, low: null, high: null };
  const z = 1.959963984540054,
    p = successes / total,
    a = (z * z) / total;
  const center = (p + a / 2) / (1 + a),
    half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / (1 + a);
  return {
    count: successes,
    total,
    rate: p,
    low: successes === 0 ? 0 : Math.max(0, center - half),
    high: successes === total ? 1 : Math.min(1, center + half),
  };
}
export function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    if (!sorted.length) return null;
    const k = (sorted.length - 1) * p,
      lo = Math.floor(k);
    return sorted[lo]! + (sorted[Math.ceil(k)]! - sorted[lo]!) * (k - lo);
  };
  return {
    n: sorted.length,
    min: at(0),
    p05: at(0.05),
    median: at(0.5),
    p95: at(0.95),
    max: at(1),
  };
}
const counts = (items: string[]) =>
  Object.fromEntries(
    [...new Set(items)].sort().map((id) => [id, items.filter((x) => x === id).length]),
  );
/** 报表拒绝混用旧口径、重复种子或错位种子；不能把缺失遥测当成零风险。 */
export function validateCoverage(runs: SummaryRun[], start: number, seeds: number, probe = false) {
  const expected = new Set(
    Array.from({ length: seeds }, (_, i) => seedFor(start + i)).flatMap((seed) =>
      (probe ? ['cautious'] : strategies).map((strategy) => seed + ':' + strategy),
    ),
  );
  for (const run of runs) {
    if (
      run.telemetryVersion !== telemetryVersion ||
      !Array.isArray(run.stageCash) ||
      !Object.hasOwn(run, 'collection') ||
      !Object.hasOwn(run, 'quality')
    )
      throw new Error('Telemetry version mismatch; rerun simulation');
    if (!expected.delete(run.seed + ':' + run.strategy))
      throw new Error('Seed coverage unexpected or duplicate');
  }
  if (expected.size) throw new Error('Seed coverage incomplete');
}
function businessSummary(group: SummaryRun[]) {
  const oaSelected = group.filter((r) => r.payment === 'OA_60');
  const oaReached = oaSelected.filter((r) => r.collection);
  const oaSampled = oaReached.flatMap((r) => (r.collection?.scenarioId ? [r.collection] : []));
  const batches = group.flatMap((r) => (r.quality ? [r.quality] : []));
  const qualityGroup = (items: typeof batches) => ({
    produced: items.length,
    initialIssues: wilson(items.filter((q) => q.initialIssue).length, items.length),
    reworked: items.filter((q) => q.reworked).length,
    unresolved: items.filter((q) => q.unresolved).length,
  });
  const sum = (
    field:
      | 'initialUsdCent'
      | 'receivedUsdCent'
      | 'outstandingUsdCent'
      | 'writtenOffUsdCent'
      | 'badDebtFen'
      | 'bankFeeFen',
  ) => oaReached.reduce((total, r) => total + r.collection![field], 0);
  return {
    fullyCollected: wilson(group.filter((r) => r.collection?.fullyCollected).length, group.length),
    collectionClosedAtEnding: wilson(
      group.filter((r) => r.ending && r.collection?.closed).length,
      group.length,
    ),
    collectionClosedReturnOnCost: quantiles(
      group.flatMap((r) =>
        r.ending && r.collection?.closed && r.costFen > 0 ? [r.profitFen / r.costFen] : [],
      ),
    ),
    oa: {
      selected: oaSelected.length,
      reachedCollection: oaReached.length,
      sampled: oaSampled.length,
      scenarios: Object.fromEntries(
        ['oa_full', 'oa_delayed', 'oa_partial_loss', 'oa_default'].map((id) => [
          id,
          wilson(oaSampled.filter((v) => v.scenarioId === id).length, oaSampled.length),
        ]),
      ),
      firstChecked: oaSampled.filter((v) => v.firstChecked).length,
      recoveryAttempted: oaSampled.filter((v) => v.recoveryAttempted).length,
      fullyCollected: wilson(
        oaReached.filter((r) => r.collection!.fullyCollected).length,
        oaReached.length,
      ),
      closedWithLoss: oaReached.filter((r) => r.collection!.closed && r.collection!.badDebtFen > 0)
        .length,
      stillOutstanding: oaReached.filter((r) => r.collection!.outstandingUsdCent > 0).length,
      initialUsdCent: sum('initialUsdCent'),
      receivedUsdCent: sum('receivedUsdCent'),
      outstandingUsdCent: sum('outstandingUsdCent'),
      writtenOffUsdCent: sum('writtenOffUsdCent'),
      badDebtFen: sum('badDebtFen'),
      bankFeeFen: sum('bankFeeFen'),
    },
    quality: {
      ...qualityGroup(batches),
      bySupplier: Object.fromEntries(
        [...new Set(batches.map((q) => q.supplierId))].sort().map((id) => {
          const items = batches.filter((q) => q.supplierId === id);
          return [id, { configuredRisk: items[0]!.risk, ...qualityGroup(items) }];
        }),
      ),
      byCredentials: Object.fromEntries(
        [true, false].map((verified) => [
          verified ? 'verified' : 'informationGap',
          qualityGroup(batches.filter((q) => q.credentialsVerified === verified)),
        ]),
      ),
    },
    stageCash: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((stage) => {
        const points = group.flatMap((r) => r.stageCash.filter((p) => p.stage === stage));
        return [
          stage,
          {
            reached: points.length,
            entryFen: quantiles(points.map((p) => p.entryFen)),
            exitFen: quantiles(points.map((p) => p.exitFen)),
            minimumFen: quantiles(points.map((p) => p.minimumFen)),
            elapsedDays: quantiles(points.map((p) => p.lastDay - p.enteredDay)),
          },
        ];
      }),
    ),
    minimumCashNodes: counts(group.map((r) => r.minimumCashNode)),
  };
}
export function summarize(runs: SummaryRun[]) {
  return Object.fromEntries(
    strategies.map((strategy) => {
      const group = runs.filter((r) => r.strategy === strategy),
        n = group.length;
      const completed = group.filter((r) => r.completion === 'completed');
      const adverse = group.filter(
        (r) =>
          r.failures.some((f) => f.realized) || r.ending === 'tuition' || r.ending === 'bankrupt',
      );
      const earlyLoss = group.filter(
        (r) => r.completion === 'lost_order' && r.maxStage >= 3 && r.maxStage <= 4,
      );
      const repeatedQuoteLoss = group.filter(
        (r) => r.completion === 'lost_order' && r.terminalNodeId === 'L03.lost',
      );
      const phaseAdverse = group.filter((r) =>
        r.failures.some((f) => f.realized && [4, 6, 7].includes(f.stage)),
      );
      return [
        strategy,
        {
          runs: n,
          ...businessSummary(group),
          endings: Object.fromEntries(
            ['excellent', 'breakeven', 'tuition', 'bankrupt'].map((kind) => [
              kind,
              wilson(group.filter((r) => r.ending === kind).length, n),
            ]),
          ),
          completion: counts(group.map((r) => r.completion)),
          errors: group
            .filter((r) => r.error)
            .map((r) => ({ seed: r.seed, nodeId: r.terminalNodeId, error: r.error })),
          completed: wilson(completed.length, n),
          profitable: wilson(
            group.filter((r) => r.completion === 'completed' && r.profitFen > 0).length,
            n,
          ),
          adverse: wilson(adverse.length, n),
          earlyLoss: wilson(earlyLoss.length, n),
          repeatedQuoteLoss: wilson(repeatedQuoteLoss.length, n),
          phaseAdverse: wilson(phaseAdverse.length, n),
          returnOnCost: quantiles(
            completed.flatMap((r) => (r.returnOnCost === null ? [] : [r.returnOnCost])),
          ),
          finalCashFen: quantiles(group.map((r) => r.cashFen)),
          minimumCashFen: quantiles(group.map((r) => r.minimumCashFen)),
          profitFen: quantiles(group.map((r) => r.profitFen)),
          days: quantiles(group.map((r) => r.day)),
          failureNodes: counts(
            group.flatMap((r) => r.failures.filter((f) => f.realized).map((f) => f.nodeId)),
          ),
          failureStages: counts(
            group.flatMap((r) => r.failures.filter((f) => f.realized).map((f) => String(f.stage))),
          ),
          failureReasons: counts(group.flatMap((r) => r.failures.map((f) => f.reason))),
          firstFailureNodes: counts(
            group.flatMap((r) => {
              const first = r.failures.find((f) => f.realized);
              return first ? [first.nodeId] : [];
            }),
          ),
          warningReasons: counts(
            group.flatMap((r) => r.failures.filter((f) => !f.realized).map((f) => f.reason)),
          ),
          terminalNodes: counts(group.map((r) => r.terminalNodeId)),
          events: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => 'e' + String(i + 1).padStart(2, '0')).map((id) => [
              id,
              group.filter((r) => r.eventIds.includes(id)).length,
            ]),
          ),
          eventCount: counts(group.map((r) => String(r.eventIds.length))),
          reachedWindows: counts(group.flatMap((r) => r.eventWindows.map((w) => w.id))),
          eventWindows: Object.fromEntries(
            [...new Set(group.flatMap((r) => r.eventWindows.map((w) => w.id)))].sort().map((id) => {
              const windows = group.flatMap((r) => r.eventWindows.filter((w) => w.id === id));
              return [
                id,
                {
                  reached: windows.length,
                  selected: windows.filter((w) => w.eventId).length,
                  resolved: windows.filter((w) => w.eventId && w.status === 'resolved').length,
                  events: counts(windows.flatMap((w) => (w.eventId ? [w.eventId] : []))),
                },
              ];
            }),
          ),
          product: counts(group.map((r) => r.productId ?? 'none')),
          payment: counts(group.map((r) => r.payment ?? 'none')),
          stageReached: Object.fromEntries(
            [1, 2, 3, 4, 5, 6, 7].map((stage) => [
              stage,
              group.filter((r) => r.stages.includes(stage)).length,
            ]),
          ),
        },
      ];
    }),
  );
}
