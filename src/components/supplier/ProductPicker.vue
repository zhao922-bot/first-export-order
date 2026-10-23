<script setup lang="ts">
import type { Product } from '../../domain/types';
import ProductIllustration from '../presentation/ProductIllustration.vue';
defineProps<{ products: (Product & { choiceId: string })[] }>();
defineEmits<{ choose: [id: string] }>();
</script>
<template>
  <div class="product-grid">
    <article v-for="product in products" :key="product.id" class="product-card">
      <div class="product-art" :class="product.id">
        <ProductIllustration :product-id="product.id" />
        <small>{{ product.attributes.focus }}</small>
      </div>
      <div class="card-body">
        <h2>{{ product.name }}</h2>
        <p>{{ product.description }}</p>
        <p class="muted">3 家供应商可比较</p>
        <button
          class="primary full"
          data-guide="product"
          @click="$emit('choose', product.choiceId)"
        >
          选择{{ product.name }} →
        </button>
      </div>
    </article>
  </div>
</template>
