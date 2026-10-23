import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import { validateContent } from '../../src/content/validation';
import type { ContentPack } from '../../src/domain/types';
describe('结局与图鉴的 JSON 引用校验', () => {
  it('完整 24 词条、四结局、评分绑定均有效', () => expect(validateContent(pack).ok).toBe(true));
  const cases: [string, (p: ContentPack) => void][] = [
    [
      '不存在的结算节点',
      (p) => {
        p.debrief!.terminalNodeIds = ['missing'];
      },
    ],
    [
      '重复结局种类',
      (p) => {
        p.endings[0]!.kind = p.endings[1]!.kind;
      },
    ],
    [
      '未知评分选项',
      (p) => {
        p.debrief!.assessments[0]!.choiceIds.push('missing');
      },
    ],
    [
      '未知评分规则',
      (p) => {
        p.debrief!.assessments[0]!.rubricId = 'missing';
      },
    ],
    [
      '错误的结果标记',
      (p) => {
        p.debrief!.assessments[0]!.successFlag = 'inquiryBuyerId';
      },
    ],
    [
      '未绑定的评分规则',
      (p) => {
        p.debrief!.assessments.pop();
      },
    ],
    [
      '未知证据节点',
      (p) => {
        p.debrief!.assessments[0]!.nodeIds = ['missing'];
      },
    ],
    [
      '重复回放节点',
      (p) => {
        p.debrief!.replayGuides[1]!.nodeIds = p.debrief!.replayGuides[0]!.nodeIds;
      },
    ],
    [
      '未知重大风险选项',
      (p) => {
        p.debrief!.replayGuides[0]!.riskChoiceIds = ['missing'];
      },
    ],
    [
      '缺失知识题',
      (p) => {
        p.debrief!.quizzes.pop();
      },
    ],
    [
      '重复知识题',
      (p) => {
        p.debrief!.quizzes[1] = p.debrief!.quizzes[0]!;
      },
    ],
    [
      '不存在的答案',
      (p) => {
        p.debrief!.quizzes[0]!.answerId = 'missing';
      },
    ],
    [
      '重复答案选项',
      (p) => {
        p.debrief!.quizzes[0]!.options[1] = p.debrief!.quizzes[0]!.options[0]!;
      },
    ],
    [
      '未知本局模板参数',
      (p) => {
        p.glossary[0]!.exampleTemplate = '{{arbitrary.path}}';
      },
    ],
    [
      '知识前置关系成环',
      (p) => {
        p.glossary[0]!.prerequisiteIds = [p.glossary[1]!.id];
        p.glossary[1]!.prerequisiteIds = [p.glossary[0]!.id];
      },
    ],
    [
      '评分门槛不一致',
      (p) => {
        p.debrief!.scoring.excellentReputation = 79;
      },
    ],
    [
      '收益基数为零',
      (p) => {
        p.debrief!.scoring.targetReturnOnCost.value = '0';
      },
    ],
    [
      '路线分母为空',
      (p) => {
        p.rubrics[0]!.paymentMethods = [];
      },
    ],
  ];
  it.each(cases)('拒绝%s', (_, change) => {
    const p = structuredClone(pack);
    change(p);
    expect(validateContent(p).ok).toBe(false);
  });
});
