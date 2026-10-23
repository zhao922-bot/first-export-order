import type { ContentPack, EventWindowConfig, GameEvent, GameSnapshot } from '../../domain/types';
import { nextRandom } from './rng';
import { evaluateCondition } from './conditions';

export interface EventDrawResult {
  event: GameEvent | null;
  windowId: string;
  probabilityRoll: string | null;
  selectedWeight: string | null;
}
export const eventWindowId = (window: EventWindowConfig) =>
  `event.window.${window.stage}.${window.nodeId}`;
export function eventWeight(event: GameEvent, snapshot: GameSnapshot, pack: ContentPack): number {
  const supplier = pack.suppliers.find((item) => item.id === snapshot.order.supplierId);
  const customer = pack.customers.find((item) => item.id === snapshot.order.customerId);
  return (
    event.weight +
    (supplier?.riskEventIds.includes(event.id) || customer?.exclusiveEventIds.includes(event.id)
      ? event.exclusiveWeightBonus
      : 0)
  );
}
/** 只推进传入事务的事件随机流。资格、互斥、上限均在抽数前过滤。 */
export function drawEvent(
  pack: ContentPack,
  snapshot: GameSnapshot,
  window: EventWindowConfig,
  canHandle: (event: GameEvent) => boolean = () => true,
): EventDrawResult {
  const empty: EventDrawResult = {
    event: null,
    windowId: eventWindowId(window),
    probabilityRoll: null,
    selectedWeight: null,
  };
  const schedule = pack.eventScheduling;
  if (
    !schedule ||
    snapshot.story.pendingEvent ||
    snapshot.story.eventWindows.some((record) => record.id === empty.windowId)
  )
    return empty;
  const count = snapshot.story.eventWindows.filter((record) => record.eventId !== null);
  if (
    count.length >= schedule.perRunEventCap ||
    count.filter((record) => record.stage === window.stage).length >= schedule.perStageEventCap
  )
    return empty;
  const eligible = pack.events
    .filter(
      (event) =>
        window.eventIds.includes(event.id) &&
        event.stages.includes(window.stage) &&
        !snapshot.story.triggeredEventIds.includes(event.id) &&
        (!event.mutexGroup ||
          !pack.events.some(
            (other) =>
              other.mutexGroup === event.mutexGroup &&
              snapshot.story.triggeredEventIds.includes(other.id),
          )) &&
        evaluateCondition(event.when, snapshot, pack) &&
        canHandle(event),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!eligible.length) return empty;
  const forced = eligible
    .filter((event) => event.forceWhen && evaluateCondition(event.forceWhen, snapshot, pack))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
  if (forced)
    return { ...empty, event: forced, selectedWeight: String(eventWeight(forced, snapshot, pack)) };
  // 为尚未确定付款方式的首单预留一次强制审证机会，仍遵守单局上限。
  if (window.stage < 4 && count.length >= schedule.perRunEventCap - 1) return empty;
  const probabilityDraw = nextRandom(snapshot.story.rngState.events);
  snapshot.story.rngState.events = probabilityDraw.state;
  snapshot.story.drawCount++;
  const probabilityRoll = probabilityDraw.value.toFixed(17);
  if (probabilityDraw.value >= Number(schedule.windowProbability))
    return { ...empty, probabilityRoll };
  const total = eligible.reduce((sum, event) => sum + eventWeight(event, snapshot, pack), 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('事件权重总和必须为正');
  const weightDraw = nextRandom(snapshot.story.rngState.events);
  snapshot.story.rngState.events = weightDraw.state;
  snapshot.story.drawCount++;
  let cursor = weightDraw.value * total;
  const event =
    eligible.find((candidate) => {
      cursor -= eventWeight(candidate, snapshot, pack);
      return cursor < 0;
    }) ?? eligible.at(-1)!;
  return {
    ...empty,
    event,
    probabilityRoll,
    selectedWeight: String(eventWeight(event, snapshot, pack)),
  };
}
export function eventForWindow(pack: ContentPack, stage: number, nodeId: string) {
  return pack.eventScheduling?.windows.find(
    (window) => window.stage === stage && window.nodeId === nodeId,
  );
}
