import type { GameSnapshot, ScoringConfig, EndingResult, DecisionRecord } from '../../domain/types';
import { D } from './decimal';
import { accountBalance } from './ledger';
import { scoreEvidence } from '../debrief/evidence';
/** F17：只钳制评分，不钳制现金。 */
export function clamp(value: number, low: number, high: number): number {
  if (![value, low, high].every(Number.isFinite) || low > high)
    throw new RangeError('无效评分范围');
  return Math.min(high, Math.max(low, value));
}
export function computeScores(
  snapshot: GameSnapshot,
  config: ScoringConfig,
): EndingResult['scores'] {
  const dimension = (name: 'risk' | 'professionalism' | 'relationship' | 'compliance') =>
    scoreEvidence(snapshot, config, name).score;
  const basis = D.max(
    new D(Math.max(0, accountBalance(snapshot.journal, 'expense'))).mul(
      config.targetReturnOnCost.value,
    ),
    config.minimumScoreBasisCnyFen.value,
  );
  const profit = Math.round(
    clamp(
      new D(Math.max(0, snapshot.player.cumulativeProfitCnyFen)).mul(100).div(basis).toNumber(),
      0,
      100,
    ),
  );
  const trust =
    snapshot.order.customerId === null || snapshot.order.flags.customerIsFraud === true
      ? 0
      : (snapshot.player.trustByCustomer[snapshot.order.customerId] ?? 0);
  return {
    profit,
    risk: dimension('risk'),
    professionalism: dimension('professionalism'),
    relationship: Math.round(0.7 * trust + 0.3 * dimension('relationship')),
    compliance: dimension('compliance'),
  };
}
/** 回放影响分：各项先无量纲化，优先跨关、同类最多一个。 */
export function rankDecisions(
  decisions: DecisionRecord[],
  initialCashFen: number,
  contractDays: number,
  riskIds: readonly string[] = [],
): string[] {
  if (initialCashFen <= 0 || contractDays <= 0) throw new RangeError('回放基数必须为正');
  const impact = (d: DecisionRecord) =>
    Math.abs(d.deltas.profitCnyFen) / initialCashFen +
    Math.abs(d.deltas.reputation) / 100 +
    Math.abs(d.deltas.trust) / 100 +
    Math.abs(d.deltas.days) / contractDays +
    Number(d.majorRisk || riskIds.includes(d.id));
  const sorted = [...decisions].sort((a, b) => impact(b) - impact(a) || a.sequence - b.sequence);
  const result: DecisionRecord[] = [],
    families = new Set<string>(),
    stages = new Set<number>();
  for (const distinctStage of [true, false])
    for (const decision of sorted) {
      const family = decision.familyId ?? decision.choiceId.split('.')[0]!;
      if (
        result.length === 3 ||
        families.has(family) ||
        (distinctStage && stages.has(decision.stage))
      )
        continue;
      result.push(decision);
      families.add(family);
      stages.add(decision.stage);
    }
  return result.map((d) => d.id);
}
