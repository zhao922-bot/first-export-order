<script setup lang="ts">
import type { Supplier } from '../../domain/types';
defineProps<{
  suppliers: (Supplier & { choiceId: string; price: string; depositPercent: string })[];
}>();
defineEmits<{ choose: [id: string] }>();
const credentials: Record<string, string> = {
  invoice: '开票凭证',
  sample: '样品记录',
  food_contact: '材质证明',
  electronics: '认证资料',
  textile: '面料证明',
};
const status: Record<string, string> = { verified: '已核验', pending: '待核验', missing: '缺失' };
</script>
<template>
  <div class="supplier-grid">
    <article v-for="supplier in suppliers" :key="supplier.id" class="supplier-card">
      <p class="eyebrow">候选合作方</p>
      <h2>{{ supplier.name }}</h2>
      <p class="supplier-price">¥{{ supplier.price }} <small>/ 件 · 含税</small></p>
      <dl class="specs">
        <div>
          <dt>起订量 MOQ</dt>
          <dd>{{ supplier.moq }} 件</dd>
        </div>
        <div>
          <dt>备货交期</dt>
          <dd>{{ supplier.leadDays }} 天</dd>
        </div>
        <div>
          <dt>供应商定金比例</dt>
          <dd>{{ supplier.depositPercent }}</dd>
        </div>
      </dl>
      <ul class="credential-list">
        <li v-for="item in supplier.credentials" :key="item.id">
          <span>{{ credentials[item.id] }}</span
          ><span :class="['badge', item.status]">{{ status[item.status] }}</span>
        </li>
      </ul>
      <p>{{ supplier.negotiationStyle }}</p>
      <small class="muted">教学算例参数，可配置；本切片不抽取质量或延期事件。</small>
      <button
        class="primary full"
        data-guide="supplier"
        @click="$emit('choose', supplier.choiceId)"
      >
        选择{{ supplier.name }}
      </button>
    </article>
  </div>
</template>
