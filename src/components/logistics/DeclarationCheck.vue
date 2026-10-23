<script setup lang="ts">
import type { LogisticsView } from '../../app/logisticsView';
import { useTextDrafts } from '../../app/useTextDrafts';
const props = defineProps<{ fields: LogisticsView['fields'] }>();
const { draft, edit } = useTextDrafts(() =>
  Object.fromEntries(props.fields.map((f) => [f.id, f.value])),
);
const emit = defineEmits<{
  edit: [id: LogisticsView['fields'][number]['id'], value: string];
  check: [id: LogisticsView['fields'][number]['id'], checked: boolean];
}>();
function update(id: LogisticsView['fields'][number]['id'], event: Event) {
  const value = (event.target as HTMLInputElement).value;
  edit(id, value);
  emit('edit', id, value);
}
</script>
<template>
  <section class="panel declaration-panel" aria-label="申报核心字段核对">
    <h2>合同源记录与协同草稿</h2>
    <p class="muted">修改字段后，该项确认会清空；先修正草稿，再重新确认。</p>
    <div v-for="field in fields" :key="field.id" class="declaration-row">
      <p>
        <strong>{{ field.label }}</strong
        ><br /><span :data-source-field="field.id">合同源记录：{{ field.source }}</span>
      </p>
      <label :for="'declaration-' + field.id">{{ field.label }}草稿</label>
      <input
        :id="'declaration-' + field.id"
        :value="draft[field.id]"
        :aria-invalid="field.error"
        :aria-describedby="field.error ? 'declaration-error-' + field.id : undefined"
        maxlength="200"
        @input="update(field.id, $event)"
      />
      <label class="checkbox"
        ><input
          type="checkbox"
          :checked="field.checked && draft[field.id] === field.value"
          @change="emit('check', field.id, ($event.target as HTMLInputElement).checked)"
        />已核对{{ field.label }}</label
      >
      <p v-if="field.error" :id="'declaration-error-' + field.id" class="field-error">
        上次校核发现差异；修改后请重新提交确认。
      </p>
    </div>
  </section>
</template>
