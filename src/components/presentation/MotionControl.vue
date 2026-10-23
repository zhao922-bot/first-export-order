<script setup lang="ts">
import { usePresentation } from '../../app/usePresentation';
import { useId } from 'vue';
const motion = usePresentation();
const id = useId();
</script>
<template>
  <div class="motion-control">
    <label :for="id">界面动效</label>
    <select
      :id="id"
      :value="motion.preference"
      @change="
        motion.setPreference(
          ($event.target as HTMLSelectElement).value === 'off' ? 'off' : 'system',
        )
      "
    >
      <option value="system">跟随系统</option>
      <option value="off">关闭动效</option>
    </select>
    <small v-if="motion.reduced">系统已减少动态效果</small>
    <small v-if="motion.notice" role="status">{{ motion.notice }}</small>
  </div>
</template>
