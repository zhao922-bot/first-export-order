export type RngState = [number, number, number, number];
const rotl = (value: number, k: number) => ((value << k) | (value >>> (32 - k))) >>> 0;
/** FNV-1a 派生四字状态；参数/事件/单据各自独立。版本 1。 */
export function seedRngState(seed: string, stream: string): RngState {
  const words = [0, 1, 2, 3].map((index) => {
    let hash = 2166136261;
    for (const char of seed + ':' + stream + ':' + index)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    // 事件流 v2：打散相邻 FNV 种子字，避免前两次抽数相关导致尾部权重难以命中。
    // 参数流保持 v1，既有报价、客户引导种子不变。
    if (stream === 'events') {
      hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
      hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
      hash = (hash ^ (hash >>> 16)) >>> 0;
    }
    return hash;
  });
  if (words.every((word) => word === 0)) return [1, 0, 0, 0];
  return words as RngState;
}
/** xoshiro128**：纯函数返回下一个状态，不修改传入数组。 */
export function nextRandom(source: RngState): { value: number; state: RngState } {
  if (
    source.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffffffff) ||
    source.every((n) => n === 0)
  )
    throw new RangeError('无效随机状态');
  const s = [...source] as RngState;
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0,
    t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return { value: result / 4294967296, state: s };
}
export function createSeededRng(seed: string): () => number {
  let state = seedRngState(seed, 'parameters');
  return () => {
    const draw = nextRandom(state);
    state = draw.state;
    return draw.value;
  };
}
