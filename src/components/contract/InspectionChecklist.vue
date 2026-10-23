<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
import { nextTick, ref } from 'vue';
import { presentation } from '../../content/presentation';
defineProps<{ items: ProcurementView['inspection']; revision: number; disabled: boolean }>();
const list = ref<HTMLElement>();
async function inspect(item: ProcurementView['inspection'][number]) {
  if (!item.viewed) emit('view', item.id);
  await nextTick();
  const card = list.value?.querySelector<HTMLElement>(`[data-testid="evidence-${item.id}"]`);
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({ block: 'start' });
}
const emit = defineEmits<{
  view: [id: ProcurementView['inspection'][number]['id']];
  assess: [id: ProcurementView['inspection'][number]['id'], answer: 'pass' | 'issue'];
}>();
</script>
<template>
  <section ref="list" class="inspection-list" aria-label="验货证据与判断">
    <p class="eyebrow">第 {{ revision }} 版验货记录 · 五项均需阅读</p>
    <div class="inspection-map" :aria-label="presentation.experience.inspection" role="group">
      <div class="inspection-crate" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="10" cy="10" r="6" />
          <path d="m14 14 6 6" />
        </svg>
      </div>
      <p>{{ presentation.experience.inspection }}</p>
      <div class="inspection-points">
        <button
          v-for="(item, index) in items"
          :key="item.id"
          type="button"
          :disabled="disabled"
          :aria-label="presentation.experience.inspectPoint + ' · ' + item.label"
          :data-inspection-point="item.id"
          :data-viewed="item.viewed"
          @click="inspect(item)"
        >
          <b>{{ index + 1 }}</b
          ><span
            >{{ item.label
            }}<small>{{
              item.viewed ? presentation.experience.read : presentation.experience.unread
            }}</small></span
          >
        </button>
      </div>
    </div>
    <article
      v-for="item in items"
      :key="item.id"
      class="panel evidence-card"
      tabindex="-1"
      :data-testid="'evidence-' + item.id"
    >
      <div class="section-head">
        <h2>{{ item.label }}</h2>
        <button
          v-if="!item.viewed"
          class="secondary"
          :disabled="disabled"
          @click="emit('view', item.id)"
        >
          查看证据</button
        ><span v-else class="badge">已阅读</span>
      </div>
      <p v-if="item.viewed" class="evidence-copy">{{ item.text }}</p>
      <fieldset :disabled="disabled || !item.viewed">
        <legend>{{ item.label }}判断</legend>
        <label
          ><input
            type="radio"
            :name="item.id"
            :checked="item.answer === 'pass'"
            @change="emit('assess', item.id, 'pass')"
          />符合</label
        ><label
          ><input
            type="radio"
            :name="item.id"
            :checked="item.answer === 'issue'"
            @change="emit('assess', item.id, 'issue')"
          />异常，需处理</label
        >
      </fieldset>
      <p v-if="item.error" class="field-error">此项判断与证据不符，请重读后修正。</p>
    </article>
  </section>
</template>
