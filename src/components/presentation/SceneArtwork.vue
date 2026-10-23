<script setup lang="ts">
import { useId } from 'vue';
import type { Scene } from '../../domain/schemas/presentation';
defineProps<{ scene: Scene }>();
const sky = useId();
</script>
<template>
  <svg class="scene-artwork" viewBox="0 0 420 260" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="sky" x1="210" y1="15" x2="210" y2="240" gradientUnits="userSpaceOnUse">
        <stop stop-color="#d8e5dd" />
        <stop offset="1" stop-color="#f7edda" />
      </linearGradient>
    </defs>
    <path d="M40 235V110a170 100 0 0 1 340 0v125Z" :fill="`url(#${sky})`" />
    <circle cx="305" cy="69" r="24" fill="#edc986" />
    <g class="scene-cloud" stroke="#fffaf1" stroke-width="8" stroke-linecap="round">
      <path d="M68 66h57m-39-12h20m110 48h42m-29-12h15" />
    </g>
    <path d="M36 235H390" stroke="#c9c9ac" stroke-width="3" stroke-linecap="round" />
    <template v-if="scene === 'harbor'">
      <path d="M58 155V82h114M64 87l45 41m33-40v63m-7 0h15" stroke="#789689" stroke-width="5" />
      <path d="M18 214q30-12 60 0t60 0 60 0 60 0 60 0 60 0 60 0v31H18" fill="#b1cfca" />
      <g class="scene-vessel">
        <path d="M84 183h272l-29 36H107Z" fill="#234f48" />
        <path d="M294 145h35v38h-35z" fill="#faf4e6" />
        <path d="M309 124h10v22h-10z" fill="#315a50" />
        <path d="M110 153h56v29h-56zM171 153h56v29h-56z" fill="#c98b60" />
        <path d="M171 119h56v29h-56zM232 153h55v29h-55z" fill="#d8b96b" />
        <path
          d="M120 157v20m13-20v20m13-20v20m36-20v20m13-20v20m13-20v20m35-20v20m13-20v20m13-20v20m-87-54v20m13-20v20m13-20v20"
          stroke="#fff8e5"
          opacity=".5"
        />
        <path d="M303 154h18v10h-18z" fill="#91b4b0" />
      </g>
      <path
        class="scene-water"
        d="M36 230h54m45 8h58m51-8h47m30 9h52"
        stroke="#f7fffa"
        stroke-width="3"
        stroke-linecap="round"
      />
    </template>
    <template v-else-if="scene === 'warehouse'">
      <path d="M80 101h236v130H80z" fill="#dfd7bd" />
      <path d="m64 104 135-65 135 65" stroke="#52786a" stroke-width="13" stroke-linejoin="round" />
      <path d="M159 130h80v104h-80z" fill="#95aca0" />
      <path d="M90 184h57v49H90zM243 183h62v50h-62zM248 139h52v40h-52z" fill="#c79c67" />
      <path d="M114 185h10v24h-10zM268 184h10v24h-10zM269 140h10v20h-10z" fill="#f5dfb3" />
      <g class="scene-inspection">
        <circle cx="194" cy="174" r="25" stroke="#fdf6e6" stroke-width="8" />
        <path d="m212 193 22 26" stroke="#2e6054" stroke-width="11" stroke-linecap="round" />
      </g>
    </template>
    <template v-else>
      <path d="M53 213h307v14H53z" fill="#b98a60" />
      <path d="M75 226v24m260-24v24" stroke="#577263" stroke-width="10" />
      <g v-if="scene === 'samples'" class="scene-object">
        <ellipse cx="148" cy="213" rx="43" ry="7" fill="#9eaa8a" opacity=".4" />
        <rect x="120" y="107" width="56" height="103" rx="16" fill="#2e6c5e" />
        <rect x="122" y="99" width="52" height="21" rx="7" fill="#dfc58a" />
        <path d="M131 132v52" stroke="#8dbbae" stroke-width="5" stroke-linecap="round" />
        <path d="M217 161h75v51h-75z" fill="#d5b47e" />
        <path d="m217 161 34-20 75 1-34 19m0 0 34-19v51l-34 19" fill="#e7c995" />
        <path d="m250 161 12-7 11 0-12 7v23h-11z" fill="#f6ead0" />
      </g>
      <g v-else-if="scene === 'inbox'" class="scene-mail">
        <rect
          x="110"
          y="109"
          width="178"
          height="104"
          rx="9"
          fill="#fdf7e8"
          stroke="#789b8d"
          stroke-width="3"
        />
        <path
          d="m112 112 87 61 87-61m-174 97 60-52m114 52-60-52"
          stroke="#789b8d"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <circle cx="286" cy="110" r="23" fill="#c87b51" />
        <path d="M286 98v16m0 6v2" stroke="#fff9eb" stroke-width="4" stroke-linecap="round" />
      </g>
      <g v-else-if="scene === 'quote'">
        <path d="m84 124 115-21 14 93-116 20z" fill="#fffcf0" />
        <path d="m105 144 70-13m-66 30 57-10m-54 28 49-9" stroke="#b0b9a2" stroke-width="4" />
        <g class="scene-object">
          <rect x="211" y="94" width="92" height="119" rx="12" fill="#3b6c5e" />
          <rect x="222" y="107" width="70" height="25" rx="4" fill="#e2eacb" />
          <path
            d="M228 151h11m14 0h11m14 0h7m-57 21h11m14 0h11m14 0h7m-57 21h11m14 0h11m14 0h7"
            stroke="#f0d89f"
            stroke-width="9"
            stroke-linecap="round"
          />
        </g>
      </g>
      <g v-else-if="scene === 'meeting'">
        <path d="m139 142 109 4-7 64-111-8z" fill="#fffaf0" />
        <path d="m152 159 69 3m-70 12 69 3m-35 13 28 2" stroke="#a7b7a2" stroke-width="3" />
        <path class="scene-pen" d="m240 119-35 73 10 5 35-73z" fill="#c98952" />
        <path d="m205 192-1 15 11-10" fill="#36564c" />
        <path d="M81 169h30v32a15 12 0 0 1-30 0zM282 169h30v32a15 12 0 0 1-30 0z" fill="#76958a" />
        <path
          d="M85 154q-6-8 0-16m205 16q-6-8 0-16"
          stroke="#fffaf0"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>
      <g v-else-if="scene === 'documents'">
        <path d="m126 120 107-8 9 94-108 8z" fill="#d2b982" />
        <g class="scene-object">
          <path d="m143 92 111 8-8 107-112-9z" fill="#fffcf0" />
          <path d="m158 117 72 5m-74 14 71 6m-73 14 49 4" stroke="#a9b7a4" stroke-width="4" />
          <circle cx="219" cy="179" r="15" stroke="#759b85" stroke-width="3" />
          <path d="m211 179 6 6 11-12" stroke="#759b85" stroke-width="3" />
        </g>
        <path d="M273 193h42v17h-42z" fill="#e3bd6e" />
        <path d="M273 199h42" stroke="#b48a47" stroke-width="2" />
      </g>
      <path
        d="M326 191v-50m0 26q-30 0-24-21 27-3 24 21m0-11q29-2 24-23-26-2-24 23"
        fill="#7c9a72"
        stroke="#7c9a72"
        stroke-width="3"
      />
      <path d="M310 186h33l-5 26h-23z" fill="#d5a279" />
    </template>
  </svg>
</template>
