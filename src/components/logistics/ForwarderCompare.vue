<script setup lang="ts">
import type { LogisticsView } from '../../app/logisticsView';
defineProps<{ model: LogisticsView }>();
</script>
<template>
  <section class="forwarder-grid" aria-label="三家货代比较">
    <p class="forwarder-route-note muted">
      柜价按本局已选航线的海运参数相对基准换算，附加费单列；比较的是当前合同路线。
    </p>
    <article
      v-for="plan in model.plans"
      :key="plan.id"
      class="panel forwarder-card"
      :class="{ selected: plan.selected }"
    >
      <p class="eyebrow">{{ plan.selected ? '当前选择' : '整柜教学报价' }}</p>
      <h2>{{ plan.name }}</h2>
      <p>{{ plan.description }}</p>
      <strong class="shipping-price">本方 {{ plan.sellerCost }}</strong>
      <p>
        本方国内/工厂准备：{{ plan.domestic }}<br />主海运总价：{{ plan.ocean }}<br />本方保险：{{
          plan.insurance
        }}
      </p>
      <p class="muted">
        买方运输参考：{{ plan.buyerCost }}，不扣本方现金；不包含买方保险和目的港另约费用。
      </p>
      <dl class="shipping-dates">
        <dt>预计约定交付</dt>
        <dd>第 {{ plan.delivery }} 天</dd>
        <dt>距原交期</dt>
        <dd>{{ plan.overdue ? '预计逾期 ' + plan.overdue + ' 天' : '当前预计可按期' }}</dd>
      </dl>
      <p v-if="model.term !== 'EXW'">
        截关第 {{ plan.cutoff }} 天 · 船期第 {{ plan.sailing }} 天<br />预计到港第
        {{ plan.arrival }} 天（不作交付截止）
      </p>
      <p>{{ plan.risk }}</p>
      <p class="muted">
        {{ plan.cartons }} 箱 · {{ plan.volume }} CBM · 毛重 {{ plan.weight }} kg ·
        {{ plan.containerCount }} 柜
      </p>
      <p>仅扣本次本方报价后现金 {{ plan.afterCost }}；未扣异常与逾期费用。</p>
    </article>
  </section>
</template>
