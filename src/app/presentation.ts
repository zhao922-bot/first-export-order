import type { ActorId, Presentation, MentorCue } from '../domain/schemas/presentation';
import type { SliceSession } from '../engine/slice/session';
import type { DeepReadonly } from 'vue';

/** Prefer the delivery encoding; retain lossless expression and identity fallbacks. */
export function portraitCandidates(data: Presentation, source: string) {
  return [...new Set([source, data.atlas])].flatMap((png) => {
    const optimized = data.optimizedAtlases.find((a) => a.source === png);
    return [
      ...(optimized
        ? [
            { source: png, url: optimized.delivery },
            { source: png, url: optimized.webp },
          ]
        : []),
      { source: png, url: png },
    ];
  });
}

export function taskLabel(data: Presentation, feedback: boolean, review: boolean) {
  return feedback
    ? data.experience.feedback
    : review
      ? data.experience.review
      : data.experience.task;
}

/** Pure presentation mapping. No score, RNG, clock or business command is used. */
export function mentorCue(
  data: Presentation,
  context: { nodeId: string; feedback: boolean; review: boolean; event: boolean; risk?: boolean },
): MentorCue {
  if (context.event) return 'event';
  if (context.feedback) return context.risk ? 'correcting' : 'feedback';
  return (
    data.mentor.nodeCues[context.nodeId] ??
    workspacePhase(data, context.nodeId)?.phase.cue ??
    (context.review ? 'review' : 'default')
  );
}

export function workspacePhase(data: Presentation, nodeId: string) {
  for (const workspace of data.workspaces) {
    const index = workspace.phases.findIndex((phase) => phase.nodeIds.includes(nodeId));
    if (index >= 0) return { workspace, phase: workspace.phases[index]!, index };
  }
  return null;
}

/** Only the current recorded decision may supply a receipt. Opening it cannot post money or draw RNG. */
export function decisionReceipt(data: Presentation, session: DeepReadonly<SliceSession>) {
  const { story, order } = session.snapshot;
  const decision = story.decisionLog.at(-1);
  const workspace = data.workspaces.find((item) => item.stage === story.stage);
  if (
    !workspace ||
    !session.feedback ||
    !decision ||
    decision.nodeId !== story.nodeId ||
    decision.consequenceText !== session.feedback.text
  )
    return null;
  const event = Boolean(story.pendingEvent);
  return {
    title: event ? data.receipt.eventTitle : workspace.receiptTitle,
    note: event ? data.receipt.eventNote : workspace.receiptNote,
    scene: data.stages.find((stage) => stage.stage === story.stage)!.scene,
    sourceId: decision.id,
    status: data.receipt.orderStates[order.status],
    deltas: { ...decision.deltas },
  };
}
export function mentorExpression(data: Presentation, cue: MentorCue) {
  return data.mentor.expressions.find((expression) => expression.id === data.mentor.cues[cue])!;
}

export function sampleStep(cue: MentorCue): number | null {
  return cue === 'product' ? 0 : cue === 'supplier' ? 1 : cue === 'verify' ? 2 : null;
}

/** 只读演出选择；不接收命令入口、RNG 或可变经营状态。未知联络人不冒用已知客户。 */
export function sceneActor(
  data: Presentation,
  context: {
    stage: number;
    mentor: boolean;
    sender?: string | undefined;
    customerId?: string | null | undefined;
  },
): ActorId | null {
  if (context.mentor) return 'mentor_lin';
  if (context.stage === 2 && context.sender)
    return data.actors.find((a) => a.id !== 'mentor_lin' && a.name === context.sender)?.id ?? null;
  if (context.stage === 4 && context.customerId)
    return data.actors.find((a) => a.id === context.customerId)?.id ?? null;
  return 'mentor_lin';
}

export const motionKey = 'first-export.presentation.motion.v1';
export type MotionPreference = 'system' | 'off';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export function readMotion(storage: () => StoragePort): MotionPreference {
  try {
    return storage().getItem(motionKey) === 'off' ? 'off' : 'system';
  } catch {
    return 'system';
  }
}
export function writeMotion(storage: () => StoragePort, preference: MotionPreference) {
  try {
    storage().setItem(motionKey, preference);
    return true;
  } catch {
    return false;
  }
}
export function motionAllowed(preference: MotionPreference, reduced: boolean) {
  return preference !== 'off' && !reduced;
}
