<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
defineProps<{ items: ProcurementView['inspection']; revision: number; disabled: boolean }>();
const emit = defineEmits<{
  view: [id: ProcurementView['inspection'][number]['id']];
  assess: [id: ProcurementView['inspection'][number]['id'], answer: 'pass' | 'issue'];
}>();
</script>
<template>
  <section class="inspection-list" aria-label="验货证据与判断">
    <p class="eyebrow">第 {{ revision }} 版验货记录 · 五项均需阅读</p>
    <article
      v-for="item in items"
      :key="item.id"
      class="panel evidence-card"
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
