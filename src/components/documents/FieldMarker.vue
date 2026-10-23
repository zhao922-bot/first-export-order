<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
import { presentation } from '../../content/presentation';
import { watch } from 'vue';
import { useTextDrafts } from '../../app/useTextDrafts';
const props = defineProps<{
  field: CollectionView['documents'][number]['fields'][number];
  documentTitle: string;
}>();
const emit = defineEmits<{
  mark: [key: string, marked: boolean];
  correct: [key: string, value: string];
}>();
const { draft, edit, reset } = useTextDrafts(() => ({ value: props.field.correction }));
watch(
  () => props.field.marked,
  (marked) => {
    if (!marked) reset('value');
  },
);
function correct(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  edit('value', value);
  emit('correct', props.field.key, value);
}
</script>
<template>
  <div class="document-field" :class="{ 'is-marked': field.marked }" :data-doc-key="field.key">
    <div>
      <strong>{{ field.label }}</strong>
      <p class="document-value">{{ field.value }}</p>
      <p v-if="field.marked" class="inline-source">
        <small>{{ presentation.experience.source }}</small
        ><strong>{{ field.source }}</strong>
      </p>
    </div>
    <label class="document-mark"
      ><input
        type="checkbox"
        :checked="field.marked"
        @change="$emit('mark', field.key, ($event.target as HTMLInputElement).checked)"
      />{{ documentTitle }} · {{ field.label }}有误</label
    >
    <label v-if="field.marked" class="document-correction"
      >{{ documentTitle }} · {{ field.label }}正确值<input
        :value="draft.value"
        maxlength="200"
        @input="correct"
    /></label>
    <p v-if="field.hint" class="guidance-note">{{ field.hint }}</p>
  </div>
</template>
