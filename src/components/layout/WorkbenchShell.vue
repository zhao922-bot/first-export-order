<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import OnboardingGuide from '../shared/OnboardingGuide.vue';
import MotionControl from '../presentation/MotionControl.vue';
import { usePresentation } from '../../app/usePresentation';
import { watch } from 'vue';
import { useSliceGame, formatMoney } from '../../app/useSliceGame';
const game = useSliceGame();
const route = useRoute();
const motion = usePresentation();
watch(
  () => [route.path, game.resumeRoute],
  () => game.playtestSurface(route.path === game.resumeRoute),
  { immediate: true },
);
</script>
<template>
  <div class="app-shell" :data-motion="motion.enabled ? 'on' : 'off'" :data-paused="motion.hidden">
    <a
      href="#main-content"
      class="skip-link"
      @click.prevent="($el.querySelector('#main-content') as HTMLElement)?.focus()"
      >跳到当前任务</a
    >
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">出</span
        ><span>出海第一单<small>FIRST EXPORT ORDER</small></span></RouterLink
      >
      <p class="nav-caption">你的第一张订单</p>
      <nav aria-label="关卡进度" data-guide="progress">
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 1 }]"
          ><b>01</b> 选品与供应商</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 2 }]"
          ><b>02</b> 询盘与客户</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 3 }]"
          ><b>03</b> 报价工作台</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 4 }]"
          ><b>04</b> 谈判与签约</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 5 }]"
          ><b>05</b> PI 与备货验货</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 6 }]"
          ><b>06</b> 物流与出运</span
        >
        <span :class="['nav-step', { active: game.session?.snapshot.story.stage === 7 }]"
          ><b>07</b> 单据与收汇</span
        >
      </nav>
      <RouterLink to="/playtest" class="nav-step">试玩记录与知识测评</RouterLink>
      <RouterLink to="/glossary" class="nav-step" data-guide="glossary"
        >知识图鉴 · 24 词条</RouterLink
      >
      <RouterLink v-if="game.session?.ending" to="/ending" class="nav-step"
        >本单结局与复盘</RouterLink
      >
      <div class="sidebar-note">
        <span class="eyebrow">本次试玩范围</span>
        <p>
          第 1 → 2 → 3 → 4 → 5 → 6 → 7 关<br />选品、辨询盘、报价、谈判、备货，出运、审单并核验收汇。
        </p>
        <small>所有金额、税率、费率、汇率均为教学算例参数，可配置。</small>
      </div>
    </aside>
    <div class="main-column">
      <header class="topbar">
        <span>外贸实习工作台 <span class="version">试玩 0.10</span></span
        ><span class="save-state" aria-live="polite">{{
          game.storageNotice || '本地教学模拟'
        }}</span>
        <RouterLink to="/recovery" class="text-link save-link">存档与恢复</RouterLink>
        <MotionControl />
      </header>
      <div v-if="game.storageProblem" class="storage-banner" role="alert">
        <p>{{ game.storageNotice }}</p>
        <RouterLink to="/recovery" class="secondary">{{
          game.storageConflict ? '处理进度冲突' : '打开存档与恢复'
        }}</RouterLink>
      </div>
      <div v-if="game.session" class="status-strip" data-guide="resources">
        <span
          >可用现金
          <strong data-testid="cash">{{
            formatMoney(game.session.snapshot.player.cashCnyFen)
          }}</strong></span
        >
        <span
          >已确认利润
          <strong>{{
            formatMoney(game.session.snapshot.player.cumulativeProfitCnyFen)
          }}</strong></span
        >
        <span
          >信誉
          <strong data-testid="reputation"
            >{{ game.session.snapshot.player.reputation }} / 100</strong
          ></span
        >
        <span
          >游戏日 <strong>第 {{ game.session.snapshot.gameDay }} 天</strong></span
        >
      </div>
      <main id="main-content" tabindex="-1"><OnboardingGuide /><slot /></main>
      <footer>
        教学算例参数，可配置 ·
        {{
          game.session?.snapshot.order.signedDay === null || !game.session
            ? '未签约，不启动合同交期'
            : game.session.snapshot.order.deliveryCompletedDay !== null
              ? '已完成约定交付，交期已冻结；款项以账本为准'
              : '已签约，交付期限已启动；收款仍待核验'
        }}
        · 当前报价不构成真实业务建议
      </footer>
    </div>
  </div>
</template>
