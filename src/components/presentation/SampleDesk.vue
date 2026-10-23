<script setup lang="ts">
import { useId } from 'vue';
defineProps<{ productId?: string | undefined }>();
const id = useId();
</script>
<template>
  <svg
    class="scene-artwork sample-desk"
    viewBox="0 0 560 340"
    fill="none"
    aria-hidden="true"
    :data-product="productId ?? 'assortment'"
  >
    <defs>
      <linearGradient
        :id="`${id}-wood`"
        x1="100"
        y1="230"
        x2="400"
        y2="320"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#dfbe91" />
        <stop offset="1" stop-color="#ab7752" />
      </linearGradient>
      <linearGradient
        :id="`${id}-glass`"
        x1="120"
        y1="20"
        x2="280"
        y2="210"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#bdd5ce" />
        <stop offset="1" stop-color="#f7eed6" />
      </linearGradient>
      <linearGradient :id="`${id}-cup`">
        <stop stop-color="#274f46" />
        <stop offset=".45" stop-color="#629285" />
        <stop offset="1" stop-color="#234b43" />
      </linearGradient>
    </defs>
    <!-- A window, sample shelf and warm tabletop; every object is decorative. -->
    <path d="M58 244V80a105 62 0 0 1 210 0v164Z" fill="#c6cbb6" />
    <path d="M69 235V83a94 53 0 0 1 188 0v152Z" :fill="`url(#${id}-glass)`" />
    <circle cx="213" cy="89" r="26" fill="#fff0be" />
    <path d="M80 200h26v-49h23v49h17v-69h36v69h17v-39h25v39h23" fill="#94b2a7" opacity=".5" />
    <path d="M162 29v207M69 131h189" stroke="#f7eed9" stroke-width="8" />
    <path d="m92 130 60 0 214 161H201Z" fill="#fff9dc" opacity=".32" />
    <rect x="297" y="75" width="181" height="112" rx="5" fill="#e8dfc7" stroke="#c4b99a" />
    <path d="M312 162h151" stroke="#b49a77" stroke-width="7" stroke-linecap="round" />
    <rect x="321" y="116" width="37" height="43" rx="3" fill="#d6b385" />
    <path d="M337 116v19" stroke="#faf0d8" stroke-width="8" />
    <path d="M380 159v-51h12v51m7 0v-61h12v61m8 0v-46h12v46" stroke="#688476" stroke-width="9" />
    <path d="M58 245h419l54 54H12Z" :fill="`url(#${id}-wood)`" />
    <path d="M12 299h519v13H12z" fill="#986f4f" />
    <path d="M42 312v22m457-22v22" stroke="#526758" stroke-width="14" />
    <path
      d="m79 270 300 0m-252 15h305m-382 11h237"
      stroke="#f8dfb8"
      opacity=".3"
      stroke-linecap="round"
    />
    <path d="m335 249 98-4 22 36-100 5Z" fill="#a47e57" opacity=".25" />
    <path d="m329 241 98-4 22 36-100 5Z" fill="#fff9e9" />
    <path
      d="m342 250 55-2m-50 9 66-2m-60 9 27-1"
      stroke="#a4af99"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path d="m414 245 24 24" stroke="#315a4e" stroke-width="5" stroke-linecap="round" />
    <ellipse cx="200" cy="268" rx="93" ry="14" fill="#554d35" opacity=".13" />
    <g v-if="!productId || productId === 'cup_500'" class="sample-feature">
      <rect x="171" y="148" width="61" height="115" rx="18" :fill="`url(#${id}-cup)`" />
      <rect x="171" y="139" width="61" height="23" rx="7" fill="#c5a36a" />
      <path d="M178 146h47M181 157h42" stroke="#f8df9f" stroke-width="2" opacity=".8" />
      <path d="M184 175v62" stroke="#b0d5c4" stroke-width="4" stroke-linecap="round" opacity=".7" />
      <rect x="192" y="199" width="22" height="18" rx="3" fill="#e0d9b7" opacity=".7" />
    </g>
    <g v-else-if="productId === 'tws'" class="sample-feature" stroke="#7b9894" stroke-width="2">
      <rect x="145" y="204" width="110" height="58" rx="24" fill="#fffdf4" />
      <path d="M148 222h104" />
      <circle cx="200" cy="241" r="3" fill="#6f9a7d" />
      <path
        d="M170 184c-24 0-22-32-4-32 11 0 13 7 13 15v29h-9Zm61 0c24 0 22-32 4-32-11 0-13 7-13 15v29h9Z"
        fill="#fffdf4"
      />
    </g>
    <g v-else class="sample-feature">
      <path d="m165 161 19-10 18 9 18-9 19 10-11 39h-52Z" fill="#bc8974" />
      <path d="m175 207 27 4 27-4 18 47-34 3-11-32-11 32-34-3Z" fill="#9e7465" />
      <path d="m185 159 17 10 17-10m-41 32h47" stroke="#ebc3a9" stroke-width="3" />
    </g>
    <path d="m74 219 49-12 23 41-49 12Z" fill="#c69c66" />
    <path d="m74 219 15-19 49-12-15 19m0 0 15-19 23 41-15 19" fill="#e8c997" />
    <path d="m94 215 15-19 10-2-15 19 12 21-10 3Z" fill="#f7e8c9" />
    <path
      d="M466 231v-43m0 20q-27-1-22-22 23 0 22 22m0-8q22 0 22-25-24 1-22 25"
      fill="#6d8e6e"
      stroke="#6d8e6e"
      stroke-width="3"
    />
    <path d="M448 224h37l-6 28h-25Z" fill="#bb8463" />
    <path d="m160 278 64-1 6 12-66 1Z" fill="#fff6df" />
    <path d="M174 284h36" stroke="#b5a582" stroke-width="2" />
  </svg>
</template>
