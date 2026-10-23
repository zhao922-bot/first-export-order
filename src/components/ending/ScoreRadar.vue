<script setup lang="ts">
import { computed } from 'vue';
import type { EndingViewModel } from '../../app/debriefView';
const props = defineProps<{ model: EndingViewModel }>();
const point = (i: number, r: number) => [
  180 + Math.cos((i * Math.PI * 2) / 5 - Math.PI / 2) * r,
  170 + Math.sin((i * Math.PI * 2) / 5 - Math.PI / 2) * r,
];
const polygon = (scale: number) =>
  props.model.axes.map((_, i) => point(i, 110 * scale).join(',')).join(' ');
const actual = computed(() =>
  props.model.axes.map((a, i) => point(i, (110 * a.score) / 100).join(',')).join(' '),
);
</script>
<template>
  <section class="panel score-section" aria-labelledby="score-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">证据组成成绩</p>
        <h2 id="score-title">五维评分</h2>
      </div>
      <p>
        总评 <strong data-testid="score-average">{{ model.average }}</strong> / 100
      </p>
    </div>
    <div class="score-layout">
      <svg
        viewBox="0 0 360 330"
        role="img"
        aria-label="五维评分雷达图，分数和计算依据见右侧表格"
        class="score-radar"
      >
        <polygon
          v-for="scale in [0.25, 0.5, 0.75, 1]"
          :key="scale"
          :points="polygon(scale)"
          class="radar-grid"
        />
        <line
          v-for="(_, i) in model.axes"
          :key="i"
          x1="180"
          y1="170"
          :x2="point(i, 110)[0]"
          :y2="point(i, 110)[1]"
          class="radar-grid"
        />
        <polygon :points="actual" class="radar-value" />
        <g v-for="(axis, i) in model.axes" :key="axis.id">
          <circle
            :cx="point(i, (110 * axis.score) / 100)[0]"
            :cy="point(i, (110 * axis.score) / 100)[1]"
            r="4"
            fill="#167568"
          />
          <text
            :x="point(i, 144)[0]"
            :y="point(i, 140)[1]"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ axis.label }} {{ axis.score }}
          </text>
        </g>
      </svg>
      <div>
        <table class="score-table">
          <caption>
            结算时成绩与评分依据
          </caption>
          <thead>
            <tr>
              <th scope="col">维度</th>
              <th scope="col">分数</th>
              <th scope="col">计分依据</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="axis in model.axes" :key="axis.id" :data-score-axis="axis.id">
              <th scope="row">{{ axis.label }}</th>
              <td>{{ axis.score }} / 100</td>
              <td>
                {{
                  axis.evidence
                    ? `${axis.evidence.earned} / ${axis.evidence.possible} 证据分`
                    : '净利润 / 目标利润基数'
                }}<span v-if="axis.id === 'relationship'"
                  >；本单真实客户信任 {{ model.trust }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          各维度等权平均；结局由现金、利润、收款完成与信誉判定。未走的付款路线不扣分。
        </p>
      </div>
    </div>
    <details class="score-basis">
      <summary>展开五维评分依据与每项证据</summary>
      <h3>利润：{{ model.result.scores.profit }} 分</h3>
      <p>
        100 × max(0, 已确认净利润) ÷ max(成本口径支出 × {{ model.targetReturn }},
        {{ model.minimumBasis }})，取整并限制在 0–100。成本口径支出
        {{ model.costBasis }}，包括已确认费用并扣除合资格退税，不计初始资本和客户来款。
      </p>
      <div
        v-for="axis in model.axes.filter((a) => a.evidence)"
        :key="axis.id"
        class="evidence-group"
      >
        <h3>{{ axis.label }} · {{ axis.score }} 分</h3>
        <p v-if="axis.id === 'relationship'">
          70% × 当前真实客户信任 {{ model.trust }} + 30% × 沟通证据标准分
          {{ axis.evidence!.score }}，四舍五入。诈骗线索信任不计分。
        </p>
        <p v-else>
          100 × 已得证据分 {{ axis.evidence!.earned }} ÷ 应评满分
          {{ axis.evidence!.possible }}，四舍五入。
        </p>
        <ul>
          <li
            v-for="item in axis.evidence!.opportunities"
            :key="item.id"
            :data-opportunity="item.id"
          >
            <strong>{{ item.title }}：{{ item.earned }} / {{ item.possible }}</strong> ·
            {{
              item.attempts === 0
                ? '必经项尚未完成'
                : item.attempts > 1
                  ? '经历返工，最高记 1 分'
                  : item.earned === 2
                    ? '首次独立完成'
                    : item.earned === 1
                      ? '辅导后完成'
                      : '本次未获得证据分'
            }}
          </li>
        </ul>
      </div>
      <p class="muted">
        同一机会只计最后一次证据；纠错后不能刷回首次满分。未触发事件不进分母。所有门槛为教学参数。
      </p>
    </details>
  </section>
</template>
