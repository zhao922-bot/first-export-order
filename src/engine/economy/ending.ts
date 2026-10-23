import type { GameSnapshot, ScoringConfig, EndingResult } from '../../domain/types';
import { computeScores, rankDecisions } from './score';
import { accountBalance } from './ledger';
/** F18：先处理首次致命后果的复盘保护。 */
export function requiresRecovery(snapshot: GameSnapshot): boolean {
  return (
    snapshot.player.cashCnyFen < 0 &&
    (!snapshot.player.rescueUsed || snapshot.player.criticalMistakeCount < 2)
  );
}
export function financialEnding(
  snapshot: GameSnapshot,
  excellentReputation: number,
): EndingResult['kind'] {
  if (requiresRecovery(snapshot)) throw new RangeError('首次致命后果必须先展示复盘与纠错');
  const p = snapshot.player,
    completed = snapshot.order.status === 'collected';
  // 现金优先，其后是利润、实际收款完成和信誉。
  return p.cashCnyFen < 0
    ? 'bankrupt'
    : p.cumulativeProfitCnyFen < 0
      ? 'tuition'
      : completed && p.cumulativeProfitCnyFen > 0 && p.reputation >= excellentReputation
        ? 'excellent'
        : 'breakeven';
}
export function resolveEnding(snapshot: GameSnapshot, config: ScoringConfig): EndingResult {
  const kind = financialEnding(snapshot, config.excellentReputation);
  const p = snapshot.player,
    completed = snapshot.order.status === 'collected';
  const scores = computeScores(snapshot, config);
  const average = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  const repeat =
    kind === 'excellent' &&
    snapshot.order.customerId !== null &&
    snapshot.order.flags.customerIsFraud !== true &&
    (snapshot.order.flags.customerIsPotential !== true ||
      (average >= 80 && scores.compliance >= 80));
  const unsettledItems = (
    [
      'inventory',
      'supplierAdvance',
      'customerAdvance',
      'receivable',
      'payable',
      'taxReceivable',
    ] as const
  ).filter((account) => accountBalance(snapshot.journal, account) !== 0);
  return {
    kind,
    completion: kind === 'bankrupt' ? 'bankrupt' : completed ? 'completed' : 'lost_order',
    subtitle:
      kind === 'breakeven' && p.cumulativeProfitCnyFen > 0
        ? '赚到利润，仍需修复信誉与履约表现'
        : '',
    profitCnyFen: p.cumulativeProfitCnyFen,
    finalCashCnyFen: p.cashCnyFen,
    scores,
    learnedTermIds: [...p.learnedTermIds],
    masteredTermIds: [...p.masteredTermIds],
    replayDecisionIds: rankDecisions(
      snapshot.story.decisionLog,
      Math.max(1, -accountBalance(snapshot.journal, 'capital')),
      Math.max(1, (snapshot.order.deliveryDueDay ?? 1) - (snapshot.order.signedDay ?? 0)),
    ),
    repeatIntent: { unlocked: repeat, customerId: repeat ? snapshot.order.customerId : null },
    scoreEvidenceIds: [
      ...new Set(snapshot.story.decisionLog.flatMap((d) => d.evidence.map((e) => e.rubricId))),
    ],
    unsettledItems,
  };
}
