import type { z } from 'zod';
import type {
  choiceSchema,
  storyNodeSchema,
  choiceNodeSchema,
  calcNodeSchema,
  textNodeSchema,
  puzzleNodeSchema,
  terminalNodeSchema,
  checkpointNodeSchema,
} from '../schemas/story';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type Choice = z.infer<typeof choiceSchema>;
export type StoryNode = z.infer<typeof storyNodeSchema>;
export type ChoiceNode = z.infer<typeof choiceNodeSchema>;
export type CalcNode = z.infer<typeof calcNodeSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type PuzzleNode = z.infer<typeof puzzleNodeSchema>;
export type TerminalNode = z.infer<typeof terminalNodeSchema>;
export type CheckpointNode = z.infer<typeof checkpointNodeSchema>;
export type NodeType = StoryNode['type'];
export type NodeBase = Pick<
  StoryNode,
  'id' | 'stage' | 'type' | 'title' | 'entryWhen' | 'onEnterEffects' | 'tags' | 'teachingOnly'
>;
