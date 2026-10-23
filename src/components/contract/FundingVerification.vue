<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
defineProps<{ model: ProcurementView; disabled: boolean }>();
const emit = defineEmits<{ check: [id: string, checked: boolean] }>();
</script>
<template>
  <section class="panel funding-record" aria-label="客户资金核验证据">
    <span class="eyebrow">教学模拟记录 · 并非真实银行接口</span>
    <p class="lead small">{{ model.fundingEvidence }}</p>
    <ul>
      <li v-for="detail in model.fundingDetails" :key="detail">{{ detail }}</li>
    </ul>
    <fieldset :disabled="disabled">
      <legend>资金核验清单</legend>
      <label v-for="field in model.fundingChecks" :key="field.id" class="pi-field"
        ><input
          type="checkbox"
          :checked="field.checked"
          @change="emit('check', field.id, ($event.target as HTMLInputElement).checked)"
        /><span>{{ field.label }}</span></label
      >
    </fieldset>
  </section>
</template>
