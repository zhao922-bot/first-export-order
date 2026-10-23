<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { QuoteInput } from '../../domain/types';
const props = defineProps<{
  input: QuoteInput;
  editable: boolean;
  eligibilityLocked: boolean;
  savedDraft: Readonly<Record<string, string | boolean>> | null;
}>();
const emit = defineEmits<{
  configure: [input: QuoteInput];
  dirty: [value: boolean];
  draft: [value: Record<string, string | boolean> | null];
}>();
const normalize = (input: QuoteInput) =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? value : String(value),
    ]),
  );
const draft = reactive<Record<string, string | boolean>>({
  ...normalize(props.input),
  ...props.savedDraft,
});
let latestEmission: string | undefined;
watch(
  () => JSON.stringify(props.input),
  (value) => {
    latestEmission = undefined;
    Object.assign(draft, normalize(JSON.parse(value) as QuoteInput));
  },
);
watch(
  () => JSON.stringify(props.savedDraft),
  (value) => {
    // An earlier queued save must not replace text typed after that save began.
    // On reload there is no local emission, so recovered drafts can populate UI.
    if (latestEmission !== undefined && value !== latestEmission) return;
    latestEmission = undefined;
    Object.assign(draft, normalize(props.input), props.savedDraft);
  },
);
watch(
  [() => JSON.stringify(draft), () => JSON.stringify(normalize(props.input))],
  ([value, input]) => emit('dirty', value !== input),
  { immediate: true },
);
const fields = [
  ['taxInclusiveUnitCny', '含税采购价 P', 'CNY/件'],
  ['quantity', '数量 Q', '件'],
  ['vatRate', '增值税率 v', '小数比例'],
  ['rebateRate', '退税率 r', '小数比例'],
  ['domesticTotalCny', '国内总费用 D', 'CNY'],
  ['fxCnyPerUsd', '汇率 E', 'CNY/USD'],
  ['costMarkupRate', '成本加成率 m', '小数比例'],
  ['oceanTotalUsd', '海运总费用 F', 'USD'],
  ['insuranceCoverageFactor', '投保比例 a', '倍数'],
  ['insuranceRate', '保险费率 i', '小数比例'],
] as const;
function update(key: (typeof fields)[number][0], event: Event) {
  const value = (event.target as HTMLInputElement).value;
  draft[key] = value;
  persist();
}
function persist() {
  const value =
    JSON.stringify(draft) === JSON.stringify(normalize(props.input)) ? null : { ...draft };
  latestEmission = JSON.stringify(value);
  emit('draft', value);
}
function apply() {
  emit('configure', { ...draft, quantity: Number(draft.quantity) } as QuoteInput);
}
</script>
<template>
  <section class="panel parameters">
    <div class="section-head">
      <h2>本单参数</h2>
      <span class="badge">教学算例参数，可配置</span>
    </div>
    <p class="muted">百分比以小数填写：0.13 = 13%。首次提交后锁定参数，刷新不会重抽或清除返工。</p>
    <form @submit.prevent="apply">
      <div class="parameter-grid">
        <label v-for="[key, label, unit] in fields" :key="key"
          >{{ label }} <small>{{ unit }}</small
          ><input
            :aria-label="label"
            :value="draft[key]"
            inputmode="decimal"
            maxlength="100"
            :disabled="!editable"
            @input="update(key, $event)"
        /></label>
      </div>
      <label class="checkbox"
        ><input
          v-model="draft.rebateEligible"
          type="checkbox"
          :disabled="!editable || eligibilityLocked"
          @change="persist"
        />
        教学核验满足预计退税资格{{ eligibilityLocked ? '（由所选供应商凭证锁定）' : '' }}</label
      >
      <button v-if="editable" class="secondary" type="submit">应用参数并清空草稿</button>
    </form>
  </section>
</template>
