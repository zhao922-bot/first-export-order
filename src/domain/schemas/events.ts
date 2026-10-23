import { z } from 'zod';
import {
  idSchema,
  textSchema,
  stageSchema,
  nonnegativeIntSchema,
  positiveIntSchema,
  probabilitySchema,
  scalarSchema,
} from './common';
import { conditionSchema } from './effects';

export const gameEventSchema = z.strictObject({
  id: idSchema,
  title: textSchema,
  stages: z.array(stageSchema).min(1),
  window: z.enum(['beforeDecision', 'afterStage', 'beforeCollection']),
  weight: z.number().positive().finite(),
  when: conditionSchema,
  forceWhen: conditionSchema.nullable().default(null),
  oncePerRun: z.literal(true),
  mutexGroup: idSchema.nullable(),
  priority: nonnegativeIntSchema,
  exclusiveWeightBonus: z.number().nonnegative().finite().default(0),
  choiceNodeId: idSchema,
  minChoices: z.literal(2),
  maxExtraDays: nonnegativeIntSchema,
  reviewNodeId: idSchema,
  useNodeEffects: z.boolean().default(false),
});

export const eventWindowConfigSchema = z.strictObject({
  stage: stageSchema,
  nodeId: idSchema,
  returnNodeId: idSchema,
  eventIds: z.array(idSchema).min(1),
});

export const eventSchedulingSchema = z.strictObject({
  windowProbability: probabilitySchema,
  perStageEventCap: positiveIntSchema,
  perRunEventCap: positiveIntSchema,
  windows: z.array(eventWindowConfigSchema).min(1),
});

export const eventReviewSchema = z.strictObject({
  eventId: idSchema,
  title: textSchema,
  consequence: textSchema,
  mentorReview: textSchema,
  riskTags: z.array(idSchema).min(1),
});

export const eventEconomySchema = z.strictObject({
  eventId: idSchema,
  options: z
    .array(
      z.strictObject({
        choiceId: idSchema,
        amountCnyParam: idSchema.nullable(),
        extraDays: nonnegativeIntSchema,
        trustDelta: z.number().int().min(-100).max(100),
        reputationDelta: z.number().int().min(-100).max(100),
        riskFlag: idSchema.nullable(),
        resultFlags: z.record(idSchema, scalarSchema).default({}),
        advanceDeliveryClock: z.boolean().default(true),
        eventCostMode: z
          .enum(['direct', 'procurement', 'logistics', 'collection'])
          .default('direct'),
        operation: z
          .enum([
            'standard',
            'fxRequote',
            'fxRetain',
            'freightIncrease',
            'priceDiscount',
            'logisticsResolution',
          ])
          .default('standard'),
        rateParam: idSchema.nullable().default(null),
        minimumDepositRatioParam: idSchema.nullable().default(null),
        resolution: z.enum(['standard', 'expedite', 'wait', 'priority']).nullable().default(null),
      }),
    )
    .min(2),
});
