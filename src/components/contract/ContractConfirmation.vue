<script setup lang="ts">
defineProps<{ items: readonly { id: string; label: string }[]; checked: readonly string[] }>();
const emit = defineEmits<{ confirm: [id: string, checked: boolean] }>();
function update(id: string, event: Event) {
  emit('confirm', id, (event.target as HTMLInputElement).checked);
}
</script>
<template>
  <fieldset class="panel contract-checklist">
    <legend>合同关键项核对</legend>
    <label v-for="item in items" :key="item.id" class="checkbox"
      ><input
        type="checkbox"
        :checked="checked.includes(item.id)"
        @change="update(item.id, $event)"
      />{{ item.label }}</label
    >
  </fieldset>
</template>
