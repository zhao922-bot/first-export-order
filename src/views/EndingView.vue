<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import WorkbenchShell from '../components/layout/WorkbenchShell.vue';
import ScoreRadar from '../components/ending/ScoreRadar.vue';
import DecisionReplay from '../components/ending/DecisionReplay.vue';
import KnowledgeNotebook from '../components/ending/KnowledgeNotebook.vue';
import CharacterPortrait from '../components/presentation/CharacterPortrait.vue';
import { useSliceGame, formatMoney } from '../app/useSliceGame';
const game = useSliceGame(),
  router = useRouter();
const model = computed(() => game.endingModel);
async function restart() {
  if (!window.confirm('重开将替换本单结局和学习记录。可先导出或保存到手动槽。确定重开？')) return;
  if (await game.start()) void router.push('/supplier');
}
</script>
<template>
  <WorkbenchShell>
    <div v-if="model" class="work-area ending-page">
      <section class="ending-hero" :data-ending="model.result.kind">
        <p class="eyebrow">FIRST ORDER / 结局与复盘 · 第 {{ model.day }} 天</p>
        <h1>
          {{ game.node?.id === 'L07.complete' ? '七关流程完成：' : '本单结局：' }}{{ model.title }}
        </h1>
        <p v-if="model.subtitle" class="ending-subtitle">{{ model.subtitle }}</p>
        <p>{{ model.text }}</p>
        <p v-if="game.node?.id !== 'L07.complete'">
          {{ game.node?.title }}，后续未完成的必经评分项按零分计算。
        </p>
        <div class="ending-numbers">
          <div>
            <span>最终可用现金</span
            ><strong>{{ formatMoney(model.result.finalCashCnyFen) }}</strong>
          </div>
          <div>
            <span>已确认净利润</span><strong>{{ formatMoney(model.result.profitCnyFen) }}</strong>
          </div>
          <div>
            <span>信誉</span><strong>{{ model.reputation }} / 100</strong>
          </div>
        </div>
        <p v-if="model.unsettled.length">
          尚未结清：<span v-for="item in model.unsettled" :key="item.id"
            >{{ item.id }} {{ item.amount }}；</span
          >
        </p>
        <p v-else>账本核对：应收、应付、预收预付、库存和应收退税均已结清。</p>
        <p class="ending-save">结算已冻结 · {{ game.storageNotice }}。刷新或补学不会重复收款。</p>
      </section>
      <p v-if="game.error" role="alert" class="error-box">{{ game.error }}</p>
      <section class="panel">
        <h2>知识后测与试玩记录</h2>
        <p>用另一组教学算例检查理解，再导出本地试玩指标。</p>
        <RouterLink class="primary" to="/playtest">进行知识后测 / 导出试玩指标</RouterLink>
        <p v-if="game.session?.rescue?.history.length">
          本局纠错检查点处理
          {{ game.session.rescue.history.length }} 次；错误与补救记录随本地存档保留。
        </p>
      </section>
      <ScoreRadar :model="model" />
      <section class="panel mentor-ending">
        <CharacterPortrait actor-id="mentor_lin" cue="review" />
        <div>
          <p class="eyebrow">林姐 · 这一单留给下一单的经验</p>
          <p>{{ model.mentor }}</p>
        </div>
      </section>
      <DecisionReplay :items="model.replay" />
      <section
        class="panel repeat-panel"
        aria-labelledby="repeat-title"
        :data-repeat="model.result.repeatIntent.unlocked"
      >
        <p class="eyebrow">下一次联系</p>
        <h2 id="repeat-title">
          {{ model.result.repeatIntent.unlocked ? '复购意向已解锁' : '复购意向尚未解锁' }}
        </h2>
        <p>
          <strong>{{ model.customer }}</strong> · {{ model.repeatText }}
        </p>
        <p v-if="model.potentialText">{{ model.potentialText }}</p>
        <small>这是本单结局的后续意向；没有创建第二笔订单、扣款或预计收入。</small>
      </section>
      <details v-if="game.collection" open class="panel ending-ledger">
        <summary>收汇与退税凭证</summary>
        <p>
          {{ game.collection.bankStatus }}；实际退税到账
          <strong data-testid="collection-rebate">{{ game.collection.rebateReceived }}</strong
          >；坏账 {{ game.collection.badDebt }}；汇兑损益 {{ game.collection.gain }}。
        </p>
        <ul>
          <li v-for="entry in game.collection.journal" :key="entry.id">
            第 {{ entry.day }} 天 · {{ entry.text }}
          </li>
        </ul>
      </details>
      <KnowledgeNotebook />
      <div class="ending-actions">
        <RouterLink to="/" class="secondary">返回入口，保留本地结局</RouterLink
        ><button class="primary" @click="restart">重开选品练习 →</button>
        <p class="muted">重开会替换当前浏览器的订单、结局与学习记录。</p>
      </div>
    </div>
    <section v-else class="panel empty-state">
      <h1>本单还没有正式结局</h1>
      <p>完成收汇与退税核验，或在终止交易后进入复盘，才会生成结算成绩。</p>
      <RouterLink :to="game.session ? game.resumeRoute : '/'" class="primary"
        >返回当前进度</RouterLink
      >
    </section>
  </WorkbenchShell>
</template>
