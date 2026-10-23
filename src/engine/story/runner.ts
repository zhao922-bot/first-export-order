import type { GameSnapshot, GameCommand, ContentPack, TransitionResult } from '../../domain/types';
import { notImplemented } from '../../app/notImplemented';
/** 占位签名，本阶段不执行任何关卡或数值规则。 */
export function advanceNode(
  _snapshot: GameSnapshot,
  _command: GameCommand,
  _content: ContentPack,
): TransitionResult {
  return notImplemented('advanceNode');
}
