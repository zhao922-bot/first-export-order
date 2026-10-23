import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import raw from '../../src/content/presentation.json';
import { parsePresentation, presentation } from '../../src/content/presentation';
import { presentationSchema } from '../../src/domain/schemas/presentation';
import {
  motionAllowed,
  motionKey,
  readMotion,
  sceneActor,
  writeMotion,
} from '../../src/app/presentation';
import { eventPack } from '../fixtures/economy';

describe('角色与场景内容', () => {
  it('覆盖全部七关和六位剧情人物，不改业务内容；图集为有效 3×2 PNG', () => {
    const before = JSON.stringify(eventPack);
    const content = parsePresentation(raw, [eventPack]);
    expect(content.stages.map((s) => s.stage).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(JSON.stringify(eventPack)).toBe(before);
    const png = readFileSync('public/' + content.atlas);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1536, 1024]);
  });
  it.each(['actors', 'stages'] as const)('拒绝 %s 缺项及重复项', (key) => {
    const missing = structuredClone(raw);
    missing[key].pop();
    expect(presentationSchema.safeParse(missing).success).toBe(false);
    const duplicate = structuredClone(raw);
    if (key === 'actors') duplicate.actors[1] = duplicate.actors[0]!;
    else duplicate.stages[1] = duplicate.stages[0]!;
    expect(presentationSchema.safeParse(duplicate).success).toBe(false);
  });
  it('拒绝重复图集位置及不属于剧情的人名', () => {
    const invalid = structuredClone(raw);
    invalid.actors[1]!.column = 0;
    expect(() => parsePresentation(invalid, [eventPack])).toThrow('图集位置');
    invalid.actors[1]!.column = 1;
    invalid.actors[1]!.name = '错误客户';
    expect(() => parsePresentation(invalid, [eventPack])).toThrow('剧情人物');
  });
  it.each(['https://example.com/cast.png', '../cast.png', 'assets/portraits/../../cast.png'])(
    '拒绝非本地安全素材路径 %s',
    (atlas) => {
      expect(presentationSchema.safeParse({ ...raw, atlas }).success).toBe(false);
    },
  );
  it.each(presentation.actors.filter((a) => a.id !== 'mentor_lin'))(
    '$name 在询盘和谈判中使用相同角色，复盘由林姐出场',
    (actor) => {
      expect(sceneActor(presentation, { stage: 2, sender: actor.name, mentor: false })).toBe(
        actor.id,
      );
      expect(sceneActor(presentation, { stage: 4, customerId: actor.id, mentor: false })).toBe(
        actor.id,
      );
      expect(sceneActor(presentation, { stage: 4, customerId: actor.id, mentor: true })).toBe(
        'mentor_lin',
      );
    },
  );
  it('未知询盘身份不借用成交客户的形象；其他业务阶段由导师陪同', () => {
    expect(
      sceneActor(presentation, {
        stage: 2,
        sender: '采购联络处',
        customerId: 'customer_c',
        mentor: false,
      }),
    ).toBeNull();
    expect(sceneActor(presentation, { stage: 4, customerId: 'invalid', mentor: false })).toBeNull();
    for (const stage of [1, 3, 5, 6, 7])
      expect(sceneActor(presentation, { stage, mentor: false })).toBe('mentor_lin');
  });
});
describe('独立动效偏好', () => {
  it('只写独立键，保留经营存档；损坏偏好回落到系统', () => {
    const data = new Map<string, string>([['game-save', 'unchanged']]);
    const storage = () => ({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    });
    expect(readMotion(storage)).toBe('system');
    expect(writeMotion(storage, 'off')).toBe(true);
    expect(readMotion(storage)).toBe('off');
    expect(data.get('game-save')).toBe('unchanged');
    expect(data.size).toBe(2);
    data.set(motionKey, '{broken');
    expect(readMotion(storage)).toBe('system');
  });
  it('存储禁用不阻塞页面，可以提示设置未保存', () => {
    const denied = () => {
      throw new Error('denied');
    };
    expect(readMotion(denied)).toBe('system');
    expect(writeMotion(denied, 'off')).toBe(false);
  });
  it.each([
    ['system', false, true],
    ['system', true, false],
    ['off', false, false],
    ['off', true, false],
  ] as const)('%s / 系统减少动态=%s → 播放=%s', (pref, reduced, expected) => {
    expect(motionAllowed(pref, reduced)).toBe(expected);
  });
});
