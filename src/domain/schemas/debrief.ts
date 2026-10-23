import { z } from 'zod';
import { idSchema, idListSchema, textSchema, nonnegativeIntSchema, scoreSchema } from './common';
import { scoringConfigSchema } from './config';
import { endingResultSchema } from './ending';

export const debriefContentSchema = z.strictObject({
  scoring: scoringConfigSchema.omit({ rubrics: true }),
  terminalNodeIds: idListSchema.min(1),
  mentorReview: textSchema,
  repeatCopy: z.strictObject({
    unlocked: textSchema,
    brand: textSchema,
    locked: textSchema,
    potential: textSchema,
  }),
  assessments: z.array(
    z.strictObject({
      rubricId: idSchema,
      nodeIds: idListSchema.min(1),
      choiceIds: idListSchema.min(1),
      correctChoiceIds: idListSchema,
      successFlag: idSchema.optional(),
      reputationReward: nonnegativeIntSchema.max(3),
    }),
  ),
  replayGuides: z.array(
    z.strictObject({
      nodeIds: idListSchema.min(1),
      familyId: idSchema,
      riskChoiceIds: idListSchema,
      alternative: textSchema,
    }),
  ),
  quizzes: z.array(
    z.strictObject({
      termId: idSchema,
      question: textSchema,
      options: z
        .array(z.strictObject({ id: idSchema, text: textSchema }))
        .min(2)
        .max(4),
      answerId: idSchema,
      explanation: textSchema,
    }),
  ),
});
export const frozenEndingSchema = z.strictObject({
  result: endingResultSchema,
  revision: nonnegativeIntSchema,
  nodeId: idSchema,
  reputation: scoreSchema,
  gameDay: nonnegativeIntSchema,
});
export const learningStateSchema = z.strictObject({
  answers: z.record(idSchema, idSchema),
  events: z.array(
    z.strictObject({
      type: z.enum(['term_opened', 'term_mastered']),
      termId: idSchema,
      revision: nonnegativeIntSchema,
    }),
  ),
});
