<script setup lang="ts">
import type { NegotiationView } from '../../app/negotiationView';
import { formatMoney } from '../../app/useSliceGame';
defineProps<{
  model: NegotiationView;
  customer: string;
  selectedPayment: string | null;
  selectedTerm: string | null;
}>();
</script>
<template>
  <section class="panel negotiation-summary" aria-label="谈判条件摘要">
    <div class="section-head">
      <h2>{{ customer }} · 当前条件</h2>
      <span class="badge">预计结果，不是已实现利润</span>
    </div>
    <p v-if="model.clientText" class="client-message">“{{ model.clientText }}”</p>
    <div class="deal-totals">
      <div>
        <small>本次数量</small
        ><strong data-testid="deal-quantity">{{ model.projection.quantity }} 件</strong>
      </div>
      <div>
        <small>{{ selectedTerm || 'FOB 参考' }} 单价</small
        ><strong>USD {{ model.projection.unitUsd }}</strong>
      </div>
      <div>
        <small>合同总额</small
        ><strong data-testid="deal-total">{{
          formatMoney(model.projection.invoiceUsdCent, 'USD')
        }}</strong>
      </div>
    </div>
    <p>
      付款：{{ selectedPayment || '待选择（预览暂用 T/T）' }}
      <span v-if="model.projection.payment === 'TT'">· 定金 {{ model.depositPercent }}</span> /
      {{
        selectedTerm
          ? model.projection.term + ' ' + model.projection.place
          : '术语与地点待第 3 轮确认'
      }}
    </p>
    <p>
      条件成立时预计单笔贡献
      <strong
        :class="{ 'field-error': model.projection.projectedMarginFen < 0 }"
        data-testid="deal-margin"
        >{{ formatMoney(model.projection.projectedMarginFen) }}</strong
      >；计入本局已发生准备费用后预计总利润
      {{ formatMoney(model.projection.projectedTotalProfitFen) }}。
    </p>
    <p class="muted">
      仅在按约收款、费用与退税条件成立时适用。签约起
      {{ model.deadlineDays }}
      个游戏日到约定交付节点；收款账期另计。金额、比例、日期均为教学算例参数，可配置。
    </p>
    <ul v-if="model.warnings.length" class="risk-notes" aria-label="当前风险">
      <li v-for="warning in model.warnings" :key="warning">{{ warning }}</li>
    </ul>
  </section>
</template>
