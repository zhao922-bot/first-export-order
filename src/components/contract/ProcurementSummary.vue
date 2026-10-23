<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
import { formatMoney } from '../../app/useSliceGame';
defineProps<{ model: ProcurementView; cancelled: boolean }>();
</script>
<template>
  <section class="panel procurement-summary" aria-label="备货资金与交期">
    <div class="section-head">
      <h2>备货与资金记录</h2>
      <span class="badge">{{ model.deadline }}</span>
    </div>
    <div class="procurement-totals">
      <div>
        <small>已核验客户入账</small
        ><strong data-testid="received-customer">{{ model.customerReceived }}</strong>
      </div>
      <div>
        <small>供应商已付款</small><strong>{{ model.supplierPaid }}</strong>
      </div>
      <div>
        <small>采购预付款余额</small
        ><strong data-testid="supplier-advance">{{ model.supplierAdvance }}</strong>
      </div>
      <div>
        <small>已验收入库</small><strong data-testid="inventory">{{ model.inventory }}</strong>
      </div>
    </div>
    <p>{{ model.fundingResult }}</p>
    <p>{{ model.productionNote }}</p>
    <template v-if="!model.closed"
      ><p>
        采购含税总额 {{ formatMoney(model.amounts.total) }} · 约定定金
        {{ formatMoney(model.amounts.deposit) }} · 尚待支付
        {{ formatMoney(model.amounts.balance) }}。
      </p>
      <p class="muted">
        仅用于资金比较：以当前现金支付尚欠采购款后的余额
        {{ model.cashAfterBalance }}。未扣后续运保等费用，不假设客户尾款或退税已到账。
      </p></template
    >
    <p v-if="model.qualityUnresolved" class="risk-note">本批仍有材质/包装问题，需要返工与复验。</p>
    <p v-if="model.documentsUnresolved" class="risk-note">
      本批凭证仍待补检核验，付款不会自动补齐证据。
    </p>
    <p>客户预收款负债余额 {{ model.customerLiability }}；当前采购及库存不确认销售收入。</p>
    <p v-if="cancelled">
      供应商实际退款 {{ model.supplierRefund }}；定金损失 {{ model.cancellationLoss }}；尚欠客户退款
      {{ model.unpaidRefund }}。
    </p>
    <details v-if="model.cancellationPreview" class="cancellation-preview">
      <summary>停止采购的预计退款与损失</summary>
      <p>{{ model.cancellationPreview }}</p>
    </details>
    <details v-if="model.journal.length" class="procurement-journal">
      <summary>第 5 关实际流水（{{ model.journal.length }}）</summary>
      <ol>
        <li v-for="entry in model.journal" :key="entry.id">
          第 {{ entry.day }} 天 · {{ entry.description }} · 现金变化 {{ entry.cash }}
        </li>
      </ol>
    </details>
  </section>
</template>
