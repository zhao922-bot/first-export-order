<script setup lang="ts">
import { RouterView } from 'vue-router';
import { onErrorCaptured, ref } from 'vue';
const failed = ref(false);
onErrorCaptured((error) => {
  console.error(error);
  failed.value = true;
  return false;
});
</script>
<template>
  <main v-if="failed" class="panel" role="alert">
    <h1>工作台暂时无法打开</h1>
    <p>请刷新页面重试。当前保存的进度不会因此自动删除。</p>
  </main>
  <RouterView v-else />
</template>
