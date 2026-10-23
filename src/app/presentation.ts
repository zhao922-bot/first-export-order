import type { ActorId, Presentation } from '../domain/schemas/presentation';

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
