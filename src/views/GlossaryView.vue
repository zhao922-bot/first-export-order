<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router';
import WorkbenchShell from '../components/layout/WorkbenchShell.vue';
import KnowledgeNotebook from '../components/ending/KnowledgeNotebook.vue';
import { useSliceGame } from '../app/useSliceGame';
const route = useRoute(),
  game = useSliceGame();
</script>
<template>
  <WorkbenchShell
    ><div class="work-area">
      <div class="page-heading">
        <h1>随用随查 · 外贸知识</h1>
        <RouterLink :to="game.session ? game.resumeRoute : '/'" class="text-link"
          >返回本单进度</RouterLink
        >
      </div>
      <KnowledgeNotebook
        :initial-id="typeof route.query.term === 'string' ? route.query.term : undefined"
      /></div
  ></WorkbenchShell>
</template>
