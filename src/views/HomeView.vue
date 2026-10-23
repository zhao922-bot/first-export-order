<script setup lang="ts">
import { useRouter } from 'vue-router';
import WorkbenchShell from '../components/layout/WorkbenchShell.vue';
import { useSliceGame } from '../app/useSliceGame';
import CharacterPortrait from '../components/presentation/CharacterPortrait.vue';
import SceneArtwork from '../components/presentation/SceneArtwork.vue';
import { presentation } from '../content/presentation';
const game = useSliceGame(),
  router = useRouter();
function start(practice: boolean, randomize = false, pretest = false) {
  if (
    (game.session || game.storageProblem) &&
    !window.confirm('重开将替换当前本地进度。可先到“存档与恢复”导出或保存到手动槽。确定重开？')
  )
    return;
  if (game.start(practice, randomize, pretest))
    void router.push(pretest ? '/playtest' : practice ? '/quote' : '/supplier');
}
function resume() {
  void router.push(game.resumeRoute);
}
</script>
<template>
  <WorkbenchShell>
    <section class="landing">
      <div class="landing-intro">
        <div class="landing-copy">
          <p class="eyebrow">FIRST EXPORT ORDER / 单人外贸成长记</p>
          <h1>先看清成本，<br />再做第一单。</h1>
          <p class="lead">
            你是刚入行的外贸业务员。从样品桌到港口，从第一封询盘到最后一笔收汇，每个决定都由你亲手完成。
            林姐会陪你看证据、算成本，也陪你从失误中重新出发。
          </p>
        </div>
        <div class="landing-stage" :aria-label="presentation.home.title">
          <SceneArtwork scene="harbor" />
          <CharacterPortrait actor-id="mentor_lin" />
          <div class="landing-greeting">
            <span>林姐 · 你的外贸前辈</span>
            <p>{{ presentation.home.subtitle }}</p>
          </div>
          <span class="postmark" aria-hidden="true">FIRST<br />ORDER<br />01</span>
        </div>
      </div>
      <div class="actions">
        <button v-if="game.session" class="primary" data-guide="resume" @click="resume">
          继续本地进度 →
        </button>
        <button
          :class="game.session ? 'secondary' : 'primary'"
          data-guide="start"
          @click="start(false)"
        >
          {{ game.session ? '重开选品练习' : '开始第 1 关' }} →
        </button>
        <button class="secondary" @click="start(true)">
          {{ game.session ? '重开独立报价练习' : '直接练习报价' }}
        </button>
        <button class="secondary" @click="start(true, true)">新开随机报价练习</button>
      </div>
      <button class="secondary" @click="start(false, false, true)">前测并开始七关试玩</button>
      <p class="muted">普通开始会跳过前测；测评可选，不影响经营成绩。侧栏可导出本地试玩指标。</p>
      <p v-if="game.session" class="muted">重开会替换此浏览器保存的当前练习。</p>
      <div class="intro-grid">
        <article>
          <span class="large-number">01</span>
          <h2>选得有依据</h2>
          <p>三种产品，九家供应商。比较价格、资质、起订量和交期，再决定是否付费核验。</p>
        </article>
        <article>
          <span class="large-number">02</span>
          <h2>问得有证据</h2>
          <p>判断真实采购、同行套价与异常付款。首次遇到 Emma，重开可遇见不同风格的买家。</p>
        </article>
        <article>
          <span class="large-number">03</span>
          <h2>算得清口径</h2>
          <p>亲手填写退税、成本和报价。遇到漏退税或利润率误用，就进入分步纠错。</p>
        </article>
      </div>
      <p class="scope-note">
        第 1→2→3→4→5→6→7 关已连通。从第 1 关开始可一路体验 PI
        核对、收付款、验货、物流出运与最终收汇，再查看四类结局、五维评分与关键决策复盘。
        途中可能遇到汇率、供应商、船期或收款变化；12 种事件按条件出现，单局最多 3 次。
        知识图鉴可随时查阅，复购意向在本单结算后解锁。
      </p>
    </section>
  </WorkbenchShell>
</template>
