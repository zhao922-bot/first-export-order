import type { GameCommand, DispatchResult, RestoreResult, GameSnapshot } from '../domain/types';
import { notImplemented } from './notImplemented';
export interface GameService {
  dispatch(command: GameCommand): Promise<DispatchResult>;
  getSnapshot(): Readonly<GameSnapshot>;
  restore(save: unknown): Promise<RestoreResult>;
}
export function createGameService(): GameService {
  return notImplemented('GameService');
}
