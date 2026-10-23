<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSliceGame, formatMoney } from '../../app/useSliceGame';
import CharacterPortrait from '../presentation/CharacterPortrait.vue';
const game = useSliceGame();
const pending = computed(() => game.session?.rescue?.pending);
const heading = ref<HTMLHeadingElement | null>(null);
watch(
  () => pending.value?.phase,
  () => heading.value?.focus(),
  { immediate: true, flush: 'post' },
);
</script>
<template>
  <section
    v-if="pending && game.pack.rescue"
    class="panel rescue-panel"
    data-testid="rescue-checkpoint"
    :inert="game.storageConflict"
    aria-labelledby="rescue-title"
  >
    <p class="eyebrow">
      交易检查点 ·
      {{ game.session?.snapshot.player.rescueUsed ? '纠错机会已使用' : '本局一次纠错机会' }}
    </p>
    <h1 id="rescue-title" ref="heading" tabindex="-1">
      {{
        pending.reason === 'cash_shortfall'
          ? game.pack.rescue.cashTitle
          : game.pack.rescue.releaseTitle
      }}
    </h1>
    <p v-if="pending.reason === 'cash_shortfall'" role="alert">
      现金不足，本次付款尚未提交。资金缺口：<strong data-testid="rescue-gap">{{
        formatMoney(pending.gapFen)
      }}</strong
      >。
    </p>
    <p v-else>
      预计尾款坏账：<strong>{{ formatMoney(pending.lossFen) }}</strong
      >。本次放单尚未提交。
    </p>
    <p>{{ game.pack.rescue.restoreText }}</p>
    <template v-if="pending.phase === 'consequence'">
      <button class="primary" @click="game.act({ type: 'rescue', step: 'review' })">
        查看林姐的救援复盘
      </button>
    </template>
    <template v-else-if="pending.phase === 'mentor'">
      <CharacterPortrait actor-id="mentor_lin" compact />
      <h2>林姐 · 先核对再继续</h2>
      <p>
        {{
          pending.reason === 'cash_shortfall'
            ? game.pack.rescue.cashReview
            : game.pack.rescue.releaseReview
        }}
      </p>
      <div class="actions">
        <button class="primary" @click="game.act({ type: 'rescue', step: 'use' })">
          {{
            game.session?.snapshot.player.rescueUsed
              ? '返回核验，暂不冒险'
              : '使用一次纠错，恢复检查点'
          }}
        </button>
        <button class="secondary" @click="game.act({ type: 'rescue', step: 'decline' })">
          拒绝纠错，查看风险确认
        </button>
      </div>
    </template>
    <template v-else>
      <h2>再次确认这次风险</h2>
      <p>{{ game.pack.rescue.declineText }}</p>
      <div class="actions">
        <button class="secondary" @click="game.act({ type: 'rescue', step: 'back' })">
          返回林姐复盘
        </button>
        <button class="primary" @click="game.act({ type: 'rescue', step: 'confirm' })">
          {{
            pending.reason === 'cash_shortfall' ? '确认拒绝，返回资金安排' : '确认仍放单并承担坏账'
          }}
        </button>
      </div>
    </template>
  </section>
</template>
