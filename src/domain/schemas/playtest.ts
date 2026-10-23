import { z } from 'zod';
import { idSchema, textSchema, nonnegativeIntSchema } from './common';

export const rescueContentSchema = z.strictObject({
  limit: z.literal(1),
  cashTitle: textSchema,
  cashReview: textSchema,
  releaseTitle: textSchema,
  releaseReview: textSchema,
  restoreText: textSchema,
  declineText: textSchema,
  riskChoices: z.array(z.strictObject({ nodeId: idSchema, choiceId: idSchema })).min(1),
});
export const rescueStateSchema = z.strictObject({
  pending: z
    .strictObject({
      checkpointId: idSchema,
      nodeId: idSchema,
      choiceId: idSchema,
      reason: z.enum(['cash_shortfall', 'unverified_release']),
      phase: z.enum(['consequence', 'mentor', 'confirm']),
      gapFen: nonnegativeIntSchema,
      lossFen: nonnegativeIntSchema,
      digest: z.string(),
    })
    .nullable(),
  history: z.array(
    z.strictObject({
      checkpointId: idSchema,
      nodeId: idSchema,
      choiceId: idSchema,
      reason: z.enum(['cash_shortfall', 'unverified_release']),
      outcome: z.enum(['used', 'declined', 'returned']),
    }),
  ),
});

export const playtestContentSchema = z
  .strictObject({
    configVersion: textSchema,
    idleMs: z.literal(120000),
    questions: z
      .array(
        z.strictObject({
          id: idSchema,
          knowledgeId: idSchema,
          phase: z.enum(['pre', 'post']),
          question: textSchema,
          options: z
            .array(z.strictObject({ id: idSchema, text: textSchema }))
            .min(2)
            .max(4),
          answerId: idSchema,
          explanation: textSchema,
        }),
      )
      .length(12),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const phases = new Map<string, Set<string>>();
    for (const q of value.questions) {
      const options = q.options.map((o) => o.id);
      if (
        ids.has(q.id) ||
        new Set(options).size !== options.length ||
        !options.includes(q.answerId)
      )
        ctx.addIssue({ code: 'custom', message: '测评题或选项重复，或缺少正确答案' });
      ids.add(q.id);
      const set = phases.get(q.knowledgeId) ?? new Set<string>();
      if (set.has(q.phase)) ctx.addIssue({ code: 'custom', message: '同知识点同阶段只能一题' });
      set.add(q.phase);
      phases.set(q.knowledgeId, set);
    }
    if (phases.size !== 6 || [...phases.values()].some((p) => p.size !== 2))
      ctx.addIssue({ code: 'custom', message: '须有六个知识点的前后测配对' });
  });
