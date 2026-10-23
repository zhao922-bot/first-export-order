<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{ documents: CollectionView['documents']; selected: string }>();
defineEmits<{ select: [id: string] }>();
</script>
<template>
  <nav class="document-tabs" aria-label="选择待核对单据">
    <button
      v-for="doc in documents"
      :key="doc.id"
      class="secondary"
      :aria-pressed="selected === doc.id"
      :data-document-id="doc.id"
      @click="$emit('select', doc.id)"
    >
      {{ doc.title }}
    </button>
  </nav>
</template>
