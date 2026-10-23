import type { ContentPack, EventEconomy, GameEvent } from '../../domain/types';
import type { SliceSession } from './session';
import { drawEvent, eventForWindow, eventWindowId } from '../story/events';
import { nextRandom } from '../story/rng';
import { evaluateCondition } from '../story/conditions';
import { D, toMinorUnits } from '../economy/decimal';
import { appendJournal, projectLedger, transfer } from '../economy/ledger';
import { accrueDeadline } from '../economy/deadline';
import { calculateQuote } from '../economy/quote';
import { clamp } from '../economy/score';
import { logisticsQuote, logisticsResolution, logisticsRule } from './logistics';

type Option = EventEconomy['options'][number];
const param = (pack: ContentPack, id: string) => String(pack.parameters[id]!.value);
export function eventOptionPreview(
  session: SliceSession,
  pack: ContentPack,
  event: GameEvent,
  option: Option,
) {
  if (option.operation === 'logisticsResolution') {
    const candidate = structuredClone(session);
    candidate.logistics!.risk = event.id === 'e03' ? 'customs' : 'rollover';
    const result = logisticsResolution(candidate, pack, option.resolution!);
    return {
      costFen: result.feeFen + result.penaltyFen,
      days: option.extraDays,
      buyerExtraFen: result.buyerExtraFen,
    };
  }
  const fixed = option.amountCnyParam ? toMinorUnits(param(pack, option.amountCnyParam)) : 0;
  const freight =
    option.operation === 'freightIncrease'
      ? toMinorUnits(
          new D(logisticsQuote(session, pack, session.logistics!.forwarderId!).sellerOceanFen)
            .div(100)
            .mul(param(pack, option.rateParam!)),
        )
      : 0;
  return { costFen: fixed + freight, days: option.extraDays, buyerExtraFen: 0 };
}
function affordable(session: SliceSession, pack: ContentPack, event: GameEvent) {
  const node = pack.nodes.find((item) => item.id === event.choiceNodeId);
  return (
    pack.eventEconomy
      ?.find((item) => item.eventId === event.id)
      ?.options.some((option) => {
        const choice =
          node?.type === 'choice'
            ? node.choices.find((item) => item.id === option.choiceId)
            : undefined;
        if (!choice || !evaluateCondition(choice.when, session.snapshot, pack)) return false;
        const preview = eventOptionPreview(session, pack, event, option);
        return preview.costFen === 0 || preview.costFen < session.snapshot.player.cashCnyFen;
      }) ?? false
  );
}
/** 只在已提交的剧情转场运行；UI 构建和读档从不调用。 */
export function openEventWindow(session: SliceSession, pack: ContentPack, nodeId: string): void {
  const state = session.snapshot;
  if (state.story.pendingEvent || !state.order.supplierId || session.ending) return;
  const window = eventForWindow(pack, state.story.stage, nodeId);
  if (!window || state.story.eventWindows.some((record) => record.id === eventWindowId(window)))
    return;
  const result = drawEvent(pack, state, window, (event) => affordable(session, pack, event));
  state.story.eventWindows.push({
    id: result.windowId,
    stage: window.stage,
    anchorNodeId: nodeId,
    eventId: result.event?.id ?? null,
    status: result.event ? 'pending' : 'resolved',
    probabilityRoll: result.probabilityRoll,
    selectedWeight: result.selectedWeight,
  });
  if (!result.event) return;
  const event = result.event;
  state.story.triggeredEventIds.push(event.id);
  state.story.pendingEvent = {
    eventId: event.id,
    windowId: result.windowId,
    returnNodeId: window.returnNodeId,
  };
  state.story.nodeId = event.choiceNodeId;
  state.story.visitIndex++;
  if (event.id === 'e01') {
    const sign = nextRandom(state.story.rngState.events);
    state.story.rngState.events = sign.state;
    state.story.drawCount++;
    state.story.sampledParameters.eventFxFactor = new D(1)
      .plus(new D(param(pack, 'economy.events.e01.amplitude')).mul(sign.value < 0.5 ? -1 : 1))
      .toFixed();
  }
  if (event.id === 'e03' || event.id === 'e08') {
    const risk = event.id === 'e03' ? 'customs' : 'rollover';
    session.logistics!.risk = risk;
    session.logistics!.riskResolved = false;
    Object.assign(state.order.flags, {
      logisticsCustoms: risk === 'customs',
      logisticsRollover: risk === 'rollover',
      logisticsClear: false,
      logisticsRiskResolved: false,
    });
    state.story.sampledParameters.logisticsRisk = risk;
  }
}
/** 事件结算仍是 reducer 原子事务的一部分，失败不提交账本、时钟或随机状态。 */
export function applyEventOutcome(
  session: SliceSession,
  pack: ContentPack,
  choiceId: string,
  commandId: string,
): void {
  const pending = session.snapshot.story.pendingEvent;
  const event = pack.events.find((item) => item.id === pending?.eventId);
  const option = pack.eventEconomy
    ?.find((item) => item.eventId === event?.id)
    ?.options.find((item) => item.choiceId === choiceId);
  if (!event || !option || session.feedback) throw new RangeError('事件处置与当前窗口不匹配');
  const state = session.snapshot,
    o = state.order;
  if (option.operation === 'logisticsResolution') {
    logisticsRule(session, pack, 'logistics.resolve', commandId, option.resolution!);
  } else {
    const preview = eventOptionPreview(session, pack, event, option);
    if (preview.costFen > state.player.cashCnyFen)
      throw new RangeError('现金不足支付事件处置费用，请选择其他可用处置');
    if (preview.costFen) {
      state.journal = appendJournal(state.journal, [
        {
          id: commandId + '.event',
          commandId,
          sourceNodeId: event.choiceNodeId,
          gameDay: state.gameDay,
          description: event.title + '实际处置支出（教学算例参数，可配置）',
          postings: transfer('expense', 'cash', preview.costFen),
        },
      ]);
      Object.assign(state.player, projectLedger(state.journal));
      if (option.eventCostMode === 'logistics' && session.logistics)
        session.logistics.incidentPaidFen += preview.costFen;
      if (option.eventCostMode === 'collection' && session.collection && event.id === 'e07')
        session.collection.bankFeeFen += preview.costFen;
    }
    if (option.extraDays) {
      const deadline = accrueDeadline(state, state.gameDay + option.extraDays);
      state.gameDay += option.extraDays;
      if (option.advanceDeliveryClock) o.remainingDeliveryDays = deadline.remainingDays;
      if (session.logistics && state.story.stage === 6 && session.logistics.readyDay !== null)
        session.logistics.readyDay = Math.max(session.logistics.readyDay, state.gameDay);
    }
  }
  if (option.operation === 'fxRequote' || option.operation === 'fxRetain') {
    const factor = String(state.story.sampledParameters.eventFxFactor);
    if (state.story.stage === 3 && option.operation === 'fxRequote') {
      session.quoteInput.fxCnyPerUsd = new D(session.quoteInput.fxCnyPerUsd).mul(factor).toFixed();
      const quote = calculateQuote(session.quoteInput);
      if (!quote.ok) throw new RangeError('波动后报价参数无效');
      o.quote = quote.value;
      session.answers = {};
    } else o.flags.eventCollectionFxFactor = factor;
    // 收汇阶段选择提前结汇，使用当前已知波动因子；不增加美元本金或重复销售收入。
  }
  if (option.operation === 'priceDiscount') {
    o.flags.eventDiscountRate = new D(1)
      .minus(
        new D(1)
          .minus(String(o.flags.eventDiscountRate || '0'))
          .mul(new D(1).minus(param(pack, option.rateParam!))),
      )
      .toFixed();
    if (session.negotiation) session.negotiation.confirmations = [];
    o.flags.contractReady = false;
    if (option.minimumDepositRatioParam && session.negotiation) {
      if (o.payment !== 'TT') throw new RangeError('让价交换的高定金只适用于 T/T');
      const ratio = D.max(
        session.negotiation.depositRatio,
        param(pack, option.minimumDepositRatioParam),
      ).toFixed();
      session.negotiation.depositRatio = ratio;
      o.flags.eventMinimumDepositRatio = ratio;
      o.flags.requiresDeposit = true;
    }
  }
  state.player.reputation = clamp(state.player.reputation + option.reputationDelta, 0, 100);
  if (o.customerId)
    state.player.trustByCustomer[o.customerId] = clamp(
      (state.player.trustByCustomer[o.customerId] ?? 0) + option.trustDelta,
      0,
      100,
    );
  for (const [id, value] of Object.entries(option.resultFlags)) o.flags[id] = value;
  if (option.riskFlag) o.flags[option.riskFlag] = true;
  if (event.id === 'e04' && session.procurement) session.procurement.delayIssue = true;
}

/** 恢复只校验已保存事实，不调用抽签；拒绝损坏的悬挂事件与重复窗口。 */
export function validateEventState(session: SliceSession, pack: ContentPack): void {
  const { story } = session.snapshot;
  if (story.rngVersion !== 2) throw new RangeError('随机状态版本不兼容');
  if (
    new Set(story.eventWindows.map((record) => record.id)).size !== story.eventWindows.length ||
    new Set(story.triggeredEventIds).size !== story.triggeredEventIds.length
  )
    throw new RangeError('事件记录重复');
  const selected = story.eventWindows.filter((record) => record.eventId);
  if (
    selected.length !== story.triggeredEventIds.length ||
    new Set(selected.map((record) => record.eventId)).size !== selected.length
  )
    throw new RangeError('事件触发记录不完整');
  if (selected.length > (pack.eventScheduling?.perRunEventCap ?? 0))
    throw new RangeError('事件次数超过上限');
  const groups = selected
    .map((record) => pack.events.find((item) => item.id === record.eventId)?.mutexGroup)
    .filter((group): group is string => Boolean(group));
  if (new Set(groups).size !== groups.length) throw new RangeError('事件互斥记录无效');
  for (const stage of [1, 2, 3, 4, 5, 6, 7])
    if (
      selected.filter((record) => record.stage === stage).length >
      (pack.eventScheduling?.perStageEventCap ?? 0)
    )
      throw new RangeError('关卡事件次数超过上限');
  for (const record of story.eventWindows) {
    const window = eventForWindow(pack, record.stage, record.anchorNodeId);
    if (
      !window ||
      record.id !== eventWindowId(window) ||
      (record.eventId && !window.eventIds.includes(record.eventId))
    )
      throw new RangeError('事件窗口记录无效');
    if (record.eventId && !story.triggeredEventIds.includes(record.eventId))
      throw new RangeError('事件触发记录不完整');
  }
  const pending = story.pendingEvent;
  const active = story.eventWindows.filter((record) => record.status === 'pending');
  if (!pending) {
    if (active.length || story.nodeId.startsWith('EVT.')) throw new RangeError('事件上下文缺失');
    return;
  }
  const event = pack.events.find((item) => item.id === pending.eventId);
  const record = active.find(
    (item) => item.id === pending.windowId && item.eventId === pending.eventId,
  );
  const window = record ? eventForWindow(pack, record.stage, record.anchorNodeId) : null;
  if (
    !event ||
    active.length !== 1 ||
    !window ||
    pending.returnNodeId !== window.returnNodeId ||
    ![event.choiceNodeId, event.reviewNodeId].includes(story.nodeId)
  )
    throw new RangeError('待处置事件记录无效');
  if (pending.eventId === 'e01') {
    const factor = String(story.sampledParameters.eventFxFactor),
      amplitude = param(pack, 'economy.events.e01.amplitude');
    if (![new D(1).plus(amplitude).toFixed(), new D(1).minus(amplitude).toFixed()].includes(factor))
      throw new RangeError('汇率事件抽样结果无效');
  }
}
