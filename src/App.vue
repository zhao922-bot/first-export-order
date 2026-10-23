<script setup lang="ts">
import { RouterView } from 'vue-router';
import { onErrorCaptured, ref } from 'vue';
import { navigation } from './app/navigation';
import { presentation } from './content/presentation';
const copy = presentation.experience;
function reload() {
  window.location.reload();
}
const failed = ref(false);
onErrorCaptured((error) => {
  console.error(error);
  failed.value = true;
  return false;
});
</script>
<template>
  <div v-if="navigation.loading" class="route-notice" role="status">{{ copy.loading }}</div>
  <section v-if="navigation.failed" class="route-notice route-error" role="alert">
    <strong>{{ copy.loadFailed }}</strong>
    <p>{{ copy.loadRecovery }}</p>
    <button class="primary" @click="reload">{{ copy.reload }}</button>
  </section>
  <main v-if="failed" class="panel" role="alert">
    <h1>工作台暂时无法打开</h1>
    <p>请刷新页面重试。当前保存的进度不会因此自动删除。</p>
  </main>
  <RouterView v-else />
</template>
