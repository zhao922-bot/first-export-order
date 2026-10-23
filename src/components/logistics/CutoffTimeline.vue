<script setup lang="ts">
import type { LogisticsView } from '../../app/logisticsView';
defineProps<{ model: LogisticsView }>();
</script>
<template>
  <section class="panel logistics-summary" aria-label="物流责任、资金与交期">
    <div class="section-head">
      <h2>物流与交付记录</h2>
      <span class="badge">{{ model.term }}</span>
    </div>
    <p>{{ model.responsibility }}</p>
    <p class="muted">
      集装箱在码头提前交承运人时，现实业务应另评估 FCA/CPT/CIP；本教学合同采用既定 EXW/FOB/CIF
      节点。
    </p>
    <p data-testid="delivery-clock">
      <strong>{{ model.deadline }}</strong>
    </p>
    <p>
      教学合同逾期费用 {{ model.dailyPenalty }}/天，信誉扣
      {{ model.dailyReputation }}/天；交付后不再随收款等待增加。
    </p>
    <template v-if="model.selected">
      <p>{{ model.selected.name }} · {{ model.origin }} → {{ model.destination }}</p>
      <ol class="shipping-timeline">
        <li v-if="model.term !== 'EXW'">
          材料可用：第 {{ model.selected.ready }} 天；截关：第 {{ model.selected.cutoff }} 天
        </li>
        <li>
          预计约定交付：第 {{ model.selected.delivery }} 天
          <span v-if="model.selected.missed && model.term !== 'EXW'"
            >（已错过截关，顺延 {{ model.selected.missed }} 班）</span
          >
        </li>
        <li v-if="model.term !== 'EXW'">
          预计到港：第 {{ model.selected.arrival }} 天，不用到港日扣装船交期
        </li>
      </ol>
      <p v-if="!model.complete">
        预计尚待发生逾期费用 {{ model.expectedPenalty }}；未记为实际支出。
      </p>
    </template>
    <div class="procurement-totals">
      <div>
        <small>本关已付费用</small><strong data-testid="logistics-paid">{{ model.paid }}</strong>
      </div>
      <div>
        <small>库存余额</small
        ><strong data-testid="logistics-inventory">{{ model.inventory }}</strong>
      </div>
      <div>
        <small>客户应收款</small
        ><strong data-testid="logistics-receivable">{{ model.receivable }}</strong>
      </div>
    </div>
    <p>{{ model.collection }}</p>
    <p class="risk-note" data-testid="logistics-risk">{{ model.riskText }}</p>
    <div v-if="model.riskOptions.length" class="shipping-options">
      <article v-for="option in model.riskOptions" :key="option.id">
        <h3>{{ option.name }}</h3>
        <p>本方新增 {{ option.cost }} · 买方主运价差 {{ option.buyerExtra }}（不扣本方）</p>
        <p>
          预计交付第 {{ option.delivery }} 天，尚待逾期费 {{ option.penalty }}；两者支付后现金
          {{ option.afterCost }}。
        </p>
      </article>
    </div>
    <details v-if="model.journal.length">
      <summary>第 6 关实际流水（{{ model.journal.length }}）</summary>
      <ol class="procurement-journal">
        <li v-for="entry in model.journal" :key="entry.id">
          第 {{ entry.day }} 天 · {{ entry.text }} · 现金变化 {{ entry.cash }}
        </li>
      </ol>
    </details>
  </section>
</template>
