<script setup lang="ts">
defineProps<{ productId: string }>();
</script>
<template>
  <svg class="product-illustration" viewBox="0 0 240 150" fill="none" aria-hidden="true">
    <ellipse cx="120" cy="133" rx="64" ry="9" fill="#325a4a" opacity=".1" />
    <g v-if="productId === 'cup_500'">
      <rect x="90" y="28" width="60" height="105" rx="18" fill="#397568" />
      <rect x="92" y="19" width="56" height="25" rx="8" fill="#d7b97d" />
      <path d="M102 56v52" stroke="#92c1b3" stroke-width="5" stroke-linecap="round" />
      <path d="M101 28h38" stroke="#f4ddab" stroke-width="4" stroke-linecap="round" />
    </g>
    <g v-else-if="productId === 'tws'">
      <rect
        x="67"
        y="71"
        width="106"
        height="60"
        rx="25"
        fill="#fdfdf6"
        stroke="#9eafb3"
        stroke-width="2"
      />
      <path d="M70 91h100" stroke="#b6c6c7" stroke-width="2" />
      <circle cx="120" cy="109" r="3" fill="#678f7a" />
      <path
        d="M93 53c-25 0-23-34-4-34 11 0 14 7 14 16v31H93Zm54 0c25 0 23-34 4-34-11 0-14 7-14 16v31h10Z"
        fill="#fffef7"
        stroke="#9eafb3"
        stroke-width="2"
      />
      <path d="M85 28v9m70-9v9" stroke="#779399" stroke-width="5" stroke-linecap="round" />
    </g>
    <g v-else>
      <path d="m77 29 20-10 23 10 23-10 20 10-12 43-62 0Z" fill="#b67d69" />
      <path d="m91 77 29 4 29-4 20 52-37 3-12-36-12 36-37-3Z" fill="#976c60" />
      <path d="m99 25 21 14 21-14m-49 38h56" stroke="#e7b29b" stroke-width="3" />
    </g>
  </svg>
</template>
