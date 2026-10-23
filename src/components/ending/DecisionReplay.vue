<script setup lang="ts">
import type { EndingViewModel } from '../../app/debriefView';
defineProps<{ items: EndingViewModel['replay'] }>();
</script>
<template>
  <section class="panel decision-replay" aria-labelledby="replay-title">
    <p class="eyebrow">回到当时的选择</p>
    <h2 id="replay-title">三个关键转折点</h2>
    <p class="muted">按利润、信誉、信任、用时变化与重大风险排序，同类最多一项，优先不同关卡。</p>
    <ol class="replay-list">
      <li v-for="item in items" :key="item.id" :data-replay-id="item.id">
        <p class="eyebrow">
          第 {{ item.stage }} 关 <span v-if="item.majorRisk" class="risk-chip">重大风险选择</span>
        </p>
        <h3>{{ item.title }}</h3>
        <p><strong>当时选择：</strong>{{ item.choice }}</p>
        <p>{{ item.consequenceText }}</p>
        <p class="replay-change">{{ item.beforeText }}</p>
        <details>
          <summary>林姐复盘与下次可以怎么做</summary>
          <p v-if="item.mentor">{{ item.mentor }}</p>
          <p>{{ item.alternative }}</p>
          <small>建议用于下次决策，不代表未发生方案的确定利润。</small>
        </details>
      </li>
    </ol>
    <p v-if="items.length < 3" data-testid="replay-incomplete">
      尚未到达：本局只有 {{ items.length }} 个可回放转折点，后续关卡没有生成决策记录。
    </p>
  </section>
</template>
