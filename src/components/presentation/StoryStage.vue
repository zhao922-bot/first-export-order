<script setup lang="ts">
import { computed } from 'vue';
import { presentation } from '../../content/presentation';
import type { ActorId } from '../../domain/schemas/presentation';
import CharacterPortrait from './CharacterPortrait.vue';
import SceneArtwork from './SceneArtwork.vue';
const props = defineProps<{ stage: number; actorId: ActorId | null }>();
const scene = computed(() => presentation.stages.find((s) => s.stage === props.stage));
const actor = computed(() => presentation.actors.find((a) => a.id === props.actorId));
</script>
<template>
  <section v-if="scene" class="story-stage" :data-scene="scene.scene" :aria-label="scene.title">
    <div class="scene-copy">
      <span class="scene-kicker">CHAPTER 0{{ stage }} / 业务现场</span>
      <h2>{{ scene.title }}</h2>
      <p>{{ scene.subtitle }}</p>
    </div>
    <SceneArtwork :scene="scene.scene" />
    <div class="scene-person">
      <CharacterPortrait :actor-id="actorId" /><span class="scene-name">{{
        actor?.name ?? '采购联络处'
      }}</span>
    </div>
    <span class="scene-footnote">场景插画 · 交易状态以记录为准</span>
  </section>
</template>
