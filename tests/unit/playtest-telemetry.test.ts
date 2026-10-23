import { describe, it, expect } from 'vitest';
import { ActiveClock } from '../../src/telemetry/activeClock';
import { createLocalSink, telemetryKey, maxTelemetryBytes } from '../../src/telemetry/localSink';
import { playtestContentSchema } from '../../src/domain/schemas/playtest';
import { pack } from '../fixtures/economy';
import { createSliceSession } from '../../src/engine/slice/session';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { fullGame } from '../fixtures/debrief';
import type { TelemetryData } from '../../src/telemetry/events';

function setup() {
  let now = 1000000,
    raw: string | null = null,
    fail = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      if (fail) throw Error('quota');
      raw = value;
    },
  };
  let sid = 0;
  const make = () =>
    createLocalSink({
      storage: () => storage,
      pack,
      sessionId: 'session.' + ++sid,
      now: () => now,
    });
  return {
    make,
    tick: (ms: number) => {
      now += ms;
    },
    read: () => JSON.parse(raw!) as TelemetryData,
    corrupt: () => {
      raw = '{broken';
    },
    fail: () => {
      fail = true;
    },
    raw: () => raw,
  };
}
const initial = () => createSliceSession(pack, 'telemetry.unit');

describe('有效时长', () => {
  it('可见 + 最近交互；无交互不计时，闲置两分钟封顶，重复结算不重复计时', () => {
    let now = 0;
    const c = new ActiveClock(() => now);
    c.visibility(true);
    now += 10000;
    expect(c.tick()).toBe(0);
    c.interact();
    now += 180000;
    expect(c.tick()).toBe(120000);
    expect(c.tick()).toBe(0);
    c.interact();
    now += 3000;
    expect(c.visibility(false)).toBe(3000);
    now += 60000;
    expect(c.visibility(true)).toBe(0);
    now += 2000;
    expect(c.tick()).toBe(2000);
  });
  it('刷新从零开启本次时钟，离线一天不补计；时钟倒退无负数', () => {
    let now = 10000;
    const c = new ActiveClock(() => now);
    c.visibility(true);
    c.interact();
    now -= 5000;
    expect(c.tick()).toBe(0);
    now += 7000;
    expect(c.tick()).toBe(2000);
    now += 86400000;
    const fresh = new ActiveClock(() => now);
    fresh.visibility(true);
    now += 1000;
    expect(fresh.tick()).toBe(0);
  });
  it('本地恢复累计有效时长，导出不会二次累加，隐藏间隔不算', () => {
    const f = setup(),
      sink = f.make(),
      s = initial();
    sink.attach(s, 'full');
    sink.visibility(true);
    sink.interact();
    f.tick(2000);
    sink.flush();
    sink.export();
    sink.export();
    expect(f.read().runs[0]!.activeMs).toBe(2000);
    sink.visibility(false);
    f.tick(86400000);
    const reloaded = f.make();
    reloaded.attach(s);
    reloaded.visibility(true);
    f.tick(4000);
    reloaded.flush();
    expect(f.read().runs[0]!.activeMs).toBe(2000);
    reloaded.interact();
    f.tick(1000);
    reloaded.flush();
    expect(f.read().runs[0]!.activeMs).toBe(3000);
    expect(reloaded.view().metrics.startedRuns).toBe(1);
  });
});

describe('本地试玩事件与统计', () => {
  it('十二题覆盖六个知识点、每点前后各一题，拒绝缺答案和重复选项', () => {
    expect(playtestContentSchema.parse(pack.playtest).questions).toHaveLength(12);
    const bad = structuredClone(pack.playtest!);
    bad.questions[0]!.answerId = 'missing';
    expect(playtestContentSchema.safeParse(bad).success).toBe(false);
    bad.questions[0] = structuredClone(bad.questions[1]!);
    expect(playtestContentSchema.safeParse(bad).success).toBe(false);
  });
  it('前测可中断恢复且提交幂等；后测须结局后，只有完成配对才算提升', () => {
    const f = setup();
    let sink = f.make();
    const s = initial();
    sink.attach(s, 'full', true);
    const pre = pack.playtest!.questions.filter((q) => q.phase === 'pre'),
      post = pack.playtest!.questions.filter((q) => q.phase === 'post');
    expect(sink.answer('post', post[0]!.id, post[0]!.answerId)).toBe(false);
    expect(sink.answer('pre', pre[0]!.id, 'invalid')).toBe(false);
    expect(sink.answer('pre', pre[0]!.id, pre[0]!.answerId)).toBe(true);
    expect(sink.answer('pre', pre[0]!.id, pre[0]!.answerId)).toBe(false);
    sink = f.make();
    sink.attach(s);
    for (const q of pre.slice(1))
      sink.answer('pre', q.id, q.options.find((o) => o.id !== q.answerId)!.id);
    expect(sink.view().metrics.knowledge.pairedN).toBe(0);
    const end = structuredClone(fullGame().session);
    end.snapshot.runId = s.snapshot.runId;
    sink.transition(s, end, 'advance');
    for (const q of post) sink.answer('post', q.id, q.answerId);
    expect(sink.view().metrics.knowledge).toMatchObject({
      pairedN: 1,
      preMean: 1,
      postMean: 6,
      improvementPoints: 5,
    });
    expect(sink.view().metrics).toMatchObject({ startedRuns: 1, completedRuns: 1, endedRuns: 1 });
    sink.attach(end);
    expect(sink.view().run!.counts.run_finished).toBe(1);
  });
  it('普通开始标为跳过；部分答题后跳过不纳入配对；先经营则锁定前测', () => {
    const f = setup(),
      sink = f.make(),
      s = initial();
    sink.attach(s, 'full');
    expect(sink.view().metrics.knowledge).toMatchObject({
      preSkipped: 1,
      preMean: null,
      pairedN: 0,
    });
    const s2 = createSliceSession(pack, 'second');
    sink.attach(s2, 'full', true);
    const q = pack.playtest!.questions[0]!;
    sink.answer('pre', q.id, q.answerId);
    sink.skip('pre');
    expect(sink.view().run!.pre.status).toBe('skipped');
    const s3 = createSliceSession(pack, 'third');
    sink.attach(s3, 'full', true);
    const next = reduceSlice(s3, pack, {
      id: 'first.action',
      revision: 0,
      action: { type: 'choose', choiceId: 'select_cup_500' },
    });
    sink.transition(s3, next, 'choose');
    expect(sink.answer('pre', q.id, q.answerId)).toBe(false);
    expect(sink.view().run!.pre.status).toBe('skipped');
  });
  it('重开区分中途/结局后，导入和独立报价排除分母；流失等待 24 小时观察', () => {
    const f = setup(),
      sink = f.make(),
      s = initial();
    sink.attach(s, 'full');
    expect(sink.view().metrics.stages[0]).toMatchObject({
      suspectedDropout: 1,
      observedDropout24h: 0,
    });
    f.tick(86400000);
    expect(sink.view().metrics.stages[0]!.observedDropout24h).toBe(1);
    sink.attach(s);
    expect(sink.view().metrics.stages[0]!.observedDropout24h).toBe(0);
    sink.restart();
    expect(sink.view().metrics.restartsDuring).toBe(1);
    sink.attach(createSliceSession(pack, 'practice', true), 'practice');
    sink.attach(createSliceSession(pack, 'imported'));
    expect(sink.view().metrics.startedRuns).toBe(1);
    expect(sink.view().metrics.excludedPracticeOrImported).toBe(2);
  });
  it('坏 JSON、存储拒绝不抛到游戏；原记录保留，本页仍可导出', () => {
    const f = setup();
    f.corrupt();
    const sink = f.make();
    sink.attach(initial(), 'full');
    expect(f.raw()).toBe('{broken');
    expect(sink.view().notice).toContain('保留原数据');
    expect(JSON.parse(sink.export()).runs).toHaveLength(1);
    const g = setup();
    g.fail();
    const failed = g.make();
    expect(() => failed.attach(initial(), 'full')).not.toThrow();
    expect(failed.view().notice).toContain('无法保存');
  });
  it('另一标签页写入后不覆盖其统计并暂停计时', () => {
    const f = setup(),
      a = f.make(),
      b = f.make();
    a.attach(initial(), 'full');
    const actual = f.raw();
    b.attach(createSliceSession(pack, 'other'), 'full');
    expect(f.raw()).toBe(actual);
    expect(b.view().notice).toContain('另一标签页');
    b.interact();
    f.tick(1000);
    b.flush();
    expect(b.view().run!.activeMs).toBe(0);
  });
  it('明细有上限，裁剪后汇总不丢；达到局数上限明确不纳入新局', () => {
    const f = setup(),
      sink = f.make();
    sink.attach(initial(), 'full');
    for (let i = 0; i < 2050; i++) sink.failure('QUOTA', i);
    const data = f.read();
    expect(data.events.length).toBeLessThanOrEqual(2000);
    expect(new TextEncoder().encode(f.raw()!).length).toBeLessThanOrEqual(maxTelemetryBytes);
    expect(data.droppedEvents).toBeGreaterThan(0);
    expect(data.runs[0]!.counts.save_failed).toBe(2050);
    for (let i = 0; i < 40; i++) sink.attach(createSliceSession(pack, 'run.' + i), 'full');
    expect(sink.view().metrics.startedRuns).toBe(40);
    expect(sink.view().run).toBe(null);
    expect(sink.view().notice).toContain('未纳入统计');
    // 容量压力用例执行 2050 次真实序列化写入，给 Windows 并行浏览器检查留出预算。
  }, 45000);
  it('事件不包含报价自由输入或原始种子，复盘需实际显示并继续才记录', () => {
    const f = setup(),
      sink = f.make(),
      s = initial();
    sink.attach(s, 'full');
    sink.visibility(true);
    sink.interact();
    const draft = { ...s, answers: { fobUnitUsd: 'private-free-text' } };
    sink.transition(s, draft, 'draft');
    expect(sink.export()).not.toContain('private-free-text');
    expect(f.read().events.every((e) => e.seedHash !== s.snapshot.story.seed)).toBe(true);
    expect(f.read().runs[0]!.counts.mentor_reviewed).toBeUndefined();
    expect(telemetryKey).toBe('first-export.playtest.v1');
  });
});
