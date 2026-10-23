import type { ContentPack, Effect } from '../domain/types';
import { D } from '../engine/economy/decimal';
import { teachingText } from './teachingText';

export function validateNegotiationContent(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
): void {
  const data = pack.negotiation;
  if (!data) {
    issue('/negotiation', '第 4 关缺少谈判配置');
    return;
  }
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (
    data.profiles.length !== 5 ||
    !unique(data.profiles.map((p) => p.customerId)) ||
    pack.customers.some((c) => !data.profiles.some((p) => p.customerId === c.id))
  )
    issue('/negotiation/profiles', '五位客户均须有独立谈判文案');
  if (data.offers.length < 3 || !unique(data.offers.map((o) => o.id)))
    issue('/negotiation/offers', '议价方案缺失或重复');
  if (data.payments.length !== 3 || !unique(data.payments.map((p) => p.id)))
    issue('/negotiation/payments', '需要三种不同付款方式');
  if (data.terms.length !== 3 || !unique(data.terms.map((t) => t.id)))
    issue('/negotiation/terms', '需要三个不同贸易术语');
  if (!unique(data.checklist.map((c) => c.id)))
    issue('/negotiation/checklist', '合同核对项不能重复');
  const numeric = (id: string, max?: number, positive = false, inclusive = false) => {
    try {
      const v = new D(String(pack.parameters[id]!.value));
      if (
        !v.isFinite() ||
        v.lt(0) ||
        (positive && v.lte(0)) ||
        (max !== undefined && (inclusive ? v.gt(max) : v.gte(max)))
      )
        throw new Error('range');
    } catch {
      issue('/parameters/' + id, '谈判参数缺失或超出范围');
    }
  };
  for (const p of data.profiles) numeric(p.openingDiscountParam, 1);
  for (const o of data.offers) {
    numeric(o.quantityRatioParam, 10, true);
    if (o.discountParam) numeric(o.discountParam, 1);
    numeric(o.depositRatioParam, 1, false, true);
  }
  for (const t of data.terms)
    if (
      typeof pack.parameters[t.placeParam]?.value !== 'string' ||
      !String(pack.parameters[t.placeParam]?.value).trim()
    )
      issue('/negotiation/terms', '术语必须引用明确命名地点');
  for (const key of [
    'factoryUnitCost',
    'lcFixedFee',
    'lcRate',
    'oaFee',
    'lcAmendFee',
    'fraudAdvanceFee',
  ])
    numeric(key);
  for (const key of [
    'oaDays',
    'contractDeliveryDays',
    'negotiationDeliveryDay',
    'collectionLagDays',
    'rebateLagDays',
  ]) {
    const value = pack.parameters[key]?.value;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365)
      issue('/parameters/' + key, '教学期限须为 1–365 的整数');
  }
  if (
    Number(pack.parameters.negotiationDeliveryDay?.value) >
    Number(pack.parameters.contractDeliveryDays?.value)
  )
    issue('/parameters/negotiationDeliveryDay', '稳妥计划交付日不能晚于约定交期');
  const copies = [
    ...data.profiles.flatMap((p) => [p.pricePrompt, p.paymentPrompt, p.termsPrompt]),
    ...data.payments.map((p) => p.explanation),
    ...data.terms.map((t) => t.explanation),
    ...data.checklist.map((c) => c.label),
  ];
  for (const copy of copies)
    try {
      teachingText(copy, pack);
    } catch {
      issue('/negotiation', '谈判文案引用了未声明参数');
    }
}

export function validateNegotiationRule(
  effect: Extract<Effect, { op: 'rule' }>,
  pack: ContentPack,
  path: string,
  issue: (path: string, message: string) => void,
): boolean {
  const enums: Record<string, { key: string; values: string[] }> = {
    'negotiation.offer': {
      key: 'offerId',
      values: pack.negotiation?.offers.map((o) => o.id) ?? [],
    },
    'negotiation.payment': { key: 'payment', values: ['TT', 'LC_SIGHT', 'OA_60'] },
    'negotiation.terms': { key: 'incoterm', values: ['EXW', 'FOB', 'CIF'] },
    'ledger.preparationExpense': { key: 'parameterId', values: ['lcAmendFee', 'fraudAdvanceFee'] },
  };
  const spec = enums[effect.ruleId];
  if (spec) {
    const argument = effect.args[spec.key];
    if (argument?.kind !== 'literal' || !spec.values.includes(String(argument.value)))
      issue(path, '第 4 关规则参数不合法');
    return true;
  }
  return ['contract.sign', 'negotiation.cancel'].includes(effect.ruleId);
}
