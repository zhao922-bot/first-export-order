import { expect, it, vi } from 'vitest';
import { uniqueId } from '../../src/app/uniqueId';
it('安全上下文优先使用原生 randomUUID，并保留方法接收者', () => {
  const source = {
    randomUUID: vi.fn(function (this: unknown) {
      expect(this).toBe(source);
      return 'native-uuid';
    }),
    getRandomValues: vi.fn(),
  } as unknown as Crypto;
  expect(uniqueId(source)).toBe('native-uuid');
  expect(source.getRandomValues).not.toHaveBeenCalled();
});
it('普通 LAN HTTP 无 randomUUID 时用 getRandomValues，固定 UUID v4 版本和变体', () => {
  let counter = 0;
  const source = {
    getRandomValues: vi.fn((array: Uint8Array) => {
      array.fill(255);
      array[0] = counter++;
      return array;
    }),
  } as unknown as Crypto;
  expect(uniqueId(source)).toBe('00ffffff-ffff-4fff-bfff-ffffffffffff');
  expect(uniqueId(source)).toBe('01ffffff-ffff-4fff-bfff-ffffffffffff');
  expect(source.getRandomValues).toHaveBeenCalledTimes(2);
});
