import type { StoryNode, GameSnapshot } from '../../domain/types';
import { notImplemented } from '../../app/notImplemented';
/** 占位签名，本阶段不执行任何关卡或数值规则。 */
export function canEnterNode(_node: StoryNode, _snapshot: GameSnapshot): boolean {
  return notImplemented('canEnterNode');
}
