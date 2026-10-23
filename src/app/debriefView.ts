import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import { scoreEvidence, type EvidenceDimension } from '../engine/debrief/evidence';
import { debriefScoring } from '../engine/debrief/runtime';
import { accountBalance } from '../engine/economy/ledger';
import { teachingText } from '../content/teachingText';
import { D } from '../engine/economy/decimal';
const money = (fen: number) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(fen / 100);
export const scoreAxes = [
  { id: 'profit', label: '利润' },
  { id: 'risk', label: '风控' },
  { id: 'professionalism', label: '专业度' },
  { id: 'relationship', label: '客户关系' },
  { id: 'compliance', label: '合规' },
] as const;
export function buildEndingView(session: SliceSession, pack: ContentPack) {
  const frozen = session.ending,
    config = pack.debrief;
  if (!frozen || !config) return null;
  const result = frozen.result,
    s = session.snapshot;
  const axes = scoreAxes.map((axis) => ({
    ...axis,
    score: result.scores[axis.id],
    evidence:
      axis.id === 'profit'
        ? null
        : scoreEvidence(s, debriefScoring(pack), axis.id as EvidenceDimension),
  }));
  const customer = pack.customers.find((c) => c.id === s.order.customerId);
  const realTrust =
    s.order.flags.customerIsFraud || !s.order.customerId
      ? 0
      : (s.player.trustByCustomer[s.order.customerId] ?? 0);
  const replay = result.replayDecisionIds.map((id) => {
    const d = s.story.decisionLog.find((d) => d.id === id)!;
    const node = pack.nodes.find((n) => n.id === d.nodeId)!;
    const review = pack.nodes.find((n) => n.id === d.counterfactualReviewId);
    const guide = config.replayGuides.find((g) => g.nodeIds.includes(d.nodeId));
    return {
      ...d,
      title: node.title,
      choice:
        node.type === 'choice'
          ? (node.choices.find((c) => c.id === d.choiceId)?.label ?? d.choiceId)
          : d.choiceId === 'quote.correct'
            ? '提交报价校核：正确'
            : '提交报价校核：需纠错',
      mentor: review?.type === 'review' ? teachingText(review.text, pack) : '',
      alternative:
        guide?.alternative ?? '下次仍以本单源记录核验后再确认，不把未发生的收益当成确定结果。',
      beforeText: d.before
        ? `现金 ${money(d.before.cashCnyFen)} → ${money(d.before.cashCnyFen + d.deltas.cashCnyFen)}；已确认利润 ${money(d.before.profitCnyFen)} → ${money(d.before.profitCnyFen + d.deltas.profitCnyFen)}；信誉 ${d.before.reputation} → ${d.before.reputation + d.deltas.reputation}；客户信任 ${d.before.trust} → ${d.before.trust + d.deltas.trust}；第 ${d.before.day} → ${d.before.day + d.deltas.days} 天。`
        : '',
    };
  });
  return {
    result,
    axes,
    replay,
    title: pack.endings.find((e) => e.kind === result.kind)!.title,
    text: pack.endings.find((e) => e.kind === result.kind)!.text,
    subtitle:
      result.kind === 'breakeven' && result.profitCnyFen > 0 ? '小赚但信用不足' : result.subtitle,
    average: new D(Object.values(result.scores).reduce((a, b) => a + b, 0)).div(5).toFixed(1),
    costBasis: money(Math.max(0, accountBalance(s.journal, 'expense'))),
    targetReturn: new D(config.scoring.targetReturnOnCost.value).mul(100).toString() + '%',
    minimumBasis: money(config.scoring.minimumScoreBasisCnyFen.value),
    trust: realTrust,
    reputation: frozen.reputation,
    day: frozen.gameDay,
    customer: customer?.name ?? '未选定真实客户',
    repeatText: result.repeatIntent.unlocked
      ? s.order.flags.customerIsPotential
        ? config.repeatCopy.brand
        : config.repeatCopy.unlocked
      : config.repeatCopy.locked,
    potentialText:
      result.repeatIntent.unlocked && !s.order.flags.customerIsPotential
        ? config.repeatCopy.potential
        : '',
    mentor: config.mentorReview,
    unsettled: result.unsettledItems.map((id) => ({
      id,
      amount: money(accountBalance(s.journal, id as Parameters<typeof accountBalance>[1])),
    })),
  };
}
export function buildKnowledgeView(session: SliceSession | null, pack: ContentPack) {
  const s = session?.snapshot,
    q = session?.quoteInput;
  const supplier = pack.suppliers.find((x) => x.id === s?.order.supplierId);
  const values: Record<string, string> = {
    quantity: String(s?.order.quantity || q?.quantity || '尚未确定'),
    moq: String(supplier?.moq ?? '尚未选择'),
    supplier: supplier?.name ?? '尚未选择',
    product: pack.products.find((x) => x.id === s?.order.productId)?.name ?? '尚未选择',
    price: q?.taxInclusiveUnitCny ?? '—',
    vat: q ? new D(q.vatRate).mul(100).toString() : '—',
    rebate: q ? new D(q.rebateRate).mul(100).toString() : '—',
    markup: q ? new D(q.costMarkupRate).mul(100).toString() : '—',
    fx: q?.fxCnyPerUsd ?? '—',
    term: s?.order.incoterm ?? '尚未选定',
    place: s?.order.namedPlace ?? '尚未确认',
    payment: s?.order.payment ?? '尚未选定',
    invoice:
      s?.order.invoiceUsdCent != null
        ? new D(s.order.invoiceUsdCent).div(100).toFixed(2)
        : '尚未签约',
    freight: q?.oceanTotalUsd ?? '—',
    day: String(s?.gameDay ?? 0),
    coverage: q?.insuranceCoverageFactor ?? '—',
    insuranceRate: q ? new D(q.insuranceRate).mul(100).toString() : '—',
  };
  return pack.glossary.map((term) => {
    const quiz = pack.debrief!.quizzes.find((x) => x.termId === term.id)!;
    const answer = session?.learning.answers[term.id];
    return {
      ...term,
      status: s?.player.masteredTermIds.includes(term.id)
        ? '掌握'
        : s?.player.learnedTermIds.includes(term.id)
          ? '接触'
          : '未解锁',
      example: term.exampleTemplate.replace(
        /\{\{([^{}]+)\}\}/g,
        (_, key: string) => values[key] ?? '—',
      ),
      prerequisites: term.prerequisiteIds.map((id) => ({
        id,
        title: pack.glossary.find((t) => t.id === id)!.title,
      })),
      quiz: { question: quiz.question, options: quiz.options },
      answer,
      feedback: answer
        ? (answer === quiz.answerId ? '回答正确，已掌握。' : '再想一步。') + quiz.explanation
        : '',
    };
  });
}
export type EndingViewModel = NonNullable<ReturnType<typeof buildEndingView>>;
export type KnowledgeCard = ReturnType<typeof buildKnowledgeView>[number];
