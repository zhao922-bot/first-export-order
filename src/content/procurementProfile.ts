import type { ContentPack, Effect } from '../domain/types';
import { piFieldIds, inspectionItemIds } from '../domain/schemas/procurement';
import { D } from '../engine/economy/decimal';
import { teachingText } from './teachingText';
const allowed = new Set([
  'procurement.acceptPi',
  'procurement.verifyFunding',
  'procurement.repairLc',
  'procurement.payDeposit',
  'procurement.produce',
  'procurement.inspect',
  'procurement.resolve',
  'procurement.acceptInspection',
  'procurement.payBalance',
  'procurement.cancel',
]);
export function validateProcurementRule(
  effect: Extract<Effect, { op: 'rule' }>,
  path: string,
  issue: (path: string, message: string) => void,
): boolean {
  if (!allowed.has(effect.ruleId)) return false;
  if (
    effect.ruleId === 'procurement.resolve' &&
    (effect.args.resolution?.kind !== 'literal' ||
      !['rework', 'supplement'].includes(String(effect.args.resolution.value)))
  )
    issue(path, '未知验货处置方式');
  return true;
}
export function validateProcurementContent(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
): void {
  const config = pack.procurement;
  if (!config) {
    issue('/procurement', '第 5 关缺少备货与验货配置');
    return;
  }
  const covers = (actual: string[], expected: readonly string[]) =>
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((id) => actual.includes(id));
  if (
    !covers(
      config.piFields.map((f) => f.id),
      piFieldIds,
    )
  )
    issue('/procurement/piFields', 'PI 必须完整覆盖七类关键字段且不能重复');
  if (new Set(config.fundingChecks.map((f) => f.id)).size !== config.fundingChecks.length)
    issue('/procurement/fundingChecks', '资金核验项不能重复');
  if (
    !covers(
      config.inspectionProfiles.map((p) => p.productId),
      pack.products.map((p) => p.id),
    )
  )
    issue('/procurement/inspectionProfiles', '每个产品必须有独立验货证据');
  for (const profile of config.inspectionProfiles)
    if (
      !covers(
        profile.items.map((i) => i.id),
        inspectionItemIds,
      )
    )
      issue('/procurement/inspectionProfiles', '验货证据必须完整覆盖材质、数量、规格、包装、凭证');
  for (const id of [
    config.productionDaysParam,
    config.delayDaysParam,
    config.reworkDaysParam,
    config.supplementDaysParam,
    config.lcValidityDaysParam,
    config.lcRepairDaysParam,
  ]) {
    const v = pack.parameters[id]?.value;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 365)
      issue('/parameters/' + id, '准备天数必须为 1–365 整数');
  }
  for (const [id, ratio] of [
    [config.reworkFeeParam, false],
    [config.supplementFeeParam, false],
    [config.refundBeforeProductionParam, true],
    [config.refundAfterProductionParam, true],
  ] as const) {
    try {
      const v = new D(String(pack.parameters[id]!.value));
      if (!v.isFinite() || v.lt(0) || v.gt(ratio ? 1 : 1000000)) throw new Error('range');
    } catch {
      issue('/parameters/' + id, '缺失或无效的备货费用/退款比例');
    }
  }
  const copies = [
    ...config.piFields.map((f) => f.label),
    ...config.fundingChecks.map((f) => f.label),
    ...Object.values(config.fundingEvidence),
    ...Object.values(config.fundingMessages),
    ...config.inspectionProfiles.flatMap((p) => p.items.flatMap((i) => [i.label, i.good, i.bad])),
  ];
  for (const copy of copies)
    try {
      teachingText(copy, pack);
    } catch {
      issue('/procurement', '文案引用了未声明参数或格式');
    }
}
