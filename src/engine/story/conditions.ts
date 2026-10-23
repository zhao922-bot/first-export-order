import type { Condition, ContentPack, GameSnapshot } from '../../domain/types';
type ConditionValue = Extract<Condition, { op: 'in' }>['left'];

function readValue(value: ConditionValue, state: GameSnapshot, pack: ContentPack): unknown {
  if (value.kind === 'literal') return value.value;
  if (value.scope === 'config') return pack.parameters[value.path.replace(/\.value$/, '')]?.value;
  let cursor: unknown = state;
  for (const key of value.path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** 条件求值不消耗随机数；运行时只读取已登记快照与配置。 */
export function evaluateCondition(
  condition: Condition,
  state: GameSnapshot,
  pack: ContentPack,
): boolean {
  if (condition.op === 'all')
    return condition.conditions.every((child) => evaluateCondition(child, state, pack));
  if (condition.op === 'any')
    return condition.conditions.some((child) => evaluateCondition(child, state, pack));
  if (condition.op === 'not') return !evaluateCondition(condition.condition, state, pack);
  if (condition.op === 'exists') {
    const value = readValue(condition.value, state, pack);
    return value !== undefined && value !== null && value !== '';
  }
  if (condition.op === 'flag') {
    const [scope, ...parts] = condition.path.split('.');
    if (scope !== 'order' || parts[0] !== 'flags') return false;
    return state.order.flags[parts.slice(1).join('.')] === condition.equals;
  }
  if (condition.op === 'in')
    return condition.right.some(
      (value) => readValue(value, state, pack) === readValue(condition.left, state, pack),
    );
  if (
    condition.op === 'eq' ||
    condition.op === 'ne' ||
    condition.op === 'gt' ||
    condition.op === 'gte' ||
    condition.op === 'lt' ||
    condition.op === 'lte'
  ) {
    const left = readValue(condition.left, state, pack);
    const right = readValue(condition.right, state, pack);
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
