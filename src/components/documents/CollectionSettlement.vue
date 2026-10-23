<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{ model: CollectionView }>();
</script>
<template>
  <section class="collection-settlement">
    <h2>七关流程完成：{{ model.ending.title }}</h2>
    <p>{{ model.ending.text }}</p>
    <p>
      实际现金 <strong>{{ model.cash }}</strong> · 已确认利润 <strong>{{ model.profit }}</strong>
    </p>
    <p>
      {{ model.bankStatus }}；退税核验{{
        model.taxEligible ? '合格，退库已到账' : '未具备完整材料，本次未确认退税'
      }}。
    </p>
    <p v-if="!model.unsettled.length">
      应收、应付、预收预付及库存均已核对结清。坏账与已支付费用仍保留在损益中。
    </p>
    <ul v-else>
      <li v-for="item in model.unsettled" :key="item.id">
        未结清 {{ item.id }}：{{ item.amount }}
      </li>
    </ul>
    <h3>回看三个关键决策</h3>
    <ol>
      <li v-for="item in model.replay" :key="item.id">
        第 {{ item.stage }} 关：{{ item.text }}
        <p class="muted">现金变化 {{ item.cash }} · 利润变化 {{ item.profit }}</p>
      </li>
    </ol>
    <details>
      <summary>收汇与退税记账凭证（{{ model.journal.length }}）</summary>
      <ul>
        <li v-for="entry in model.journal" :key="entry.id">
          第 {{ entry.day }} 天：{{ entry.text }}
        </li>
      </ul>
    </details>
  </section>
</template>
