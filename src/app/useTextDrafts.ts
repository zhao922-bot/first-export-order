import { reactive, watch } from 'vue';

/** Keep native typing immediate while queued commits acknowledge earlier values. */
export function useTextDrafts(source: () => Readonly<Record<string, string>>) {
  const draft = reactive<Record<string, string>>({});
  const pending = new Map<string, string>();
  watch(
    source,
    (values) => {
      for (const key of new Set([...Object.keys(draft), ...Object.keys(values)])) {
        const next = values[key] ?? '';
        if (pending.has(key) && pending.get(key) !== next) continue;
        pending.delete(key);
        draft[key] = next;
      }
    },
    { immediate: true, deep: true },
  );
  return {
    draft,
    edit(key: string, value: string) {
      pending.set(key, value);
      draft[key] = value;
    },
    reset(key: string) {
      pending.delete(key);
      draft[key] = source()[key] ?? '';
    },
  };
}
