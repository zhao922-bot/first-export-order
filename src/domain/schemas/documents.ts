import { z } from 'zod';
import {
  idSchema,
  idListSchema,
  scalarSchema,
  fieldPathSchema,
  positiveIntSchema,
  textSchema,
} from './common';

export const documentPuzzleSchema = z
  .strictObject({
    id: idSchema,
    templateIds: idListSchema.min(1),
    source: z.literal('confirmedOrder'),
    faults: z.array(
      z.strictObject({
        id: idSchema,
        documentId: idSchema,
        fieldPath: fieldPathSchema,
        mutation: scalarSchema,
        expectedFrom: fieldPathSchema,
        explanation: textSchema,
        severity: z.enum(['major', 'minor']),
        termIds: idListSchema,
      }),
    ),
    requiredFaultCount: positiveIntSchema,
    maxAttemptsBeforeGuidance: positiveIntSchema,
    comparisonRules: z.array(
      z.strictObject({
        id: idSchema,
        fieldPaths: z.array(fieldPathSchema).min(1),
        mode: z.enum(['exact', 'number', 'semantic']),
      }),
    ),
  })
  .refine(
    (puzzle) => puzzle.requiredFaultCount <= puzzle.faults.length,
    '要求发现的错误数超过题目错误总数',
  );
export const documentTemplateSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['pi', 'invoice', 'packing-list', 'bill-of-lading', 'origin']),
  title: textSchema,
  fields: z
    .array(
      z.strictObject({
        id: idSchema,
        label: textSchema,
        sourcePath: fieldPathSchema,
        required: z.boolean(),
      }),
    )
    .min(1),
  reviewStatus: z.enum(['draft', 'approved']),
});
export const puzzleDefinitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: idSchema,
    kind: z.literal('quote'),
    evaluatorId: z.literal('quote.v1'),
    parameterIds: idListSchema,
    inputFields: idListSchema.min(1),
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('document'),
    evaluatorId: z.literal('document.v1'),
    puzzle: documentPuzzleSchema,
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('inspection'),
    evaluatorId: z.literal('inspection.v1'),
    itemIds: idListSchema.min(1),
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('declaration'),
    evaluatorId: z.literal('declaration.v1'),
    fieldIds: idListSchema.min(1),
  }),
]);
