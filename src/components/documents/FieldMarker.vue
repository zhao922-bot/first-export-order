<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{
  field: CollectionView['documents'][number]['fields'][number];
  documentTitle: string;
}>();
defineEmits<{ mark: [key: string, marked: boolean]; correct: [key: string, value: string] }>();
</script>
<template>
  <div class="document-field" :data-doc-key="field.key">
    <div>
      <strong>{{ field.label }}</strong>
      <p class="document-value">{{ field.value }}</p>
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
        :value="field.correction"
        maxlength="200"
        @input="$emit('correct', field.key, ($event.target as HTMLInputElement).value)"
    /></label>
    <p v-if="field.hint" class="guidance-note">{{ field.hint }}</p>
  </div>
</template>
