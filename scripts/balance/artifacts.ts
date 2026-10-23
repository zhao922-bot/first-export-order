import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { summarize, validateCoverage, type SummaryRun } from './report';
import { policyVersion, telemetryVersion, type BalanceRun } from './simulation';

export function writeArtifacts(
  out: string,
  source: string,
  start: number,
  seeds: number,
  runs: SummaryRun[],
  cashCsv: string,
  failures: unknown[],
  probe: SummaryRun[],
) {
  validateCoverage(runs, start, seeds);
  if (probe.length) validateCoverage(probe, start, seeds, true);
  const stats = summarize(runs),
    cautious = stats.cautious!,
    aggressive = stats.aggressive!,
    random = stats.random!;
  const teachingObservations = {
    cautiousFullCollection: (cautious.fullyCollected.rate ?? 0) >= 0.95,
    cautiousProfitable: (cautious.profitable.rate ?? 0) >= 0.9,
    cautiousReturnOnCost:
      (cautious.returnOnCost.median ?? 0) >= 0.03 && (cautious.returnOnCost.median ?? 1) <= 0.12,
    aggressivePhaseAdverse: (aggressive.phaseAdverse.rate ?? 0) >= 0.7,
    aggressiveSomeSuccess: aggressive.profitable.count > 0,
  };
  const cautiousBySeed = new Map(
    runs.filter((r) => r.strategy === 'cautious').map((r) => [r.seed, r]),
  );
  const economicFacts = (r: SummaryRun) =>
    JSON.stringify([
      r.ending,
      r.completion,
      r.cashFen,
      r.profitFen,
      r.minimumCashFen,
      r.day,
      r.eventWindows,
      r.quality,
      r.collection,
      r.stageCash,
    ]);
  const gates = {
    cautiousNoBankruptcy: cautious.endings.bankrupt!.count === 0,
    noNegativeCash: runs.every((r) => r.minimumCashFen >= 0),
    noInternalQuoteLoss: [cautious, aggressive, random].every(
      (s) => s.repeatedQuoteLoss.count === 0,
    ),
    noSimulatorErrors: runs.every((r) => r.error === null),
    collectionConserved: runs.every(
      (r) =>
        !r.collection ||
        (r.collection.writtenOffUsdCent >= 0 &&
          r.collection.initialUsdCent ===
            r.collection.receivedUsdCent +
              r.collection.outstandingUsdCent +
              r.collection.writtenOffUsdCent &&
          (r.collection.writtenOffUsdCent === 0) === (r.collection.badDebtFen === 0)),
    ),
    firstMistakeProtection:
      probe.length === seeds &&
      probe.every(
        (r) =>
          !r.error &&
          r.ending !== 'bankrupt' &&
          r.minimumCashFen >= 0 &&
          r.completion === 'completed',
      ),
    firstMistakeEconomicsUnchanged:
      probe.length === seeds &&
      probe.every(
        (r) =>
          cautiousBySeed.has(r.seed) &&
          economicFacts(r) === economicFacts(cautiousBySeed.get(r.seed)!),
      ),
  };
  const summary = {
    protocol: policyVersion,
    telemetryVersion,
    contentVersion: JSON.parse(source).contentVersion as string,
    contentSha256: createHash('sha256').update(source).digest('hex'),
    seedPrefix: 'balance.v1.',
    start,
    seeds,
    totalRuns: runs.length,
    nonterminalRuns: runs.filter((r) => r.ending === null).length,
    firstInquiryRun: true,
    confidence:
      '95% Wilson intervals; gates use point estimates; deterministic seed sample, not human playtest data',
    denominators: {
      endings: '每种策略的全部种子；未完成另列，不补成经营结局',
      oaScenarios: '实际到达 OA 到期抽样的订单；选择 OA 但采购中止的订单未暴露于回款情境',
      quality: '实际完成生产的批次；initialIssues 保留返工前抽样事实',
      eventWindows: '到达窗口不代表满足每个候选事件条件；上限、互斥、保护仍会筛除候选',
      cash: '人民币分；CSV 包含初始值、现金/利润变化、跨关和无现金变动的时间推进',
      collection: '美元分；初始待收 = 实收 + 剩余待收 + 核销，核销不计实收',
    },
    strategies: stats,
    firstMistakeProbe: {
      runs: probe.length,
      completed: probe.filter((r) => r.completion === 'completed').length,
      bankrupt: probe.filter((r) => r.ending === 'bankrupt').length,
      errors: probe.filter((r) => r.error).length,
      minimumCashFen: probe.length ? Math.min(...probe.map((r) => r.minimumCashFen)) : null,
    },
    gates,
    teachingObservations,
    retiredGate:
      '0.9 的乱选 60% 因内部报价错误丢单目标已撤销；其余收益比例仅作教学观察，不可为达标修改业务事实',
    allAutomatedGatesPassed: Object.values(gates).every(Boolean),
    playTimeGate: {
      status: 'not_measured',
      reason:
        'Business game days and command counts cannot measure human active play time; 30–45 minutes requires playtests',
    },
  };
  fs.mkdirSync(out, { recursive: true });
  for (const [name, value] of Object.entries({
    'summary.json': summary,
    'runs.json': runs,
    'failure-seeds.json': failures,
    'first-mistake-probe.json': probe,
  }))
    fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'content.json'), source);
  fs.writeFileSync(path.join(out, 'cash-timeline.csv'), cashCsv);
  return summary;
}
export function cashCsv(runs: BalanceRun[]) {
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  const lines = ['seed,strategy,revision,day,stage,node,action,cashFen,profitFen'];
  for (const run of runs)
    for (const p of run.cashTimeline)
      lines.push(
        [
          run.seed,
          run.strategy,
          p.revision,
          p.day,
          p.stage,
          p.nodeId,
          p.action,
          p.cashFen,
          p.profitFen,
        ]
          .map((v) => (typeof v === 'string' ? quote(v) : v))
          .join(','),
      );
  return '\uFEFF' + lines.join('\n') + '\n';
}
export function compact(run: BalanceRun) {
  const { cashTimeline, decisionTrace, ...rest } = run;
  return { ...rest, cashPoints: cashTimeline.length, decisions: decisionTrace.length };
}
