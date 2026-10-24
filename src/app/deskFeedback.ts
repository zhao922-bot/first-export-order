import type { SliceSession } from '../engine/slice/session';
import type { ContentPack } from '../domain/types';
import { dispatchSlice, type RescueAction } from '../engine/slice/rescue';
import type { SliceAction } from '../engine/slice/reducer';

/** One business action plus its acknowledgement, committed together by the caller.
 * Reviews, corrections, events and rescue decisions are never auto-selected.
 */
export function deskAction(
  source: SliceSession,
  pack: ContentPack,
  action: SliceAction | RescueAction,
  id: string,
) {
  const decision = dispatchSlice(source, pack, { id, revision: source.snapshot.revision, action });
  const next =
    decision.feedback &&
    (action.type === 'choose' || action.type === 'submit') &&
    !decision.rescue?.pending
      ? dispatchSlice(decision, pack, {
          id: id + '.ack',
          revision: decision.snapshot.revision,
          action: { type: 'advance' },
        })
      : decision;
  return { decision, next };
}

export interface DeskFeedback {
  id: string;
  text: string;
  deltas: {
    cashCnyFen: number;
    profitCnyFen: number;
    reputation: number;
    trust: number;
    days: number;
  };
}
