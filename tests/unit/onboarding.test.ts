import { describe, it, expect } from 'vitest';
import raw from '../../src/content/onboarding.json';
import { parseOnboarding } from '../../src/content/onboarding';
import { guideScreens, onboardingSchema } from '../../src/domain/schemas/onboarding';
import {
  freshGuide,
  guideKey,
  guideRule,
  GuideIdleClock,
  readGuide,
  writeGuide,
  type GuideContext,
} from '../../src/app/onboarding';
import { eventPack } from '../fixtures/economy';

const content = parseOnboarding(raw, [eventPack]);
const context = (patch: Partial<GuideContext> = {}): GuideContext => ({
  screen: 'game',
  phase: 'normal',
  nodeId: 'unmatched',
  nodeType: 'choice',
  tags: [],
  stage: 1,
  key: 'test',
  ...patch,
});
describe('JSON 新手引导', () => {
  it('所有节点和页面都有提示，实际引用有效，读取不修改业务内容', () => {
    const before = JSON.stringify(eventPack);
    for (const node of eventPack.nodes) {
      expect(
        guideRule(
          content,
          context({ nodeId: node.id, nodeType: node.type, tags: node.tags, stage: node.stage }),
        ),
      ).toBeDefined();
    }
    for (const screen of guideScreens)
      expect(guideRule(content, context({ screen }))).toBeDefined();
    expect(JSON.stringify(eventPack)).toBe(before);
  });
  it.each([
    [{ phase: 'rescue' }, 'rescue'],
    [{ phase: 'feedback' }, 'feedback'],
    [{ phase: 'review', nodeId: 'L01.finish' }, 'finish'],
    [{ phase: 'event', stage: 5 }, 'event'],
    [{ nodeId: 'L01.verify.yoga' }, 'verify'],
    [{ nodeId: 'L02.inbox', stage: 2 }, 'inbox'],
    [{ nodeType: 'calc', nodeId: 'L03.main', stage: 3 }, 'quote'],
    [{ tags: ['pi_confirmation'], stage: 5 }, 'pi'],
    [{ tags: ['funding_check'], stage: 5 }, 'funding'],
    [{ tags: ['inspection_check'], stage: 5 }, 'inspection'],
    [{ tags: ['declaration_check'], stage: 6 }, 'declaration'],
    [{ tags: ['document_check'], stage: 7 }, 'documents'],
    [{ tags: ['tax_check'], stage: 7 }, 'tax'],
  ] as const)('高优先级情境 %j 对应 %s', (patch, id) => {
    expect(
      guideRule(content, context({ ...patch, tags: 'tags' in patch ? [...patch.tags] : [] })).id,
    ).toBe(id);
  });
  it('拒绝脚本、业务效果、任意 CSS 目标和危险计时配置', () => {
    expect(onboardingSchema.safeParse({ ...raw, effects: [] }).success).toBe(false);
    for (const target of ['body', 'script', 'button:nth-child(1)']) {
      const bad = structuredClone(raw);
      bad.rules[0]!.target = target;
      expect(onboardingSchema.safeParse(bad).success).toBe(false);
    }
    for (const idleSeconds of [-1, 0, 29, 121, NaN])
      expect(onboardingSchema.safeParse({ ...raw, idleSeconds }).success).toBe(false);
  });
  it('拒绝重复 id、缺失默认提示和失效剧情引用', () => {
    expect(() =>
      parseOnboarding({ ...raw, rules: [...raw.rules, raw.rules[0]] }, [eventPack]),
    ).toThrow();
    expect(() =>
      parseOnboarding({ ...raw, rules: raw.rules.filter((r) => r.id !== 'game') }, [eventPack]),
    ).toThrow();
    for (const when of [
      { screen: 'game', nodeIds: ['missing'] },
      { screen: 'game', tag: 'missing' },
      { screen: 'game', nodeType: 'missing' },
    ])
      expect(() =>
        parseOnboarding(
          { ...raw, rules: [{ ...raw.rules[0], id: 'invalid', when }, ...raw.rules] },
          [eventPack],
        ),
      ).toThrow();
  });
});
describe('引导偏好隔离于经营存档', () => {
  it('首次自动打开，跳过及完成刷新保持，重新查看只改引导键', () => {
    const data = new Map<string, string>([['business', 'unchanged']]);
    const storage = () => ({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    });
    expect(readGuide(storage).state).toEqual(freshGuide());
    for (const status of ['skipped', 'completed'] as const) {
      expect(writeGuide(storage, { ...freshGuide(), status, overview: 3 })).toBe(true);
      expect(readGuide(storage).state.status).toBe(status);
    }
    writeGuide(storage, freshGuide());
    expect(readGuide(storage).state.status).toBe('active');
    expect([...data.keys()]).toEqual(['business', guideKey]);
    expect(data.get('business')).toBe('unchanged');
  });
  it.each(['{', '{"version":"old"}', JSON.stringify({ ...freshGuide(), overview: 900 })])(
    '损坏偏好 %s 可恢复',
    (value) => {
      expect(readGuide(() => ({ getItem: () => value, setItem: () => {} }))).toEqual({
        state: freshGuide(),
        unavailable: true,
      });
    },
  );
  it('存储禁用不抛错，允许本页使用并明确返回未保存', () => {
    const storage = () => {
      throw new Error('blocked');
    };
    expect(readGuide(storage).unavailable).toBe(true);
    expect(writeGuide(storage, freshGuide())).toBe(false);
  });
});
describe('卡住提醒仅计前台有效停留', () => {
  function setup() {
    let now = 0;
    const c = new GuideIdleClock();
    c.reset('a', now, true);
    const ticks = (seconds: number, eligible = true, key = 'a') => {
      let ready = false;
      for (let i = 0; i < seconds; i++) ready = c.tick(key, (now += 1000), eligible, 60000);
      return ready;
    };
    return { c, ticks, now: () => now };
  }
  it('60 秒门槛，编辑重置；同一步关闭后不再打扰，换步重新计时', () => {
    const { c, ticks, now } = setup();
    expect(ticks(59)).toBe(false);
    expect(ticks(1)).toBe(true);
    c.activity(now());
    expect(ticks(59)).toBe(false);
    expect(ticks(1)).toBe(true);
    c.dismiss();
    expect(ticks(120)).toBe(false);
    expect(ticks(1, true, 'b')).toBe(false);
    expect(ticks(60, true, 'b')).toBe(true);
  });
  it('失焦或隐藏不计时，恢复不补计，睡眠大跨度不触发', () => {
    const { c, ticks, now } = setup();
    expect(ticks(30)).toBe(false);
    expect(ticks(3600, false)).toBe(false);
    expect(ticks(1)).toBe(false);
    expect(ticks(29)).toBe(false);
    expect(ticks(1)).toBe(true);
    c.reset('b', now(), true);
    expect(c.tick('b', now() + 86400000, true, 60000)).toBe(false);
  });
  it('跳过/打开引导/冲突状态均可通过 eligible 禁止提醒，时钟倒退不产生负数', () => {
    const { c, ticks, now } = setup();
    expect(ticks(120, false)).toBe(false);
    expect(c.tick('a', now() - 1000, false, 60000)).toBe(false);
  });
});
