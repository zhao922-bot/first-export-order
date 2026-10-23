import { nextRandom, seedRngState } from './rng';

/** 业务事实使用独立命名空间；不扰动 12 个事件的调度流。结果随事务持久化。 */
export function businessDraw(seed: string, fact: string): number {
  return nextRandom(seedRngState(seed + ':business.v1:' + fact, 'events')).value;
}
