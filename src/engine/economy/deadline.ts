import type { GameSnapshot } from '../../domain/types';
import { assertMinor } from './decimal';
import { transfer, type Posting } from './ledger';
export interface DeadlineResult {
  remainingDays: number | null;
  totalOverdueDays: number;
  newOverdueDays: number;
  penaltyFen: number;
  reputationLoss: number;
  postings: Posting[];
}
/** F13/F14：交付后冻结；持久化已扣逾期天数保证重算幂等。 */
export function accrueDeadline(
  snapshot: Pick<GameSnapshot, 'gameDay' | 'order'>,
  nextDay: number,
  dailyFeeFen = 0,
  dailyReputationLoss = 0,
): DeadlineResult {
  assertMinor(dailyFeeFen);
  if (
    !Number.isSafeInteger(nextDay) ||
    nextDay < snapshot.gameDay ||
    dailyFeeFen < 0 ||
    !Number.isSafeInteger(dailyReputationLoss) ||
    dailyReputationLoss < 0
  )
    throw new RangeError('无效交期参数');
  const due = snapshot.order.deliveryDueDay;
  const effectiveDay = Math.min(nextDay, snapshot.order.deliveryCompletedDay ?? nextDay);
  const total = due === null ? 0 : Math.max(0, effectiveDay - due);
  const fresh = Math.max(0, total - snapshot.order.overdueDaysCharged);
  const penaltyFen = fresh * dailyFeeFen;
  assertMinor(penaltyFen);
  const reputationLoss = fresh * dailyReputationLoss;
  assertMinor(reputationLoss);
  return {
    remainingDays: due === null ? null : due - effectiveDay,
    totalOverdueDays: total,
    newOverdueDays: fresh,
    penaltyFen,
    reputationLoss,
    postings: transfer('expense', 'cash', penaltyFen),
  };
}
