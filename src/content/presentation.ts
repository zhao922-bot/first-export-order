import raw from './presentation.json';
import { presentationSchema } from '../domain/schemas/presentation';
import type { ContentPack } from '../domain/types';

export function parsePresentation(input: unknown, packs: readonly ContentPack[]) {
  const data = presentationSchema.parse(input);
  const people = packs.flatMap((p) => [...p.customers, ...(p.mentor ? [p.mentor] : [])]);
  for (const nodeId of Object.keys(data.mentor.nodeCues)) {
    if (!packs.some((pack) => pack.nodes.some((node) => node.id === nodeId)))
      throw new Error(`表情节点 ${nodeId} 不存在于剧情中`);
  }
  for (const actor of data.actors) {
    if (!people.some((p) => p.id === actor.id && p.name === actor.name))
      throw new Error(`演出角色 ${actor.id} 与剧情人物不一致`);
  }
  for (const workspace of data.workspaces) {
    for (const phase of workspace.phases) {
      for (const nodeId of phase.nodeIds) {
        const node = packs.flatMap((pack) => pack.nodes).find((node) => node.id === nodeId);
        if (!node || node.stage !== workspace.stage || node.type === 'review')
          throw new Error(`工作台节点 ${nodeId} 不存在或不属于本关操作`);
      }
    }
  }
  const mapped = new Set(data.workspaces.flatMap((w) => w.phases.flatMap((p) => p.nodeIds)));
  for (const node of packs.flatMap((pack) => pack.nodes)) {
    if (/^L0[2-7]\./.test(node.id) && node.type !== 'review' && !mapped.has(node.id))
      throw new Error(`工作台缺少操作节点 ${node.id}`);
  }
  return data;
}
export const presentation = presentationSchema.parse(raw);
