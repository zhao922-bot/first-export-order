import { z } from 'zod';
import Decimal from 'decimal.js';
import { contentPackSchema } from '../domain/schemas/content';
import { validateSliceProfile } from './sliceProfile';
import { validateDebriefProfile } from './debriefProfile';
import { teachingText } from './teachingText';
import {
  stateReferencePaths,
  setTargets,
  resultReferencePaths,
  ruleDefinitions,
  evaluatorIds,
} from '../domain/registries';

export type ContentPack = z.infer<typeof contentPackSchema>;
export interface ContentIssue {
  source: string;
  pointer: string;
  message: string;
}
export type ValidationResult =
  { ok: true; data: ContentPack } | { ok: false; issues: ContentIssue[] };
type Node = ContentPack['nodes'][number];
type Condition = Node['entryWhen'];
type Effect = Node['onEnterEffects'][number];
type Value = Extract<Effect, { op: 'set' }>['value'];

function pointer(parts: PropertyKey[]): string {
  return (
    '/' + parts.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
  );
}

/** 与构建共用；仅验证数据，不运行节点、效果、随机数或报价。 */
export function validateContent(value: unknown, source = '<content>'): ValidationResult {
  const issues: ContentIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ source, pointer: path, message });
  };
  const preflight = (item: unknown, path: string, depth: number): void => {
    if (depth > 48) {
      issue(path, 'JSON 嵌套超过安全上限');
      return;
    }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        const childPath = `${path}/${key}`;
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          issue(childPath, '禁止使用原型链键');
        else preflight(child, childPath, depth + 1);
      }
    }
  };
  preflight(value, '', 0);
  if (issues.length) return { ok: false, issues };
  const parsed = contentPackSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((item) => ({
        source,
        pointer: pointer(item.path),
        message: item.message,
      })),
    };
  const data = parsed.data;
  const indexed = <T extends { id: string }>(items: T[], name: string): Map<string, T> => {
    const result = new Map<string, T>();
    items.forEach((item, index) => {
      if (result.has(item.id)) issue(`/${name}/${index}/id`, `重复 id：${item.id}`);
      result.set(item.id, item);
    });
    return result;
  };
  const nodes = indexed(data.nodes, 'nodes');
  data.rescue?.riskChoices.forEach((reference, index) => {
    const node = nodes.get(reference.nodeId);
    const choice =
      node?.type === 'choice' ? node.choices.find((c) => c.id === reference.choiceId) : null;
    if (!choice?.effects.some((e) => e.op === 'rule' && e.ruleId === 'collection.riskyRelease'))
      issue(`/rescue/riskChoices/${index}`, '救援放单触发项必须引用实际的未核验放单规则');
  });
  const products = indexed(data.products, 'products');
  const suppliers = indexed(data.suppliers, 'suppliers');
  const customers = indexed(data.customers, 'customers');
  const glossary = indexed(data.glossary, 'glossary');
  const events = indexed(data.events, 'events');
  const puzzles = indexed(data.puzzles, 'puzzles');
  const templates = indexed(data.documentTemplates, 'documentTemplates');
  const flags = indexed(data.flags, 'flags');
  const rubrics = indexed(data.rubrics, 'rubrics');
  indexed(data.endings, 'endings');
  indexed(data.inquiries, 'inquiries');
  indexed(data.forwarders, 'forwarders');
  const speakers = new Set(customers.keys());
  if (data.mentor) {
    if (speakers.has(data.mentor.id)) issue('/mentor/id', '导师与客户 id 冲突');
    speakers.add(data.mentor.id);
  }
  const has = (
    collection: { has(id: string): boolean },
    id: string,
    path: string,
    name: string,
  ) => {
    if (!collection.has(id)) issue(path, `未找到${name}：${id}`);
  };
  const parameters = new Set(Object.keys(data.parameters));
  const ports = new Set(data.ports);
  const profiles = new Set(data.complianceProfileIds);
  const refIds = (
    ids: string[],
    collection: { has(id: string): boolean },
    path: string,
    name: string,
  ) => ids.forEach((id, index) => has(collection, id, `${path}/${index}`, name));
  const checkEntityLiteral = (target: string, value: Value, path: string): void => {
    if (value.kind !== 'literal') return;
    const sets = {
      'order.customerId': customers,
      'order.productId': products,
      'order.supplierId': suppliers,
    };
    if (target in sets) {
      const collection = sets[target as keyof typeof sets];
      if (typeof value.value !== 'string') issue(path, '实体引用必须是 id 字符串');
      else has(collection, value.value, path, target);
    }
    if (target === 'order.payment' && !['TT', 'LC_SIGHT', 'OA_60'].includes(String(value.value)))
      issue(path, '未知付款方式');
    if (target === 'order.incoterm' && !['EXW', 'FOB', 'CIF'].includes(String(value.value)))
      issue(path, '未知贸易术语');
  };
  const checkValue = (value: Value, path: string, node: Node): void => {
    if (value.kind === 'ref') {
      if (value.scope === 'config') {
        has(parameters, value.path.replace(/\.value$/, ''), `${path}/path`, '配置参数');
      } else if (value.scope === 'state') {
        if (value.path.startsWith('player.trustByCustomer.'))
          has(
            customers,
            value.path.slice('player.trustByCustomer.'.length),
            `${path}/path`,
            '客户',
          );
        else if (value.path.startsWith('order.flags.'))
          has(flags, value.path.slice('order.flags.'.length), `${path}/path`, 'flag');
        else if (!stateReferencePaths.has(value.path))
          issue(`${path}/path`, '未登记的状态读取路径');
      } else if (value.scope === 'input') {
        const puzzle = 'puzzleId' in node ? puzzles.get(node.puzzleId) : undefined;
        if (!puzzle || puzzle.kind !== 'quote' || !puzzle.inputFields.includes(value.path))
          issue(`${path}/path`, '该节点未声明此输入字段');
      } else if (
        !resultReferencePaths.has(value.path) ||
        !('results' in node) ||
        (node.type === 'calc'
          ? !value.path.startsWith('quote.')
          : !value.path.startsWith('puzzle.'))
      ) {
        issue(`${path}/path`, '该节点未声明此评估结果');
      }
    } else if (value.kind === 'randomDecimal') {
      const min = new Decimal(value.min);
      const max = new Decimal(value.max);
      const step = new Decimal(value.step);
      if (step.lte(0) || min.gt(max) || (step.gt(0) && !max.minus(min).div(step).isInteger()))
        issue(path, '随机小数区间必须递增、步长为正且端点对齐');
    }
  };
  const checkCondition = (condition: Condition, path: string, node: Node, depth = 1): void => {
    if (depth > 8) {
      issue(path, '条件嵌套超过 8 层');
      return;
    }
    if (condition.op === 'all' || condition.op === 'any')
      condition.conditions.forEach((child, index) =>
        checkCondition(child, `${path}/conditions/${index}`, node, depth + 1),
      );
    else if (condition.op === 'not')
      checkCondition(condition.condition, `${path}/condition`, node, depth + 1);
    else if (condition.op === 'exists') checkValue(condition.value, `${path}/value`, node);
    else if (condition.op === 'flag') {
      if (!condition.path.startsWith('order.flags.'))
        issue(`${path}/path`, 'flag 条件只能读取订单标记');
      else {
        const id = condition.path.slice('order.flags.'.length);
        const flag = flags.get(id);
        if (!flag) issue(`${path}/path`, `未登记的 flag：${id}`);
        else if (typeof condition.equals !== flag.valueType)
          issue(`${path}/equals`, 'flag 条件类型不匹配');
      }
    } else if (condition.op === 'in') {
      checkValue(condition.left, `${path}/left`, node);
      condition.right.forEach((value, index) => checkValue(value, `${path}/right/${index}`, node));
      const entity = condition.left;
      if (entity.kind === 'ref' && entity.scope === 'state')
        condition.right.forEach((value, index) =>
          checkEntityLiteral(entity.path, value, `${path}/right/${index}/value`),
        );
    } else if (
      condition.op === 'eq' ||
      condition.op === 'ne' ||
      condition.op === 'gt' ||
      condition.op === 'gte' ||
      condition.op === 'lt' ||
      condition.op === 'lte'
    ) {
      checkValue(condition.left, `${path}/left`, node);
      checkValue(condition.right, `${path}/right`, node);
      if (condition.left.kind === 'ref' && condition.left.scope === 'state')
        checkEntityLiteral(condition.left.path, condition.right, `${path}/right/value`);
      if (condition.right.kind === 'ref' && condition.right.scope === 'state')
        checkEntityLiteral(condition.right.path, condition.left, `${path}/left/value`);
    }
  };
  const checkEffects = (effects: Effect[], path: string, node: Node, depth = 1): number => {
    if (depth > 8) {
      issue(path, '效果嵌套超过 8 层');
      return 0;
    }
    let count = effects.length;
    effects.forEach((effect, index) => {
      const at = `${path}/${index}`;
      if ('value' in effect) checkValue(effect.value, `${at}/value`, node);
      if (effect.op === 'adjust') {
        if (
          effect.target !== 'player.reputation' &&
          !effect.target.startsWith('player.trustByCustomer.')
        )
          issue(`${at}/target`, 'adjust 只能修改信誉或客户信任');
        if (effect.target.startsWith('player.trustByCustomer.'))
          has(
            customers,
            effect.target.slice('player.trustByCustomer.'.length),
            `${at}/target`,
            '客户',
          );
        if (
          effect.value.kind === 'literal' &&
          (typeof effect.value.value !== 'number' || !Number.isInteger(effect.value.value))
        )
          issue(`${at}/value`, '信誉和信任变化必须为整数');
        if (effect.clamp && (effect.clamp.min < 0 || effect.clamp.max > 100))
          issue(`${at}/clamp`, '不能放宽 0–100 的边界');
      } else if (effect.op === 'set') {
        if (effect.target.startsWith('order.flags.')) {
          const flag = flags.get(effect.target.slice('order.flags.'.length));
          if (!flag) issue(`${at}/target`, '未登记的 flag');
          else if (effect.value.kind === 'literal' && typeof effect.value.value !== flag.valueType)
            issue(`${at}/value`, 'flag 类型不匹配');
        } else if (!setTargets.has(effect.target)) issue(`${at}/target`, '禁止写入该状态字段');
        checkEntityLiteral(effect.target, effect.value, `${at}/value/value`);
      } else if (effect.op === 'advanceDays') {
        if (
          effect.value.kind === 'literal' &&
          (typeof effect.value.value !== 'number' ||
            !Number.isInteger(effect.value.value) ||
            effect.value.value < 0)
        )
          issue(`${at}/value`, '推进天数必须是非负整数');
      } else if (effect.op === 'rule') {
        const args = ruleDefinitions[effect.ruleId];
        if (!args) issue(`${at}/ruleId`, `未知规则：${effect.ruleId}`);
        else if (
          Object.keys(effect.args).length !== args.length ||
          args.some((arg) => !(arg in effect.args))
        )
          issue(`${at}/args`, '规则参数名或数量不匹配');
        Object.entries(effect.args).forEach(([key, value]) =>
          checkValue(value, `${at}/args/${key}`, node),
        );
      } else if (effect.op === 'unlockTerm') has(glossary, effect.termId, `${at}/termId`, '词条');
      else if (effect.op === 'recordEvidence')
        has(rubrics, effect.rubricId, `${at}/rubricId`, '评分规则');
      else if (effect.op === 'if') {
        checkCondition(effect.when, `${at}/when`, node);
        count +=
          checkEffects(effect.then, `${at}/then`, node, depth + 1) +
          checkEffects(effect.else, `${at}/else`, node, depth + 1);
      }
    });
    if (count > 64) issue(path, '展开效果超过 64 个');
    return count;
  };
  const edges = new Map<string, string[]>();
  data.nodes.forEach((node, index) => {
    const path = `/nodes/${index}`;
    const next: string[] = [];
    const edge = (id: string, at: string) => {
      has(nodes, id, at, '节点');
      next.push(id);
    };
    checkCondition(node.entryWhen, `${path}/entryWhen`, node);
    checkEffects(node.onEnterEffects, `${path}/onEnterEffects`, node);
    if ('speakerId' in node) has(speakers, node.speakerId, `${path}/speakerId`, '客户或导师');
    if ('nextNodeId' in node) edge(node.nextNodeId, `${path}/nextNodeId`);
    if (node.type === 'review' && [...node.text].length > 120)
      issue(`${path}/text`, '导师复盘不得超过 120 个字符');
    if (node.type === 'choice') {
      const choiceIds = new Set<string>();
      node.choices.forEach((choice, choiceIndex) => {
        const at = `${path}/choices/${choiceIndex}`;
        if (choiceIds.has(choice.id)) issue(`${at}/id`, '同节点选项 id 重复');
        choiceIds.add(choice.id);
        checkCondition(choice.when, `${at}/when`, node);
        checkEffects(choice.effects, `${at}/effects`, node);
        edge(choice.nextNodeId, `${at}/nextNodeId`);
      });
    }
    if ('puzzleId' in node) {
      has(puzzles, node.puzzleId, `${path}/puzzleId`, '小游戏');
      if (!evaluatorIds.has(node.evaluatorId)) issue(`${path}/evaluatorId`, '未知评估器');
      const puzzle = puzzles.get(node.puzzleId);
      if (
        puzzle &&
        (puzzle.evaluatorId !== node.evaluatorId ||
          (node.type === 'calc'
            ? puzzle.kind !== 'quote'
            : node.type === 'inspection'
              ? puzzle.kind !== 'inspection'
              : !['document', 'declaration'].includes(puzzle.kind)))
      )
        issue(`${path}/puzzleId`, '节点与小游戏类型/评估器不匹配');
    }
    if ('results' in node) {
      node.results.forEach((result, resultIndex) => {
        const at = `${path}/results/${resultIndex}`;
        checkCondition(result.when, `${at}/when`, node);
        checkEffects(result.effects, `${at}/effects`, node);
        edge(result.nextNodeId, `${at}/nextNodeId`);
      });
      const last = node.results.at(-1);
      if (!last || last.when.op !== 'all' || last.when.conditions.length !== 0)
        issue(`${path}/results`, '最后一个结果分支必须为空 all 恒真兜底');
    }
    edges.set(node.id, next);
  });
  refIds(data.entryNodeIds, nodes, '/entryNodeIds', '入口节点');
  data.products.forEach((product, i) => {
    refIds(product.supplierIds, suppliers, `/products/${i}/supplierIds`, '供应商');
    if (new Set(product.supplierIds).size !== 3)
      issue(`/products/${i}/supplierIds`, '必须引用三家不同供应商');
    [product.vatRateParam, product.rebateRateParam].forEach((id) =>
      has(parameters, id, `/products/${i}`, '税率参数'),
    );
    refIds(
      product.complianceProfileIds,
      profiles,
      `/products/${i}/complianceProfileIds`,
      '合规资料',
    );
    product.supplierIds.forEach((id) => {
      if (suppliers.has(id) && suppliers.get(id)?.productId !== product.id)
        issue(`/products/${i}/supplierIds`, '供应商所属产品不匹配');
    });
  });
  data.suppliers.forEach((supplier, i) => {
    has(products, supplier.productId, `/suppliers/${i}/productId`, '产品');
    has(
      parameters,
      supplier.taxInclusiveUnitPriceParam,
      `/suppliers/${i}/taxInclusiveUnitPriceParam`,
      '价格参数',
    );
    has(parameters, supplier.depositRatioParam, `/suppliers/${i}/depositRatioParam`, '定金参数');
    refIds(supplier.riskEventIds, events, `/suppliers/${i}/riskEventIds`, '事件');
  });
  data.customers.forEach((customer, i) => {
    refIds(customer.exclusiveEventIds, events, `/customers/${i}/exclusiveEventIds`, '事件');
    refIds(customer.allowedPorts, ports, `/customers/${i}/allowedPorts`, '港口');
  });
  if (data.mentor)
    refIds(data.mentor.exclusiveEventIds, events, '/mentor/exclusiveEventIds', '事件');
  data.inquiries.forEach((inquiry, i) => {
    if (inquiry.customerId)
      has(customers, inquiry.customerId, `/inquiries/${i}/customerId`, '客户');
    has(nodes, inquiry.replyNodeId, `/inquiries/${i}/replyNodeId`, '节点');
  });
  data.forwarders.forEach((forwarder, i) => {
    has(parameters, forwarder.priceParam, `/forwarders/${i}/priceParam`, '报价参数');
    has(ports, forwarder.portId, `/forwarders/${i}/portId`, '港口');
  });
  data.glossary.forEach((term, i) => {
    refIds(term.prerequisiteIds, glossary, `/glossary/${i}/prerequisiteIds`, '词条');
    refIds(term.triggerNodeIds, nodes, `/glossary/${i}/triggerNodeIds`, '节点');
  });
  data.rubrics.forEach((rubric, i) =>
    refIds(rubric.evidenceNodeIds, nodes, `/rubrics/${i}/evidenceNodeIds`, '节点'),
  );
  data.puzzles.forEach((puzzle, i) => {
    if (puzzle.kind === 'quote')
      refIds(puzzle.parameterIds, parameters, `/puzzles/${i}/parameterIds`, '参数');
    if (puzzle.kind === 'document') {
      refIds(puzzle.puzzle.templateIds, templates, `/puzzles/${i}/puzzle/templateIds`, '单据模板');
      indexed(puzzle.puzzle.faults, `puzzles/${i}/puzzle/faults`);
      puzzle.puzzle.faults.forEach((fault, j) => {
        has(templates, fault.documentId, `/puzzles/${i}/puzzle/faults/${j}/documentId`, '单据模板');
        refIds(fault.termIds, glossary, `/puzzles/${i}/puzzle/faults/${j}/termIds`, '词条');
      });
    }
  });
  const eventRoots: string[] = [];
  const reviews = new Map((data.eventReviews ?? []).map((review) => [review.eventId, review]));
  const economies = new Map((data.eventEconomy ?? []).map((economy) => [economy.eventId, economy]));
  data.events.forEach((event, i) => {
    const choice = nodes.get(event.choiceNodeId);
    const review = nodes.get(event.reviewNodeId);
    has(nodes, event.choiceNodeId, `/events/${i}/choiceNodeId`, '节点');
    has(nodes, event.reviewNodeId, `/events/${i}/reviewNodeId`, '节点');
    if (choice?.type !== 'choice' || choice.choices.length < 2)
      issue(`/events/${i}/choiceNodeId`, '事件必须引用至少两个选项的 choice 节点');
    if (review?.type !== 'review') issue(`/events/${i}/reviewNodeId`, '事件必须引用 review 节点');
    if (!data.eventScheduling?.windows.some((window) => window.eventIds.includes(event.id)))
      issue('/events/' + i, '事件没有可触达窗口');
    if (
      choice?.type === 'choice' &&
      choice.choices.some((c) => c.nextNodeId !== event.reviewNodeId)
    )
      issue('/events/' + i, '事件每个选项必须经过林姐复盘');
    if (choice) checkCondition(event.when, `/events/${i}/when`, choice);
    if (event.forceWhen && choice)
      checkCondition(event.forceWhen, `/events/${i}/forceWhen`, choice);
    if (!reviews.has(event.id)) issue(`/events/${i}/id`, '事件缺少林姐复盘');
    else {
      const reviewCopy = reviews.get(event.id)!;
      if ([...reviewCopy.mentorReview].length > 120)
        issue(`/eventReviews/${i}/mentorReview`, '林姐事件复盘不得超过 120 个字符');
      if (!reviewCopy.mentorReview.startsWith('林姐：'))
        issue(`/eventReviews/${i}/mentorReview`, '林姐事件复盘须以“林姐：”开头');
    }
    const economy = economies.get(event.id);
    if (!economy) issue(`/events/${i}/id`, '事件缺少实际后果配置');
    else {
      if (new Set(economy.options.map((option) => option.choiceId)).size !== economy.options.length)
        issue(`/eventEconomy/${i}/options`, '事件选项后果重复');
      if (choice?.type === 'choice') {
        if (choice.choices.length < event.minChoices)
          issue(`/events/${i}/minChoices`, '事件选项少于声明下限');
        const ids = new Set(choice.choices.map((candidate) => candidate.id));
        economy.options.forEach((option) => {
          if (option.extraDays > event.maxExtraDays)
            issue(`/eventEconomy/${i}/options`, '事件处置天数超过上限');
        });
        economy.options.forEach((option) => {
          if (!ids.has(option.choiceId))
            issue(`/eventEconomy/${i}/options`, `未知事件选项：${option.choiceId}`);
          if (
            !option.amountCnyParam &&
            option.extraDays === 0 &&
            option.trustDelta === 0 &&
            option.reputationDelta === 0 &&
            !option.riskFlag &&
            option.operation === 'standard' &&
            !event.useNodeEffects
          )
            issue(`/eventEconomy/${i}/options`, '每个事件选项必须有实际代价或风险后果');
          for (const id of [
            option.amountCnyParam,
            option.rateParam,
            option.minimumDepositRatioParam,
          ].filter((id): id is string => id !== null)) {
            has(parameters, id, '/eventEconomy/' + i + '/options', '费用/比例参数');
            try {
              const amount = new Decimal(String(data.parameters[id]!.value));
              if (
                !amount.isFinite() ||
                amount.lt(0) ||
                amount.gt(
                  option.rateParam === id || option.minimumDepositRatioParam === id ? 1 : 1000000,
                )
              )
                throw new Error('range');
            } catch {
              issue('/eventEconomy/' + i + '/options', '事件费用或比例参数越界');
            }
          }
          if (['priceDiscount', 'freightIncrease'].includes(option.operation) && !option.rateParam)
            issue('/eventEconomy/' + i + '/options', '事件缺少数值比例');
          if (option.operation === 'logisticsResolution' && !option.resolution)
            issue('/eventEconomy/' + i + '/options', '事件缺少物流处置');
          if (option.riskFlag) has(flags, option.riskFlag, `/eventEconomy/${i}/options`, 'flag');
          Object.entries(option.resultFlags).forEach(([id, value]) => {
            const flag = flags.get(id);
            if (!flag) issue(`/eventEconomy/${i}/options`, `未知 flag：${id}`);
            else if (typeof value !== flag.valueType)
              issue(`/eventEconomy/${i}/options`, '事件结果 flag 类型不匹配');
          });
        });
        const configured = new Set(economy.options.map((option) => option.choiceId));
        choice.choices.forEach((candidate) => {
          if (!configured.has(candidate.id))
            issue(`/events/${i}/choiceNodeId`, `事件选项缺少后果：${candidate.id}`);
        });
      }
    }
    const tags = new Set(reviews.get(event.id)?.riskTags);
    if (!tags.size) issue(`/eventReviews/${event.id}`, '事件复盘必须有风险标签');
    eventRoots.push(event.choiceNodeId);
  });
  data.eventReviews?.forEach((review, index) => {
    has(events, review.eventId, `/eventReviews/${index}/eventId`, '事件');
    try {
      teachingText(review.title, data);
      teachingText(review.consequence, data);
      teachingText(review.mentorReview, data);
    } catch {
      issue(`/eventReviews/${index}`, '事件复盘文案引用了未声明参数');
    }
  });
  data.eventEconomy?.forEach((economy, index) =>
    has(events, economy.eventId, `/eventEconomy/${index}/eventId`, '事件'),
  );
  if (data.mode === 'slice') {
    const schedule = data.eventScheduling;
    if (!schedule) issue('/eventScheduling', '七关流程缺少事件调度配置');
    else {
      if (new Set(schedule.windows.map((window) => window.nodeId)).size !== schedule.windows.length)
        issue('/eventScheduling/windows', '同一节点不能配置重复事件窗口');
      schedule.windows.forEach((window, index) => {
        has(nodes, window.nodeId, '/eventScheduling/windows/' + index + '/nodeId', '节点');
        has(
          nodes,
          window.returnNodeId,
          '/eventScheduling/windows/' + index + '/returnNodeId',
          '节点',
        );
        refIds(window.eventIds, events, '/eventScheduling/windows/' + index + '/eventIds', '事件');
        if (nodes.get(window.returnNodeId)?.stage !== window.stage)
          issue('/eventScheduling/windows', '事件返回节点不能跨关');
        if (window.eventIds.some((id) => !events.get(id)?.stages.includes(window.stage)))
          issue('/eventScheduling/windows', '事件与窗口关卡不符');
      });
      if (schedule.perStageEventCap !== 1)
        issue('/eventScheduling/perStageEventCap', '七关单窗口每关最多触发一个事件');
      if (schedule.perRunEventCap < 1 || schedule.perRunEventCap > 4)
        issue('/eventScheduling/perRunEventCap', '单局事件上限须在 1–4 之间');
      const windowStages = new Set(schedule.windows.map((window) => window.stage));
      for (let stage = 3; stage <= 7; stage++)
        if (!windowStages.has(stage as 3 | 4 | 5 | 6 | 7))
          issue('/eventScheduling/windows', `第 ${stage} 关缺少事件窗口`);
      schedule.windows.forEach((window) => {
        const node = nodes.get(window.nodeId);
        if (node && node.stage !== window.stage)
          issue('/eventScheduling/windows', `窗口 ${window.nodeId} 的关卡不匹配`);
      });
    }
    const expectedIds = Array.from(
      { length: 12 },
      (_, index) => `e${String(index + 1).padStart(2, '0')}`,
    );
    if (
      data.events.length !== 12 ||
      expectedIds.some((id) => !events.has(id)) ||
      data.events.some((event) => !expectedIds.includes(event.id))
    )
      issue('/events', '七关随机事件必须完整覆盖 e01–e12');
    if (
      data.eventReviews?.length !== 12 ||
      data.eventEconomy?.length !== 12 ||
      new Set(data.eventReviews?.map((review) => review.eventId)).size !== 12 ||
      new Set(data.eventEconomy?.map((economy) => economy.eventId)).size !== 12
    )
      issue('/events', '每个事件须有唯一的实际后果和林姐复盘');
    const lcEvent = events.get('e11');
    if (
      !lcEvent ||
      !lcEvent.stages.includes(4) ||
      !lcEvent.forceWhen ||
      !lcEvent.useNodeEffects ||
      !schedule?.windows.some(
        (window) => window.nodeId === 'L04.lc.soft' && window.eventIds.includes('e11'),
      )
    )
      issue('/events', 'L/C 软条款事件必须覆盖第 4 关');
  }
  const walk = (roots: string[], graph: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length) {
      const id = queue.pop();
      if (!id || seen.has(id) || !nodes.has(id)) continue;
      seen.add(id);
      queue.push(...(graph.get(id) ?? []));
    }
    return seen;
  };
  const reachable = walk([...data.entryNodeIds, ...eventRoots], edges);
  const reverse = new Map<string, string[]>();
  edges.forEach((targets, id) =>
    targets.forEach((target) => reverse.set(target, [...(reverse.get(target) ?? []), id])),
  );
  const canEnd = walk(
    data.nodes.filter((node) => node.type === 'settlement').map((node) => node.id),
    reverse,
  );
  data.nodes.forEach((node, i) => {
    if (!reachable.has(node.id)) issue(`/nodes/${i}/id`, `节点不可达：${node.id}`);
    if (!canEnd.has(node.id)) issue(`/nodes/${i}/id`, `没有通向结局的出口：${node.id}`);
  });
  if (data.mode === 'game') {
    const required = {
      products: 3,
      suppliers: 9,
      customers: 5,
      events: 12,
      glossary: 24,
      documentTemplates: 5,
      endings: 4,
    } as const;
    for (const [name, count] of Object.entries(required))
      if (data[name as keyof typeof required].length !== count)
        issue(`/${name}`, `正式内容要求 ${count} 条记录`);
  }
  if (data.mode === 'slice') validateSliceProfile(data, issue);
  validateDebriefProfile(data, issue);
  return issues.length ? { ok: false, issues } : { ok: true, data };
}

export class ContentValidationError extends Error {
  readonly issues: ContentIssue[];
  constructor(issues: ContentIssue[]) {
    super(issues.map((item) => `${item.source}#${item.pointer}: ${item.message}`).join('\n'));
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}
export function parseContent(value: unknown, source?: string): ContentPack {
  const result = validateContent(value, source);
  if (!result.ok) throw new ContentValidationError(result.issues);
  return result.data;
}
