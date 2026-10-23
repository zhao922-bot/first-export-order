import { shallowRef } from 'vue';
import type { GameStore } from './useSliceGame';

/** The landing page can render before loading trade content and the game engine. */
export const loadedGame = shallowRef<GameStore | null>(null);
let loading: Promise<GameStore> | undefined;
export function loadGame(): Promise<GameStore> {
  if (loadedGame.value) return Promise.resolve(loadedGame.value);
  loading ??= import('./useSliceGame')
    .then(({ useSliceGame }) => useSliceGame())
    .catch((cause) => {
      loading = undefined;
      throw cause;
    });
  return loading;
}

/** Presence hint only. Full validation always happens before resume or overwrite. */
export function hasLocalSave() {
  try {
    return Boolean(
      localStorage.getItem('first-export.slice.v2:auto:head') ||
      localStorage.getItem('first-export.slice.v1'),
    );
  } catch {
    return false;
  }
}
