<script setup lang="ts">
import { useId } from 'vue';
import type { Scene } from '../../domain/schemas/presentation';
defineProps<{ scene: Exclude<Scene, 'samples'> }>();
const id = useId();
</script>
<template>
  <!-- Decorative scenery, never a representation of stock, cash or shipment completion. -->
  <svg
    class="scene-artwork trade-artwork"
    :data-artwork="scene"
    viewBox="0 0 560 340"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        :id="id + '-sky'"
        x1="280"
        y1="20"
        x2="280"
        y2="300"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#d0e2da" />
        <stop offset="1" stop-color="#f7eed7" />
      </linearGradient>
      <linearGradient
        :id="id + '-wood'"
        x1="80"
        y1="247"
        x2="440"
        y2="323"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#ddbd8b" />
        <stop offset="1" stop-color="#b88254" />
      </linearGradient>
      <linearGradient
        :id="id + '-paper'"
        x1="230"
        y1="150"
        x2="340"
        y2="280"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#fffcf1" />
        <stop offset="1" stop-color="#eadcc0" />
      </linearGradient>
    </defs>
    <path d="M90 286V118a190 108 0 0 1 380 0v168Z" :fill="`url(#${id}-sky)`" />
    <path
      d="M90 283V118a190 108 0 0 1 380 0v165M280 17v200M93 120h374"
      stroke="#c2cebb"
      stroke-width="4"
    />
    <circle cx="365" cy="73" r="29" fill="#f3d291" opacity=".9" />
    <path d="m345 102-86 140h148l-32-140" fill="#fff7df" opacity=".4" />
    <g class="scene-cloud" stroke="#fffdf1" stroke-width="7" stroke-linecap="round">
      <path d="M141 81h48m-34-12h17m173 60h44m-25-12h13" />
    </g>
    <path
      d="M97 193v-26h31v-24h23v50h18v-44h37v44h28v-15h29v35H97m228 0v-34h23v-16h34v50h21v-30h32v30h33"
      fill="#afc4b6"
      opacity=".55"
    />
    <ellipse cx="283" cy="317" rx="236" ry="17" fill="#6a795c" opacity=".12" />
    <template v-if="scene === 'harbor'">
      <path d="M45 273H500l-12 37H62Z" fill="#93b9ae" />
      <path
        d="M62 266V116h150M68 120l61 53m-55-52v145m53-144v87m-7 0h15M390 245V148h86m-80 5 37 31"
        stroke="#638a7a"
        stroke-width="6"
        stroke-linejoin="round"
      />
      <path d="M80 269h58v-39H80zM143 268h57v-39h-57zM111 226h57v-37h-57z" fill="#bd9264" />
      <path
        d="M92 234v29m14-29v29m14-29v29m35-29v29m14-29v29m14-29v29m-58-70v29m14-29v29m14-29v29"
        stroke="#e9d5aa"
        stroke-width="3"
      />
      <g class="scene-vessel">
        <path d="M212 258h266l-29 38H245Z" fill="#2e5b4e" />
        <path d="M224 265h244" stroke="#f0d89e" stroke-width="3" />
        <path d="M398 216h39v42h-39z" fill="#f9f3df" />
        <path d="M411 196h12v20h-12z" fill="#496d60" />
        <path d="M405 226h25v12h-25z" fill="#8ab2a7" />
        <path d="M243 222h68v35h-68zM315 221h66v36h-66zM279 183h67v34h-67z" fill="#ce946b" />
        <path
          d="M254 229v22m15-22v22m15-22v22m15-22v22m27-22v22m15-22v22m15-22v22m15-22v22m-81-62v23m15-23v23m15-23v23m15-23v23"
          stroke="#f2d5a8"
          stroke-width="3"
        />
        <circle cx="445" cy="274" r="4" fill="#e1cf9d" />
      </g>
      <path
        class="scene-water"
        d="M61 288h29m20 13h42m17-14h29m-1 17h49m47 9h39m40-8h32m34 1h45"
        stroke="#ebf5df"
        stroke-width="3"
        stroke-linecap="round"
      />
      <g transform="translate(35 185) rotate(-8)">
        <rect width="69" height="82" rx="5" fill="#f8f3df" stroke="#bbbd9d" />
        <rect x="9" y="14" width="51" height="17" rx="3" fill="#c4d4ba" />
        <path d="M13 42h44m-44 12h30m-30 12h36" stroke="#9da98d" stroke-width="3" />
        <path d="M19 0v14m30-14v14" stroke="#4d6c54" stroke-width="4" />
      </g>
    </template>
    <template v-else>
      <path d="M65 246h395l57 49H35Z" :fill="`url(#${id}-wood)`" />
      <path d="M35 295h482v13H35z" fill="#b58159" />
      <path d="m66 308 8 22m401-22-7 22" stroke="#5b7259" stroke-width="10" />
      <path d="M61 288h434m-420-9h390" stroke="#edd4a7" opacity=".5" stroke-width="2" />
      <template v-if="scene === 'inbox'">
        <path d="M123 105h232a9 9 0 0 1 9 9v122H114V114a9 9 0 0 1 9-9Z" fill="#537767" />
        <rect x="123" y="115" width="232" height="111" rx="3" fill="#f2efd9" />
        <path d="M123 115h48v111h-48z" fill="#c4d4ba" />
        <circle cx="147" cy="134" r="9" fill="#5f846e" />
        <path d="M135 156h24m-24 14h17m-17 14h20" stroke="#799b7d" stroke-width="3" />
        <g stroke="#b7c4a7" stroke-width="3"><path d="M208 142h122m-122 28h122m-122 28h82" /></g>
        <g fill="#d9b775">
          <rect x="183" y="132" width="16" height="14" rx="2" />
          <rect x="183" y="160" width="16" height="14" rx="2" />
          <rect x="183" y="188" width="16" height="14" rx="2" />
        </g>
        <path d="M110 236h258l28 24H86Z" fill="#8da38a" />
        <path d="M222 246h40l8 9h-56z" fill="#c9d2b4" />
        <g class="scene-mail" transform="rotate(-9 369 225)">
          <rect
            x="318"
            y="191"
            width="107"
            height="73"
            rx="5"
            :fill="`url(#${id}-paper)`"
            stroke="#a7b391"
            stroke-width="2"
          />
          <path
            d="m320 194 51 36 52-36m-103 68 35-29m67 29-34-29"
            stroke="#b9bba1"
            stroke-width="2"
          />
          <circle cx="411" cy="192" r="12" fill="#ca9368" />
        </g>
        <path d="m116 268 69-5 16 17-70 5Z" fill="#f9efd4" />
        <path d="m131 272 44-3" stroke="#9eaa8e" stroke-width="2" />
      </template>
      <template v-else-if="scene === 'quote'">
        <path d="m108 167 157-15 30 121-165 13Z" fill="#b9c4a3" />
        <path d="m115 157 157-14 23 121-165 14Z" :fill="`url(#${id}-paper)`" />
        <path
          d="m135 180 117-11m-113 27 117-11m-113 27 117-11m-113 27 117-11m-99-50 12 78m30-82 12 78"
          stroke="#bdc4a8"
          stroke-width="2"
        />
        <path d="m150 255 105-10" stroke="#cc9567" stroke-width="4" />
        <g class="scene-object" transform="rotate(8 338 211)">
          <rect x="288" y="125" width="110" height="153" rx="12" fill="#3b6654" />
          <rect x="300" y="138" width="86" height="32" rx="4" fill="#ccd9b6" />
          <path d="M341 154h35" stroke="#628067" stroke-width="4" />
          <path
            d="M308 190h13m17 0h13m17 0h10m-70 25h13m17 0h13m17 0h10m-70 25h13m17 0h13m17 0h10m-70 23h43"
            stroke="#f1d4a0"
            stroke-width="10"
            stroke-linecap="round"
          />
        </g>
        <path d="m233 136 36 115" stroke="#bf855c" stroke-width="7" stroke-linecap="round" />
        <path d="m269 251 2 12-8-10" fill="#4a6852" />
        <path d="M83 191h26v57H83z" fill="#73967c" />
        <path d="M84 181h25v12H84z" fill="#bdc7a7" />
      </template>
      <template v-else-if="scene === 'meeting'">
        <path
          d="M128 244v-82q0-19 19-19h23q19 0 19 19v82m182 0v-82q0-19 19-19h23q19 0 19 19v82"
          fill="#8ea88c"
        />
        <path d="m194 186 139 4-7 84-143-4z" fill="#b7bfa1" />
        <path d="m199 180 139 4-7 84-143-4z" :fill="`url(#${id}-paper)`" />
        <path
          d="m215 201 99 3m-100 13 99 3m-100 13 61 2m-61 14 37 1m19 1 31 1"
          stroke="#a6b298"
          stroke-width="3"
        />
        <path class="scene-pen" d="m320 171-23 74 7 3 23-74Z" fill="#bf8456" />
        <path d="m297 245-1 12 8-9" fill="#385d4b" />
        <g fill="#fbf5e1" stroke="#b7bc9b" stroke-width="2">
          <ellipse cx="137" cy="256" rx="28" ry="8" />
          <path d="M121 222h32v27a16 8 0 0 1-32 0Z" />
          <path d="M154 229h7a8 8 0 0 1 0 16h-7" />
          <ellipse cx="398" cy="257" rx="27" ry="8" />
          <path d="M382 224h32v27a16 8 0 0 1-32 0Z" />
          <path d="M414 231h7a8 8 0 0 1 0 16h-7" />
        </g>
        <path
          d="M137 209q-8-9 0-18m261 18q-8-9 0-18"
          stroke="#fbf8e4"
          stroke-width="4"
          stroke-linecap="round"
        />
        <path d="m220 282 50 1 7 7-50-1z" fill="#546e55" />
        <path d="m300 282 50 1 7 7-50-1z" fill="#c7af7e" />
      </template>
      <template v-else-if="scene === 'warehouse'">
        <path
          d="M116 119v128m269-128v128M107 120h287m-287 61h287m-287 64h287"
          stroke="#738d6e"
          stroke-width="6"
        />
        <path
          d="M131 130h64v45h-64zM201 130h75v45h-75zM283 130h85v45h-85zM130 194h90v45h-90zM229 191h60v49h-60z"
          fill="#cfaa75"
        />
        <path
          d="M157 130h12v24h-12zM230 130h13v24h-13zM318 130h13v24h-13zM168 194h13v24h-13zM252 191h13v24h-13z"
          fill="#eee0b8"
        />
        <path d="m91 241 78-7 23 43-83 9z" fill="#ba9565" />
        <path d="m94 239 78-7 23 43-83 9z" fill="#efd8ad" />
        <path d="m129 237 22 41" stroke="#bb9463" stroke-width="15" />
        <g transform="rotate(8 335 239)">
          <rect x="300" y="190" width="85" height="102" rx="5" fill="#466d56" />
          <rect x="306" y="199" width="73" height="86" rx="2" :fill="`url(#${id}-paper)`" />
          <rect x="326" y="187" width="31" height="13" rx="4" fill="#bfc7a5" />
          <path d="M317 219h9v9h-9zm0 23h9v9h-9zm0 23h9v9h-9z" stroke="#a5b596" stroke-width="2" />
          <path d="M337 224h31m-31 23h31m-31 23h23" stroke="#9eaf91" stroke-width="3" />
        </g>
        <g class="scene-inspection">
          <circle
            cx="242"
            cy="239"
            r="25"
            fill="#dce8d2"
            fill-opacity=".5"
            stroke="#4e7760"
            stroke-width="7"
          />
          <path d="m261 259 24 26" stroke="#ac7f54" stroke-width="11" stroke-linecap="round" />
          <path d="M229 224q12-8 23 1" stroke="#fbf9e9" stroke-width="4" stroke-linecap="round" />
        </g>
      </template>
      <template v-else-if="scene === 'documents'">
        <path d="m95 196 124-13 11 92-124 13z" fill="#c3a878" />
        <path d="m105 190 113-12 9 90-113 12z" :fill="`url(#${id}-paper)`" />
        <path d="m119 212 81-9m-79 24 81-9m-79 24 59-7" stroke="#a6b097" stroke-width="3" />
        <g class="scene-object">
          <path d="m228 146 119 9-10 126-119-9z" fill="#b8c5a3" />
          <path d="m233 138 119 9-10 126-119-9z" :fill="`url(#${id}-paper)`" />
          <path
            d="m249 163 86 6m-87 12 86 6m-87 12 56 4m-57 13 85 6"
            stroke="#a4b295"
            stroke-width="3"
          />
          <rect x="246" y="235" width="68" height="17" rx="3" fill="#d6dec3" />
        </g>
        <path d="M361 224h53v63h-53z" fill="#66856a" />
        <path d="M365 224q0-18 22-18t22 18" fill="#769379" />
        <path d="M369 238h37v29h-37z" fill="#f3e9ce" />
        <path d="M377 249h21m-21 8h15" stroke="#b5bda1" stroke-width="3" />
        <path d="m174 284 65-5 1 8-65 5z" fill="#b98159" />
        <path d="m174 284-12 5 13 3" fill="#3b5b47" />
        <path d="M88 161v-34h74v34" stroke="#b6c4a2" stroke-width="4" />
        <path d="M95 140h57m-57 10h42" stroke="#fbf7e5" stroke-width="3" />
      </template>
      <g v-if="scene !== 'meeting' && scene !== 'warehouse'" transform="translate(457 226)">
        <path
          d="M0 25v-55m0 22q-28 0-25-23 26 0 25 23m0 15q30-2 27-24-28-1-27 24m0-25q15-15 0-29-15 15 0 29"
          fill="#7d9a74"
          stroke="#70916a"
          stroke-width="2"
        />
        <path d="M-19 17h38l-5 36h-28z" fill="#c48e64" />
        <path d="M-19 17h38v8h-38z" fill="#dcaf85" />
      </g>
    </template>
  </svg>
</template>
