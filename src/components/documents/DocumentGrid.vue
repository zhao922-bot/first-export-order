<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CollectionView } from '../../app/collectionView';
import DocumentTabs from './DocumentTabs.vue';
import FieldMarker from './FieldMarker.vue';
const props = defineProps<{ model: CollectionView }>();
defineEmits<{ mark: [key: string, marked: boolean]; correct: [key: string, value: string] }>();
const selected = ref(props.model.documents[0]!.id);
const current = computed(() => props.model.documents.find((d) => d.id === selected.value)!);
</script>
<template>
  <DocumentTabs :documents="model.documents" :selected="selected" @select="selected = $event" />
  <div class="document-workspace">
    <section class="panel" aria-label="单据找错">
      <h2>{{ current.title }}</h2>
      <p class="muted">教学模板 · 待校核草稿</p>
      <FieldMarker
        v-for="field in current.fields"
        :key="field.key"
        :field="field"
        :document-title="current.title"
        @mark="(key, marked) => $emit('mark', key, marked)"
        @correct="(key, value) => $emit('correct', key, value)"
      />
    </section>
    <aside class="panel document-source" aria-label="单据核验源记录">
      <h2>合同与交付源记录</h2>
      <p class="muted">已确认 PI、实际出运记录与信用证要求。包装箱数与产品件数分别列示。</p>
      <dl>
        <template v-for="field in model.sources" :key="field.id"
          ><dt>{{ field.label }}</dt>
          <dd :data-document-source="field.id">{{ field.value }}</dd></template
        >
      </dl>
    </aside>
  </div>
</template>
