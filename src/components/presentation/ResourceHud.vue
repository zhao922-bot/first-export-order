<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { loadedGame as game } from '../../app/gameAccess';
import { formatMoney } from '../../app/formatMoney';
import { presentation } from '../../content/presentation';
const flash = ref('');
let timer = 0;
watch(
  () => game.value?.deskFeedback?.id,
  (id, old) => {
    clearTimeout(timer);
    flash.value = id && id !== old ? id : '';
    if (flash.value)
      timer = window.setTimeout(() => {
        flash.value = '';
      }, presentation.desk.deltaDurationMs);
  },
);
onBeforeUnmount(() => clearTimeout(timer));
const items = computed(() => {
  const session = game.value?.session;
  if (!session) return [];
  const { player, gameDay, order } = session.snapshot;
  const delta = game.value?.deskFeedback?.deltas;
  return [
    {
      key: 'cash',
      label: '可用现金',
      value: formatMoney(player.cashCnyFen),
      delta: delta?.cashCnyFen ?? 0,
      money: true,
    },
    {
      key: 'profit',
      label: '已确认利润',
      value: formatMoney(player.cumulativeProfitCnyFen),
      delta: delta?.profitCnyFen ?? 0,
      money: true,
    },
    {
      key: 'reputation',
      label: '信誉',
      value: player.reputation + ' / 100',
      delta: delta?.reputation ?? 0,
    },
    {
      key: 'trust',
      label: presentation.desk.trust,
      value: order.customerId ? player.trustByCustomer[order.customerId] + ' / 100' : '尚未选定',
      delta: delta?.trust ?? 0,
    },
    { key: 'day', label: '游戏日', value: '第 ' + gameDay + ' 天', delta: delta?.days ?? 0 },
  ];
});
function change(value: number, money?: boolean) {
  return (value > 0 ? '+' : '−') + (money ? formatMoney(Math.abs(value)) : Math.abs(value));
}
</script>
<template>
  <div class="status-strip resource-hud" data-guide="resources" aria-label="本单实时数值">
    <span v-for="item in items" :key="item.key" class="hud-item" :data-resource="item.key">
      <small>{{ item.label }}</small
      ><strong :data-testid="item.key">{{ item.value }}</strong>
      <span
        v-if="flash && item.delta"
        :key="flash"
        class="hud-delta"
        :data-direction="item.delta > 0 ? 'up' : 'down'"
        >{{ change(item.delta, item.money) }}</span
      >
    </span>
    <span class="sr-only" role="status" aria-live="polite">{{
      flash
        ? items
            .filter((i) => i.delta)
            .map((i) => i.label + ' ' + change(i.delta, i.money))
            .join('；')
        : ''
    }}</span>
  </div>
</template>
