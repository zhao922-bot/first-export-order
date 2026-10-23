import raw from './presentation.json';
import { presentationSchema } from '../domain/schemas/presentation';
import type { ContentPack } from '../domain/types';

export function parsePresentation(input: unknown, packs: readonly ContentPack[]) {
  const data = presentationSchema.parse(input);
  const people = packs.flatMap((p) => [...p.customers, ...(p.mentor ? [p.mentor] : [])]);
  for (const actor of data.actors) {
    if (!people.some((p) => p.id === actor.id && p.name === actor.name))
      throw new Error(`演出角色 ${actor.id} 与剧情人物不一致`);
  }
  return data;
}
export const presentation = presentationSchema.parse(raw);
