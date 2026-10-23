import { D, assertMinor, toMinorUnits } from './decimal';
import { transfer, type Posting } from './ledger';
/** F12：到账本金冲应收，仅汇兑差额进损益。手续费单列费用。 */
export function calculateCollection(
  usdCent: number,
  fxCnyPerUsd: string,
  receivableBookFen: number,
  bankFeeFen: number,
): { cashFen: number; exchangeGainFen: number; postings: Posting[] } {
  [usdCent, receivableBookFen, bankFeeFen].forEach(assertMinor);
  const rate = new D(fxCnyPerUsd);
  if (usdCent < 0 || receivableBookFen < 0 || bankFeeFen < 0 || !rate.isFinite() || rate.lte(0))
    throw new RangeError('收汇参数无效');
  const gross = toMinorUnits(new D(usdCent).div(100).mul(rate));
  const gain = gross - receivableBookFen;
  return {
    cashFen: gross - bankFeeFen,
    exchangeGainFen: gain,
    postings: [
      ...transfer('cash', 'receivable', receivableBookFen),
      ...(gain >= 0 ? transfer('cash', 'expense', gain) : transfer('expense', 'cash', -gain)),
      ...transfer('expense', 'cash', bankFeeFen),
    ],
  };
}
