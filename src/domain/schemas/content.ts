import { z } from 'zod';
import { idSchema, idListSchema, textSchema, parameterSchema } from './common';
import {
  productSchema,
  supplierSchema,
  customerSchema,
  mentorSchema,
  inquirySchema,
  glossarySchema,
  forwarderSchema,
} from './catalog';
import { storyNodeSchema } from './story';
import {
  gameEventSchema,
  eventSchedulingSchema,
  eventReviewSchema,
  eventEconomySchema,
} from './events';
import { documentTemplateSchema, puzzleDefinitionSchema } from './documents';
import { endingDefinitionSchema } from './ending';
import { flagDefinitionSchema, rubricSchema } from './effects';
import { negotiationContentSchema } from './negotiation';
import { procurementContentSchema } from './procurement';
import { collectionContentSchema } from './collection';
import { logisticsContentSchema } from './logistics';
import { debriefContentSchema } from './debrief';
import { rescueContentSchema, playtestContentSchema } from './playtest';

export const contentPackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contentVersion: textSchema,
  mode: z.enum(['scaffold', 'slice', 'game']),
  entryNodeIds: idListSchema.min(1),
  nodes: z.array(storyNodeSchema).min(1),
  products: z.array(productSchema),
  suppliers: z.array(supplierSchema),
  customers: z.array(customerSchema),
  mentor: mentorSchema.nullable(),
  parameters: z.record(idSchema, parameterSchema),
  events: z.array(gameEventSchema),
  eventScheduling: eventSchedulingSchema.optional(),
  eventReviews: z.array(eventReviewSchema).optional(),
  eventEconomy: z.array(eventEconomySchema).optional(),
  glossary: z.array(glossarySchema),
  documentTemplates: z.array(documentTemplateSchema),
  puzzles: z.array(puzzleDefinitionSchema),
  endings: z.array(endingDefinitionSchema),
  inquiries: z.array(inquirySchema),
  forwarders: z.array(forwarderSchema),
  flags: z.array(flagDefinitionSchema),
  rubrics: z.array(rubricSchema),
  ports: idListSchema,
  complianceProfileIds: idListSchema,
  negotiation: negotiationContentSchema.optional(),
  procurement: procurementContentSchema.optional(),
  logistics: logisticsContentSchema.optional(),
  collection: collectionContentSchema.optional(),
  debrief: debriefContentSchema.optional(),
  rescue: rescueContentSchema.optional(),
  playtest: playtestContentSchema.optional(),
});
export const contentManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contentVersion: textSchema,
  mode: z.enum(['scaffold', 'slice', 'game']),
  packs: z
    .array(z.string().regex(/^(?!.*(?:\.\.|\\))[^:]+\.json$/, '仅允许内容目录内的 JSON 相对路径'))
    .min(1),
  onboarding: z.literal('onboarding.json').optional(),
  presentation: z.literal('presentation.json').optional(),
});
