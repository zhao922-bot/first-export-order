import type { JournalEntry, PlayerState } from '../../domain/types';
import { journalEntrySchema } from '../../domain/schemas/state';
import { assertMinor } from './decimal';
export type Posting = JournalEntry['postings'][number];
export type Account = Posting['account'];
export function validateJournal(entries: JournalEntry[]): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    journalEntrySchema.parse(entry);
    if (ids.has(entry.id)) throw new RangeError('重复 journal id');
    ids.add(entry.id);
    let balance = 0n;
    for (const p of entry.postings)
      balance += BigInt(p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen);
    if (balance !== 0n) throw new RangeError('借贷不平');
  }
}
/** 整个 commandId 事务幂等，单个事务可含多条 journal。 */
export function appendJournal(entries: JournalEntry[], batch: JournalEntry[]): JournalEntry[] {
  validateJournal(batch);
  const commands = new Set(entries.map((entry) => entry.commandId));
  const repeated = batch.filter((entry) => commands.has(entry.commandId));
  if (repeated.length === batch.length) return entries;
  if (repeated.length) throw new RangeError('事务只允许整体重放');
  const result = [...entries, ...batch];
  validateJournal(result);
  return result;
}
export function accountBalance(entries: JournalEntry[], account: Account): number {
  const balance = Number(
    entries
      .flatMap((entry) => entry.postings)
      .filter((p) => p.account === account)
      .reduce((sum, p) => sum + BigInt(p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen), 0n),
  );
  assertMinor(balance);
  return balance;
}
/** F10：资本不计利润，预付采购款不直接计费用。 */
export function projectLedger(
  entries: JournalEntry[],
): Pick<PlayerState, 'cashCnyFen' | 'cumulativeProfitCnyFen'> {
  validateJournal(entries);
  const cashCnyFen = accountBalance(entries, 'cash');
  const cumulativeProfitCnyFen =
    0 - accountBalance(entries, 'sales') - accountBalance(entries, 'expense');
  assertMinor(cumulativeProfitCnyFen);
  return { cashCnyFen, cumulativeProfitCnyFen };
}
export function transfer(debit: Account, credit: Account, amountCnyFen: number): Posting[] {
  assertMinor(amountCnyFen);
  if (amountCnyFen < 0) throw new RangeError('借贷金额不能为负');
  return [
    { account: debit, side: 'debit', amountCnyFen },
    { account: credit, side: 'credit', amountCnyFen },
  ];
}
/** F11：出货确认收入/销售成本；退税资格须经上游核验。 */
export function shipmentPostings(
  revenueFen: number,
  inventoryFen: number,
  expectedRebateFen: number,
  eligible: boolean,
): Posting[] {
  if (expectedRebateFen > inventoryFen) throw new RangeError('预计退税不能超过采购成本');
  if (!eligible && expectedRebateFen !== 0) throw new RangeError('无资格不能确认税款应收');
  return [
    ...transfer('receivable', 'sales', revenueFen),
    ...transfer('expense', 'inventory', inventoryFen),
    ...transfer('taxReceivable', 'expense', expectedRebateFen),
  ];
}
