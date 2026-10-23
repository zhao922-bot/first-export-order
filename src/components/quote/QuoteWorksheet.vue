<script setup lang="ts">
import type { QuoteEvaluation } from '../../domain/types';
import { ref, watch, nextTick } from 'vue';
const props = defineProps<{
  fields: string[];
  blocked: boolean;
  answers: Readonly<Record<string, string>>;
  errors: readonly QuoteEvaluation['fieldErrors'][number][];
}>();
const emit = defineEmits<{ draft: [answers: Record<string, string>]; submit: [] }>();
const form = ref<HTMLFormElement | null>(null);
watch(
  () => props.errors,
  async (errors) => {
    if (errors.length) {
      await nextTick();
      form.value?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }
  },
);
const labels: Record<string, string> = {
  rebateUnitCny: '每件预计退税（CNY/件）',
  fobCostUnitCny: 'FOB 成本基数（CNY/件）',
  rateBasis: '本题利润率口径',
  fobUnitUsd: 'FOB 对外单价（USD/件）',
  cifUnitUsd: 'CIF 对外单价（USD/件）',
};
function update(key: string, value: string) {
  emit('draft', { ...props.answers, [key]: value });
}
</script>
<template>
  <form ref="form" class="panel worksheet" @submit.prevent="!blocked && emit('submit')">
    <div class="section-head">
      <h2>你的计算草稿</h2>
      <span class="eyebrow">手填校核</span>
    </div>
    <p class="muted">
      任务指定成本加成率。中间答案可填至分，计算过程请保留精度；最终报价保留两位小数。可使用计算器。
    </p>
    <div class="answer-grid">
      <label v-for="field in fields" :key="field"
        >{{ labels[field] }}
        <select
          v-if="field === 'rateBasis'"
          :value="answers[field] || 'costMarkup'"
          :aria-label="labels[field]"
          @change="update(field, ($event.target as HTMLSelectElement).value)"
        >
          <option value="costMarkup">成本加成率：利润 ÷ 成本</option>
          <option value="salesMargin">销售毛利率：利润 ÷ 售价</option>
        </select>
        <input
          v-else
          :value="answers[field] || ''"
          :aria-label="labels[field]"
          :aria-invalid="errors.some((e) => e.field === field)"
          :aria-describedby="errors.some((e) => e.field === field) ? 'error-' + field : undefined"
          inputmode="decimal"
          maxlength="100"
          placeholder="填写你的计算结果"
          @input="update(field, ($event.target as HTMLInputElement).value)"
        />
        <small
          v-for="error in errors.filter((e) => e.field === field)"
          :id="'error-' + field"
          :key="error.code"
          class="field-error"
          >{{ error.message }}</small
        >
      </label>
    </div>
    <p v-if="blocked" class="guidance-note">参数有未应用的修改，请先应用参数再提交报价。</p>
    <button class="primary" type="submit" :disabled="blocked">
      {{ fields.length === 5 ? '提交完整报价' : '校核这一步' }} →
    </button>
  </form>
</template>
