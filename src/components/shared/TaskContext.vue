<script setup lang="ts">
import type { ProcurementView } from '../../app/procurementView';
import type { LogisticsView } from '../../app/logisticsView';
import type { CollectionView } from '../../app/collectionView';
import { formatMoney } from '../../app/useSliceGame';
import { presentation } from '../../content/presentation';
defineProps<{
  procurement: ProcurementView | null;
  logistics: LogisticsView | null;
  collection: CollectionView | null;
}>();
</script>
<template>
  <!-- Decision evidence stays beside the controls, even when the full ledger is folded. -->
  <aside
    v-if="procurement || logistics || collection"
    class="task-context panel"
    aria-label="当前业务条件"
  >
    <template v-if="procurement">
      <p>
        <strong>{{ procurement.deadline }}</strong> · {{ procurement.fundingResult }}
      </p>
      <p v-if="!procurement.closed">
        采购总额 {{ formatMoney(procurement.amounts.total) }} · 约定定金
        {{ formatMoney(procurement.amounts.deposit) }} · 尚待支付
        {{ formatMoney(procurement.amounts.balance) }}。仅支付尚欠采购款后的现金
        {{ procurement.cashAfterBalance }}，尚未扣后续运保费用。
      </p>
      <p>{{ procurement.productionNote }}</p>
      <p v-if="procurement.qualityUnresolved" class="risk-note">
        本批仍有材质/包装问题，需要返工与复验。
      </p>
      <p v-if="procurement.documentsUnresolved" class="risk-note">
        本批凭证仍待补检核验，付款不会自动补齐证据。
      </p>
      <p v-if="procurement.cancellationPreview">{{ procurement.cancellationPreview }}</p>
    </template>
    <template v-if="logistics">
      <p>{{ logistics.responsibility }}</p>
      <p>
        <strong>{{ logistics.deadline }}</strong> · 教学合同逾期费用
        {{ logistics.dailyPenalty }}/天，信誉扣
        {{ logistics.dailyReputation }}/天；交付后不随收款等待增加。
      </p>
      <p class="risk-note">{{ logistics.riskText }}</p>
      <p v-for="option in logistics.riskOptions" :key="option.id">
        {{ option.name }}：本方新增 {{ option.cost }} · 买方主运价差
        {{ option.buyerExtra }}（不扣本方）；预计交付第 {{ option.delivery }} 天，尚待逾期费
        {{ option.penalty }}，两者支付后现金 {{ option.afterCost }}。
      </p>
    </template>
    <template v-if="collection">
      <p>
        <strong>{{ collection.payment }} · {{ collection.bankStatus }}</strong> · 尚欠外币本金
        {{ collection.outstanding }}
      </p>
      <p>{{ collection.message }}</p>
      <p v-if="collection.payment === 'LC_SIGHT'">{{ collection.lcTerms }}</p>
      <template v-if="collection.payment === 'OA_60'"
        ><p>
          {{
            collection.due === null
              ? presentation.experience.oaPending
              : presentation.experience.oaDue.replace('{day}', String(collection.due))
          }}{{ collection.oaTerms }}
        </p>
        <p>{{ collection.oaEvidence }}</p></template
      >
      <p v-if="collection.exwMessage">{{ collection.exwMessage }}</p>
    </template>
  </aside>
</template>
