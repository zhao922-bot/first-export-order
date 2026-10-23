<script setup lang="ts">
defineProps<{
  mails: readonly {
    id: string;
    subject: string;
    body: string;
    sender: string;
    choiceId: string;
    done: boolean;
  }[];
  ready: boolean;
}>();
const emit = defineEmits<{ choose: [id: string] }>();
</script>
<template>
  <section class="mail-inbox" aria-label="询盘收件箱">
    <div class="section-head">
      <h2>待处理来信</h2>
      <span class="badge">{{ mails.filter((m) => m.done).length }} / 3 已回复</span>
    </div>
    <article v-for="(mail, index) in mails" :key="mail.id" class="panel mail-card">
      <div class="section-head">
        <span class="eyebrow">来信 {{ index + 1 }} · {{ mail.sender }}</span
        ><span v-if="mail.done" class="badge verified">已处理</span>
      </div>
      <h3>{{ mail.subject }}</h3>
      <details v-if="mail.done">
        <summary>重读原信</summary>
        <p class="mail-body">{{ mail.body }}</p>
      </details>
      <p v-else class="muted">身份与采购意图待判断。阅读完整来信后，再决定怎样回复。</p>
      <button
        class="secondary"
        :disabled="mail.done"
        :data-testid="'mail-' + mail.id"
        @click="emit('choose', mail.choiceId)"
      >
        {{ mail.done ? '已归档' : '阅读这封来信' }}
      </button>
    </article>
    <p v-if="!ready" class="muted">先完成三封来信的判断、回复和复盘，再选择报价对象。</p>
    <button class="primary" :disabled="!ready" @click="emit('choose', 'finish_inquiries')">
      三封已处理，选择报价对象 →
    </button>
  </section>
</template>
