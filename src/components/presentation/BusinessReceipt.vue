<script setup lang="ts">
import { presentation } from '../../content/presentation';
import type { decisionReceipt } from '../../app/presentation';
import type { MentorCue } from '../../domain/schemas/presentation';
import { formatMoney } from '../../app/useSliceGame';
import CharacterPortrait from './CharacterPortrait.vue';
defineProps<{ model: NonNullable<ReturnType<typeof decisionReceipt>>; cue: MentorCue }>();
const copy = presentation.receipt;
</script>
<template>
  <article
    class="business-receipt"
    :data-receipt-source="model.sourceId"
    :data-receipt-scene="model.scene"
    aria-label="本次操作回执"
  >
    <div class="receipt-heading">
      <div>
        <span class="eyebrow">{{ copy.label }}</span>
        <h3>{{ model.title }}</h3>
        <p class="receipt-state">{{ copy.state }} · {{ model.status }}</p>
      </div>
      <CharacterPortrait compact :cue="cue" />
    </div>
    <p
      :key="model.sourceId"
      class="ledger-entry"
      :data-ledger-direction="
        model.deltas.cashCnyFen < 0 ? 'out' : model.deltas.cashCnyFen > 0 ? 'in' : 'none'
      "
    >
      <span aria-hidden="true" class="ledger-arrow">{{
        model.deltas.cashCnyFen === 0 ? '—' : model.deltas.cashCnyFen > 0 ? '↙' : '↗'
      }}</span>
      <span
        >{{ presentation.experience.ledger
        }}<strong>{{
          model.deltas.cashCnyFen === 0
            ? presentation.experience.cashUnchanged
            : model.deltas.cashCnyFen > 0
              ? presentation.experience.cashIn
              : presentation.experience.cashOut
        }}</strong></span
      >
    </p>
    <dl class="receipt-metrics">
      <div
        :data-cash-direction="
          model.deltas.cashCnyFen < 0 ? 'out' : model.deltas.cashCnyFen > 0 ? 'in' : 'none'
        "
      >
        <dt>{{ copy.cash }}</dt>
        <dd data-testid="receipt-cash">{{ formatMoney(model.deltas.cashCnyFen) }}</dd>
        <small v-if="model.deltas.cashCnyFen === 0">{{ copy.zeroCash }}</small>
      </div>
      <div>
        <dt>{{ copy.profit }}</dt>
        <dd data-testid="receipt-profit">{{ formatMoney(model.deltas.profitCnyFen) }}</dd>
      </div>
      <div>
        <dt>{{ copy.time }}</dt>
        <dd data-testid="receipt-days">
          {{ model.deltas.days }} <small>{{ copy.days }}</small>
        </dd>
      </div>
    </dl>
    <p class="receipt-relationship">
      {{ copy.reputation }} {{ model.deltas.reputation }} <span>·</span> {{ copy.trust }}
      {{ model.deltas.trust }}
    </p>
    <p class="receipt-note">{{ model.note }}</p>
  </article>
</template>
