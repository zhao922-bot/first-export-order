<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { presentation } from '../../content/presentation';
import type { ActorId, MentorCue } from '../../domain/schemas/presentation';
import { mentorExpression, portraitCandidates } from '../../app/presentation';
const props = withDefaults(
  defineProps<{
    actorId?: ActorId | null;
    compact?: boolean;
    cue?: MentorCue;
    customerExpression?: 'neutral' | 'considering';
  }>(),
  {
    actorId: 'mentor_lin',
    compact: false,
    cue: 'default',
    customerExpression: 'neutral',
  },
);
const actor = computed(() => presentation.actors.find((a) => a.id === props.actorId));
const expression = computed(() =>
  actor.value?.id === 'mentor_lin'
    ? mentorExpression(presentation, props.cue)
    : actor.value && props.customerExpression === 'considering'
      ? { ...actor.value, id: 'considering', label: presentation.customers.label }
      : null,
);
const attempt = ref(0);
watch(
  () => `${props.actorId}/${expression.value?.id}`,
  () => {
    attempt.value = 0;
  },
);
const candidates = computed(() =>
  portraitCandidates(
    presentation,
    expression.value
      ? actor.value?.id === 'mentor_lin'
        ? presentation.mentor.atlas
        : presentation.customers.atlas
      : presentation.atlas,
  ),
);
const candidate = computed(() => candidates.value[attempt.value]);
const failed = computed(() => !candidate.value);
const expressionFailed = computed(
  () => !candidate.value || candidate.value.source === presentation.atlas,
);
const atlas = computed(() => import.meta.env.BASE_URL + (candidate.value?.url ?? ''));
const cell = computed(() =>
  expression.value && !expressionFailed.value ? expression.value : actor.value,
);
function imageError() {
  attempt.value += 1;
}
</script>
<template>
  <div
    class="character-portrait"
    :class="{ compact }"
    :data-actor="actor?.id ?? 'unknown'"
    :data-expression="expression?.id"
    :data-portrait-fallback="attempt > 0"
    role="img"
    :aria-label="
      actor
        ? `${actor.name}角色插画${expression && !expressionFailed ? ` · ${expression.label}` : ''}`
        : '未确认身份的联络人'
    "
  >
    <div
      v-if="actor && !failed"
      class="character-crop"
      :style="
        expression && 'leftInset' in expression && !expressionFailed
          ? { clipPath: `inset(0 0 0 ${expression.leftInset}%)` }
          : undefined
      "
    >
      <img
        :key="atlas"
        :src="atlas"
        alt=""
        aria-hidden="true"
        width="1536"
        height="1024"
        draggable="false"
        :style="{ left: `${-(cell?.column ?? 0) * 100}%`, top: `${-(cell?.row ?? 0) * 100}%` }"
        @error="imageError"
      />
    </div>
    <div v-else class="character-fallback" aria-hidden="true">
      {{ actor?.name.slice(0, 1) ?? '?' }}
    </div>
  </div>
</template>
