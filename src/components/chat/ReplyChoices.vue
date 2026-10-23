<script setup lang="ts">
defineProps<{
  choices: readonly {
    id: string;
    label: string;
    enabled: boolean;
    disabledReason: string | null;
    detail: string;
  }[];
}>();
const emit = defineEmits<{ choose: [id: string] }>();
</script>
<template>
  <div class="panel choice-list">
    <div v-for="choice in choices" :key="choice.id">
      <button
        class="choice-button"
        :disabled="!choice.enabled"
        :data-choice-id="choice.id"
        @click="emit('choose', choice.id)"
      >
        {{ choice.label }} <span>→</span>
      </button>
      <p v-if="choice.detail" class="option-detail">{{ choice.detail }}</p>
      <p v-if="!choice.enabled && choice.disabledReason" class="muted">
        {{ choice.disabledReason }}
      </p>
    </div>
  </div>
</template>
