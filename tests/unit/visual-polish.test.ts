import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import raw from '../../src/content/presentation.json';
import { presentation, parsePresentation } from '../../src/content/presentation';
import { presentationSchema, mentorCues } from '../../src/domain/schemas/presentation';
import { mentorCue, mentorExpression, sampleStep } from '../../src/app/presentation';
import { importSave, encodeSave } from '../../src/persistence/sliceSave';
import { eventPack } from '../fixtures/economy';

describe('视觉精修内容契约', () => {
  it('独立表情图集为 1536×1024 RGBA PNG，原图集和业务内容保持不变', () => {
    const data = parsePresentation(raw, [eventPack]);
    const png = readFileSync('public/' + data.mentor.atlas);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1536, 1024, 6]);
    expect(
      createHash('sha256')
        .update(readFileSync('public/' + data.atlas))
        .digest('hex'),
    ).toBe('d0c7feed11694ea773d993af498bf41d20a85e757cd80807f769950ed5968d40');
    expect(
      createHash('sha256').update(readFileSync('src/content/levels/L01-L07.json')).digest('hex'),
    ).toBe('67b398cbe076d7689d8d05a9bd625734d7f3ccf17b2c3616c66a533ebb859a18');
  });
  it.each(['missing', 'duplicate', 'position', 'path', 'reference', 'unknown'] as const)(
    '拒绝无效表情配置：%s',
    (kind) => {
      const data = structuredClone(raw);
      if (kind === 'missing') data.mentor.expressions.pop();
      if (kind === 'duplicate') data.mentor.expressions[1]!.id = 'welcome';
      if (kind === 'position') data.mentor.expressions[1]!.column = 0;
      if (kind === 'path') data.mentor.atlas = '../remote.png';
      if (kind === 'reference') data.mentor.cues.home = 'absent';
      if (kind === 'unknown') Object.assign(data.mentor.cues, { execute: 'welcome' });
      expect(presentationSchema.safeParse(data).success).toBe(false);
    },
  );
  it('拒绝缺少必要情境和不存在的剧情节点', () => {
    const data = structuredClone(raw);
    const { home: _home, ...cues } = data.mentor.cues;
    expect(
      presentationSchema.safeParse({ ...data, mentor: { ...data.mentor, cues } }).success,
    ).toBe(false);
    Object.assign(data.mentor.nodeCues, { 'L01.absent': 'product' });
    expect(() => parsePresentation(data, [eventPack])).toThrow('不存在于剧情');
  });
  it('表情映射来自 JSON；配置改变即可改变呈现，无需修改订单', () => {
    for (const cue of mentorCues) expect(mentorExpression(presentation, cue)).toBeDefined();
    const changed = structuredClone(presentation);
    changed.mentor.cues.product = 'thinking';
    expect(mentorExpression(changed, 'product').id).toBe('thinking');
    expect(mentorExpression(presentation, 'product').id).toBe('welcome');
  });
  it.each([
    ['L01.product', false, false, false, 'product', 'welcome'],
    ['L01.suppliers.tws', false, false, false, 'supplier', 'thinking'],
    ['L01.verify.yoga', false, false, false, 'verify', 'explaining'],
    ['L01.risk.cup_500', false, true, false, 'rescue', 'concerned'],
    ['L01.finish', false, true, false, 'finish', 'encouraging'],
    ['L01.finish', true, true, false, 'feedback', 'reflecting'],
    ['L01.product', false, false, true, 'event', 'explaining'],
    ['L07.unknown', false, true, false, 'review', 'reflecting'],
    ['L07.unknown', false, false, false, 'default', 'explaining'],
  ] as const)(
    '%s / feedback=%s / review=%s / event=%s',
    (nodeId, feedback, review, event, expected, expression) => {
      const context = Object.freeze({ nodeId, feedback, review, event });
      const cue = mentorCue(presentation, context);
      expect(cue).toBe(expected);
      expect(mentorExpression(presentation, cue).id).toBe(expression);
    },
  );
  it('样品流程不把尚待核验展示为已完成', () => {
    expect(sampleStep('event')).toBeNull();
    expect(sampleStep('feedback')).toBeNull();
    expect(
      ['product', 'supplier', 'verify'].map((cue) =>
        sampleStep(cue as 'product' | 'supplier' | 'verify'),
      ),
    ).toEqual([0, 1, 2]);
    expect(presentation.interface.sampleNotes[2]).toContain('以记录为准');
  });
  it('冻结的 v0.2.0 付费存档导入、演出和再次导出不改变现金、账本、随机状态或草稿', () => {
    const old = importSave(
      readFileSync('tests/fixtures/visual-v020-paid-save.json', 'utf8'),
      eventPack,
    );
    const before = JSON.stringify(old);
    expect(old.session.snapshot.player.cashCnyFen).toBe(9_980_000);
    for (const cue of mentorCues) mentorExpression(presentation, cue);
    expect(JSON.stringify(old)).toBe(before);
    expect(importSave(encodeSave(old, eventPack), eventPack)).toEqual(old);
    expect(old.session.contentVersion).toBe('0.10.0-slice');
  });
});
