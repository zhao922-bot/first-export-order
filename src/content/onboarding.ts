import { onboardingSchema } from '../domain/schemas/onboarding';
import type { ContentPack } from '../domain/types';

export function parseOnboarding(raw: unknown, packs: readonly ContentPack[]) {
  const data = onboardingSchema.parse(raw);
  const nodes = packs.flatMap((p) => p.nodes);
  for (const rule of data.rules) {
    if (rule.when.nodeIds?.some((id) => !nodes.some((n) => n.id === id)))
      throw new Error(`新手引导 ${rule.id} 引用了不存在的节点`);
    if (rule.when.tag && !nodes.some((n) => n.tags.includes(rule.when.tag!)))
      throw new Error(`新手引导 ${rule.id} 引用了不存在的标签`);
    if (rule.when.nodeType && !nodes.some((n) => n.type === rule.when.nodeType))
      throw new Error(`新手引导 ${rule.id} 引用了不存在的节点类型`);
  }
  return data;
}
