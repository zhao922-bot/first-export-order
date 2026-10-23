<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue';
import { useSliceGame } from '../../app/useSliceGame';
import KnowledgeGraph from './KnowledgeGraph.vue';
const props = defineProps<{ initialId?: string | undefined }>();
const sourceHost = (url: string) => new URL(url).hostname;
const game = useSliceGame(),
  selectedId = ref(''),
  cardHeading = ref<HTMLHeadingElement | null>(null);
const cards = computed(() => game.knowledgeCards);
const selected = computed(() => cards.value.find((t) => t.id === selectedId.value));
const mastered = computed(() => cards.value.filter((t) => t.status === '掌握').length);
const learned = computed(() => cards.value.filter((t) => t.status === '接触').length);
function select(id: string) {
  if (!cards.value.some((t) => t.id === id)) return;
  selectedId.value = id;
  game.act({ type: 'openTerm', termId: id });
  void nextTick(() => cardHeading.value?.focus());
}
watch(
  () => props.initialId,
  (id) => {
    if (id) select(id);
  },
  { immediate: true },
);
</script>
<template>
  <section class="panel knowledge-notebook" aria-labelledby="knowledge-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">把一次经历变成可复用的知识</p>
        <h2 id="knowledge-title">知识图鉴</h2>
      </div>
      <p data-testid="knowledge-count">
        掌握 {{ mastered }} · 接触 {{ learned }} · 未解锁 {{ 24 - mastered - learned }}
      </p>
    </div>
    <p v-if="game.session?.ending" class="muted">
      结算时掌握 {{ game.session.ending.result.masteredTermIds.length }} 个，接触过
      {{ game.session.ending.result.learnedTermIds.length }}
      个。复盘补学保存在本地，五维成绩保持结算时的结果。
    </p>
    <KnowledgeGraph :cards="cards" :selected-id="selectedId" @select="select" />
    <article v-if="selected" class="knowledge-card" aria-label="当前知识词条">
      <p class="eyebrow">{{ selected.status }} · 教学草稿，专业内容待审校</p>
      <h3 ref="cardHeading" tabindex="-1">{{ selected.title }}</h3>
      <p>{{ selected.plainDefinition }}</p>
      <p class="knowledge-example">{{ selected.example }}<small>教学算例参数，可配置</small></p>
      <details>
        <summary>常见误区与学习前置</summary>
        <p>{{ selected.pitfall }}</p>
        <p v-if="!selected.prerequisites.length">没有指定学习前置词条。</p>
        <ul v-else>
          <li v-for="p in selected.prerequisites" :key="p.id">
            <button class="text-link" @click="select(p.id)">{{ p.title }}</button>
          </li>
        </ul>
        <ul v-if="selected.sourceRefs.length" aria-label="参考资料">
          <li v-for="url in selected.sourceRefs" :key="url">
            <a class="text-link" :href="url" target="_blank" rel="noopener noreferrer"
              >参考资料 · {{ sourceHost(url) }}</a
            >
          </li>
        </ul>
        <p v-else class="muted">本卡依据项目教学模型编写；计算示例由本局参数生成。</p>
      </details>
      <fieldset class="knowledge-quiz" :disabled="!game.session">
        <legend>换个情境想一想：{{ selected.quiz.question }}</legend>
        <button
          v-for="option in selected.quiz.options"
          :key="option.id"
          class="secondary"
          :data-answer-id="option.id"
          :aria-pressed="selected.answer === option.id"
          @click="game.act({ type: 'answerTerm', termId: selected.id, answerId: option.id })"
        >
          {{ option.text }}
        </button>
      </fieldset>
      <p v-if="selected.feedback" role="status" class="quiz-feedback">{{ selected.feedback }}</p>
      <p v-if="!game.session" class="muted">开始练习后可保存接触与掌握记录。</p>
    </article>
    <p v-else class="muted">选择一个词条，查看本局示例并用一道复习题验证理解。</p>
  </section>
</template>
