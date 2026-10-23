<script setup lang="ts">
import type { CashflowForecast } from '../../domain/types';
import { formatMoney } from '../../app/useSliceGame';
defineProps<{ forecast: CashflowForecast; context?: string }>();
const labels: Record<string, string> = {
  customerDeposit: '客户定金',
  supplierDeposit: '供应商定金',
  supplierBalance: '供应商尾款',
  domestic: '国内费用',
  bank: '银行费',
  customerBalance: '客户尾款',
  rebate: '合资格退税（待核验到账）',
  ocean: '本方海运费',
  insurance: '本方保险费',
};
</script>
<template>
  <section class="panel cash-preview">
    <div class="section-head">
      <h2>{{ context ? '谈判条件下的资金预览' : '报价后的资金预览' }}</h2>
      <span class="badge">全部为预计 · 未记账</span>
    </div>
    <p class="muted">
      {{
        context || '以 FOB / T/T 预收定金的教学情景估算'
      }}；金额、比例、时点均为教学算例参数，可配置。同日先支付、后计预计到账；未来退税不属于当前可用现金。预览不构成已到账记录。
    </p>
    <p>
      预计最低现金
      <strong :class="{ 'field-error': forecast.minimumCashCnyFen < 0 }">{{
        formatMoney(forecast.minimumCashCnyFen)
      }}</strong
      ><span v-if="forecast.gapDay !== null">
        · 第 {{ forecast.gapDay }} 天出现缺口，签约前需调整数量或收付款安排。</span
      >
    </p>
    <div class="cashflow-table">
      <table>
        <thead>
          <tr>
            <th>预计日</th>
            <th>项目</th>
            <th>现金流入 / 流出</th>
            <th>性质</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in forecast.items" :key="item.id">
            <td>第 {{ item.dueDay }} 天</td>
            <td>{{ labels[item.sourceId] }}</td>
            <td>{{ item.direction === 'in' ? '+' : '−' }} {{ formatMoney(item.amountCnyFen) }}</td>
            <td>预计</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
