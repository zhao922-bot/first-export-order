import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregatePlaytests, median } from '../../scripts/playtest/aggregate';
import { auditReviews, renderReport } from '../../scripts/playtest/report';
import { studyFixture, assessmentAnswers } from '../fixtures/playtest-study';

const first = (f: ReturnType<typeof studyFixture>) => f.exports['P01.json']!.runs[0]!;
describe('真人批次的首局、配对和门槛', () => {
  it('12 人配对，按百分点中位数和扣除前后测的时长验收，不信任导出 metrics', () => {
    const result = aggregatePlaytests(studyFixture());
    expect(result.cohort.recorded).toBe(12);
    expect(result.knowledge.medianGainPp).toBeCloseTo(33.33333);
    expect(result.duration.medianGameplayMinutes).toBe(35);
    expect(result.participants[0]!.activeMs).toBe(42 * 60000);
    expect(result.gates).toEqual({
      sample: 'pass',
      completion: 'pass',
      knowledge: 'pass',
      duration: 'pass',
    });
    expect(result.releaseDecision).toBe('pending-human-review');
    expect(renderReport(result)).toContain('待人工签核');
  });
  it('中位数不改输入、支持偶数和空样本', () => {
    const xs = [100, 0, 0, 0];
    expect(median(xs)).toBe(0);
    expect(xs[0]).toBe(100);
    expect(median([1, 5, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
  it('使用个人增益中位数而非平均增益，12 人小样本不声称证明学习有效', () => {
    const f = studyFixture();
    Object.values(f.exports).forEach((e, i) => {
      e.runs[0]!.pre.answers = assessmentAnswers('pre', 0);
      e.runs[0]!.post.answers = assessmentAnswers('post', i < 7 ? 0 : 6);
      for (const event of e.events)
        if (event.eventName === 'assessment_answered') event.data.correct = false;
    });
    const r = aggregatePlaytests(f);
    expect(r.knowledge.medianGainPp).toBe(0);
    expect(r.gates.knowledge).toBe('fail');
  });
  it.each([9, 8])('%i / 12 完整七关按 70%% 判断；丢单不算完整通关', (count) => {
    const f = studyFixture();
    Object.values(f.exports)
      .slice(count)
      .forEach((e) => {
        e.runs[0]!.ending = { kind: 'tuition', completion: 'lost_order', scores: {} };
        const endingEvent = e.events.find((x) => x.eventName === 'run_finished')!;
        endingEvent.data = { endingKind: 'tuition', completion: 'lost_order' };
      });
    const r = aggregatePlaytests(f);
    expect(r.completion.completed).toBe(count);
    expect(r.completion.endings.tuition).toBe(12 - count);
    expect(r.completion.anyEnding).toBe(12);
    expect(r.gates.completion).toBe(count === 9 ? 'pass' : 'fail');
  });
  it('缺文件仍保留在纳入分母，人数不足不能自动通过', () => {
    const f = studyFixture();
    delete f.exports['P01.json'];
    const r = aggregatePlaytests(f);
    expect(r.cohort.missing).toBe(1);
    expect(r.completion.rate).toBe(11 / 12);
    expect(r.gates.sample).toBe('insufficient');
  });
  it('空模板和撤回单列，不把 12 个空位当成受试者', () => {
    const f = studyFixture();
    f.exports = {};
    f.manifest.participants.forEach((p, i) => {
      p.status = i ? 'pending' : 'withdrawn';
      p.exports = [];
      p.novice = null;
      p.consent = null;
      p.humanConfirmed = null;
    });
    const r = aggregatePlaytests(f);
    expect(r.cohort.enrolled).toBe(0);
    expect(r.cohort.withdrawn).toBe(1);
    expect(r.completion.rate).toBeNull();
    expect(r.knowledge.medianGainPp).toBeNull();
  });
  it('跳过和不完整前测不作零分；不足 12 对只报告观察值', () => {
    const f = studyFixture();
    first(f).pre = { status: 'skipped', answers: {} };
    f.exports['P01.json']!.events = f.exports['P01.json']!.events.filter(
      (x) => x.eventName !== 'assessment_answered',
    );
    const r = aggregatePlaytests(f);
    expect(r.knowledge.pairedN).toBe(11);
    expect(r.knowledge.preSkipped).toBe(1);
    expect(r.knowledge.preMean).toBe(2);
    expect(r.gates.knowledge).toBe('insufficient');
  });
  it('明细裁剪不改汇总计数；缺终局计时边界不猜时长', () => {
    const f = studyFixture();
    f.exports['P01.json']!.events = [];
    f.exports['P01.json']!.droppedEvents = 10;
    f.exports['P01.json']!.capacityReached = true;
    const r = aggregatePlaytests(f);
    expect(r.counts.rescue_used).toBe(12);
    expect(r.observedEventDistribution.e01).toBe(11);
    expect(r.duration.measuredN).toBe(11);
    expect(r.gates.duration).toBe('insufficient');
    expect(r.detailIncompleteN).toBe(1);
  });
  it('首局中断和重开不被后来的优胜局覆盖；练习/导入局排除', () => {
    const f = studyFixture(1),
      e = f.exports['P01.json']!,
      retry = structuredClone(first(f));
    retry.runId = 'retry';
    retry.startedAt += 1;
    retry.counts = {};
    first(f).ending = null;
    first(f).completed = [1, 2];
    first(f).entered = [1, 2, 3];
    first(f).restarted = 'during';
    first(f).post = { status: 'pending', answers: {} };
    e.events = [];
    e.runs.push(
      retry,
      { ...retry, runId: 'practice', mode: 'practice' },
      { ...retry, runId: 'imported', mode: 'imported', started: false },
    );
    const r = aggregatePlaytests(f);
    expect(r.completion.completed).toBe(0);
    expect(r.completion.additionalRuns).toBe(1);
    expect(r.participants[0]!.excludedPracticeOrImported).toBe(2);
    expect(r.stages[2]!.restartsHere).toBe(1);
    expect(r.stages[2]!.observedDropout24h).toBe(0);
    f.manifest.participants[0]!.primaryRunId = 'retry';
    expect(() => aggregatePlaytests(f)).toThrow('不是首局');
  });
  it('24h 截止区分观察退出、重开与正式终局；恢复后的新时间消除旧观察', () => {
    const f = studyFixture(1),
      e = f.exports['P01.json']!,
      r = first(f);
    r.ending = null;
    r.entered = [1];
    r.completed = [];
    r.post = { status: 'pending', answers: {} };
    e.events = [];
    f.manifest.observationAt = '2026-10-24T00:49:59Z';
    expect(aggregatePlaytests(f).stages[0]!.suspectedDropout).toBe(1);
    f.manifest.observationAt = '2026-10-24T00:50:00Z';
    expect(aggregatePlaytests(f).stages[0]!.observedDropout24h).toBe(1);
    r.lastSeen = Date.parse('2026-10-24T00:40:00Z');
    e.exportedAt = '2026-10-24T00:45:00Z';
    expect(aggregatePlaytests(f).stages[0]!.observedDropout24h).toBe(0);
  });
});
describe('快照去重和输入审计', () => {
  it('重复快照、刷新后快照以及任意文件顺序均不双计费用事件或时长', () => {
    const f = studyFixture(1),
      latest = structuredClone(f.exports['P01.json']!);
    latest.revision++;
    latest.exportedAt = '2026-10-23T02:00:00Z';
    latest.runs[0]!.lastSeen += 60000;
    latest.runs[0]!.activeMs += 60000;
    latest.runs[0]!.stageMs['7']! += 60000;
    f.exports['P01-new.json'] = latest;
    f.exports['P01-copy.json'] = structuredClone(f.exports['P01.json']!);
    f.manifest.participants[0]!.exports = ['P01-new.json', 'P01-copy.json', 'P01.json'];
    const r = aggregatePlaytests(f);
    expect(r.counts.rescue_used).toBe(1);
    expect(r.observedEventDistribution.e01).toBe(1);
    expect(r.participants[0]!.activeMs).toBe(43 * 60000);
    expect(r.duration.medianGameplayMinutes).toBe(35);
    f.manifest.participants[0]!.exports.reverse();
    expect(aggregatePlaytests(f)).toEqual(r);
  });
  it.each(['active', 'answer', 'ending', 'identity', 'event'])('拒绝 %s 快照分叉/回退', (kind) => {
    const f = studyFixture(1),
      e = structuredClone(f.exports['P01.json']!);
    e.exportedAt = '2026-10-23T02:00:00Z';
    const r = e.runs[0]!;
    if (kind === 'active') {
      r.activeMs -= 1;
      r.stageMs['7']! -= 1;
    }
    if (kind === 'answer') r.post.answers = assessmentAnswers('post', 3);
    if (kind === 'ending') r.ending!.kind = 'breakeven';
    if (kind === 'identity') r.seedHash = 'different';
    if (kind === 'event') e.events[0]!.data.extra = true;
    f.exports['P01-new.json'] = e;
    f.manifest.participants[0]!.exports.push('P01-new.json');
    expect(() => aggregatePlaytests(f)).toThrow();
  });
  it.each([
    'version',
    'hash',
    'future',
    'answer',
    'incomplete',
    'stage',
    'time',
    'counts',
    'schema',
  ])('拒绝 %s 损坏或不兼容记录', (kind) => {
    const f = studyFixture(1),
      r = first(f),
      e = f.exports['P01.json']!;
    if (kind === 'version') r.contentVersion = 'old';
    if (kind === 'hash') f.contentSha256 = '0'.repeat(64);
    if (kind === 'future') e.exportedAt = '2027-01-01T00:00:00Z';
    if (kind === 'answer') r.pre.answers.pre_rebate!.correct = false;
    if (kind === 'incomplete') delete r.post.answers.post_rebate;
    if (kind === 'stage') r.completed = [1, 1];
    if (kind === 'time') r.stageMs['1'] = 1;
    if (kind === 'counts') r.counts.rescue_used = 0;
    if (kind === 'schema') Object.assign(e, { schemaVersion: 2 });
    expect(() => aggregatePlaytests(f)).toThrow();
  });
  it('拒绝跨人复制同一局、重复编号、重复文件和有数据的撤回者', () => {
    const f = studyFixture(2);
    f.exports['P02.json'] = structuredClone(f.exports['P01.json']!);
    expect(() => aggregatePlaytests(f)).toThrow('不同参与者');
    f.manifest.participants[1]!.id = 'P01';
    expect(() => aggregatePlaytests(f)).toThrow('重复');
    f.manifest.participants[1]!.id = 'P02';
    f.manifest.participants[1]!.exports = ['P01.json'];
    expect(() => aggregatePlaytests(f)).toThrow('重复');
    f.manifest.participants[1]!.exports = ['P02.json'];
    f.manifest.participants[1]!.status = 'withdrawn';
    expect(() => aggregatePlaytests(f)).toThrow('撤回');
  });
  it('拒绝目录穿越文件名和未确认真人/零基础/同意', () => {
    for (const field of ['novice', 'consent', 'humanConfirmed'] as const) {
      const f = studyFixture(1);
      f.manifest.participants[0]![field] = false;
      expect(() => aggregatePlaytests(f)).toThrow('须确认');
    }
    const f = studyFixture(1);
    f.manifest.participants[0]!.exports = ['../private.json'];
    expect(() => aggregatePlaytests(f)).toThrow();
  });
  it('实际浏览器样本能通过格式验证但不能冒充真人批次', () => {
    const f = studyFixture(1);
    const sample = JSON.parse(readFileSync('tests/fixtures/playtest-browser-export.json', 'utf8'));
    f.exports['P01.json'] = sample;
    expect(() => aggregatePlaytests(f)).toThrow('非真人');
    // 只用于接口兼容性测试，绝不写回或输出去掉标记的样本。
    delete sample.evidenceSource;
    expect(aggregatePlaytests(f).cohort.recorded).toBe(1);
  });
  it('复盘预算覆盖节点、12 事件、结局与两类救援；内容保持原冻结哈希', () => {
    const f = studyFixture(),
      audit = auditReviews(f.pack);
    expect(audit.count).toBeGreaterThan(30);
    expect(audit.overBudget).toBe(0);
    expect(audit.reviews.some((r) => r.path === '/rescue/cashReview')).toBe(true);
    expect(audit.reviews.some((r) => r.path === '/debrief/mentorReview')).toBe(true);
    expect(audit.reviews.filter((r) => r.path.startsWith('/eventReviews/'))).toHaveLength(12);
    expect(auditReviews({ nodes: [{ type: 'review', text: '字'.repeat(121) }] }).overBudget).toBe(
      1,
    );
    expect(f.contentSha256).toBe(f.protocol.contentSha256);
  });
});
