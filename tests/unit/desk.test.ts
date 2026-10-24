import { describe, expect, it } from 'vitest';
import { paginate, pageAt } from '../../src/app/deskPagination';
import { deskAction } from '../../src/app/deskFeedback';
import { createSliceSession } from '../../src/engine/slice/session';
import { dispatchSlice } from '../../src/engine/slice/rescue';
import { eventPack, pack } from '../fixtures/economy';
import { encodeSave, decodeSave } from '../../src/persistence/sliceSave';
import { presentationSchema } from '../../src/domain/schemas/presentation';
import raw from '../../src/content/presentation.json';

describe('固定工作台分页', () => {
  it('优先保持完整控件，卡片和标签的软分页建议不能切断输入框', () => {
    const controls = [
      { start: 290, end: 337 },
      { start: 333, end: 360 },
    ];
    const pages = paginate(600, 320, controls, [{ start: 140, end: 334 }]);
    for (const page of pages)
      expect(controls.some((s) => s.start < page.end && s.end > page.end)).toBe(false);
    const at = pageAt(pages, 290, 337);
    expect(pages[at]!.start).toBeLessThanOrEqual(290);
    expect(pages[at]!.end).toBeGreaterThanOrEqual(337);
  });
  it('连续覆盖全文且避开按钮、输入行和重叠卡片', () => {
    const protectedSpans = [
      { start: 90, end: 145 },
      { start: 130, end: 180 },
      { start: 260, end: 300 },
    ];
    const pages = paginate(350, 160, protectedSpans);
    expect(pages).toEqual([
      { start: 0, end: 90 },
      { start: 90, end: 250 },
      { start: 250, end: 350 },
    ]);
    expect(pageAt(pages, 130, 180)).toBe(1);
    expect(pageAt(pages, 260, 300)).toBe(2);
    for (const page of pages) {
      expect(page.end - page.start).toBeLessThanOrEqual(160);
      expect(protectedSpans.some((s) => s.start < page.end && s.end > page.end)).toBe(false);
    }
  });
  it('空容器、小窗口和过高插图不会产生无限循环或漏页', () => {
    expect(paginate(0, 0, [])).toEqual([{ start: 0, end: 0 }]);
    expect(paginate(900, 100, [{ start: 0, end: 900 }])).toHaveLength(9);
    expect(paginate(900, 100, []).at(-1)?.end).toBe(900);
  });
  it('配置拒绝空标签、业务指令和过长动画', () => {
    expect(presentationSchema.safeParse(raw).success).toBe(true);
    for (const desk of [
      { ...raw.desk, next: '' },
      { ...raw.desk, deltaDurationMs: 6000 },
      { ...raw.desk, onAnimation: 'pay' },
    ])
      expect(presentationSchema.safeParse({ ...raw, desk }).success).toBe(false);
  });
});

describe('反馈在原工作台显示，业务动作只提交一次', () => {
  it.each([pack, eventPack])('结果与旧的选择→确认完全等价，事件种子未改变', (content) => {
    const source = createSliceSession(content, 'desk.fixed.seed', false, false, true);
    const action = { type: 'choose', choiceId: 'select_cup_500' } as const;
    const first = dispatchSlice(source, content, {
      id: 'choice',
      revision: source.snapshot.revision,
      action,
    });
    const expected = dispatchSlice(first, content, {
      id: 'choice.ack',
      revision: first.snapshot.revision,
      action: { type: 'advance' },
    });
    const result = deskAction(source, content, action, 'choice');
    expect(result.decision).toEqual(first);
    expect(result.next).toEqual(expected);
    expect(result.next.feedback).toBeNull();
    expect(source.snapshot.story.decisionLog).toHaveLength(0);
  });
  it('支付核验费后停在林姐复盘，重载与旧反馈确认均不重扣款', () => {
    let session = createSliceSession(pack, 'desk.paid', false, false, true);
    let i = 0;
    const act = (action: Parameters<typeof deskAction>[2]) =>
      (session = deskAction(session, pack, action, 'desk.' + ++i).next);
    act({ type: 'choose', choiceId: 'select_cup_500' });
    act({ type: 'choose', choiceId: 'select_cup_500_verified' });
    expect(pack.nodes.find((n) => n.id === session.snapshot.story.nodeId)?.type).toBe('review');
    act({ type: 'advance' });
    const source = session;
    act({ type: 'choose', choiceId: 'verify_cup_500' });
    expect(session.snapshot.player.cashCnyFen).toBe(source.snapshot.player.cashCnyFen - 20000);
    expect(session.snapshot.story.nodeId).toBe('L01.finish');
    const restored = decodeSave(encodeSave({ session, parameterDraft: null }, pack), pack);
    expect(restored.payload.session).toEqual(session);
    const old = dispatchSlice(source, pack, {
      id: 'old.payment',
      revision: source.snapshot.revision,
      action: { type: 'choose', choiceId: 'verify_cup_500' },
    });
    const resumed = deskAction(old, pack, { type: 'advance' }, 'resume').next;
    expect(resumed.snapshot.journal).toEqual(old.snapshot.journal);
    expect(resumed.snapshot.story.rngState).toEqual(old.snapshot.story.rngState);
    expect(resumed.snapshot.story.nodeId).toBe('L01.finish');
  });
});
