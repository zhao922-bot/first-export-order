import type { ContentPack, GameSnapshot, QuoteInput, CashflowItem } from '../../domain/types';
import { D, toMinorUnits } from '../economy/decimal';
import { calculateQuote, invoiceTotal } from '../economy/quote';
import { splitPayment, forecastCashflow } from '../economy/cashflow';
/** 报价通过后的 T/T 教学预览；所有项目均为预计，不落入真实账本。 */
export function buildQuoteCashflow(input: QuoteInput, state: GameSnapshot, pack: ContentPack) {
  const result = calculateQuote(input);
  if (!result.ok) throw new RangeError('无效报价预览');
  const invoice = invoiceTotal(result.value.fobUnitUsdQuoted, input.quantity);
  const customer = splitPayment(invoice, String(pack.parameters.customerDeposit!.value));
  const purchase = toMinorUnits(new D(input.taxInclusiveUnitCny).mul(input.quantity));
  const supplier = splitPayment(purchase, String(pack.parameters.deposit!.value));
  const convert = (cents: number) => toMinorUnits(new D(cents).div(100).mul(input.fxCnyPerUsd));
  const items: CashflowItem[] = [
    {
      id: 'customerDeposit',
      dueDay: state.gameDay,
      direction: 'in',
      amountCnyFen: convert(customer.deposit),
      certainty: 'forecast',
      sourceId: 'customerDeposit',
    },
    {
      id: 'supplierDeposit',
      dueDay: state.gameDay,
      direction: 'out',
      amountCnyFen: supplier.deposit,
      certainty: 'forecast',
      sourceId: 'supplierDeposit',
    },
    {
      id: 'supplierBalance',
      dueDay: state.gameDay + Number(pack.parameters.previewBalanceDay!.value),
      direction: 'out',
      amountCnyFen: supplier.balance,
      certainty: 'forecast',
      sourceId: 'supplierBalance',
    },
    {
      id: 'domestic',
      dueDay: state.gameDay + Number(pack.parameters.previewBalanceDay!.value),
      direction: 'out',
      amountCnyFen: toMinorUnits(input.domesticTotalCny),
      certainty: 'forecast',
      sourceId: 'domestic',
    },
    {
      id: 'bank',
      dueDay: state.gameDay + Number(pack.parameters.previewBalanceDay!.value),
      direction: 'out',
      amountCnyFen: toMinorUnits(String(pack.parameters.bankFee!.value)),
      certainty: 'forecast',
      sourceId: 'bank',
    },
    {
      id: 'customerBalance',
      dueDay: state.gameDay + Number(pack.parameters.previewCollectionDay!.value),
      direction: 'in',
      amountCnyFen: convert(customer.balance),
      certainty: 'forecast',
      sourceId: 'customerBalance',
    },
    {
      id: 'rebate',
      dueDay: state.gameDay + Number(pack.parameters.previewRebateDay!.value),
      direction: 'in',
      amountCnyFen: toMinorUnits(new D(result.value.rebateUnitCny).mul(input.quantity)),
      certainty: 'forecast',
      sourceId: 'rebate',
    },
  ];
  return forecastCashflow(state, items);
}
