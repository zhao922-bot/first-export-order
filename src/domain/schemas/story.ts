import { z } from 'zod';
import { idSchema, idListSchema, stageSchema, textSchema } from './common';
import { conditionSchema, effectSchema } from './effects';

export const choiceSchema = z.strictObject({
  id: idSchema,
  label: textSchema,
  when: conditionSchema,
  disabledReason: textSchema.nullable(),
  effects: z.array(effectSchema).max(64),
  feedback: textSchema,
  nextNodeId: idSchema,
});
export const nodeBaseShape = {
  id: idSchema,
  stage: stageSchema,
  title: textSchema,
  entryWhen: conditionSchema,
  onEnterEffects: z.array(effectSchema).max(64),
  tags: idListSchema,
  teachingOnly: z.literal(true),
};
export const resultBranchSchema = z.strictObject({
  when: conditionSchema,
  effects: z.array(effectSchema).max(64),
  feedback: textSchema,
  nextNodeId: idSchema,
});
export const choiceNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.literal('choice'),
  speakerId: idSchema,
  prompt: textSchema,
  choices: z.array(choiceSchema).min(2),
});
export const calcNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.literal('calc'),
  puzzleId: idSchema,
  evaluatorId: z.literal('quote.v1'),
  results: z.array(resultBranchSchema).min(1),
});
export const textNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.enum(['dialogue', 'review']),
  speakerId: idSchema,
  text: textSchema,
  nextNodeId: idSchema,
});
export const puzzleNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.enum(['document', 'inspection']),
  puzzleId: idSchema,
  evaluatorId: idSchema,
  results: z.array(resultBranchSchema).min(1),
});
export const terminalNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.literal('settlement'),
  resultMode: z.enum(['completed', 'lost_order', 'bankrupt']),
});
export const checkpointNodeSchema = z.strictObject({
  ...nodeBaseShape,
  type: z.literal('checkpoint'),
  checkpointId: idSchema,
  nextNodeId: idSchema,
});
export const storyNodeSchema = z.discriminatedUnion('type', [
  choiceNodeSchema,
  calcNodeSchema,
  textNodeSchema,
  puzzleNodeSchema,
  terminalNodeSchema,
  checkpointNodeSchema,
]);
