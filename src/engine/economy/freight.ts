import { freightInputSchema } from '../../domain/schemas/economy';
import type { FreightInput, FreightResult, NumericResult } from '../../domain/types';
import { D, checked, bounded, NumericFault } from './decimal';
/** F05：体积或重量任一触顶都须增加柜数。 */
export function calculateFreight(input: FreightInput): NumericResult<FreightResult> {
  return checked(freightInputSchema, input, (v) => {
    if (new D(v.usableCbm).lte(0) || new D(v.usableWeightKg).lte(0))
      throw new NumericFault('OUT_OF_RANGE', 'capacity');
    const count = D.max(
      new D(v.totalCbm).div(v.usableCbm),
      new D(v.totalWeightKg).div(v.usableWeightKg),
    ).ceil();
    if (count.lte(0) || count.gt(Number.MAX_SAFE_INTEGER))
      throw new NumericFault('OUT_OF_RANGE', 'containerCount');
    const total = count.mul(v.containerRateUsd).plus(v.surchargesUsd);
    return {
      containerCount: count.toNumber(),
      totalUsd: bounded(total),
      unitUsd: bounded(total.div(v.quantity)),
    };
  });
}
