<script setup lang="ts">
import type { Scene } from '../../domain/schemas/presentation';
import SampleDesk from './SampleDesk.vue';
import TradeScene from './TradeScene.vue';
defineProps<{ scene: Scene; productId?: string | undefined }>();
</script>
<template>
  <SampleDesk v-if="scene === 'samples'" :product-id="productId" />
  <TradeScene v-else :scene="scene" />
</template>
