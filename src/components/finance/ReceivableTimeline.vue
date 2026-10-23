<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{ model: CollectionView }>();
</script>
<template>
  <section class="panel receivable-summary" aria-label="收汇与退税账本">
    <div class="section-head">
      <h2>{{ model.payment }} · 收汇工作台</h2>
      <span class="badge">{{ model.bankStatus }}</span>
    </div>
    <p>起始情境：{{ model.message }}</p>
    <p v-if="model.insurance">{{ model.insurance }}</p>
    <p v-if="model.payment === 'LC_SIGHT'">{{ model.lcTerms }}</p>
    <p v-if="model.payment === 'OA_60'">{{ model.oaTerms }}</p>
    <p v-if="model.payment === 'OA_60'" data-testid="oa-evidence">{{ model.oaEvidence }}</p>
    <p v-if="model.exwMessage">{{ model.exwMessage }}</p>
    <p>
      实际装船：{{ model.shipment === null ? '待核验' : '第 ' + model.shipment + ' 天'
      }}<span v-if="model.due !== null"> · OA 到期：第 {{ model.due }} 天</span>
    </p>
    <dl class="receivable-grid">
      <div>
        <dt>本关实际收汇</dt>
        <dd data-testid="collection-received">{{ model.received }}</dd>
      </div>
      <div>
        <dt>尚欠外币本金</dt>
        <dd>{{ model.outstanding }}</dd>
      </div>
      <div>
        <dt>应收账面余额</dt>
        <dd data-testid="collection-receivable">{{ model.receivable }}</dd>
      </div>
      <div>
        <dt>累计汇兑损益</dt>
        <dd>{{ model.gain }}</dd>
      </div>
      <div>
        <dt>新增收汇银行费</dt>
        <dd>{{ model.fee }}</dd>
      </div>
      <div>
        <dt>已确认坏账</dt>
        <dd data-testid="collection-bad-debt">{{ model.badDebt }}</dd>
      </div>
      <div>
        <dt>核验确认退税</dt>
        <dd>{{ model.rebateAccrued }}</dd>
      </div>
      <div>
        <dt>实际退库到账</dt>
        <dd data-testid="collection-rebate">{{ model.rebateReceived }}</dd>
      </div>
      <div>
        <dt>应收退税余额</dt>
        <dd>{{ model.taxReceivable }}</dd>
      </div>
    </dl>
  </section>
</template>
