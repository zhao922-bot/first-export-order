import { expect, it } from 'vitest';
import { createGameService } from '../../src/app/GameService';
import { NotImplementedError } from '../../src/app/notImplemented';

it('脚手架不会伪装成可执行的游戏服务', () => {
  expect(createGameService).toThrow(NotImplementedError);
});
