import type { ContentPack, Condition, Effect } from '../domain/types';
import { quoteScenario } from '../engine/slice/scenario';
import { calculateQuote } from '../engine/economy/quote';
import { teachingText } from './teachingText';
import { validateNegotiationContent, validateNegotiationRule } from './negotiationProfile';
import { validateProcurementContent, validateProcurementRule } from './procurementProfile';
import { validateCollectionContent, validateCollectionRule } from './collectionProfile';
import { validateLogisticsContent, validateLogisticsRule } from './logisticsProfile';
import {
  unsignedDecimalSchema,
  probabilitySchema,
  positiveIntSchema,
} from '../domain/schemas/common';
const fields = new Set([
  'rebateUnitCny',
  'fobCostUnitCny',
  'rateBasis',
  'fobUnitUsd',
  'cifUnitUsd',
]);
/** 七关流程采用显式受限 DSL，不能在数据中悄悄接入尚未实现的功能。 */
export function validateSliceProfile(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
): void {
  if (pack.products.length !== 3 || pack.suppliers.length !== 9)
    issue('/products', '七关流程必须有三产品、九供应商');
  const condition = (value: Condition, path: string): void => {
    if (value.op === 'all') value.conditions.forEach((c) => condition(c, path));
    else if (value.op === 'any') value.conditions.forEach((c) => condition(c, path));
    else if (value.op === 'not') condition(value.condition, path);
    else if (!['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'exists', 'flag'].includes(value.op))
      issue(path, '七关流程包含未实现的条件');
  };
  const effects = (values: Effect[], path: string): void =>
    values.forEach((effect) => {
      if ('value' in effect && effect.value.kind !== 'literal')
        issue(path, '七关流程效果须使用常量');
      if (
        effect.op === 'set' &&
        !['order.productId', 'order.supplierId', 'order.customerId'].includes(effect.target) &&
        !effect.target.startsWith('order.flags.')
      )
        issue(path, '七关流程不支持此写入');
      else if (effect.op === 'adjust' && effect.target !== 'player.reputation')
        issue(path, 'adjust 仅调整信誉，客户信任使用明确的规则');
      else if (effect.op === 'rule') {
        if (validateCollectionRule(effect)) return;
        if (validateLogisticsRule(effect, pack, path, issue)) return;
        if (validateProcurementRule(effect, path, issue)) return;
        if (validateNegotiationRule(effect, pack, path, issue)) return;
        if (['ledger.sampleExpense', 'ledger.preparationExpense'].includes(effect.ruleId)) {
          const parameterId = effect.args.parameterId;
          if (
            parameterId?.kind !== 'literal' ||
            typeof parameterId.value !== 'string' ||
            !pack.parameters[parameterId.value]
          )
            issue(path, '准备费用参数无效');
          return;
        }
        if (effect.ruleId === 'customer.adjustActiveTrust') {
          const delta = effect.args.delta;
          if (
            delta?.kind !== 'literal' ||
            typeof delta.value !== 'number' ||
            !Number.isSafeInteger(delta.value)
          )
            issue(path, '客户信任变化必须是整数常量');
        } else issue(path, '不支持未声明的业务规则');
      } else if (!['set', 'adjust', 'advanceDays'].includes(effect.op))
        issue(path, '七关流程不支持此效果');
    });
  pack.nodes.forEach((node, i) => {
    const path = '/nodes/' + i;
    const copies = [
      node.title,
      ...('text' in node ? [node.text] : []),
      ...(node.type === 'choice'
        ? [node.prompt, ...node.choices.flatMap((c) => [c.label, c.feedback])]
        : []),
    ];
    for (const copy of copies)
      try {
        teachingText(copy, pack);
      } catch {
        issue(path, '文案引用了未声明参数');
      }
    if (
      ![1, 2, 3, 4, 5, 6, 7].includes(node.stage) ||
      !['choice', 'calc', 'review', 'settlement'].includes(node.type)
    )
      issue(path, '本次只实现第 1–7 关');
    const allEffects = [
      ...node.onEnterEffects,
      ...(node.type === 'choice' ? node.choices.flatMap((c) => c.effects) : []),
      ...(node.type === 'calc' ? node.results.flatMap((r) => r.effects) : []),
    ];
    if (
      node.type === 'calc' &&
      (allEffects.length ||
        node.results.some((r) => {
          const next = pack.nodes.find((n) => n.id === r.nextNodeId);
          return next?.stage !== 3 || next.type === 'settlement';
        }))
    )
      issue(path, '内部报价校核只允许学习反馈，不得扣费、改变客户关系、推进业务时间或直接丢单');
    for (const effect of allEffects) {
      if (
        effect.op === 'rule' &&
        validateNegotiationRule(effect, pack, path, issue) &&
        node.stage !== 4
      )
        issue(path, '谈判与签约规则只能出现在第 4 关');
      if (effect.op === 'rule' && validateProcurementRule(effect, path, issue) && node.stage !== 5)
        issue(path, '备货与验货规则只能出现在第 5 关');
      if (
        effect.op === 'rule' &&
        validateLogisticsRule(effect, pack, path, issue) &&
        node.stage !== 6
      )
        issue(path, '物流规则只能出现在第 6 关');
    }
    for (const effect of allEffects)
      if (effect.op === 'rule' && validateCollectionRule(effect) && node.stage !== 7)
        issue(path, '收汇规则只能出现在第 7 关');
    if ([5, 6, 7].includes(node.stage)) {
      const transactions = [
        node.onEnterEffects,
        ...(node.type === 'choice' ? node.choices.map((c) => c.effects) : []),
      ];
      for (const transaction of transactions) {
        if (
          transaction.filter((e) => e.op === 'rule').length > 1 ||
          transaction.some(
            (e) =>
              e.op !== 'rule' ||
              !e.ruleId.startsWith(
                node.stage === 5 ? 'procurement.' : node.stage === 6 ? 'logistics.' : 'collection.',
              ),
          )
        )
          issue(path, '每个备货/物流/收汇事务只执行一项业务事实，禁止混入其他效果');
      }
    }
    condition(node.entryWhen, path);
    effects(node.onEnterEffects, path);
    if (node.type === 'choice')
      node.choices.forEach((c) => {
        condition(c.when, path);
        effects(c.effects, path);
      });
    if (node.type === 'calc')
      node.results.forEach((r) => {
        condition(r.when, path);
        effects(r.effects, path);
      });
  });
  validateNegotiationContent(pack, issue);
  validateProcurementContent(pack, issue);
  validateLogisticsContent(pack, issue);
  validateCollectionContent(pack, issue);
  pack.puzzles.forEach((p, i) => {
    if (p.kind === 'document') return;
    if (p.kind !== 'quote' || p.inputFields.some((field) => !fields.has(field)))
      issue('/puzzles/' + i, '七关流程只支持已声明报价字段');
  });
  const personas = new Set(pack.customers.map((c) => c.persona));
  if (pack.customers.length !== 5 || personas.size !== 5)
    issue('/customers', '第 2 关须覆盖五类客户且每类一人');
  if (
    !pack.customers.some(
      (c) => c.id === pack.parameters.firstBuyerId?.value && c.persona === 'novice',
    )
  )
    issue('/parameters/firstBuyerId', '首次买家必须引用新手型客户');
  if (pack.inquiries.length !== 6)
    issue('/inquiries', '需要四位实际买家、一个同行和一个异常询盘模板');
  for (const customer of pack.customers) {
    const mails = pack.inquiries.filter((i) => i.customerId === customer.id);
    if (
      mails.length !== 1 ||
      mails[0]?.senderRole !== (customer.persona === 'fraud' ? 'fraud' : 'buyer')
    )
      issue('/inquiries', '客户类型与询盘身份必须一一对应');
  }
  if (pack.inquiries.filter((i) => i.senderRole === 'competitor').length !== 1)
    issue('/inquiries', '须有一封独立的同行询盘');
  for (const inquiry of pack.inquiries) {
    const node = pack.nodes.find((n) => n.id === inquiry.replyNodeId);
    if (
      node?.type !== 'choice' ||
      node.stage !== 2 ||
      !node.tags.includes('inquiry_' + inquiry.senderRole)
    )
      issue('/inquiries', '询盘必须连接相应类型的第 2 关判断节点');
  }
  try {
    if (!pack.customers.some((c) => c.id === 'customer_c'))
      issue('/customers', '切片首次练习需要客户 C');
    for (const key of ['initialCash', 'sampleFee', 'bankFee'])
      unsignedDecimalSchema.parse(pack.parameters[key]!.value);
    for (const key of ['deposit', 'customerDeposit'])
      probabilitySchema.parse(pack.parameters[key]!.value);
    for (const key of ['previewBalanceDay', 'previewCollectionDay', 'previewRebateDay'])
      positiveIntSchema.parse(pack.parameters[key]!.value);
    for (const id of [null, ...pack.suppliers.map((s) => s.id)]) {
      for (const variant of [0, 1, 2, 3]) {
        const input = quoteScenario(pack, id, variant);
        if (!calculateQuote(input).ok) issue('/parameters', '报价参数不能计算');
        if (id && input.quantity < pack.suppliers.find((s) => s.id === id)!.moq)
          issue('/parameters', '数量低于 MOQ');
      }
    }
  } catch {
    issue('/parameters', '缺失或无效的报价教学参数');
  }
}
