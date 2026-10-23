import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import raw from '../content/onboarding.json';
import { onboardingSchema } from '../domain/schemas/onboarding';
import { freshGuide, readGuide, writeGuide, type GuideState } from './onboarding';

export const useOnboarding = defineStore('onboarding', () => {
  const content = onboardingSchema.parse(raw);
  const loaded = readGuide(() => localStorage);
  const state = shallowRef(loaded.state);
  const storageUnavailable = shallowRef(loaded.unavailable);
  function update(patch: Partial<GuideState>) {
    state.value = { ...state.value, ...patch };
    storageUnavailable.value = !writeGuide(() => localStorage, state.value);
  }
  return { content, state, storageUnavailable, update, replay: () => update(freshGuide()) };
});
