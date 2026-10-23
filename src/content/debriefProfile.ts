import type { ContentPack } from '../domain/types';
const exampleKeys = new Set([
  'quantity',
  'moq',
  'supplier',
  'product',
  'price',
  'vat',
  'rebate',
  'markup',
  'fx',
  'term',
  'place',
  'payment',
  'invoice',
  'freight',
  'day',
  'coverage',
  'insuranceRate',
]);
const quoteResults = new Set([
  'quote.correct',
  'quote.REBATE_OMITTED',
  'quote.MARGIN_AS_MARKUP',
  'quote.DOMESTIC_DUPLICATED',
  'quote.OTHER_QUOTE_ERROR',
]);
export function validateDebriefProfile(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
) {
  const config = pack.debrief;
  if (!config) return;
  const problem = (message: string) => issue('/debrief', message);
  if (Number(config.scoring.targetReturnOnCost.value) <= 0) problem('目标收益率必须为正');
  if (pack.collection && config.scoring.excellentReputation !== pack.collection.excellentReputation)
    problem('结局信誉门槛必须一致');
  if (pack.glossary.length !== 24 || config.quizzes.length !== 24)
    problem('结局图鉴需要 24 个词条和 24 道复习题');
  if (new Set(pack.endings.map((e) => e.kind)).size !== 4 || pack.endings.length !== 4)
    problem('需要四种唯一结局');
  for (const id of config.terminalNodeIds)
    if (pack.nodes.find((n) => n.id === id)?.type !== 'settlement')
      problem('正式终止节点必须为结算节点：' + id);
  const bound = new Set<string>();
  for (const binding of config.assessments) {
    const rubric = pack.rubrics.find((r) => r.id === binding.rubricId);
    if (!rubric || bound.has(binding.rubricId)) problem('评分绑定缺失或重复：' + binding.rubricId);
    bound.add(binding.rubricId);
    if (
      rubric &&
      (binding.nodeIds.some((id) => !rubric.evidenceNodeIds.includes(id)) ||
        rubric.evidenceNodeIds.some((id) => !binding.nodeIds.includes(id)))
    )
      problem('评分证据节点与绑定不一致');
    const allowed = new Set(
      binding.nodeIds.flatMap((id) => {
        const n = pack.nodes.find((n) => n.id === id);
        if (!n) problem('评分节点不存在：' + id);
        return n?.type === 'choice'
          ? n.choices.map((c) => c.id)
          : n?.type === 'calc'
            ? [...quoteResults]
            : [];
      }),
    );
    if (
      binding.choiceIds.some((id) => !allowed.has(id)) ||
      binding.correctChoiceIds.some((id) => !binding.choiceIds.includes(id))
    )
      problem('评分选项引用不存在');
    if (
      binding.successFlag &&
      !pack.flags.some((f) => f.id === binding.successFlag && f.valueType === 'boolean')
    )
      problem('评分结果需要已声明的布尔标记');
  }
  if (pack.rubrics.some((r) => !bound.has(r.id))) problem('存在未绑定的评分规则');
  const replayNodes = new Set<string>();
  for (const guide of config.replayGuides) {
    const choices = new Set<string>();
    for (const id of guide.nodeIds) {
      const n = pack.nodes.find((n) => n.id === id);
      if (!n || replayNodes.has(id)) problem('回放节点不存在或重复：' + id);
      replayNodes.add(id);
      if (n?.type === 'choice') n.choices.forEach((c) => choices.add(c.id));
    }
    if (guide.riskChoiceIds.some((id) => !choices.has(id))) problem('回放风险选项不存在');
  }
  const quizzes = new Set<string>();
  for (const quiz of config.quizzes) {
    if (!pack.glossary.some((t) => t.id === quiz.termId) || quizzes.has(quiz.termId))
      problem('复习题词条缺失或重复');
    quizzes.add(quiz.termId);
    if (
      new Set(quiz.options.map((o) => o.id)).size !== quiz.options.length ||
      !quiz.options.some((o) => o.id === quiz.answerId)
    )
      problem('复习题答案缺失或选项重复');
  }
  for (const term of pack.glossary) {
    if (!quizzes.has(term.id)) problem('词条缺少复习题');
    for (const match of term.exampleTemplate.matchAll(/\{\{([^{}]+)\}\}/g))
      if (!exampleKeys.has(match[1]!)) problem('未知本局示例参数：' + match[1]);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) {
      problem('知识前置关系不能成环');
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const parent of pack.glossary.find((t) => t.id === id)?.prerequisiteIds ?? [])
      visit(parent);
    active.delete(id);
    visited.add(id);
  };
  pack.glossary.forEach((t) => visit(t.id));
}
