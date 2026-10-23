<script setup lang="ts">
defineProps<{ mail: { subject: string; body: string; sender: string } }>();
</script>
<template>
  <article class="panel mail-message" aria-label="询盘原文">
    <span class="mail-open-icon" aria-hidden="true"><span /></span>
    <p class="eyebrow">来信原文 · 发件人自述待核验</p>
    <h2>{{ mail.subject }}</h2>
    <p class="muted">发件人：{{ mail.sender }}</p>
    <p class="mail-body">{{ mail.body }}</p>
    <small class="muted"
      >意向数量不是成交数量；需与产品规格、供应商 MOQ、预算和报价条件一起确认。</small
    >
  </article>
</template>
