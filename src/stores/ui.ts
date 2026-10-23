import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const validationStatus = ref<'pending' | 'ready' | 'error'>('pending');
  const validationMessage = ref('正在校验示例内容');
  return { validationStatus, validationMessage };
});
