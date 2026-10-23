<script setup lang="ts">
import type { NegotiationView } from '../../app/negotiationView';
defineProps<{ payments: NegotiationView['payments'] }>();
</script>
<template>
  <div class="payment-grid" aria-label="付款方式比较">
    <article v-for="payment in payments" :key="payment.id" class="panel">
      <h2>{{ payment.label }}</h2>
      <p>{{ payment.explanation }}</p>
      <dl>
        <div>
          <dt>预计定金</dt>
          <dd>{{ payment.deposit }}</dd>
        </div>
        <div>
          <dt>预计银行/管理费</dt>
          <dd>{{ payment.bank }}</dd>
        </div>
        <div>
          <dt>预计最低现金</dt>
          <dd>{{ payment.minimum }}</dd>
        </div>
        <div>
          <dt>假设收款日</dt>
          <dd>第 {{ payment.collectionDay }} 天</dd>
        </div>
      </dl>
    </article>
  </div>
</template>
