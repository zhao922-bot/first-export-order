import type { GameSnapshot, ScoringConfig } from '../../domain/types';
export type EvidenceDimension = 'risk' | 'professionalism' | 'relationship' | 'compliance';

/** 同一机会的最后一次记录生效；返工最多一分。路线外的题不进入分母。 */
export function scoreEvidence(
  snapshot: GameSnapshot,
  config: ScoringConfig,
  name: EvidenceDimension,
) {
  const groups = new Map<string, ScoringConfig['rubrics']>();
  for (const rubric of config.rubrics.filter(
    (r) =>
      r.dimension === name &&
      (!r.paymentMethods ||
        (snapshot.order.payment !== null && r.paymentMethods.includes(snapshot.order.payment))),
  )) {
    const group = groups.get(rubric.opportunityId) ?? [];
    group.push(rubric);
    groups.set(rubric.opportunityId, group);
  }
  const evidence = snapshot.story.decisionLog.flatMap((d) => d.evidence);
  const opportunities = [...groups.entries()].flatMap(([id, group]) => {
    const marks = evidence.filter((e) => group.some((r) => r.id === e.rubricId));
    if (!group.some((r) => r.mandatory) && !marks.length) return [];
    const last = marks.at(-1)?.earned ?? 0,
      possible = Math.max(...group.map((r) => r.maxPoints));
    return [
      {
        id,
        title: group[0]!.title ?? id,
        possible,
        earned: Math.min(possible, Math.max(0, marks.length > 1 ? Math.min(1, last) : last)),
        attempts: marks.length,
        nodeIds: [...new Set(group.flatMap((r) => r.evidenceNodeIds))],
      },
    ];
  });
  const earned = opportunities.reduce((sum, e) => sum + e.earned, 0);
  const possible = opportunities.reduce((sum, e) => sum + e.possible, 0);
  return {
    earned,
    possible,
    score: possible ? Math.round((100 * earned) / possible) : 0,
    opportunities,
  };
}
