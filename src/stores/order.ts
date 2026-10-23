import { readonly, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { OrderState } from '../domain/types';
export const useOrderStore = defineStore('order', () => {
  const state = shallowRef<OrderState | null>(null);
  function replaceState(value: OrderState) {
    state.value = structuredClone(value);
  }
  return { state: readonly(state), replaceState };
});
