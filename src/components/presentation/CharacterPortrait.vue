<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { presentation } from '../../content/presentation';
import type { ActorId } from '../../domain/schemas/presentation';
const props = withDefaults(defineProps<{ actorId?: ActorId | null; compact?: boolean }>(), {
  actorId: 'mentor_lin',
  compact: false,
});
const actor = computed(() => presentation.actors.find((a) => a.id === props.actorId));
const failed = ref(false);
watch(
  () => props.actorId,
  () => {
    failed.value = false;
  },
);
const atlas = import.meta.env.BASE_URL + presentation.atlas;
</script>
<template>
  <div
    class="character-portrait"
    :class="{ compact }"
    :data-actor="actor?.id ?? 'unknown'"
    role="img"
    :aria-label="actor ? `${actor.name}角色插画` : '未确认身份的联络人'"
  >
    <div v-if="actor && !failed" class="character-crop">
      <img
        :src="atlas"
        alt=""
        aria-hidden="true"
        width="1536"
        height="1024"
        draggable="false"
        :style="{ left: `${-actor.column * 100}%`, top: `${-actor.row * 100}%` }"
        @error="failed = true"
      />
    </div>
    <div v-else class="character-fallback" aria-hidden="true">
      {{ actor?.name.slice(0, 1) ?? '?' }}
    </div>
  </div>
</template>
