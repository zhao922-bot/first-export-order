import type { ContentPack } from '../../domain/types';
import type { SliceSession } from './session';
import type { SliceCommand } from './reducer';
import { collectionAction } from './collection';
import { logisticsAction } from './logistics';

type TextAction = Extract<
  SliceCommand['action'],
  { type: 'draft' | 'correctDocument' | 'editDeclaration' }
>;
/** Text-only projection of the reducer. Copy only paths these existing domain
 * handlers may change; the repository still validates the entire saved game.
 * No choice, journal, time, RNG or rescue action can enter this path.
 */
export function applyTextDraft(
  original: SliceSession,
  pack: ContentPack,
  id: string,
  action: TextAction,
): SliceSession {
  if (original.snapshot.story.appliedCommandIds.includes(id)) return original;
  if (original.rescue?.pending) throw new RangeError('请先完成救援检查点交互');
  if (original.ending) throw new RangeError('本单已结算，不能修改经营草稿');
  const s: SliceSession = {
    ...original,
    snapshot: {
      ...original.snapshot,
      order: { ...original.snapshot.order, flags: { ...original.snapshot.order.flags } },
      story: {
        ...original.snapshot.story,
        appliedCommandIds: [...original.snapshot.story.appliedCommandIds, id],
      },
      revision: original.snapshot.revision + 1,
    },
  };
  if (action.type === 'draft') {
    const allowed = ['rebateUnitCny', 'fobCostUnitCny', 'rateBasis', 'fobUnitUsd', 'cifUnitUsd'];
    if (
      Object.entries(action.answers).some(
        ([key, value]) => !allowed.includes(key) || typeof value !== 'string' || value.length > 100,
      )
    )
      throw new RangeError('报价草稿字段无效');
    s.answers = { ...action.answers };
  } else if (action.type === 'correctDocument') {
    s.collection = original.collection
      ? { ...original.collection, corrections: { ...original.collection.corrections } }
      : null;
    collectionAction(s, pack, action);
  } else {
    s.logistics = original.logistics
      ? {
          ...original.logistics,
          declarationDraft: { ...original.logistics.declarationDraft },
          declarationChecks: [...original.logistics.declarationChecks],
        }
      : null;
    logisticsAction(s, pack, action);
  }
  return s;
}
