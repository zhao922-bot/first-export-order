<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import WorkbenchShell from '../components/layout/WorkbenchShell.vue';
import { useSliceGame } from '../app/useSliceGame';
import { exportJson } from '../app/exportJson';
import type { Phase } from '../telemetry/events';
const game = useSliceGame();
const run = computed(() => game.playtest.run);
const phase = computed<Phase>(() => (game.session?.ending ? 'post' : 'pre'));
const assessment = computed(() => run.value?.[phase.value]);
const question = computed(() =>
  game.pack.playtest?.questions.find(
    (q) => q.phase === phase.value && !assessment.value?.answers[q.id],
  ),
);
const questions = computed(
  () => game.pack.playtest?.questions.filter((q) => q.phase === phase.value) ?? [],
);
const rate = (n: number | null) => (n === null ? '暂无样本' : (n * 100).toFixed(1) + '%');
const exporting = ref(false),
  exportNotice = ref('');
async function download() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    exportNotice.value = await exportJson(
      await game.exportPlaytest(),
      'first-export-playtest.json',
    );
  } catch {
    exportNotice.value = '导出未完成，请重试。原有试玩记录仍保留。';
  } finally {
    exporting.value = false;
  }
}
function clear() {
  if (window.confirm('清空此浏览器的试玩统计与测评记录？建议先导出。经营存档不会被清除。'))
    game.clearPlaytest();
}
</script>
<template>
  <WorkbenchShell>
    <div class="work-area">
      <h1>本地试玩记录与知识测评</h1>
      <p>记录仅保存在此浏览器，主动导出 JSON 后可用于试玩汇总。没有上传服务器。</p>
      <p v-if="exportNotice" role="status" class="guidance-note">{{ exportNotice }}</p>
      <p v-if="game.playtest.notice" class="guidance-note" role="status">
        {{ game.playtest.notice }}
      </p>
      <section v-if="run" class="panel" aria-label="知识测评">
        <h2>{{ phase === 'pre' ? '知识前测' : '知识后测' }} · 六个核心知识点</h2>
        <p>约 2 分钟，可跳过；跳过不计为答错。前测开始经营后锁定，答案每题只能提交一次。</p>
        <template v-if="assessment?.status === 'pending' && question">
          <p>第 {{ Object.keys(assessment.answers).length + 1 }} / 6 题</p>
          <h3 data-testid="assessment-question" :data-item-id="question.id">
            {{ question.question }}
          </h3>
          <div class="assessment-options">
            <button
              v-for="option in question.options"
              :key="option.id"
              class="secondary"
              :data-answer-id="option.id"
              @click="game.answerAssessment(phase, question.id, option.id)"
            >
              {{ option.text }}
            </button>
          </div>
          <button class="text-link" @click="game.skipAssessment(phase)">跳过本次测评</button>
        </template>
        <template v-else-if="assessment?.status === 'completed'">
          <p role="status">
            {{ phase === 'pre' ? '前测' : '后测' }}已完成，答对
            {{ Object.values(assessment.answers).filter((a) => a.correct).length }} / 6 题。
          </p>
          <details v-if="phase === 'post'">
            <summary>查看测评解析</summary>
            <p v-for="q in questions" :key="q.id">{{ q.question }} {{ q.explanation }}</p>
          </details>
        </template>
        <p v-else>
          {{
            assessment?.status === 'skipped'
              ? '本次测评已跳过，不计为零分。'
              : '此局没有有效前测入口。可从首页“前测并开始七关试玩”新开一局。'
          }}
        </p>
        <RouterLink class="primary" :to="game.resumeRoute">{{
          game.session?.ending ? '返回本单复盘' : '继续当前关卡'
        }}</RouterLink>
      </section>
      <section class="panel" aria-label="试玩指标">
        <h2>此浏览器的试玩汇总</h2>
        <p>
          当前局有效时长：<strong data-testid="active-duration"
            >{{ Math.floor((run?.activeMs ?? 0) / 1000) }} 秒</strong
          >。页面隐藏、失焦或连续两分钟没有交互时暂停计时；刷新和离线间隔不计入。
        </p>
        <p>
          完整试玩起始局数 {{ game.playtest.metrics.startedRuns }}；完成七关
          {{ game.playtest.metrics.completedRuns }}（{{
            rate(game.playtest.metrics.completionRate)
          }}）；到达任意结局 {{ game.playtest.metrics.endedRuns }}。
        </p>
        <p>
          重开 {{ game.playtest.metrics.restartedRuns }} 局：中途
          {{ game.playtest.metrics.restartsDuring }}、结局后
          {{ game.playtest.metrics.restartsAfterEnding }}。
        </p>
        <p>
          知识前后测配对 {{ game.playtest.metrics.knowledge.pairedN }} 局；平均提升
          {{
            game.playtest.metrics.knowledge.improvementPoints === null
              ? '暂无配对样本'
              : game.playtest.metrics.knowledge.improvementPoints.toFixed(2) + ' / 6 分'
          }}。
        </p>
        <p>
          前测跳过 {{ game.playtest.metrics.knowledge.preSkipped }} 局；后测跳过
          {{ game.playtest.metrics.knowledge.postSkipped }}
          局。独立报价、无本地开局记录的导入局不纳入完整试玩分母。
        </p>
        <p class="muted">
          明细上限 2,000 条 / 256 KiB，满后保留汇总并裁剪旧明细。最多保留 40
          局汇总，达到上限后提示导出；没有继续记录的新局不进入统计。关闭页面仅为疑似流失，超过 24
          小时未继续才列为观察流失。
        </p>
        <div class="actions">
          <button class="primary" :disabled="exporting" @click="download">
            导出本地试玩指标 JSON</button
          ><button class="secondary" @click="clear">清空试玩记录</button>
        </div>
      </section>
      <RouterLink to="/" class="text-link">返回入口</RouterLink>
    </div>
  </WorkbenchShell>
</template>
