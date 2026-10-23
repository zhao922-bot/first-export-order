import type { ContentPack } from '../../domain/types';
import { accountBalance } from '../economy/ledger';
import { CashShortfall } from '../rules/cashShortfall';
import { reduceSlice, type SliceCommand } from './reducer';
import { sliceSessionSchema, type SliceSession } from './session';

export type RescueAction = {
  type: 'rescue';
  step: 'review' | 'use' | 'decline' | 'confirm' | 'back';
};
export type PlayCommand = Omit<SliceCommand, 'action'> & {
  action: SliceCommand['action'] | RescueAction;
};
/** 当前存档就是尚未提交的交易检查点；摘要绑定全部业务状态，不允许跨交易回滚。 */
export function checkpointDigest(s: SliceSession): string {
  const { rescue: _rescue, ...value } = structuredClone(s);
  value.snapshot.revision = 0;
  value.snapshot.story.appliedCommandIds = [];
  value.snapshot.rescueCheckpoint = null;
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
export function validateRescue(s: SliceSession, pack: ContentPack) {
  const p = s.rescue?.pending;
  if (!p) {
    if (s.snapshot.rescueCheckpoint) throw new RangeError('检查点缺失');
    return;
  }
  const node = pack.nodes.find((n) => n.id === p.nodeId);
  if (
    !pack.rescue ||
    s.ending ||
    s.feedback ||
    p.nodeId !== s.snapshot.story.nodeId ||
    s.snapshot.rescueCheckpoint?.checkpointId !== p.checkpointId ||
    s.snapshot.rescueCheckpoint.snapshotRevision >= s.snapshot.revision ||
    node?.type !== 'choice' ||
    !node.choices.some((c) => c.id === p.choiceId) ||
    p.digest !== checkpointDigest(s)
  )
    throw new RangeError('救援检查点与当前交易不匹配');
  if (
    p.reason === 'unverified_release' &&
    !pack.rescue.riskChoices.some((c) => c.nodeId === p.nodeId && c.choiceId === p.choiceId)
  )
    throw new RangeError('未知救援原因');
}
function commit(s: SliceSession, id: string) {
  s.snapshot.revision++;
  s.snapshot.story.appliedCommandIds.push(id);
  return sliceSessionSchema.parse(s);
}
/** 应用命令入口：事务试算不发布；救援阶段锁住业务命令，刷新只加载检查点。 */
export function dispatchSlice(
  original: SliceSession,
  pack: ContentPack,
  command: PlayCommand,
): SliceSession {
  if (original.snapshot.story.appliedCommandIds.includes(command.id)) return original;
  if (command.revision !== original.snapshot.revision) throw new RangeError('过期操作，请重试');
  validateRescue(original, pack);
  // Ordinary edits need only the reducer's clone. Rescue needs its own copy only
  // when opening/advancing a checkpoint, never on every keystroke.
  if (
    command.action.type !== 'rescue' &&
    !original.rescue?.pending &&
    (!pack.rescue || command.action.type !== 'choose' || original.feedback || original.ending)
  )
    return reduceSlice(original, pack, { ...command, action: command.action });
  const s = structuredClone(original),
    p = s.rescue?.pending;
  if (command.action.type === 'rescue') {
    if (!p) throw new RangeError('没有待处理救援');
    const step = command.action.step;
    if (step === 'review' && p.phase === 'consequence') p.phase = 'mentor';
    else if (step === 'decline' && p.phase === 'mentor') p.phase = 'confirm';
    else if (step === 'back' && p.phase === 'confirm') p.phase = 'mentor';
    else if (
      (step === 'use' && p.phase === 'mentor') ||
      (step === 'confirm' && p.phase === 'confirm')
    ) {
      const wasUsed = s.snapshot.player.rescueUsed;
      const outcome = step === 'confirm' ? 'declined' : wasUsed ? 'returned' : 'used';
      const firstMistake =
        !s.rescue!.history.some((h) => h.nodeId === p.nodeId && h.choiceId === p.choiceId) &&
        !(p.reason === 'unverified_release' && s.collection!.riskyAttempts > 0);
      s.snapshot.player.criticalMistakeCount += Number(firstMistake);
      s.snapshot.player.rescueUsed = true;
      s.rescue!.history.push({
        checkpointId: p.checkpointId,
        nodeId: p.nodeId,
        choiceId: p.choiceId,
        reason: p.reason,
        outcome,
      });
      s.rescue!.pending = null;
      s.snapshot.rescueCheckpoint = null;
      if (p.reason === 'unverified_release') {
        // 此次核验保护已交给检查点交互，不再由旧底层首错保护重复触发。
        s.collection!.riskyAttempts = Math.max(1, s.collection!.riskyAttempts);
        if (step === 'confirm')
          return reduceSlice(s, pack, {
            ...command,
            action: { type: 'choose', choiceId: p.choiceId },
          });
      } else if (
        step === 'confirm' &&
        !s
          .rescue!.history.slice(0, -1)
          .some(
            (h) => h.nodeId === p.nodeId && h.choiceId === p.choiceId && h.outcome === 'declined',
          )
      ) {
        // 无授信的失败付款仍不执行。拒绝是一次明确风险决定，不能造出借款或扣款。
        s.snapshot.player.criticalMistakeCount++;
      }
      return commit(s, command.id);
    } else throw new RangeError('请按后果、林姐复盘、确认的顺序操作');
    return commit(s, command.id);
  }
  if (p) throw new RangeError('请先完成救援检查点交互');
  const action = command.action;
  if (!pack.rescue || action.type !== 'choose' || s.feedback || s.ending)
    return reduceSlice(original, pack, { ...command, action });
  let reason: 'cash_shortfall' | 'unverified_release',
    gapFen = 0;
  try {
    const candidate = reduceSlice(original, pack, { ...command, action });
    if (
      pack.rescue.riskChoices.some(
        (c) => c.nodeId === s.snapshot.story.nodeId && c.choiceId === action.choiceId,
      )
    )
      reason = 'unverified_release';
    else return candidate;
  } catch (cause) {
    if (!(cause instanceof CashShortfall)) throw cause;
    reason = 'cash_shortfall';
    gapFen = cause.gapFen;
  }
  s.rescue ??= { pending: null, history: [] };
  s.rescue.pending = {
    checkpointId: command.id,
    nodeId: s.snapshot.story.nodeId,
    choiceId: action.choiceId,
    reason,
    phase: 'consequence',
    gapFen,
    lossFen:
      reason === 'unverified_release'
        ? Math.max(0, accountBalance(s.snapshot.journal, 'receivable'))
        : 0,
    digest: checkpointDigest(s),
  };
  s.snapshot.rescueCheckpoint = { checkpointId: command.id, snapshotRevision: s.snapshot.revision };
  return commit(s, command.id);
}
