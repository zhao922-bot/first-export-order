import { describe, expect, it } from 'vitest';
import sample from '../fixtures/scaffold.json';
import { contentPackSchema } from '../../src/domain/schemas/content';
import { conditionSchema, effectSchema } from '../../src/domain/schemas/effects';
import { moneyMinorSchema, parameterSchema } from '../../src/domain/schemas/common';
import { playerStateSchema } from '../../src/domain/schemas/state';
import { validateContent } from '../../src/content/validation';

describe('Zod 结构边界', () => {
  it('校验完整示例且不改写输入', () => {
    const before = JSON.stringify(sample);
    expect(contentPackSchema.safeParse(sample).success).toBe(true);
    expect(validateContent(sample).ok).toBe(true);
    expect(JSON.stringify(sample)).toBe(before);
  });
  it('拒绝未知字段和节点类型', () => {
    expect(contentPackSchema.safeParse({ ...sample, typo: true }).success).toBe(false);
    expect(
      contentPackSchema.safeParse({ ...sample, nodes: [{ ...sample.nodes[0], type: 'script' }] })
        .success,
    ).toBe(false);
  });
  it('条件不允许随机表达式', () => {
    expect(
      conditionSchema.safeParse({
        op: 'exists',
        value: { kind: 'randomInt', min: 0, max: 1, drawKey: 'x' },
      }).success,
    ).toBe(false);
  });
  it('拒绝倒置随机区间与钳制边界', () => {
    expect(
      effectSchema.safeParse({
        op: 'adjust',
        target: 'player.reputation',
        value: { kind: 'randomInt', min: 2, max: 1, drawKey: 'x' },
      }).success,
    ).toBe(false);
    expect(
      effectSchema.safeParse({
        op: 'adjust',
        target: 'player.reputation',
        value: { kind: 'literal', value: 1 },
        clamp: { min: 80, max: 40 },
      }).success,
    ).toBe(false);
  });
  it('金额最小单位拒绝小数和不安全整数', () => {
    // 教学算例参数，可配置；这里只检查字段存储格式，不计算金额。
    expect(moneyMinorSchema.safeParse(1.5).success).toBe(false);
    expect(moneyMinorSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });
  it('参数必须标明教学用途及单位', () => {
    expect(
      parameterSchema.safeParse({
        value: '1.00',
        unit: 'CNY',
        teachingOnly: true,
        note: '教学算例参数，可配置',
        reviewStatus: 'draft',
      }).success,
    ).toBe(true);
    expect(
      parameterSchema.safeParse({
        value: '1.00',
        unit: 'CNY',
        teachingOnly: false,
        note: '实时费率',
        reviewStatus: 'draft',
      }).success,
    ).toBe(false);
  });
  it('信誉与信任必须处于范围内，现金允许负数用于未来破产判断', () => {
    // 所有金额为教学算例参数，可配置。
    const player = {
      cashCnyFen: -1,
      cumulativeProfitCnyFen: 0,
      reputation: 60,
      trustByCustomer: { sample_customer: 50 },
      learnedTermIds: [],
      masteredTermIds: [],
      criticalMistakeCount: 0,
      rescueUsed: false,
    };
    expect(playerStateSchema.safeParse(player).success).toBe(true);
    expect(playerStateSchema.safeParse({ ...player, reputation: 101 }).success).toBe(false);
    expect(
      playerStateSchema.safeParse({ ...player, trustByCustomer: { sample_customer: -1 } }).success,
    ).toBe(false);
  });
});
