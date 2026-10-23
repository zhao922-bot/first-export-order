<script setup lang="ts">
import { RouterLink } from 'vue-router';
defineProps<{ termId: string; label: string }>();
</script>
<template>
  <RouterLink class="text-link" :to="{ path: '/glossary', query: { term: termId } }">{{
    label
  }}</RouterLink>
</template>
