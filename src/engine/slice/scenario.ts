import type { ContentPack, QuoteInput, GameSnapshot } from '../../domain/types';
import { quoteInputSchema } from '../../domain/schemas/economy';
import { D, toMinorUnits } from '../economy/decimal';
import { nextRandom } from '../story/rng';
export function quoteScenario(
  pack: ContentPack,
  supplierId: string | null,
  variant = 0,
  availableCashFen = toMinorUnits(String(pack.parameters.initialCash!.value)),
): QuoteInput {
  const values = Object.fromEntries(
    Object.entries(pack.parameters)
      .filter(([key]) => key.startsWith('quote_'))
      .map(([key, p]) => [key.slice(6), p.value]),
  );
  const base = quoteInputSchema.parse(values);
  const input = { ...base };
  let moq = 1;
  if (supplierId !== null) {
    const supplier = pack.suppliers.find((s) => s.id === supplierId)!;
    const product = pack.products.find((p) => p.id === supplier.productId)!;
    moq = supplier.moq;
    Object.assign(input, {
      quantity: Number(pack.parameters[product.id + '_quantity']!.value),
      taxInclusiveUnitCny: String(pack.parameters[supplier.taxInclusiveUnitPriceParam]!.value),
      vatRate: String(pack.parameters[product.vatRateParam]!.value),
      rebateRate: String(pack.parameters[product.rebateRateParam]!.value),
      rebateEligible: supplier.credentials.every((c) => c.status === 'verified'),
    });
  }
  if (variant !== 0) {
    if (![1, 2, 3].includes(variant)) throw new RangeError('不存在的参数组');
    input.quantity = Math.max(
      moq,
      new D(input.quantity)
        .mul(String(pack.parameters['variant' + variant + '_quantityRatio']!.value))
        .floor()
        .toNumber(),
    );
    input.fxCnyPerUsd = String(pack.parameters['variant' + variant + '_fx']!.value);
    input.oceanTotalUsd = String(pack.parameters['variant' + variant + '_ocean']!.value);
    if (supplierId !== null) {
      const reserve = new D(String(pack.parameters.bankFee!.value)).plus(
        String(pack.parameters.sampleFee!.value),
      );
      const maximum = new D(availableCashFen)
        .div(100)
        .minus(reserve)
        .div(new D(input.taxInclusiveUnitCny).plus(new D(base.domesticTotalCny).div(base.quantity)))
        .floor()
        .toNumber();
      if (maximum < moq) throw new RangeError('现有资金无法覆盖 MOQ，请更换供应商');
      input.quantity = Math.min(input.quantity, maximum);
    }
  }
  input.domesticTotalCny = new D(base.domesticTotalCny)
    .div(base.quantity)
    .mul(input.quantity)
    .toFixed(2);
  return quoteInputSchema.parse(input);
}
export function sampleQuoteScenario(pack: ContentPack, state: GameSnapshot): QuoteInput {
  const draw = nextRandom(state.story.rngState.parameters);
  const variant = 1 + Math.floor(draw.value * 3);
  const input = quoteScenario(pack, state.order.supplierId, variant, state.player.cashCnyFen);
  state.story.rngState.parameters = draw.state;
  state.story.drawCount++;
  state.story.sampledParameters = {
    ...state.story.sampledParameters,
    variant,
    destination: String(pack.parameters['variant' + variant + '_port']!.value),
    quantity: input.quantity,
    fxCnyPerUsd: input.fxCnyPerUsd,
    oceanTotalUsd: input.oceanTotalUsd,
  };
  return input;
}
