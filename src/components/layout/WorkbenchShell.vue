<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import OnboardingGuide from '../shared/OnboardingGuide.vue';
import MotionControl from '../presentation/MotionControl.vue';
import { usePresentation } from '../../app/usePresentation';
import { computed, ref, watch } from 'vue';
import { presentation } from '../../content/presentation';
import { loadedGame as game } from '../../app/gameAccess';
import { formatMoney } from '../../app/formatMoney';
const route = useRoute();
const motion = usePresentation();
defineProps<{ home?: boolean }>();
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const currentStage = computed(() =>
  presentation.stages.find((s) => s.stage === game.value?.session?.snapshot.story.stage),
);
function closeMenu() {
  menuOpen.value = false;
  menuButton.value?.focus();
}
watch(
  () => route.path,
  () => {
    menuOpen.value = false;
  },
);
watch(
  () => [route.path, game.value?.resumeRoute],
  () => game.value?.playtestSurface(route.path === game.value?.resumeRoute),
  { immediate: true },
);
</script>
<template>
  <div
    class="app-shell"
    :data-motion="motion.enabled ? 'on' : 'off'"
    :data-paused="motion.hidden"
    :data-saving="(game?.saving ?? 0) > 0"
  >
    <a
      href="#main-content"
      class="skip-link"
      @click.prevent="($el.querySelector('#main-content') as HTMLElement)?.focus()"
      >跳到当前任务</a
    >
    <aside class="sidebar" :class="{ 'menu-open': menuOpen }" @keydown.esc="closeMenu">
      <div class="brand-row">
        <RouterLink to="/" class="brand"
          ><span class="brand-mark">出</span
          ><span>出海第一单<small>FIRST EXPORT ORDER</small></span></RouterLink
        >
        <button
          ref="menuButton"
          class="journey-toggle"
          aria-controls="journey-navigation"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          {{ menuOpen ? presentation.interface.closeMenu : presentation.interface.menu }}
          <span aria-hidden="true">{{ menuOpen ? '−' : '+' }}</span>
        </button>
      </div>
      <p v-if="currentStage" class="mobile-progress" data-guide="progress">
        0{{ currentStage.stage }} / 07 <span>{{ currentStage.navLabel }}</span>
      </p>
      <div id="journey-navigation" class="journey-navigation">
        <p class="nav-caption">{{ presentation.interface.journey }}</p>
        <nav aria-label="关卡进度" data-guide="progress">
          <span
            v-for="stage in presentation.stages"
            :key="stage.stage"
            :class="['nav-step', { active: currentStage?.stage === stage.stage }]"
            :aria-current="currentStage?.stage === stage.stage ? 'step' : undefined"
            ><b>0{{ stage.stage }}</b
            >{{ stage.navLabel }}</span
          >
        </nav>
        <RouterLink to="/playtest" class="nav-step">试玩记录与知识测评</RouterLink>
        <RouterLink to="/glossary" class="nav-step">知识图鉴 · 24 词条</RouterLink>
        <RouterLink v-if="game?.session?.ending" to="/ending" class="nav-step"
          >本单结局与复盘</RouterLink
        >
        <div class="sidebar-note">
          <span class="eyebrow">本次试玩范围</span>
          <p>
            第 1 → 2 → 3 → 4 → 5 → 6 → 7 关<br />选品、辨询盘、报价、谈判、备货，出运、审单并核验收汇。
          </p>
          <small>所有金额、税率、费率、汇率均为教学算例参数，可配置。</small>
        </div>
      </div>
    </aside>
    <div class="main-column">
      <header class="topbar">
        <span class="workspace-title">外贸实习工作台 <span class="version">试玩 0.10</span></span
        ><span class="save-state" aria-live="polite">{{
          game?.pendingSaves
            ? presentation.experience.saving
            : game?.storageNotice || '本地教学模拟'
        }}</span>
        <RouterLink to="/recovery" class="text-link save-link">存档与恢复</RouterLink>
        <RouterLink to="/glossary" class="text-link glossary-link" data-guide="glossary">{{
          presentation.interface.glossary
        }}</RouterLink>
        <MotionControl />
      </header>
      <div v-if="game?.storageProblem" class="storage-banner" role="alert">
        <p>{{ game?.storageNotice }}</p>
        <RouterLink to="/recovery" class="secondary">{{
          game?.storageConflict ? '处理进度冲突' : '打开存档与恢复'
        }}</RouterLink>
      </div>
      <div v-if="game?.session && !home" class="status-strip" data-guide="resources">
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
      <main id="main-content" tabindex="-1"><OnboardingGuide v-if="!home" /><slot /></main>
      <footer>
        教学算例参数，可配置 ·
        {{
          game?.session?.snapshot.order.signedDay === null || !game?.session
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
