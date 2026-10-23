<script setup lang="ts">
import { computed } from 'vue';
import { presentation } from '../../content/presentation';
import type { ActorId, MentorCue } from '../../domain/schemas/presentation';
import { sampleStep, workspacePhase } from '../../app/presentation';
import CharacterPortrait from './CharacterPortrait.vue';
import SceneArtwork from './SceneArtwork.vue';
const props = withDefaults(
  defineProps<{
    stage: number;
    actorId: ActorId | null;
    cue?: MentorCue;
    productId?: string | undefined;
    nodeId?: string;
  }>(),
  { cue: 'default', productId: undefined, nodeId: '' },
);
const scene = computed(() => presentation.stages.find((s) => s.stage === props.stage));
const actor = computed(() => presentation.actors.find((a) => a.id === props.actorId));
const phase = computed(() => (props.stage === 1 ? sampleStep(props.cue) : null));
const workspace = computed(() => presentation.workspaces.find((w) => w.stage === props.stage));
const current = computed(() => workspacePhase(presentation, props.nodeId));
</script>
<template>
  <section
    v-if="scene"
    class="story-stage"
    :class="{ 'trade-stage': stage > 1 }"
    :data-scene="scene.scene"
    :aria-label="scene.title"
  >
    <div class="scene-copy">
      <span class="scene-kicker">{{ workspace?.label ?? `CHAPTER 0${stage} / 业务现场` }}</span>
      <h2>{{ scene.title }}</h2>
      <p>
        {{
          phase !== null
            ? presentation.interface.sampleNotes[phase]
            : (current?.phase.note ?? scene.subtitle)
        }}
      </p>
      <ol
        v-if="phase !== null"
        class="sample-steps"
        :aria-label="presentation.interface.sampleLabel"
      >
        <li
          v-for="(step, i) in presentation.interface.sampleSteps"
          :key="step"
          :aria-current="i === phase ? 'step' : undefined"
        >
          <span>0{{ i + 1 }}</span
          >{{ step }}
        </li>
      </ol>
      <ol v-if="workspace" class="sample-steps trade-steps" aria-label="本关业务环节">
        <li
          v-for="(step, i) in workspace.phases"
          :key="step.label"
          :aria-current="current?.index === i ? 'step' : undefined"
        >
          <span>0{{ i + 1 }}</span
          >{{ step.label }}
        </li>
      </ol>
    </div>
    <SceneArtwork :scene="scene.scene" :product-id="productId" />
    <div class="scene-person">
      <CharacterPortrait
        :actor-id="actorId"
        :cue="cue"
        :customer-expression="current?.phase.customerExpression ?? 'neutral'"
      /><span class="scene-name">{{ actor?.name ?? '采购联络处' }}</span>
    </div>
    <span class="scene-footnote">{{ presentation.interface.sceneNote }}</span>
  </section>
</template>
