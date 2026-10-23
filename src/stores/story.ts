import { readonly, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { StoryProgress } from '../domain/types';
export const useStoryStore = defineStore('story', () => {
  const state = shallowRef<StoryProgress | null>(null);
  function replaceState(value: StoryProgress) {
    state.value = structuredClone(value);
  }
  return { state: readonly(state), replaceState };
});
