import { reactive } from 'vue';

// UI-only state. A failed import never deletes or resets a game save.
export const navigation = reactive({ loading: false, failed: false });
