import { createHash } from 'node:crypto';
import type { ContentPack, QuoteAnswers, QuoteInput } from '../../src/domain/types';
import { createSliceSession, type SliceSession } from '../../src/engine/slice/session';
import {
  currentNode,
  matches,
  reduceSlice,
  type SliceAction,
} from '../../src/engine/slice/reducer';
import { D } from '../../src/engine/economy/decimal';
import { accountBalance, projectLedger } from '../../src/engine/economy/ledger';
import { seedRngState, nextRandom } from '../../src/engine/story/rng';
import { eventOptionPreview, validateEventState } from '../../src/engine/slice/events';
import { negotiationProjection } from '../../src/engine/slice/negotiation';
import { inspectionItemIds } from '../../src/domain/schemas/procurement';
import { inspectionExpected } from '../../src/engine/slice/procurement';
import { declarationSource } from '../../src/engine/slice/logistics';
import { documentSource, taxEvidence } from '../../src/engine/slice/collection';
import { buildCollectionView } from '../../src/app/collectionView';

export const strategies = ['cautious', 'aggressive', 'random'] as const;
export type Strategy = (typeof strategies)[number];
export const policyVersion = 'balance-policy-2-business-causality';
export const telemetryVersion = 3;
export const seedFor = (index: number) => 'balance.v1.' + String(index).padStart(4, '0');
export type CashPoint = {
  revision: number;
  day: number;
  stage: number;
  nodeId: string;
  action: string;
  cashFen: number;
  profitFen: number;
};
export type Failure = { nodeId: string; stage: number; reason: string; realized: boolean };
export type StageCash = {
  stage: number;
  enteredDay: number;
  lastDay: number;
  entryFen: number;
  exitFen: number;
  minimumFen: number;
};
export type CollectionTelemetry = {
  initialUsdCent: number;
  receivedUsdCent: number;
  outstandingUsdCent: number;
  writtenOffUsdCent: number;
  bankFeeFen: number;
  badDebtFen: number;
  closed: boolean;
  fullyCollected: boolean;
  scenarioId: string | null;
  roll: number | null;
  firstChecked: boolean;
  recoveryAttempted: boolean;
};
export interface BalanceRun {
  telemetryVersion: number;
  seed: string;
  strategy: Strategy;
  ending: 'excellent' | 'breakeven' | 'tuition' | 'bankrupt' | null;
  completion: string;
  terminalNodeId: string;
  maxStage: number;
  stages: number[];
  cashFen: number;
  profitFen: number;
  minimumCashFen: number;
  minimumCashNode: string;
  returnOnCost: number | null;
  costFen: number;
  badDebtFen: number;
  productId: string | null;
  supplierId: string | null;
  payment: string | null;
  incoterm: string | null;
  day: number;
  commands: number;
  eventIds: string[];
  eventWindows: SliceSession['snapshot']['story']['eventWindows'];
  collection: CollectionTelemetry | null;
  quality: {
    supplierId: string;
    risk: string;
    credentialsVerified: boolean;
    roll: number;
    initialIssue: boolean;
    reworked: boolean;
    unresolved: boolean;
  } | null;
  stageCash: StageCash[];
  failures: Failure[];
  cashTimeline: CashPoint[];
  decisionTrace: { nodeId: string; choiceId: string }[];
  error: string | null;
}

/** 独立手工算价模型。乱选只抽公式口径，不调用 evaluator/expectedAnswers 或题目答案。 */
export function policyQuote(
  input: QuoteInput,
  model: 'cost' | 'omitRebate' | 'salesMargin' | 'doubleDomestic',
): QuoteAnswers {
  const p = new D(input.taxInclusiveUnitCny),
    domestic = new D(input.domesticTotalCny).div(input.quantity);
  const rebate =
    input.rebateEligible && model !== 'omitRebate'
      ? p.div(new D(1).plus(input.vatRate)).mul(input.rebateRate)
      : new D(0);
  const cost = p.minus(rebate).plus(domestic.mul(model === 'doubleDomestic' ? 2 : 1));
  const fob =
    model === 'salesMargin'
      ? cost.div(input.fxCnyPerUsd).div(new D(1).minus(input.costMarkupRate))
      : cost.div(input.fxCnyPerUsd).mul(new D(1).plus(input.costMarkupRate));
  const cif = fob
    .plus(new D(input.oceanTotalUsd).div(input.quantity))
    .div(new D(1).minus(new D(input.insuranceCoverageFactor).mul(input.insuranceRate)));
  return {
    rebateUnitCny: rebate.toFixed(2),
    fobCostUnitCny: cost.toFixed(2),
    rateBasis: model === 'salesMargin' ? 'salesMargin' : 'costMarkup',
    fobUnitUsd: fob.toFixed(2),
    cifUnitUsd: cif.toFixed(2),
  };
}

export function simulateRun(
  pack: ContentPack,
  seed: string,
  strategy: Strategy,
  options: { firstQuoteMistake?: boolean; maxCommands?: number } = {},
): BalanceRun {
  // 环境种子和首局 C 引导对三策略完全相同；策略随机流独立，不消费游戏 RNG。
  let session = createSliceSession(pack, seed);
  let policyRng = seedRngState(
    createHash('sha256')
      .update(seed + '.policy.' + strategy)
      .digest('hex'),
    'policy',
  );
  const random = () => {
    const draw = nextRandom(policyRng);
    policyRng = draw.state;
    return draw.value;
  };
  const pick = <T>(items: readonly T[]): T => {
    if (!items.length) throw new Error('empty policy candidates');
    return items[Math.floor(random() * items.length)]!;
  };
  const failures: Failure[] = [],
    timeline: CashPoint[] = [],
    stages = new Set<number>([1]);
  let error: string | null = null,
    commands = 0,
    firstQuote = true;
  let minimumCashFen = session.snapshot.player.cashCnyFen,
    minimumCashNode = 'L01.product';
  const stageCash: StageCash[] = [
    {
      stage: 1,
      enteredDay: 0,
      lastDay: 0,
      entryFen: minimumCashFen,
      exitFen: minimumCashFen,
      minimumFen: minimumCashFen,
    },
  ];
  timeline.push({
    revision: 0,
    day: 0,
    stage: 1,
    nodeId: minimumCashNode,
    action: 'initial',
    cashFen: minimumCashFen,
    profitFen: 0,
  });
  const visits = new Map<string, number>();
  const fail = (
    reason: string,
    realized = true,
    nodeId = session.snapshot.story.nodeId,
    stage = session.snapshot.story.stage,
  ) => {
    if (!failures.some((f) => f.nodeId === nodeId && f.reason === reason))
      failures.push({ nodeId, stage, reason, realized });
  };
  const act = (action: SliceAction) => {
    const source = session.snapshot.story.nodeId,
      stage = session.snapshot.story.stage;
    const before = session.snapshot.player;
    const beforeDay = session.snapshot.gameDay;
    const badDebtBefore = session.collection?.badDebtFen ?? 0;
    const next = reduceSlice(session, pack, {
      id: seed + '.command.' + session.snapshot.revision,
      revision: session.snapshot.revision,
      action,
    });
    commands++;
    session = next;
    stages.add(session.snapshot.story.stage);
    const p = session.snapshot.player;
    const cash = stageCash.find((point) => point.stage === stage)!;
    cash.lastDay = session.snapshot.gameDay;
    cash.exitFen = p.cashCnyFen;
    cash.minimumFen = Math.min(cash.minimumFen, p.cashCnyFen);
    if (
      session.snapshot.story.stage !== stage &&
      !stageCash.some((point) => point.stage === session.snapshot.story.stage)
    )
      stageCash.push({
        stage: session.snapshot.story.stage,
        enteredDay: session.snapshot.gameDay,
        lastDay: session.snapshot.gameDay,
        entryFen: p.cashCnyFen,
        exitFen: p.cashCnyFen,
        minimumFen: p.cashCnyFen,
      });
    if (
      p.cashCnyFen !== before.cashCnyFen ||
      p.cumulativeProfitCnyFen !== before.cumulativeProfitCnyFen ||
      session.snapshot.gameDay !== beforeDay ||
      session.snapshot.story.stage !== stage
    ) {
      timeline.push({
        revision: session.snapshot.revision,
        day: session.snapshot.gameDay,
        stage,
        nodeId: source,
        action: action.type === 'choose' ? action.choiceId : action.type,
        cashFen: p.cashCnyFen,
        profitFen: p.cumulativeProfitCnyFen,
      });
    }
    if (p.cashCnyFen < minimumCashFen) {
      minimumCashFen = p.cashCnyFen;
      minimumCashNode = source;
    }
    if ((session.collection?.badDebtFen ?? 0) > badDebtBefore)
      fail('bad_debt', true, source, stage);
  };
  const available = () => {
    const node = currentNode(pack, session);
    if (node.type !== 'choice') return [];
    const event = pack.events.find((e) => e.id === session.snapshot.story.pendingEvent?.eventId);
    return node.choices
      .filter((choice) => {
        if (!matches(choice.when, session, pack)) return false;
        // 结束练习/离开演示不是经营策略；取消交易与暂停物流仍在可用集合中。
        if (
          [
            'finish_quote_practice',
            'finish_negotiation',
            'finish_procurement',
            'finish_logistics',
          ].includes(choice.id)
        )
          return false;
        const option = pack.eventEconomy
          ?.find((e) => e.eventId === event?.id)
          ?.options.find((o) => o.choiceId === choice.id);
        return (
          !event ||
          !option ||
          eventOptionPreview(session, pack, event, option).costFen <=
            session.snapshot.player.cashCnyFen
        );
      })
      .map((c) => c.id);
  };
  const preferred = (ids: string[], ...preferences: string[]) =>
    preferences.find((id) => ids.includes(id)) ?? ids[0]!;
  function prepareForms(id: string, visit: number) {
    if (id === 'L04.confirm') {
      const projection = negotiationProjection(session, pack);
      if (projection.forecast.minimumCashCnyFen < 0) fail('forecast_cash_gap', false);
      for (const f of pack.negotiation!.checklist)
        act({ type: 'confirmContract', fieldId: f.id, checked: true });
    }
    if (id === 'L05.pi')
      for (const f of pack.procurement!.piFields)
        act({ type: 'confirmPi', fieldId: f.id, checked: true });
    if (id === 'L05.funding' && !session.snapshot.order.flags.fundingVerified)
      for (const f of pack.procurement!.fundingChecks)
        act({ type: 'checkFunding', fieldId: f.id, checked: true });
    if (id === 'L05.inspection')
      for (const itemId of inspectionItemIds) {
        act({ type: 'viewEvidence', itemId });
        const answer =
          strategy === 'random'
            ? pick(['pass', 'issue'] as const)
            : strategy === 'aggressive' && visit === 1
              ? 'pass'
              : inspectionExpected(session.procurement!, itemId);
        act({ type: 'assessInspection', itemId, answer });
      }
    if (id === 'L06.declaration') {
      const source = declarationSource(session, pack);
      for (const f of pack.logistics!.declarationFields) {
        if (strategy !== 'aggressive' || visit > 1)
          act({ type: 'editDeclaration', fieldId: f.id, value: source[f.id] });
        act({ type: 'checkDeclaration', fieldId: f.id, checked: true });
      }
    }
    if (id === 'L07.documents') {
      const source = documentSource(session, pack),
        view = buildCollectionView(session, pack)!;
      for (const document of view.documents)
        for (const field of document.fields) {
          const spec = pack.documentTemplates
            .find((t) => t.id === document.id)!
            .fields.find((f) => document.id + '.' + f.id === field.key)!;
          const expected = source[spec.sourcePath]!;
          const marked = strategy === 'random' ? random() < 0.5 : field.value !== expected;
          act({ type: 'markDocument', fieldId: field.key, marked });
          if (marked)
            act({
              type: 'correctDocument',
              fieldId: field.key,
              value: strategy === 'random' ? pick(Object.values(source)) : expected,
            });
        }
    }
    if (id === 'L07.tax') {
      const evidence = taxEvidence(session, pack);
      for (const field of pack.collection!.taxEvidence)
        act({
          type: 'assessTax',
          fieldId: field.id,
          answer:
            strategy === 'random'
              ? pick(['verified', 'missing'] as const)
              : evidence[field.id]
                ? 'verified'
                : 'missing',
        });
    }
  }
  function choose(ids: string[], id: string, visit: number): string {
    if (strategy === 'random') return pick(ids);
    const aggressive = strategy === 'aggressive';
    const order = session.snapshot.order;
    if (order.flags.customerIsFraud && id === 'L05.supplier')
      return preferred(ids, 'procurement_cancel');
    if (session.snapshot.story.pendingEvent) {
      const event = pack.eventEconomy!.find(
        (e) => e.eventId === session.snapshot.story.pendingEvent!.eventId,
      )!;
      if (aggressive)
        return preferred(
          ids,
          ...[...event.options].sort((a, b) => b.extraDays - a.extraDays).map((o) => o.choiceId),
        );
      return preferred(ids, ...event.options.filter((o) => !o.riskFlag).map((o) => o.choiceId));
    }
    if (id === 'L01.product') {
      const product = pack.products[Number(seed.match(/\d+$/)?.[0] ?? 0) % pack.products.length]!;
      return 'select_' + product.id;
    }
    if (id.startsWith('L01.suppliers.')) {
      const suppliers = pack.suppliers.filter((s) => s.productId === order.productId);
      const supplier = aggressive
        ? [...suppliers].sort(
            (a, b) =>
              Number(pack.parameters[a.taxInclusiveUnitPriceParam]!.value) -
              Number(pack.parameters[b.taxInclusiveUnitPriceParam]!.value),
          )[0]!
        : suppliers.find((s) => s.credentials.every((c) => c.status === 'verified'))!;
      return 'select_' + supplier.id;
    }
    if (id.startsWith('L01.verify.')) return (aggressive ? 'keep_' : 'verify_') + order.productId;
    if (id === 'L02.inbox')
      return preferred(ids, 'open_buyer', 'open_competitor', 'open_fraud', 'finish_inquiries');
    if (id.endsWith('.classify')) {
      const kind = id.split('.')[1]!;
      return 'classify_' + kind + '_' + kind;
    }
    if (id.endsWith('.reply'))
      return 'reply_' + id.split('.')[1] + '_' + (aggressive ? 'risky' : 'safe');
    if (id === 'L02.fraud.amend') return 'fraud_stop'; // 最高信用敞口仍不把已知假银行当成买家。
    if (id === 'L02.lead') return 'lead_' + order.flags.inquiryBuyerId;
    const choices: Record<string, string[]> = {
      'L03.handoff': ['continue_negotiation'],
      'L04.price': [aggressive ? 'offer_bulk' : 'offer_hold'],
      'L04.payment': [aggressive ? 'payment_oa' : 'payment_tt'],
      'L04.lc.soft': [aggressive ? 'lc_accept' : 'lc_amend'],
      'L04.terms': ['terms_fob'],
      'L04.counterparty': ['counterparty_continue', 'fraud_reject'],
      'L04.confirm': ['contract_sign'],
      'L04.complete': ['continue_procurement'],
      'L05.pi': ['pi_accept'],
      'L05.funding': [
        aggressive && visit === 1 ? 'funding_screenshot' : 'funding_verify',
        'funding_lc_repair',
        'procurement_cancel',
      ],
      'L05.supplier': ['supplier_deposit', 'procurement_cancel'],
      'L05.production': ['production_wait'],
      'L05.inspection': ['inspection_submit'],
      'L05.disposition': [
        'inspection_accept',
        'inspection_rework',
        'inspection_supplement',
        'inspection_retry',
      ],
      'L05.balance': ['supplier_balance'],
      'L05.complete': ['continue_logistics'],
      'L06.plan': [aggressive ? 'plan_economy' : 'plan_steady'],
      'L06.insurance': ['insurance_basic', 'insurance_buyer'],
      'L06.declaration': ['declaration_submit'],
      'L06.gate': ['logistics_book', 'declaration_retry'],
      'L06.dispatch': ['logistics_dispatch'],
      'L06.risk': [
        'risk_clear',
        'customs_expedite',
        'rollover_priority',
        'customs_standard',
        'rollover_wait',
      ],
      'L06.delivery': ['logistics_deliver'],
      'L06.complete': ['continue_collection'],
      'L07.source': ['documents_start', 'buyer_shipment'],
      'L07.documents': ['documents_submit'],
      'L07.documents.gate': ['documents_accept', 'documents_retry'],
      'L07.payment': ['tt_verify', 'oa_due', 'lc_present'],
      'L07.tt': ['tt_chase'],
      'L07.lc': ['lc_collect', 'lc_amend'],
      'L07.oa': ['oa_chase'],
      'L07.balance': ['oa_complete', 'oa_recover', 'oa_writeoff'],
      'L07.tax': ['tax_verify'],
      'L07.tax.gate': ['tax_receive', 'tax_ineligible', 'tax_retry'],
    };
    return preferred(ids, ...(choices[id] ?? []));
  }
  try {
    while (!session.ending && commands < (options.maxCommands ?? 650)) {
      const node = currentNode(pack, session),
        id = node.id;
      if (session.feedback || node.type === 'review') {
        act({ type: 'advance' });
        continue;
      }
      if (node.type === 'settlement') break;
      const visit = (visits.get(id) ?? 0) + 1;
      visits.set(id, visit);
      if (node.type === 'calc') {
        const model =
          firstQuote && options.firstQuoteMistake
            ? 'salesMargin'
            : strategy === 'random'
              ? pick(['cost', 'omitRebate', 'salesMargin', 'doubleDomestic'] as const)
              : 'cost';
        firstQuote = false;
        act({ type: 'submit', answers: policyQuote(session.quoteInput, model) });
        continue;
      }
      prepareForms(id, visit);
      const choiceId = choose(available(), id, visit);
      if (!choiceId) throw new Error('no available choice at ' + id);
      try {
        act({ type: 'choose', choiceId });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!message.includes('现金不足')) throw cause;
        fail('actual_cash_gap');
        if (available().includes('procurement_cancel'))
          act({ type: 'choose', choiceId: 'procurement_cancel' });
        else if (available().includes('logistics_hold'))
          act({ type: 'choose', choiceId: 'logistics_hold' });
        else throw cause;
      }
    }
    if (!session.ending && commands >= (options.maxCommands ?? 650)) fail('command_limit', false);
    validateEventState(session, pack);
    const ledger = projectLedger(session.snapshot.journal);
    if (
      ledger.cashCnyFen !== session.snapshot.player.cashCnyFen ||
      ledger.cumulativeProfitCnyFen !== session.snapshot.player.cumulativeProfitCnyFen
    )
      throw new Error('simulation ledger mismatch');
  } catch (cause) {
    error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
  }
  const state = session.snapshot,
    result = session.ending?.result;
  const costFen = accountBalance(state.journal, 'expense');
  if (result?.kind === 'tuition' && !failures.some((f) => f.realized))
    fail(result.completion === 'completed' ? 'realized_loss' : 'lost_order');
  const collection = session.collection;
  const initialUsdCent = collection
    ? state.order.invoiceUsdCent! - session.procurement!.customerReceivedUsdCent
    : 0;
  const supplier = pack.suppliers.find((s) => s.id === state.order.supplierId);
  const procurement = session.procurement;
  return {
    telemetryVersion,
    seed,
    strategy,
    ending: result?.kind ?? null,
    completion: result?.completion ?? (session.logistics?.held ? 'paused' : 'incomplete'),
    terminalNodeId: state.story.nodeId,
    maxStage: Math.max(...stages),
    stages: [...stages].sort(),
    cashFen: state.player.cashCnyFen,
    profitFen: state.player.cumulativeProfitCnyFen,
    minimumCashFen,
    minimumCashNode,
    returnOnCost:
      result?.completion === 'completed' && costFen > 0
        ? state.player.cumulativeProfitCnyFen / costFen
        : null,
    costFen,
    badDebtFen: session.collection?.badDebtFen ?? 0,
    productId: state.order.productId,
    supplierId: state.order.supplierId,
    payment: state.order.payment,
    incoterm: state.order.incoterm,
    day: state.gameDay,
    commands,
    eventIds: state.story.triggeredEventIds,
    eventWindows: state.story.eventWindows,
    collection: collection
      ? {
          initialUsdCent,
          receivedUsdCent: collection.receivedUsdCent,
          outstandingUsdCent: collection.outstandingUsdCent,
          writtenOffUsdCent:
            initialUsdCent - collection.receivedUsdCent - collection.outstandingUsdCent,
          bankFeeFen: collection.bankFeeFen,
          badDebtFen: collection.badDebtFen,
          closed: collection.collectionClosed,
          fullyCollected:
            collection.collectionClosed &&
            collection.badDebtFen === 0 &&
            collection.outstandingUsdCent === 0 &&
            collection.receivedUsdCent === initialUsdCent,
          scenarioId: collection.oaScenarioId,
          roll: collection.oaRoll,
          firstChecked: collection.oaFirstChecked,
          recoveryAttempted: collection.oaRecoveryAttempted,
        }
      : null,
    quality:
      procurement?.productionDone && procurement.qualityRoll !== null && supplier
        ? {
            supplierId: supplier.id,
            risk: supplier.qualityRisk,
            credentialsVerified: supplier.credentials.every((c) => c.status === 'verified'),
            roll: procurement.qualityRoll,
            initialIssue: state.story.sampledParameters.inspectionQuality === true,
            reworked: procurement.reworked,
            unresolved: procurement.qualityIssue,
          }
        : null,
    stageCash,
    failures,
    cashTimeline: timeline,
    decisionTrace: state.story.decisionLog.map((d) => ({ nodeId: d.nodeId, choiceId: d.choiceId })),
    error,
  };
}
