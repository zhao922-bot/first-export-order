import { z } from 'zod';
import { gameSnapshotSchema } from '../../domain/schemas/state';
import { quoteInputSchema } from '../../domain/schemas/economy';
import type { ContentPack, GameSnapshot } from '../../domain/types';
import { toMinorUnits } from '../economy/decimal';
import { transfer } from '../economy/ledger';
import { quoteScenario, sampleQuoteScenario } from './scenario';
import { seedRngState } from '../story/rng';
import { negotiationDraftSchema } from '../../domain/schemas/negotiation';
import { procurementStateSchema } from '../../domain/schemas/procurement';
import { collectionStateSchema } from '../../domain/schemas/collection';
import { logisticsStateSchema } from '../../domain/schemas/logistics';
import { frozenEndingSchema, learningStateSchema } from '../../domain/schemas/debrief';
import { rescueStateSchema } from '../../domain/schemas/playtest';
export const sliceSessionSchema = z.strictObject({
  version: z.literal(1),
  contentVersion: z.string(),
  snapshot: gameSnapshotSchema,
  quoteInput: quoteInputSchema,
  answers: z.record(z.string(), z.string()),
  feedback: z.strictObject({ text: z.string(), nextNodeId: z.string() }).nullable(),
  fieldErrors: z.array(
    z.strictObject({ field: z.string(), code: z.string(), message: z.string() }),
  ),
  guided: z.boolean(),
  accepted: z.boolean(),
  firstInquiryRun: z.boolean(),
  negotiation: negotiationDraftSchema.nullable(),
  procurement: procurementStateSchema.nullable(),
  logistics: logisticsStateSchema.nullable(),
  collection: collectionStateSchema.nullable(),
  ending: frozenEndingSchema.nullable(),
  learning: learningStateSchema,
  rescue: rescueStateSchema.optional(),
});
export type SliceSession = z.infer<typeof sliceSessionSchema>;
export function initialSnapshot(pack: ContentPack, runId: string, practice: boolean): GameSnapshot {
  const cash = toMinorUnits(String(pack.parameters.initialCash!.value));
  return {
    revision: 0,
    runId,
    gameDay: 0,
    player: {
      cashCnyFen: cash,
      cumulativeProfitCnyFen: 0,
      reputation: 60,
      trustByCustomer: {},
      learnedTermIds: [],
      masteredTermIds: [],
      criticalMistakeCount: 0,
      rescueUsed: false,
    },
    order: {
      id: 'order.' + runId,
      productId: null,
      supplierId: null,
      customerId: null,
      quantity: 0,
      incoterm: null,
      namedPlace: null,
      payment: null,
      quote: null,
      contractUnitUsd: null,
      invoiceUsdCent: null,
      status: 'draft',
      signedDay: null,
      deliveryDueDay: null,
      deliveryCompletedDay: null,
      collectionDueDay: null,
      remainingDeliveryDays: null,
      overdueDaysCharged: 0,
      taxEligibility: 'pending',
      flags: Object.fromEntries(
        pack.flags.map((flag) => [
          flag.id,
          flag.valueType === 'boolean' ? false : flag.valueType === 'number' ? 0 : '',
        ]),
      ),
    },
    story: {
      stage: practice ? 3 : 1,
      nodeId: practice ? 'L03.main' : 'L01.product',
      visitIndex: 0,
      seed: runId,
      rngVersion: 2,
      rngState: {
        parameters: seedRngState(runId, 'parameters'),
        events: seedRngState(runId, 'events'),
        documents: seedRngState(runId, 'documents'),
      },
      drawCount: 0,
      sampledParameters: {},
      completedNodeIds: [],
      appliedCommandIds: [],
      triggeredEventIds: [],
      eventWindows: [],
      pendingEvent: null,
      puzzleDrafts: {},
      pendingFeedback: null,
      decisionLog: [],
    },
    journal: [
      {
        id: runId + '.capital',
        commandId: runId + '.init',
        sourceNodeId: practice ? 'L03.main' : 'L01.product',
        gameDay: 0,
        description: '开局资本（教学算例参数，可配置）',
        postings: transfer('cash', 'capital', cash),
      },
    ],
    scheduled: [],
    rescueCheckpoint: null,
  };
}
export function createSliceSession(
  pack: ContentPack,
  runId: string,
  practice = false,
  randomize = false,
  firstInquiryRun = true,
): SliceSession {
  const state = initialSnapshot(pack, runId, practice);
  const input = randomize ? sampleQuoteScenario(pack, state) : quoteScenario(pack, null);
  if (practice) {
    state.order.quantity = input.quantity;
    state.order.taxEligibility = input.rebateEligible ? 'eligible' : 'ineligible';
    state.order.customerId = 'customer_c';
    state.player.trustByCustomer.customer_c = pack.customers.find(
      (c) => c.id === 'customer_c',
    )!.initialTrust.min;
  }
  return {
    version: 1,
    contentVersion: pack.contentVersion,
    snapshot: state,
    quoteInput: input,
    answers: {},
    feedback: null,
    fieldErrors: [],
    guided: false,
    accepted: false,
    firstInquiryRun,
    negotiation: null,
    procurement: null,
    logistics: null,
    collection: null,
    ending: null,
    learning: { answers: {}, events: [] },
  };
}
