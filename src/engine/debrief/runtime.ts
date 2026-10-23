import type { ContentPack, DecisionRecord, ScoringConfig } from '../../domain/types';
import type { SliceSession } from '../slice/session';
import { resolveEnding, requiresRecovery } from '../economy/ending';
import { clamp } from '../economy/score';

export function debriefScoring(pack: ContentPack): ScoringConfig {
  if (!pack.debrief) throw new RangeError('缺少结局评分配置');
  return { ...pack.debrief.scoring, rubrics: pack.rubrics };
}
export function decisionEvidence(
  session: SliceSession,
  pack: ContentPack,
  nodeId: string,
  choiceId: string,
): DecisionRecord['evidence'] {
  return (pack.debrief?.assessments ?? [])
    .filter((a) => a.nodeIds.includes(nodeId) && a.choiceIds.includes(choiceId))
    .map((a) => {
      const rubric = pack.rubrics.find((r) => r.id === a.rubricId)!;
      const previous = session.snapshot.story.decisionLog
        .flatMap((d) => d.evidence)
        .filter(
          (e) =>
            pack.rubrics.find((r) => r.id === e.rubricId)?.opportunityId === rubric.opportunityId,
        );
      const correct =
        a.correctChoiceIds.includes(choiceId) &&
        (!a.successFlag || session.snapshot.order.flags[a.successFlag] === true);
      const guided = previous.length > 0 || (nodeId.startsWith('L03.') && session.guided);
      const earned = correct ? (guided ? 1 : rubric.maxPoints) : 0;
      // 同一机会只发一次信誉奖励，纠错后的奖励也封顶为一分。
      if (earned && !previous.some((e) => e.earned > 0))
        session.snapshot.player.reputation = clamp(
          session.snapshot.player.reputation + Math.min(a.reputationReward, earned),
          0,
          100,
        );
      return { rubricId: rubric.id, earned, possible: rubric.maxPoints };
    });
}
export function touchTerms(session: SliceSession, pack: ContentPack, nodeId: string): void {
  for (const term of pack.glossary.filter((t) => t.triggerNodeIds.includes(nodeId))) {
    if (!session.snapshot.player.learnedTermIds.includes(term.id))
      session.snapshot.player.learnedTermIds.push(term.id);
  }
}
export type LearningAction =
  { type: 'openTerm'; termId: string } | { type: 'answerTerm'; termId: string; answerId: string };
export function learn(session: SliceSession, pack: ContentPack, action: LearningAction): void {
  if (!pack.glossary.some((t) => t.id === action.termId)) throw new RangeError('词条不存在');
  const p = session.snapshot.player;
  if (action.type === 'answerTerm') {
    const quiz = pack.debrief?.quizzes.find((q) => q.termId === action.termId);
    if (!quiz || !quiz.options.some((o) => o.id === action.answerId))
      throw new RangeError('复习题选项不存在');
    session.learning.answers[action.termId] = action.answerId;
    if (action.answerId === quiz.answerId && !p.masteredTermIds.includes(action.termId)) {
      p.masteredTermIds.push(action.termId);
      session.learning.events.push({
        type: 'term_mastered',
        termId: action.termId,
        revision: session.snapshot.revision + 1,
      });
    }
  } else if (
    !session.learning.events.some((e) => e.type === 'term_opened' && e.termId === action.termId)
  ) {
    session.learning.events.push({
      type: 'term_opened',
      termId: action.termId,
      revision: session.snapshot.revision + 1,
    });
  }
  if (!p.learnedTermIds.includes(action.termId)) p.learnedTermIds.push(action.termId);
}
/** 结局只在实际终止/收汇结算节点冻结；练习退出与中途暂停不结算。 */
export function freezeEnding(session: SliceSession, pack: ContentPack): void {
  if (session.ending || !pack.debrief?.terminalNodeIds.includes(session.snapshot.story.nodeId))
    return;
  if (requiresRecovery(session.snapshot)) return;
  session.ending = {
    result: resolveEnding(session.snapshot, debriefScoring(pack)),
    revision: session.snapshot.revision + 1,
    nodeId: session.snapshot.story.nodeId,
    reputation: session.snapshot.player.reputation,
    gameDay: session.snapshot.gameDay,
  };
}
/** 补学可增加词条记录；冻结后的经营与评分证据必须仍一致。 */
export function validateFrozenEnding(session: SliceSession, pack: ContentPack): void {
  const frozen = session.ending;
  if (!frozen) {
    if (
      pack.debrief?.terminalNodeIds.includes(session.snapshot.story.nodeId) &&
      !requiresRecovery(session.snapshot)
    )
      throw new RangeError('结算节点缺少冻结结果');
    return;
  }
  if (
    !pack.debrief?.terminalNodeIds.includes(frozen.nodeId) ||
    frozen.nodeId !== session.snapshot.story.nodeId ||
    frozen.revision > session.snapshot.revision ||
    frozen.gameDay !== session.snapshot.gameDay ||
    frozen.reputation !== session.snapshot.player.reputation
  )
    throw new RangeError('冻结结算与经营状态不一致');
  const actual = resolveEnding(session.snapshot, debriefScoring(pack));
  actual.learnedTermIds = frozen.result.learnedTermIds;
  actual.masteredTermIds = frozen.result.masteredTermIds;
  if (JSON.stringify(actual) !== JSON.stringify(frozen.result))
    throw new RangeError('冻结结算与账本或评分证据不一致');
}
