import { quoteInputSchema } from '../../domain/schemas/economy';
import type { QuoteInput, NumericResult } from '../../domain/types';
import { D, NumericFault, checked, bounded } from './decimal';
type TaxInput = Pick<
  QuoteInput,
  'taxInclusiveUnitCny' | 'vatRate' | 'rebateRate' | 'rebateEligible'
>;
const schema = quoteInputSchema.pick({
  taxInclusiveUnitCny: true,
  vatRate: true,
  rebateRate: true,
  rebateEligible: true,
});
/** F01：预计退税不是现金；本项目仅使用外贸企业采购含税价教学模型。 */
export function rebate(input: TaxInput): InstanceType<typeof D> {
  if (new D(input.rebateRate).gt(input.vatRate))
    throw new NumericFault('INVALID_RATE', 'rebateRate');
  return input.rebateEligible
    ? new D(input.taxInclusiveUnitCny).div(new D(1).plus(input.vatRate)).mul(input.rebateRate)
    : new D(0);
}
export function calculateRebate(input: TaxInput): NumericResult<string> {
  return checked(schema, input, (value) => bounded(rebate(value)));
}
