import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';
import {
  motionAllowed,
  motionKey,
  readMotion,
  writeMotion,
  type MotionPreference,
} from './presentation';

export const usePresentation = defineStore('presentation', () => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const preference = ref(readMotion(() => localStorage));
  const reduced = ref(media.matches);
  const hidden = ref(document.hidden);
  const notice = ref('');
  const enabled = computed(() => motionAllowed(preference.value, reduced.value));
  const syncMedia = () => {
    reduced.value = media.matches;
  };
  const syncVisibility = () => {
    hidden.value = document.hidden;
  };
  const syncStorage = (event: StorageEvent) => {
    if (event.key === motionKey || event.key === null)
      preference.value = readMotion(() => localStorage);
  };
  media.addEventListener('change', syncMedia);
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('storage', syncStorage);
  onScopeDispose(() => {
    media.removeEventListener('change', syncMedia);
    document.removeEventListener('visibilitychange', syncVisibility);
    window.removeEventListener('storage', syncStorage);
  });
  function setPreference(value: MotionPreference) {
    preference.value = value;
    notice.value = writeMotion(() => localStorage, value) ? '' : '动效设置仅本次生效，未能保存。';
  }
  return { preference, reduced, hidden, enabled, notice, setPreference };
});
