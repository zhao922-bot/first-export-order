import type { GameSnapshot, CashflowItem, CashflowForecast } from '../../domain/types';
import { cashflowItemSchema } from '../../domain/schemas/economy';
import { D, assertMinor, toMinorUnits } from './decimal';
/** F09：尾款由总额减定金，保留舍入恒等式。分可表示 CNY 或 USD 最小单位。 */
export function splitPayment(
  totalMinor: number,
  depositRatio: string,
): { deposit: number; balance: number } {
  assertMinor(totalMinor);
  const r = new D(depositRatio);
  if (totalMinor < 0 || !r.isFinite() || r.lt(0) || r.gt(1))
    throw new RangeError('无效付款比例或总额');
  const deposit = new D(totalMinor).mul(r).toDecimalPlaces(0).toNumber();
  return { deposit, balance: totalMinor - deposit };
}
/** F15：同日确认到账先入账，随后付款，最后预测收入。 */
export function forecastCashflow(
  snapshot: Pick<GameSnapshot, 'player' | 'gameDay'>,
  schedule: CashflowItem[],
): CashflowForecast {
  let cash = snapshot.player.cashCnyFen;
  assertMinor(cash);
  if (new Set(schedule.map((item) => item.id)).size !== schedule.length)
    throw new RangeError('重复现金流项目');
  const rank = (item: CashflowItem) =>
    item.direction === 'out' ? 1 : item.certainty === 'confirmed' ? 0 : 2;
  const items = schedule
    .map((item) => cashflowItemSchema.parse(item))
    .sort((a, b) => a.dueDay - b.dueDay || rank(a) - rank(b) || a.id.localeCompare(b.id));
  let minimum = cash,
    gapDay: number | null = cash < 0 ? snapshot.gameDay : null;
  for (const item of items) {
    if (item.dueDay < snapshot.gameDay) throw new RangeError('预测不能重复计入过去流水');
    cash += item.direction === 'in' ? item.amountCnyFen : -item.amountCnyFen;
    assertMinor(cash);
    minimum = Math.min(minimum, cash);
    if (cash < 0 && gapDay === null) gapDay = item.dueDay;
  }
  return { minimumCashCnyFen: minimum, gapDay, items };
}
/** F16：资金占用成本仅供预览，本函数不生成扣款。 */
export function holdingCost(
  principalFen: number,
  annualRate: string,
  days: number,
  yearDays: number,
  enabled: boolean,
): number {
  assertMinor(principalFen);
  const rate = new D(annualRate);
  if (
    principalFen < 0 ||
    !rate.isFinite() ||
    rate.lt(0) ||
    !Number.isSafeInteger(days) ||
    days < 0 ||
    !Number.isSafeInteger(yearDays) ||
    yearDays <= 0
  )
    throw new RangeError('无效计息参数');
  return enabled ? toMinorUnits(new D(principalFen).div(100).mul(rate).mul(days).div(yearDays)) : 0;
}
export function collectionDueDay(shippedDay: number, termDays: number): number {
  if (
    !Number.isSafeInteger(shippedDay) ||
    shippedDay < 0 ||
    !Number.isSafeInteger(termDays) ||
    termDays < 0 ||
    !Number.isSafeInteger(shippedDay + termDays)
  )
    throw new RangeError('无效账期');
  return shippedDay + termDays;
}
