<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{ model: CollectionView }>();
defineEmits<{
  assess: [fieldId: CollectionView['taxFields'][number]['id'], answer: 'verified' | 'missing'];
}>();
</script>
<template>
  <section class="panel" aria-label="退税核验">
    <h2>如实判断本批凭证</h2>
    <p>{{ model.taxMessage }}</p>
    <div
      v-for="field in model.taxFields"
      :key="field.id"
      class="tax-field"
      :data-tax-field="field.id"
    >
      <strong>{{ field.label }}</strong>
      <p>{{ field.source }}</p>
      <label
        >{{ field.label }}判断<select
          :value="field.answer"
          @change="
            $emit(
              'assess',
              field.id,
              ($event.target as HTMLSelectElement).value as 'verified' | 'missing',
            )
          "
        >
          <option disabled value="">请选择</option>
          <option value="verified">齐备且核验通过</option>
          <option value="missing">缺失或不满足</option>
        </select></label
      >
      <p v-if="field.error" class="field-error">上次判断与本批记录不符，请重新核对。</p>
    </div>
  </section>
</template>
