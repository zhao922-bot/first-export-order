<script setup lang="ts">
import type { CollectionView } from '../../app/collectionView';
defineProps<{ model: CollectionView }>();
</script>
<template>
  <section
    v-if="model.attempt"
    class="panel discrepancy-list"
    aria-label="单据核对结果"
    role="status"
  >
    <h2>{{ model.valid ? '单据校核通过' : '单据仍有差异' }}</h2>
    <p>
      第 {{ model.attempt }} 次校核：漏报 {{ model.omissions.length }} · 误报
      {{ model.falsePositives.length }} · 改正值不符 {{ model.wrongCorrections.length }}
    </p>
    <p v-if="model.omissions.length">漏报：{{ model.omissions.join('、') }}</p>
    <p v-if="model.falsePositives.length">误报：{{ model.falsePositives.join('、') }}</p>
    <p v-if="model.wrongCorrections.length">改正值不符：{{ model.wrongCorrections.join('、') }}</p>
    <p v-if="model.guidance && !model.valid">
      分步辅导已开启：返回单据后逐项对照提示填写，仍须再次提交校核。
    </p>
  </section>
</template>
