<script setup lang="ts">
import { computed } from 'vue';
import type { KnowledgeCard } from '../../app/debriefView';
const props = defineProps<{ cards: KnowledgeCard[]; selectedId: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const pos = (index: number) => ({ x: 50 + (index % 6) * 100, y: 45 + Math.floor(index / 6) * 85 });
const edges = computed(() =>
  props.cards.flatMap((t, i) =>
    t.prerequisiteIds.map((id) => ({
      id: id + '-' + t.id,
      from: pos(props.cards.findIndex((x) => x.id === id)),
      to: pos(i),
    })),
  ),
);
</script>
<template>
  <div class="knowledge-map">
    <details class="graph-diagram">
      <summary>24 个知识节点与学习前置关系</summary>
      <svg
        viewBox="0 0 600 350"
        role="img"
        aria-label="知识图谱；下方词条列表提供相同节点和前置关系"
      >
        <defs>
          <marker
            id="knowledge-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill="#829c98" />
          </marker>
        </defs>
        <path
          v-for="e in edges"
          :key="e.id"
          :d="`M${e.from.x} ${e.from.y} Q${(e.from.x + e.to.x) / 2 - 20} ${(e.from.y + e.to.y) / 2 - 30} ${e.to.x} ${e.to.y}`"
          fill="none"
          stroke="#829c98"
          stroke-width="1.5"
          marker-end="url(#knowledge-arrow)"
        />
        <g v-for="(card, index) in cards" :key="card.id">
          <circle
            :cx="pos(index).x"
            :cy="pos(index).y"
            r="19"
            :class="[
              'knowledge-dot',
              { 'is-mastered': card.status === '掌握', 'is-learned': card.status === '接触' },
            ]"
          />
          <text :x="pos(index).x" :y="pos(index).y + 5" text-anchor="middle">
            {{ String(index + 1).padStart(2, '0') }}
          </text>
          <text :x="pos(index).x" :y="pos(index).y + 36" text-anchor="middle" class="graph-state">
            {{ card.status }}
          </text>
        </g>
      </svg>
      <p class="muted">
        箭头表示学习前置关系，不能当作法律从属关系。下列按钮可随时自愿查阅，未遇到的词条不扣分。
      </p>
    </details>
    <div class="knowledge-list" aria-label="知识词条列表">
      <button
        v-for="(card, index) in cards"
        :key="card.id"
        :data-term-id="card.id"
        :aria-pressed="selectedId === card.id"
        :class="['knowledge-button', { selected: selectedId === card.id }]"
        @click="emit('select', card.id)"
      >
        <span class="term-number">{{ String(index + 1).padStart(2, '0') }}</span
        ><span
          >{{ card.title }}<small>{{ card.status }}</small></span
        >
      </button>
    </div>
  </div>
</template>
