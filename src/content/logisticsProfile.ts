import type { ContentPack, Effect } from '../domain/types';
import { declarationIds } from '../domain/schemas/logistics';
import { D } from '../engine/economy/decimal';
import { teachingText } from './teachingText';
const rules = new Set([
  'logistics.plan',
  'logistics.insurance',
  'logistics.declaration',
  'logistics.book',
  'logistics.dispatch',
  'logistics.resolve',
  'logistics.deliver',
  'logistics.hold',
]);
export function validateLogisticsRule(
  effect: Extract<Effect, { op: 'rule' }>,
  pack: ContentPack,
  path: string,
  issue: (path: string, message: string) => void,
): boolean {
  if (!rules.has(effect.ruleId)) return false;
  const allowed =
    effect.ruleId === 'logistics.plan'
      ? pack.forwarders.map((p) => p.id)
      : effect.ruleId === 'logistics.insurance'
        ? ['basic', 'extended', 'buyer']
        : effect.ruleId === 'logistics.resolve'
          ? ['standard', 'expedite', 'wait', 'priority']
          : null;
  const key =
    effect.ruleId === 'logistics.plan'
      ? 'forwarderId'
      : effect.ruleId === 'logistics.insurance'
        ? 'insurance'
        : 'resolution';
  if (
    allowed &&
    (effect.args[key]?.kind !== 'literal' || !allowed.includes(String(effect.args[key].value)))
  )
    issue(path, '未知物流方案或处置');
  return true;
}
export function validateLogisticsContent(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
): void {
  const c = pack.logistics;
  if (!c) {
    issue('/logistics', '第 6 关缺少物流配置');
    return;
  }
  const covers = (a: string[], b: readonly string[]) =>
    a.length === b.length && new Set(a).size === a.length && b.every((v) => a.includes(v));
  if (
    pack.forwarders.length !== 3 ||
    !covers(
      c.plans.map((p) => p.forwarderId),
      pack.forwarders.map((p) => p.id),
    )
  )
    issue('/logistics/plans', '三家货代必须分别配置');
  if (
    !covers(
      c.declarationFields.map((f) => f.id),
      declarationIds,
    )
  )
    issue('/logistics/declarationFields', '六类核心字段须唯一完整');
  const value = (id: string, min: number, max: number, integer = false) => {
    try {
      const n = new D(String(pack.parameters[id]!.value));
      if (!n.isFinite() || n.lt(min) || n.gt(max) || (integer && !n.isInteger()))
        throw new Error('range');
      return n;
    } catch {
      issue('/parameters/' + id, '缺失或越界的物流参数');
      return new D(0);
    }
  };
  value(c.capacityCbmParam, 1, 1000);
  value('quote_oceanTotalUsd', 0.01, 100000000);
  value(c.capacityKgParam, 1, 100000);
  value(c.cartonTareKgParam, 0, 50);
  value(c.extendedRateParam, 0, 0.1);
  for (const id of [
    c.preparationDaysParam,
    c.nextSailingDaysParam,
    c.customsDaysParam,
    c.expeditedDaysParam,
    c.rolloverDaysParam,
    c.priorityDaysParam,
  ])
    value(id, 1, 365, true);
  if (value(c.expeditedDaysParam, 1, 365).gt(value(c.customsDaysParam, 1, 365)))
    issue('/logistics', '加急不能比常规查验更慢，且不得免除法定查验');
  for (const id of [
    c.customsFeeParam,
    c.expeditedFeeParam,
    c.storageFeeParam,
    c.priorityOceanFeeParam,
    c.priorityCoordinationFeeParam,
    c.dailyPenaltyParam,
  ])
    value(id, 0, 1000000);
  value(c.dailyReputationParam, 0, 10, true);
  for (const p of c.plans) {
    value(p.domesticRatioParam, 0, 10);
    value(p.surchargeParam, 0, 1000000);
    if (
      value(p.customsRiskParam, 0, 1)
        .plus(value(p.rolloverRiskParam, 0, 1))
        .gt(1)
    )
      issue('/logistics/plans', '互斥查验和甩柜概率之和不得超过 1');
  }
  for (const f of pack.forwarders) {
    value(f.priceParam, 0, 1000000);
    if (f.cutoffDay >= f.sailingDay || f.sailingDay > 365 || f.transitDays > 365)
      issue('/forwarders', '截关须早于船期，天数不超过 365');
  }
  for (const product of pack.products)
    if (new D(product.cartonCbm).lte(0) || new D(product.weightKg).lte(0))
      issue('/products', '物流产品体积和重量必须大于零');
  for (const copy of [
    ...c.plans.map((p) => p.description),
    ...c.declarationFields.map((f) => f.label),
    ...Object.values(c.responsibilities),
    ...Object.values(c.riskCopy),
    ...Object.values(c.insuranceCopy),
  ]) {
    try {
      teachingText(copy, pack);
    } catch {
      issue('/logistics', '文案引用了未声明参数或格式');
    }
  }
}
