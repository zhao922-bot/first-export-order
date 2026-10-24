<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import StoryStage from '../presentation/StoryStage.vue';
import DeskPages from '../layout/DeskPages.vue';
import { presentation } from '../../content/presentation';
import TaskContext from './TaskContext.vue';
import { sceneActor, mentorCue, taskLabel } from '../../app/presentation';
import RescueCheckpoint from './RescueCheckpoint.vue';
import { useRouter, RouterLink } from 'vue-router';
import WorkbenchShell from '../layout/WorkbenchShell.vue';
import ProductPicker from '../supplier/ProductPicker.vue';
import SupplierCompare from '../supplier/SupplierCompare.vue';
import CostInput from '../quote/CostInput.vue';
import QuoteWorksheet from '../quote/QuoteWorksheet.vue';
import CashflowPreview from '../quote/CashflowPreview.vue';
import InquiryInbox from '../mail/InquiryInbox.vue';
import InquiryMessage from '../mail/InquiryMessage.vue';
import { useSliceGame, formatMoney } from '../../app/useSliceGame';
import RoundProgress from '../chat/RoundProgress.vue';
import PaymentCompare from '../chat/PaymentCompare.vue';
import ReplyChoices from '../chat/ReplyChoices.vue';
import NegotiationSummary from '../chat/NegotiationSummary.vue';
import ContractConfirmation from '../contract/ContractConfirmation.vue';
import PIConfirm from '../contract/PIConfirm.vue';
import FundingVerification from '../contract/FundingVerification.vue';
import InspectionChecklist from '../contract/InspectionChecklist.vue';
import ProcurementSummary from '../contract/ProcurementSummary.vue';
import ForwarderCompare from '../logistics/ForwarderCompare.vue';
import CutoffTimeline from '../logistics/CutoffTimeline.vue';
import DocumentGrid from '../documents/DocumentGrid.vue';
import DiscrepancyList from '../documents/DiscrepancyList.vue';
import TaxVerification from '../documents/TaxVerification.vue';
import CollectionSettlement from '../documents/CollectionSettlement.vue';
import ReceivableTimeline from '../finance/ReceivableTimeline.vue';
import DeclarationCheck from '../logistics/DeclarationCheck.vue';
const game = useSliceGame(),
  router = useRouter();
const state = computed(() => game.session?.snapshot);
const deskTab = ref<'task' | 'reference' | 'history'>('task');
const cue = computed(() =>
  mentorCue(presentation, {
    nodeId: game.node?.id ?? '',
    feedback: Boolean(game.session?.feedback),
    review: game.node?.type === 'review',
    event: Boolean(game.eventContext),
    risk: Boolean(game.lastDecision?.majorRisk),
  }),
);
const actor = computed(() =>
  sceneActor(presentation, {
    stage: state.value?.story.stage ?? 1,
    mentor: Boolean(game.eventContext || game.session?.feedback || game.node?.type === 'review'),
    sender: game.activeMail?.sender,
    customerId: game.selectedCustomer?.id,
  }),
);
const parametersDirty = ref(false);
const task = ref<HTMLElement | null>(null);
const archiveOpen = ref(true);
const taskCopy = computed(() =>
  taskLabel(presentation, Boolean(game.session?.feedback), game.node?.type === 'review'),
);
function goToTask() {
  task.value?.focus({ preventScroll: true });
  deskTab.value = 'task';
}
const heading = ref<HTMLHeadingElement | null>(null);
const feedbackHeading = ref<HTMLHeadingElement | null>(null);
watch(
  () => (game.node?.id ?? '') + '|' + (game.session?.feedback?.nextNodeId ?? ''),
  () => {
    (feedbackHeading.value ?? heading.value)?.focus({ preventScroll: true });
    deskTab.value = 'task';
  },
  { flush: 'post' },
);
watch(
  () => game.resumeRoute,
  (route) => {
    if (game.session) void router.replace(route);
  },
  { immediate: true },
);
const headings: Record<string, string> = {
  F01: '预计退税 R = P ÷ (1+v) × r（须合资格）',
  F02: 'FOB 成本 B = P − R + D ÷ Q',
  F03: 'FOBraw = B ÷ E × (1+m)',
  F06: 'CIFraw = (FOBraw + F÷Q) ÷ (1−a×i)',
};
function choose(id: string) {
  game.act({ type: 'choose', choiceId: id });
}
function advance() {
  game.act({ type: 'advance' });
}
</script>
<template>
  <WorkbenchShell fixed>
    <DeskPages v-if="game.session?.rescue?.pending" :reset-key="game.session.rescue.pending.phase"
      ><RescueCheckpoint
    /></DeskPages>
    <div v-else-if="!game.session" class="empty-state">
      <h1>从一份产品档案开始</h1>
      <p>当前还没有练习进度。</p>
      <RouterLink class="primary" to="/">返回入口</RouterLink>
    </div>
    <div v-else-if="game.node && state" class="work-area" :inert="game.storageConflict">
      <div class="page-heading">
        <div>
          <p class="eyebrow">
            第 {{ state.story.stage }} 关 ·
            {{
              state.story.stage === 1
                ? '选品与供应商'
                : state.story.stage === 2
                  ? '询盘与客户'
                  : state.story.stage === 3
                    ? '报价计算器'
                    : state.story.stage === 4
                      ? '谈判与签约'
                      : state.story.stage === 5
                        ? '签约与备货验货'
                        : state.story.stage === 6
                          ? '物流与出运'
                          : '单据与收汇'
            }}
          </p>
          <h1 ref="heading" tabindex="-1">{{ game.node.title }}</h1>
        </div>
        <div class="actions">
          <RouterLink class="text-link" to="/glossary">随用随查 · 知识图鉴</RouterLink
          ><RouterLink class="text-link" to="/">返回入口</RouterLink>
        </div>
      </div>
      <div class="task-shortcut">
        <span>{{ game.node.title }}</span
        ><button class="primary" @click="goToTask">{{ taskCopy }} ↓</button>
      </div>
      <StoryStage
        :key="state.story.stage"
        :stage="state.story.stage"
        :node-id="game.node.id"
        :actor-id="actor"
        :cue="cue"
        :product-id="game.selectedProduct?.id"
      />
      <div class="desk-feedback" role="status">
        <span class="feedback-label">{{ presentation.desk.feedback }}</span>
        <p>{{ game.deskFeedback?.text ?? presentation.desk.idleFeedback }}</p>
        <button v-if="game.deskFeedback" class="text-link" @click="deskTab = 'history'">
          {{ presentation.desk.details }}
        </button>
      </div>
      <nav class="desk-tabs" aria-label="工作台分区">
        <button
          v-for="tab in ['task', 'reference', 'history'] as const"
          :key="tab"
          :aria-pressed="deskTab === tab"
          @click="deskTab = tab"
        >
          {{ presentation.desk[tab] }}
        </button>
      </nav>
      <DeskPages
        v-show="deskTab === 'task'"
        :reset-key="game.node.id + (game.session.feedback ? '.feedback' : '')"
        :label="presentation.desk.task"
      >
        <p
          v-if="game.session.rescue?.history.length"
          class="guidance-note"
          data-testid="rescue-history"
        >
          纠错记录已保留（{{ game.session.rescue.history.length }}
          次处理）。当前交易尚待选择补救方案；历史费用与随机结果保持原样。
        </p>
        <p v-if="game.selectedProduct" class="selection-line">
          {{ game.selectedProduct.name }}
          <span v-if="game.selectedSupplier"> / {{ game.selectedSupplier.name }}</span>
        </p>
        <p v-if="game.error" class="error-box" role="alert">{{ game.error }}</p>
        <section
          v-if="game.eventContext"
          class="panel event-context"
          data-testid="random-event"
          :data-event-id="game.eventContext.id"
          aria-label="随机事件"
        >
          <div class="section-head">
            <div>
              <p class="eyebrow">经营事件 · {{ game.eventContext.id }}</p>
              <h2>{{ game.eventContext.title }}</h2>
            </div>
            <span class="badge" :class="game.eventContext.forced ? 'missing' : 'pending'">
              {{ game.eventContext.forced ? '必经事件' : '随机触发' }}
            </span>
          </div>
          <p class="muted">先比较现金、时间和责任，再选择处置。林姐会在事后帮你复盘。</p>
          <p v-if="game.eventContext.fxChange" data-testid="event-fx-change">
            当日美元兑人民币变化 {{ game.eventContext.fxChange }}；美元本金保持合同约定。
          </p>
        </section>
        <section
          id="current-task"
          ref="task"
          class="current-task"
          tabindex="-1"
          :aria-label="taskCopy"
        >
          <TaskContext
            v-if="!game.session.feedback && game.node.type !== 'review'"
            :procurement="game.procurement"
            :logistics="game.logistics"
            :collection="game.collection"
          />
          <DiscrepancyList
            v-if="
              game.collection &&
              ['L07.documents.review', 'L07.documents.gate'].includes(game.node.id)
            "
            :model="game.collection"
          />
          <section v-if="game.node.id === 'L06.complete'" class="panel success-panel">
            <h2>约定交付已完成，尾款仍待核验。</h2>
            <p>可进入第 7 关核对单据、办理收汇与退税。</p>
          </section>
          <section v-if="game.node.id === 'L05.complete'" class="panel success-panel">
            <h2>验收入库完成，等待后续履约。</h2>
            <p>原合同交期继续计时，可进入第 6 关物流与出运。</p>
          </section>
          <section v-if="game.node.id === 'L04.complete'" class="panel success-panel">
            <h2>条款已确认，合同已记录。</h2>
            <p data-testid="contract-record">
              签约日：第 {{ state.order.signedDay }} 天；约定交付截止：第
              {{ state.order.deliveryDueDay }} 天。{{ state.order.incoterm }}
              {{ state.order.namedPlace }} / {{ state.order.payment }} /
              {{ state.order.quantity }} 件 / USD {{ state.order.contractUnitUsd }} 每件 / 合同总额
              {{ formatMoney(state.order.invoiceUsdCent!, 'USD') }}。
            </p>
            <p>下一步复用本合同核对 PI 和备货；签约本身不收客户定金、不采购或确认收入。</p>
          </section>
          <template v-if="game.negotiation">
            <RoundProgress :rounds="game.negotiation.rounds" />
            <NegotiationSummary
              :model="game.negotiation"
              :customer="game.selectedCustomer?.name ?? ''"
              :selected-payment="state.order.payment"
              :selected-term="state.order.incoterm"
            />
          </template>
          <InquiryMessage v-if="game.activeMail" :mail="game.activeMail" />
          <section
            v-if="game.reviewedCustomer && game.node.type === 'review'"
            class="panel customer-profile"
            aria-label="客户沟通档案"
          >
            <span class="eyebrow">复盘 · 客户沟通档案</span>
            <h2>{{ game.reviewedCustomer.name }} / {{ game.reviewedCustomer.identity }}</h2>
            <p>{{ game.reviewedCustomer.bargainingStyle }}</p>
            <p class="muted">
              当前信任 {{ state.player.trustByCustomer[game.reviewedCustomer.id] }} /
              100（沟通指标，不代表付款安全）
            </p>
          </section>
          <p
            v-if="state.order.flags.customerIsFraud && state.story.stage === 3"
            class="error-box"
            role="alert"
          >
            报价对象身份未核验，存在异常付款风险。当前仅作报价练习，后续风险标记已保留；没有签约、付款或确认收入。
          </p>
          <section v-if="game.session.feedback" class="panel legacy-feedback" role="status">
            <h2 ref="feedbackHeading" tabindex="-1">{{ presentation.desk.feedback }}</h2>
            <p>{{ game.session.feedback.text }}</p>
            <button class="primary" @click="advance">{{ presentation.desk.continue }} →</button>
          </section>
          <section v-else-if="game.node.type === 'review'" class="panel mentor-review">
            <div>
              <p class="eyebrow">林姐 / 外贸从业 10 年</p>
              <p class="mentor-copy">{{ game.copy(game.node.text) }}</p>
              <button class="primary" @click="advance">
                {{
                  game.eventContext
                    ? '事件记录已保存，返回原业务'
                    : game.node.id === 'L01.finish'
                      ? '进入第 2 关，查看询盘'
                      : game.node.id === 'L02.finish'
                        ? '进入第 3 关，准备报价'
                        : game.node.id === 'L03.success'
                          ? '完成报价，选择下一步'
                          : game.node.id === 'L04.signed.review'
                            ? '查看签约记录'
                            : '继续练习'
                }}
                →
              </button>
            </div>
          </section>
          <template v-else-if="game.node.type === 'choice'">
            <p class="lead small">{{ game.copy(game.node.prompt) }}</p>
            <template v-if="game.collection">
              <DocumentGrid
                v-if="game.node.tags.includes('document_check')"
                :model="game.collection"
                @mark="(fieldId, marked) => game.act({ type: 'markDocument', fieldId, marked })"
                @correct="(fieldId, value) => game.act({ type: 'correctDocument', fieldId, value })"
              />
              <TaxVerification
                v-if="game.node.tags.includes('tax_check')"
                :model="game.collection"
                @assess="(fieldId, answer) => game.act({ type: 'assessTax', fieldId, answer })"
              />
              <p v-if="game.node.id === 'L07.tax.gate'" class="panel" role="status">
                {{
                  game.collection.taxReviewed
                    ? game.collection.taxEligible
                      ? '核验合格：应收退税已确认，现金尚未增加。'
                      : '核验完成：本批资料不足，未确认应收退税。'
                    : '核验判断与资料不符，请返回修正。'
                }}
              </p>
            </template>
            <template v-if="game.logistics">
              <ForwarderCompare
                v-if="game.node.tags.includes('forwarder_compare')"
                :model="game.logistics"
              />
              <DeclarationCheck
                v-if="game.node.tags.includes('declaration_check')"
                :fields="game.logistics.fields"
                @edit="(fieldId, value) => game.act({ type: 'editDeclaration', fieldId, value })"
                @check="
                  (fieldId, checked) => game.act({ type: 'checkDeclaration', fieldId, checked })
                "
              />
              <section
                v-if="game.node.id === 'L06.insurance'"
                class="panel insurance-options"
                aria-label="保险方案比较"
              >
                <article v-for="option in game.logistics.insuranceOptions" :key="option.id">
                  <h2>
                    {{
                      option.id === 'basic'
                        ? '基础保障'
                        : option.id === 'extended'
                          ? '扩展保障'
                          : '买方保险协同'
                    }}
                  </h2>
                  <p>{{ option.copy }}</p>
                  <p>
                    本方保费 {{ option.premium }}
                    <span v-if="option.amount">· 保险金额 {{ option.amount }}</span>
                  </p>
                </article>
              </section>
            </template>
            <template v-if="game.procurement">
              <PIConfirm
                v-if="game.node.tags.includes('pi_confirmation')"
                :fields="game.procurement.piFields"
                :disabled="Boolean(state.order.flags.piAccepted)"
                @confirm="(fieldId, checked) => game.act({ type: 'confirmPi', fieldId, checked })"
              />
              <FundingVerification
                v-if="game.node.tags.includes('funding_check')"
                :model="game.procurement"
                :disabled="Boolean(state.order.flags.fundingVerified)"
                @check="(fieldId, checked) => game.act({ type: 'checkFunding', fieldId, checked })"
              />
              <InspectionChecklist
                v-if="game.node.tags.includes('inspection_check')"
                :items="game.procurement.inspection"
                :revision="game.procurement.inspectionRevision"
                :disabled="game.procurement.closed"
                @view="(itemId) => game.act({ type: 'viewEvidence', itemId })"
                @assess="(itemId, answer) => game.act({ type: 'assessInspection', itemId, answer })"
              />
            </template>
            <template v-if="game.negotiation">
              <PaymentCompare
                v-if="game.negotiation.round === 2"
                :payments="game.negotiation.payments"
              />
              <ContractConfirmation
                v-if="game.node.tags.includes('contract_confirmation')"
                :items="game.negotiation.checklist"
                :checked="game.session.negotiation!.confirmations"
                @confirm="
                  (fieldId, checked) => game.act({ type: 'confirmContract', fieldId, checked })
                "
              />
              <ReplyChoices :choices="game.negotiation.choices" @choose="choose" />
            </template>
            <InquiryInbox
              v-else-if="game.node.id === 'L02.inbox'"
              :mails="game.inbox"
              :ready="game.choices.find((c) => c.id === 'finish_inquiries')?.enabled ?? false"
              @choose="choose"
            />
            <ProductPicker
              v-else-if="game.productRows.length"
              :products="game.productRows"
              @choose="choose"
            />
            <SupplierCompare
              v-else-if="game.supplierRows.length"
              :suppliers="game.supplierRows"
              @choose="choose"
            />
            <div v-else class="panel choice-list">
              <div v-for="choice in game.choices" :key="choice.id">
                <button
                  class="choice-button"
                  :disabled="!choice.enabled"
                  :data-choice-id="choice.id"
                  @click="choose(choice.id)"
                >
                  {{ game.copy(choice.label) }} <span>→</span>
                  <small v-if="!choice.enabled" class="disabled-reason">{{
                    choice.disabledReason
                  }}</small>
                </button>
                <p v-if="choice.detail" class="option-detail">{{ choice.detail }}</p>
              </div>
            </div>
          </template>
          <template v-else-if="game.node.type === 'calc'">
            <p class="selection-line">
              {{ game.selectedCustomer?.name }} · {{ game.selectedCustomer?.identity }} /
              {{ game.quoteContext }}
            </p>
            <p v-if="state.order.flags.inquiryComplete" class="muted">
              报价对象信任 {{ state.player.trustByCustomer[state.order.customerId!] }} /
              100。数量为结合 MOQ 与资金准备的报价方案，仍需客户确认。
            </p>
            <p v-if="game.session.guided" class="guidance-note">
              正在分步纠错。每一步需亲手算出并校核，辅导不会追加信誉处罚；完成后还会复核整份报价。
            </p>
            <CostInput
              :input="game.session.quoteInput"
              :saved-draft="game.parameterDraft"
              :editable="game.canConfigure"
              :eligibility-locked="!!game.selectedSupplier"
              @draft="game.saveParameterDraft"
              @dirty="parametersDirty = $event"
              @configure="game.configure"
            />
            <QuoteWorksheet
              :blocked="parametersDirty"
              :fields="game.activeFields"
              :answers="game.session.answers"
              :errors="game.session.fieldErrors"
              @draft="game.editQuote"
              @submit="game.submitQuote"
            />
          </template>
          <section v-else-if="game.node.type === 'settlement'" class="panel success-panel">
            <span class="eyebrow">本次切片完成</span>
            <CollectionSettlement v-if="game.collection" :model="game.collection" />
            <template v-else-if="state.story.stage === 6">
              <h2>
                {{
                  game.logistics?.held
                    ? '出运已暂停，库存和合同责任保留。'
                    : '约定交付已完成，尾款仍待核验。'
                }}
              </h2>
              <p>本次停在物流阶段，收汇与退税以实际办理记录为准。</p>
            </template>
            <template v-else-if="state.story.stage === 5">
              <h2>
                {{
                  state.order.status === 'ready'
                    ? '验收入库完成，等待后续履约。'
                    : '本次采购已停止，费用与退款已记录。'
                }}
              </h2>
              <p>本次停在第 5 关，未对客交付或确认销售。完整流程已开放到第 7 关。</p>
            </template>
            <template v-else-if="state.story.stage === 4">
              <h2>
                {{
                  state.order.status === 'contracted'
                    ? '条款已确认，合同已记录。'
                    : '本次谈判已停止。'
                }}
              </h2>
              <p v-if="state.order.status === 'contracted'" data-testid="contract-record">
                签约日：第 {{ state.order.signedDay }} 天；约定交付截止：第
                {{ state.order.deliveryDueDay }} 天。{{ state.order.incoterm }}
                {{ state.order.namedPlace }} / {{ state.order.payment }} /
                {{ state.order.quantity }} 件 / USD {{ state.order.contractUnitUsd }} 每件 /
                合同总额 {{ formatMoney(state.order.invoiceUsdCent!, 'USD') }}。
              </p>
              <p>
                本次练习停在谈判与签约；未收客户定金、未采购或发货，也未确认销售收入。完整路线可进入第
                5 关，再进入第 6、7 关。
              </p>
            </template>
            <template v-else
              ><h2>选得有依据，算得清口径。</h2>
              <p>本次独立报价练习完成。第 1→2→3→4→5→6→7 关已连通。</p></template
            >
            <RouterLink class="primary" to="/">回到入口，再练一次 →</RouterLink>
          </section>
        </section>
      </DeskPages>
      <DeskPages
        v-show="deskTab === 'reference'"
        :reset-key="String(state.story.stage)"
        :label="presentation.desk.reference"
      >
        <p class="muted">{{ presentation.experience.archiveNote }}</p>
        <details
          v-if="game.procurement || game.logistics || game.collection"
          class="panel context-archive"
          :open="archiveOpen"
          @toggle="archiveOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>{{ presentation.experience.archive }}</summary>
          <p class="muted">{{ presentation.experience.archiveNote }}</p>
          <ProcurementSummary
            v-if="game.procurement"
            :model="game.procurement"
            :cancelled="state.order.status === 'cancelled'"
          />
          <CutoffTimeline v-if="game.logistics" :model="game.logistics" />
          <ReceivableTimeline v-if="game.collection" :model="game.collection" />
        </details>
        <CashflowPreview v-if="game.cashPreview" :forecast="game.cashPreview" />
        <CashflowPreview
          v-if="game.negotiation && state.order.status !== 'cancelled'"
          :forecast="game.negotiation.projection.forecast"
          :context="
            game.negotiation.projection.term +
            ' / ' +
            game.negotiation.projection.payment +
            ' 条件估算；计划交付与收款日期均尚未实际发生'
          "
        />
        <section v-if="game.quoteSummary && state.story.stage === 3" class="panel quote-result">
          <div class="section-head">
            <h2>已校核报价 · 计算复盘</h2>
            <span class="badge verified">校核通过</span>
          </div>
          <div class="quote-totals">
            <div>
              <small>FOB / USD 每件</small><strong>{{ game.quoteSummary.fobUnitUsdQuoted }}</strong
              ><span>发票金额 {{ game.quoteSummary.fobInvoice }}</span>
            </div>
            <div>
              <small>CIF / USD 每件</small><strong>{{ game.quoteSummary.cifUnitUsdQuoted }}</strong
              ><span>发票金额 {{ game.quoteSummary.cifInvoice }}</span>
            </div>
          </div>
          <p>
            按 CIF 合同金额预计保费：USD
            {{ game.quoteSummary.insuranceTotalUsd }}。尚未生成合同或记账。
          </p>
          <ol class="formula-list">
            <li v-for="step in game.quoteSummary.steps" :key="step.formulaId">
              <strong>{{ headings[step.formulaId] }}</strong
              ><span>{{
                Object.entries(step.inputs)
                  .map(([k, v]) => k + '=' + v)
                  .join(' · ')
              }}</span
              ><code>{{ step.output }}</code>
            </li>
          </ol>
        </section>
      </DeskPages>
      <DeskPages
        v-show="deskTab === 'history'"
        :label="presentation.desk.history"
        :reset-key="String(state.story.decisionLog.length)"
      >
        <details v-if="state.story.decisionLog.length" class="panel decision-log" open>
          <summary>本次决策记录（{{ state.story.decisionLog.length }}）</summary>
          <ol>
            <li v-for="decision in [...state.story.decisionLog].reverse()" :key="decision.id">
              {{ decision.consequenceText }}
            </li>
          </ol>
        </details>
      </DeskPages>
    </div>
  </WorkbenchShell>
</template>
