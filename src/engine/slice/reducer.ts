import { CashShortfall } from '../rules/cashShortfall';
import {
  decisionEvidence,
  touchTerms,
  freezeEnding,
  learn,
  type LearningAction,
} from '../debrief/runtime';
import type {
  ContentPack,
  Condition,
  ValueExpr,
  Effect,
  QuoteAnswers,
  QuoteInput,
  QuoteEvaluation,
  JournalEntry,
} from '../../domain/types';
import { quoteInputSchema } from '../../domain/schemas/economy';
import { sliceSessionSchema, type SliceSession } from './session';
import { sampleQuoteScenario } from './scenario';
import { prepareInquiries } from './inquiry';
import {
  beginCollection,
  collectionAction,
  collectionRule,
  type CollectionAction,
} from './collection';
import { beginLogistics, logisticsAction, logisticsRule, type LogisticsAction } from './logistics';
import {
  beginProcurement,
  procurementAction,
  procurementRule,
  type ProcurementAction,
} from './procurement';
import {
  beginNegotiation,
  applyOffer,
  selectPayment,
  selectTerms,
  signContract,
  confirmContractField,
} from './negotiation';
import { paymentMethodSchema, incotermSchema } from '../../domain/schemas/common';
import { teachingText } from '../../content/teachingText';
import { calculateQuote } from '../economy/quote';
import { D, toMinorUnits } from '../economy/decimal';
import { clamp } from '../economy/score';
import { appendJournal, projectLedger, transfer } from '../economy/ledger';
import { answerFields, evaluateQuote, type AnswerField } from '../puzzles/quoteEvaluator';
import { openEventWindow, applyEventOutcome } from './events';
import { evaluateCondition } from '../story/conditions';
import { accrueDeadline } from '../economy/deadline';
export type SliceAction =
  | LearningAction
  | CollectionAction
  | LogisticsAction
  | ProcurementAction
  | { type: 'choose'; choiceId: string }
  | { type: 'advance' }
  | { type: 'submit'; answers: Record<string, string> }
  | { type: 'configure'; input: QuoteInput }
  | { type: 'draft'; answers: Record<string, string> }
  | { type: 'confirmContract'; fieldId: string; checked: boolean };
export interface SliceCommand {
  id: string;
  revision: number;
  action: SliceAction;
}
export function currentNode(pack: ContentPack, session: SliceSession) {
  const node = pack.nodes.find((n) => n.id === session.snapshot.story.nodeId);
  if (!node) throw new RangeError('节点不存在');
  return session.snapshot.story.pendingEvent
    ? { ...node, stage: session.snapshot.story.stage }
    : node;
}
function read(
  value: ValueExpr,
  session: SliceSession,
  pack: ContentPack,
  result?: QuoteEvaluation,
): unknown {
  if (value.kind === 'literal') return value.value;
  if (value.kind !== 'ref') throw new RangeError('切片不执行随机表达式');
  if (value.scope === 'config') return pack.parameters[value.path.replace(/\.value$/, '')]!.value;
  if (value.scope === 'result')
    return result?.[value.path.replace('quote.', '') as keyof QuoteEvaluation];
  let cursor: unknown = value.scope === 'input' ? session.answers : session.snapshot;
  for (const key of value.path.split('.')) cursor = (cursor as Record<string, unknown>)[key];
  return cursor;
}
export function matches(
  condition: Condition,
  session: SliceSession,
  pack: ContentPack,
  result?: QuoteEvaluation,
): boolean {
  if (condition.op === 'all')
    return condition.conditions.every((c) => matches(c, session, pack, result));
  if (condition.op === 'any')
    return condition.conditions.some((c) => matches(c, session, pack, result));
  if (condition.op === 'not') return !matches(condition.condition, session, pack, result);
  if (condition.op === 'exists' || condition.op === 'flag')
    return evaluateCondition(condition, session.snapshot, pack);
  if (condition.op === 'in')
    return condition.right.some(
      (value) => read(value, session, pack, result) === read(condition.left, session, pack, result),
    );
  if (
    condition.op === 'eq' ||
    condition.op === 'ne' ||
    condition.op === 'gt' ||
    condition.op === 'gte' ||
    condition.op === 'lt' ||
    condition.op === 'lte'
  ) {
    const left = read(condition.left, session, pack, result),
      right = read(condition.right, session, pack, result);
    if (condition.op === 'eq') return left === right;
    if (condition.op === 'ne') return left !== right;
    if (
      left === null ||
      left === undefined ||
      right === null ||
      right === undefined ||
      left === '' ||
      right === ''
    )
      return false;
    const a = Number(left),
      b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (condition.op === 'gt') return a > b;
    if (condition.op === 'gte') return a >= b;
    if (condition.op === 'lt') return a < b;
    return a <= b;
  }
  return false;
}
function effects(
  items: Effect[],
  session: SliceSession,
  pack: ContentPack,
  commandId: string,
): void {
  const state = session.snapshot;
  const charges: JournalEntry[] = [];
  for (const [index, effect] of items.entries()) {
    if (effect.op === 'set') {
      const value = read(effect.value, session, pack);
      if (effect.target === 'order.productId') {
        state.order.productId = String(value);
        state.order.supplierId = null;
      } else if (effect.target === 'order.supplierId') state.order.supplierId = String(value);
      else if (effect.target === 'order.customerId') state.order.customerId = String(value);
      else if (effect.target.startsWith('order.flags.')) {
        const key = effect.target.slice('order.flags.'.length);
        const definition = pack.flags.find((f) => f.id === key);
        if (!definition || typeof value !== definition.valueType)
          throw new RangeError('未声明或类型不符的标记');
        state.order.flags[key] = value as string | number | boolean;
      } else throw new RangeError('切片不支持该写入');
    } else if (effect.op === 'adjust' && effect.target === 'player.reputation')
      state.player.reputation = clamp(
        state.player.reputation + Number(read(effect.value, session, pack)),
        0,
        100,
      );
    else if (effect.op === 'advanceDays') {
      const days = Number(read(effect.value, session, pack));
      if (
        state.order.deliveryDueDay !== null &&
        state.order.deliveryCompletedDay === null &&
        state.story.stage >= 4
      ) {
        const result = accrueDeadline(state, state.gameDay + days);
        state.gameDay += days;
        state.order.remainingDeliveryDays = result.remainingDays;
      } else state.gameDay += days;
    } else if (effect.op === 'rule' && effect.ruleId === 'customer.adjustActiveTrust') {
      // 改谈条件允许返工；同一谈判节点不重复获得信任奖励。
      if (
        state.story.stage === 4 &&
        state.story.decisionLog.some((d) => d.nodeId === state.story.nodeId)
      )
        continue;
      const id = state.order.customerId;
      if (!id || state.player.trustByCustomer[id] === undefined)
        throw new RangeError('当前客户不存在');
      state.player.trustByCustomer[id] = clamp(
        state.player.trustByCustomer[id]! + Number(read(effect.args.delta!, session, pack)),
        0,
        100,
      );
    } else if (
      effect.op === 'rule' &&
      ['ledger.sampleExpense', 'ledger.preparationExpense'].includes(effect.ruleId)
    ) {
      const id = String(read(effect.args.parameterId!, session, pack));
      const cost = toMinorUnits(String(pack.parameters[id]!.value));
      if (
        cost >
        state.player.cashCnyFen -
          charges.reduce((sum, entry) => sum + entry.postings[0]!.amountCnyFen, 0)
      )
        throw new CashShortfall(
          cost -
            state.player.cashCnyFen +
            charges.reduce((sum, entry) => sum + entry.postings[0]!.amountCnyFen, 0),
          '现金不足支付准备费用；可返回调整或停止该线索',
        );
      charges.push({
        id: commandId + '.expense.' + index,
        commandId,
        sourceNodeId: state.story.nodeId,
        gameDay: state.gameDay,
        description:
          (effect.ruleId === 'ledger.sampleExpense'
            ? '本单样品核验费'
            : id === 'fraudAdvanceFee'
              ? '异常认证费损失'
              : '信用证改单准备费') + '（教学算例参数，可配置）',
        postings: transfer('expense', 'cash', cost),
      });
    } else if (effect.op === 'rule' && effect.ruleId.startsWith('collection.')) {
      collectionRule(session, pack, effect.ruleId, commandId);
    } else if (effect.op === 'rule' && effect.ruleId.startsWith('logistics.')) {
      const argument = effect.args.forwarderId ?? effect.args.insurance ?? effect.args.resolution;
      logisticsRule(
        session,
        pack,
        effect.ruleId,
        commandId,
        argument ? String(read(argument, session, pack)) : undefined,
      );
    } else if (effect.op === 'rule' && effect.ruleId.startsWith('procurement.')) {
      procurementRule(
        session,
        pack,
        effect.ruleId,
        commandId,
        effect.args.resolution ? String(read(effect.args.resolution, session, pack)) : undefined,
      );
    } else if (effect.op === 'rule' && effect.ruleId === 'negotiation.offer') {
      applyOffer(session, pack, String(read(effect.args.offerId!, session, pack)));
    } else if (effect.op === 'rule' && effect.ruleId === 'negotiation.payment') {
      selectPayment(session, paymentMethodSchema.parse(read(effect.args.payment!, session, pack)));
    } else if (effect.op === 'rule' && effect.ruleId === 'negotiation.terms') {
      selectTerms(session, pack, incotermSchema.parse(read(effect.args.incoterm!, session, pack)));
    } else if (effect.op === 'rule' && effect.ruleId === 'contract.sign') {
      signContract(session, pack);
    } else if (effect.op === 'rule' && effect.ruleId === 'negotiation.cancel') {
      if (state.order.status !== 'negotiating') throw new RangeError('当前不能终止谈判');
      state.order.status = 'cancelled';
    } else throw new RangeError('切片不支持该效果');
  }
  if (charges.length) {
    state.journal = appendJournal(state.journal, charges);
    Object.assign(state.player, projectLedger(state.journal));
  }
}
function enter(id: string, session: SliceSession, pack: ContentPack, commandId: string): void {
  const previousEvent = pack.events.find(
    (event) =>
      event.useNodeEffects &&
      event.choiceNodeId === id &&
      session.snapshot.story.triggeredEventIds.includes(event.id),
  );
  if (previousEvent && !session.snapshot.story.pendingEvent) {
    const previousChoice = session.snapshot.story.decisionLog.find(
      (decision) => decision.nodeId === id,
    )?.choiceId;
    const result = pack.eventEconomy
      ?.find((item) => item.eventId === previousEvent.id)
      ?.options.find((option) => option.choiceId === previousChoice);
    if (result) Object.assign(session.snapshot.order.flags, result.resultFlags);
    const next = pack.eventScheduling!.windows.find((window) => window.nodeId === id)!.returnNodeId;
    enter(next, session, pack, commandId);
    return;
  }
  const oldStage = session.snapshot.story.stage;
  session.snapshot.story.nodeId = id;
  const node = currentNode(pack, session);
  if (!matches(node.entryWhen, session, pack)) throw new RangeError('未满足节点进入条件');
  if (!session.snapshot.story.pendingEvent) session.snapshot.story.stage = node.stage;
  session.snapshot.story.visitIndex++;
  if (oldStage === 1 && node.stage === 2)
    prepareInquiries(pack, session.snapshot, session.firstInquiryRun);
  if (oldStage === 3 && node.stage === 4) beginNegotiation(session, pack);
  if (oldStage === 4 && node.stage === 5) beginProcurement(session, pack);
  if (oldStage === 5 && node.stage === 6) beginLogistics(session, pack);
  if (oldStage === 6 && node.stage === 7) beginCollection(session);
  if (oldStage === 2 && node.stage === 3) {
    session.quoteInput = sampleQuoteScenario(pack, session.snapshot);
    session.snapshot.order.quantity = session.quoteInput.quantity;
    session.snapshot.order.taxEligibility = session.quoteInput.rebateEligible
      ? 'eligible'
      : 'ineligible';
  }
  if (node.type === 'calc' && node.puzzleId !== 'quote_main') session.guided = true;
  effects(node.onEnterEffects, session, pack, commandId);
  touchTerms(session, pack, node.id);
  freezeEnding(session, pack);
  openEventWindow(session, pack, id);
}
/** 原子纯 reducer：先克隆再验证，失败不会污染已提交状态。 */
export function reduceSlice(
  original: SliceSession,
  pack: ContentPack,
  command: SliceCommand,
): SliceSession {
  if (original.snapshot.story.appliedCommandIds.includes(command.id)) return original;
  if (command.revision !== original.snapshot.revision) throw new RangeError('过期操作，请重试');
  const session = structuredClone(original),
    state = session.snapshot,
    node = currentNode(pack, session);
  const action = command.action;
  if (action.type === 'openTerm' || action.type === 'answerTerm') {
    learn(session, pack, action);
    state.revision++;
    state.story.appliedCommandIds.push(command.id);
    return sliceSessionSchema.parse(session);
  }
  if (session.ending)
    throw new RangeError('本单已结算，不能操作经营记录，成绩已冻结；可以查阅图鉴或重开练习');
  if (
    action.type === 'markDocument' ||
    action.type === 'correctDocument' ||
    action.type === 'assessTax'
  ) {
    collectionAction(session, pack, action);
  } else if (action.type === 'editDeclaration' || action.type === 'checkDeclaration') {
    logisticsAction(session, pack, action);
  } else if (
    action.type === 'confirmPi' ||
    action.type === 'checkFunding' ||
    action.type === 'viewEvidence' ||
    action.type === 'assessInspection'
  ) {
    procurementAction(session, pack, action);
  } else if (action.type === 'confirmContract') {
    if (!node.tags.includes('contract_confirmation') || session.feedback)
      throw new RangeError('当前不能核对合同');
    confirmContractField(session, pack, action.fieldId, action.checked);
  } else if (action.type === 'draft') session.answers = { ...action.answers };
  else if (action.type === 'configure') {
    if (
      node.id !== 'L03.main' ||
      session.feedback ||
      state.story.decisionLog.some((d) => d.stage === 3)
    )
      throw new RangeError('开始提交后参数已锁定；新练习才能换参数');
    if (state.order.supplierId) {
      const supplier = pack.suppliers.find((s) => s.id === state.order.supplierId)!;
      if (action.input.quantity < supplier.moq) throw new RangeError('数量不能低于所选供应商 MOQ');
      if (
        action.input.rebateEligible !== supplier.credentials.every((c) => c.status === 'verified')
      )
        throw new RangeError('预计退税资格由供应商凭证状态锁定');
    }
    const result = calculateQuote(quoteInputSchema.parse(action.input));
    if (!result.ok) throw new RangeError('参数无效：' + result.error.field);
    session.quoteInput = action.input;
    state.order.quantity = action.input.quantity;
    state.order.taxEligibility = action.input.rebateEligible ? 'eligible' : 'ineligible';
    state.story.sampledParameters.customized = true;
    session.answers = {};
    session.fieldErrors = [];
  } else if (action.type === 'advance') {
    if (session.feedback) {
      const id = session.feedback.nextNodeId;
      session.feedback = null;
      enter(id, session, pack, command.id);
    } else if (node.type === 'review') {
      const pending = state.story.pendingEvent;
      const event = pack.events.find((candidate) => candidate.id === pending?.eventId);
      if (pending && event?.reviewNodeId === node.id) {
        const record = state.story.eventWindows.find((item) => item.id === pending.windowId)!;
        record.status = 'resolved';
        state.story.completedNodeIds.push(node.id);
        state.story.nodeId = pending.returnNodeId;
        state.story.stage = record.stage;
        state.story.visitIndex++;
        state.story.pendingEvent = null;
        state.story.pendingFeedback = null;
        touchTerms(session, pack, pending.returnNodeId);
      } else enter(node.nextNodeId, session, pack, command.id);
    } else throw new RangeError('当前节点不能继续');
  } else {
    if (session.feedback) throw new RangeError('请先查看后果');
    if (state.story.pendingEvent && action.type !== 'choose')
      throw new RangeError('请先处置当前随机事件');
    const before = {
      ...state.player,
      trustByCustomer: { ...state.player.trustByCustomer },
      day: state.gameDay,
    };
    let branch: { effects: Effect[]; feedback: string; nextNodeId: string }, choiceId: string;
    if (action.type === 'choose' && node.type === 'choice') {
      const choice = node.choices.find((c) => c.id === action.choiceId);
      if (!choice || !matches(choice.when, session, pack)) throw new RangeError('选项不可用');
      branch = choice;
      choiceId = choice.id;
    } else if (action.type === 'submit' && node.type === 'calc') {
      session.answers = { ...session.answers, ...action.answers };
      const puzzle = pack.puzzles.find((p) => p.id === node.puzzleId);
      if (!puzzle || puzzle.kind !== 'quote') throw new RangeError('报价题不存在');
      const fields = puzzle.inputFields as AnswerField[];
      const draft = Object.fromEntries(
        answerFields.map((field) => [
          field,
          session.answers[field] ?? (field === 'rateBasis' ? 'costMarkup' : ''),
        ]),
      ) as QuoteAnswers;
      // 分步校核未激活字段使用合法占位值，不提前泄露答案。
      for (const field of answerFields)
        if (!fields.includes(field) && !draft[field])
          Object.assign(draft, { [field]: field === 'rateBasis' ? 'costMarkup' : '0' });
      const result = evaluateQuote(session.quoteInput, draft, fields);
      session.fieldErrors = result.fieldErrors;
      if (result.fieldErrors.some((e) => e.code === 'FORMAT'))
        return sliceSessionSchema.parse(session);
      branch = node.results.find((r) => matches(r.when, session, pack, result))!;
      choiceId = result.resultId;
      if (result.correct && fields.length === answerFields.length) {
        const quote = calculateQuote(session.quoteInput);
        if (!quote.ok) throw new RangeError('报价参数无效');
        state.order.quote = quote.value;
        session.accepted = true;
      }
    } else throw new RangeError('操作与节点类型不匹配');
    const event = pack.events.find(
      (candidate) => candidate.id === state.story.pendingEvent?.eventId,
    );
    if (event && !event.useNodeEffects) applyEventOutcome(session, pack, choiceId, command.id);
    else effects(branch.effects, session, pack, command.id);
    const evidence = decisionEvidence(session, pack, node.id, choiceId);
    const replayGuide = pack.debrief?.replayGuides.find((g) => g.nodeIds.includes(node.id));
    const customerId = state.order.customerId;
    const trustBefore = customerId ? (before.trustByCustomer[customerId] ?? 0) : 0;
    const trustAfter = customerId ? (state.player.trustByCustomer[customerId] ?? 0) : 0;
    state.story.decisionLog.push({
      id: command.id,
      nodeId: node.id,
      choiceId,
      stage: node.stage,
      sequence: state.story.decisionLog.length,
      deltas: {
        cashCnyFen: state.player.cashCnyFen - before.cashCnyFen,
        profitCnyFen: state.player.cumulativeProfitCnyFen - before.cumulativeProfitCnyFen,
        reputation: state.player.reputation - before.reputation,
        trust: trustAfter - trustBefore,
        days: state.gameDay - before.day,
      },
      evidence,
      familyId: event?.id ?? replayGuide?.familyId ?? node.id,
      majorRisk: event
        ? Boolean(
            pack.eventEconomy
              ?.find((e) => e.eventId === event.id)
              ?.options.find((o) => o.choiceId === choiceId)?.riskFlag,
          )
        : (replayGuide?.riskChoiceIds.includes(choiceId) ?? false),
      before: {
        cashCnyFen: before.cashCnyFen,
        profitCnyFen: before.cumulativeProfitCnyFen,
        reputation: before.reputation,
        trust: trustBefore,
        day: before.day,
      },
      consequenceText: teachingText(branch.feedback, pack),
      counterfactualReviewId: branch.nextNodeId,
    });
    session.feedback = { text: teachingText(branch.feedback, pack), nextNodeId: branch.nextNodeId };
    if (event)
      state.story.pendingFeedback = { sourceId: event.id, reviewNodeId: event.reviewNodeId };
    if (!state.story.completedNodeIds.includes(node.id)) state.story.completedNodeIds.push(node.id);
  }
  state.revision++;
  state.story.appliedCommandIds.push(command.id);
  return sliceSessionSchema.parse(session);
}
/** 反事实仅显示数值差，不伪造尚未发生的收入或现金。 */
export function quoteDifference(session: SliceSession): string | null {
  const submitted = session.answers.fobUnitUsd;
  if (!submitted || !/^-?\d+(\.\d+)?$/.test(submitted)) return null;
  const result = calculateQuote(session.quoteInput);
  if (!result.ok) return null;
  return new D(submitted)
    .minus(result.value.fobUnitUsdQuoted)
    .mul(session.quoteInput.quantity)
    .toFixed(2);
}
