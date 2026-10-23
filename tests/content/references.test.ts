import { describe, expect, it } from 'vitest';
import sample from '../fixtures/scaffold.json';
import { contentPackSchema } from '../../src/domain/schemas/content';
import {
  parseContent,
  validateContent,
  ContentValidationError,
} from '../../src/content/validation';
import type { ContentPack, Effect, Condition } from '../../src/domain/types';

const fixture = () => contentPackSchema.parse(structuredClone(sample));
function choice(pack: ContentPack) {
  const node = pack.nodes.find((node) => node.type === 'choice');
  if (!node || node.type !== 'choice') throw new Error('测试夹具缺少选择节点');
  return node;
}
function messages(pack: unknown): string {
  const result = validateContent(pack, 'fixture.json');
  expect(result.ok).toBe(false);
  return result.ok
    ? ''
    : result.issues.map((issue) => `${issue.source}#${issue.pointer} ${issue.message}`).join('\n');
}
describe('跨引用、图和效果白名单', () => {
  it('缺失下一节点时包含文件与 JSON Pointer', () => {
    const pack = fixture();
    choice(pack).choices[0]!.nextNodeId = 'missing_node';
    expect(messages(pack)).toContain('fixture.json#/nodes/0/choices/0/nextNodeId');
  });
  it('拒绝不存在的客户（speaker）', () => {
    const pack = fixture();
    choice(pack).speakerId = 'missing_customer';
    expect(messages(pack)).toContain('未找到客户或导师');
  });
  it('拒绝条件和 effect 中不存在的客户', () => {
    const pack = fixture();
    const node = choice(pack);
    node.entryWhen = {
      op: 'eq',
      left: { kind: 'ref', scope: 'state', path: 'order.customerId' },
      right: { kind: 'literal', value: 'missing_customer' },
    };
    node.choices[0]!.effects = [
      {
        op: 'adjust',
        target: 'player.trustByCustomer.missing_customer',
        value: { kind: 'literal', value: 1 },
      },
    ];
    const error = messages(pack);
    expect(error).toContain('/entryWhen/right/value');
    expect(error).toContain('/choices/0/effects/0/target');
  });
  it('拒绝重复节点与选项 id', () => {
    const pack = fixture();
    pack.nodes.push(structuredClone(pack.nodes[0]!));
    choice(pack).choices[1]!.id = choice(pack).choices[0]!.id;
    const error = messages(pack);
    expect(error).toContain('重复 id');
    expect(error).toContain('选项 id 重复');
  });
  it('拒绝缺失配置与小游戏引用', () => {
    const pack = fixture();
    pack.parameters = {};
    expect(messages(pack)).toContain('未找到参数');
    pack.puzzles = [];
    expect(messages(pack)).toContain('未找到小游戏');
  });
  it.each(['player.cashCnyFen', 'player.cumulativeProfitCnyFen', 'order.remainingDeliveryDays'])(
    '禁止通过 set 直接修改 %s',
    (target) => {
      const pack = fixture();
      choice(pack).onEnterEffects = [{ op: 'set', target, value: { kind: 'literal', value: 0 } }];
      expect(messages(pack)).toContain('禁止写入该状态字段');
    },
  );
  it('拒绝未知读取路径、规则与多余参数', () => {
    const pack = fixture();
    choice(pack).onEnterEffects = [
      { op: 'rule', ruleId: 'executeCode', args: {} },
      {
        op: 'rule',
        ruleId: 'contract.sign',
        args: { evil: { kind: 'ref', scope: 'state', path: 'window.location' } },
      },
    ];
    const error = messages(pack);
    expect(error).toContain('未知规则');
    expect(error).toContain('规则参数名或数量不匹配');
    expect(error).toContain('未登记的状态读取路径');
  });
  it('拒绝没有兜底结果分支', () => {
    const pack = fixture();
    const calc = pack.nodes.find((node) => node.type === 'calc');
    if (!calc || calc.type !== 'calc') throw new Error('缺少 calc');
    calc.results.pop();
    expect(messages(pack)).toContain('恒真兜底');
  });
  it('拒绝没有出口的循环', () => {
    const pack = fixture();
    const review = pack.nodes.find((node) => node.id === 'sample.review');
    if (!review || !('nextNodeId' in review)) throw new Error('缺少 review');
    review.nextNodeId = 'sample.choice';
    expect(messages(pack)).toContain('没有通向结局的出口');
  });
  it('拒绝孤立节点', () => {
    const pack = fixture();
    const terminal = pack.nodes.find((node) => node.type === 'settlement');
    if (!terminal) throw new Error('缺少结局');
    pack.nodes.push({ ...terminal, id: 'isolated' });
    expect(messages(pack)).toContain('节点不可达');
  });
  it('复盘超过 120 字被拒绝', () => {
    const pack = fixture();
    const review = pack.nodes.find((node) => node.type === 'review');
    if (!review || review.type !== 'review') throw new Error('缺少复盘');
    review.text = '字'.repeat(121);
    expect(messages(pack)).toContain('120');
  });
  it('限制条件和效果嵌套层数', () => {
    const pack = fixture();
    let condition: Condition = { op: 'all', conditions: [] };
    for (let i = 0; i < 9; i++) condition = { op: 'not', condition };
    choice(pack).entryWhen = condition;
    expect(messages(pack)).toContain('条件嵌套超过');
    const pack2 = fixture();
    let effects: Effect[] = [];
    for (let i = 0; i < 9; i++)
      effects = [{ op: 'if', when: { op: 'all', conditions: [] }, then: effects, else: [] }];
    choice(pack2).onEnterEffects = effects;
    expect(messages(pack2)).toContain('效果嵌套超过');
  });
  it('校验随机小数端点、步长与推进天数', () => {
    const pack = fixture();
    choice(pack).onEnterEffects = [
      {
        op: 'adjust',
        target: 'player.reputation',
        value: { kind: 'randomDecimal', min: '0', max: '1', step: '0.3', drawKey: 'sample' },
      },
      { op: 'advanceDays', value: { kind: 'literal', value: -1 }, reason: 'test' },
    ];
    const error = messages(pack);
    expect(error).toContain('端点对齐');
    expect(error).toContain('非负整数');
  });
  it('拒绝原型链键且不污染对象', () => {
    const dangerous = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    expect(messages(dangerous)).toContain('原型链');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('运行时 parse 失败抛可展示的校验异常', () => {
    expect(() => parseContent({}, 'runtime.json')).toThrow(ContentValidationError);
    expect(() => parseContent({}, 'runtime.json')).toThrow('runtime.json#/');
  });
  it('正式模式不能拿脚手架空内容冒充全量达标', () => {
    const pack = fixture();
    pack.mode = 'game';
    expect(messages(pack)).toContain('正式内容要求');
  });
});
