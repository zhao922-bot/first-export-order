<script setup lang="ts">
defineProps<{ rounds: readonly { label: string; done: boolean }[] }>();
</script>
<template>
  <ol class="round-progress" aria-label="三轮谈判进度">
    <li v-for="(round, index) in rounds" :key="round.label" :class="{ done: round.done }">
      <strong>0{{ index + 1 }}</strong
      ><span
        >{{ round.label }}<small>{{ round.done ? '已讨论' : '待讨论' }}</small></span
      >
    </li>
  </ol>
</template>
