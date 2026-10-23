import { readonly, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { PlayerState } from '../domain/types';
export const usePlayerStore = defineStore('player', () => {
  const state = shallowRef<PlayerState | null>(null);
  function replaceState(value: PlayerState) {
    state.value = structuredClone(value);
  }
  return { state: readonly(state), replaceState };
});
