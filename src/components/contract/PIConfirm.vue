<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
defineProps<{ fields: ProcurementView['piFields']; disabled: boolean }>();
const emit = defineEmits<{ confirm: [id: string, checked: boolean] }>();
</script>
<template>
  <fieldset class="panel pi-confirm" :disabled="disabled">
    <legend>PI 关键字段确认</legend>
    <p class="muted">对照已签合同与确认样逐项核对；本页记录模拟接受，不重新签约或重置交期。</p>
    <label v-for="field in fields" :key="field.id" class="pi-field"
      ><input
        type="checkbox"
        :checked="field.checked"
        @change="emit('confirm', field.id, ($event.target as HTMLInputElement).checked)"
      /><span
        ><strong>{{ field.label }}</strong
        ><span>{{ field.value }}</span></span
      ></label
    >
  </fieldset>
</template>
