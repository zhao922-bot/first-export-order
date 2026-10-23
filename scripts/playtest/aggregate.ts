import type { ContentPack } from '../../src/domain/types';
import type { PlaytestRun, TelemetryEvent } from '../../src/telemetry/events';
import { endingKindSchema } from '../../src/domain/schemas/ending';
import { exportSchema, manifestSchema, protocolSchema, type PlaytestExport } from './schema';

const day = 86_400_000;
const kinds = endingKindSchema.options;
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = Object.entries(a),
    y = Object.entries(b);
  return x.length === y.length && x.every(([k, v]) => same(v, (b as Record<string, unknown>)[k]));
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b),
    mid = Math.floor(xs.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
const rate = (n: number, d: number) => (d ? n / d : null);
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
function assessment(run: PlaytestRun, phase: 'pre' | 'post', pack: ContentPack) {
  const value = run[phase],
    questions = pack.playtest!.questions.filter((q) => q.phase === phase);
  for (const [id, answer] of Object.entries(value.answers)) {
    const q = questions.find((q) => q.id === id);
    assert(q && q.options.some((o) => o.id === answer.optionId), `${run.runId}: 未知测评题/选项`);
    assert(
      answer.correct === (answer.optionId === q.answerId),
      `${run.runId}: 答案正确标志与内容不一致`,
    );
  }
  if (value.status === 'completed') {
    assert(
      Object.keys(value.answers).length === questions.length,
      `${run.runId}: 测评未答全却标完成`,
    );
    if (phase === 'post') assert(run.ending, `${run.runId}: 未终局的后测`);
    return questions.filter((q) => value.answers[q.id]?.optionId === q.answerId).length;
  }
  assert(Object.keys(value.answers).length < questions.length, `${run.runId}: 测评状态矛盾`);
  return null;
}
function validateRun(run: PlaytestRun, exportedAt: number, pack: ContentPack) {
  assert(run.runId && run.seedHash, '空 runId / seedHash');
  assert(run.started === (run.mode !== 'imported'), `${run.runId}: 开局与模式矛盾`);
  if (run.mode === 'full') assert(run.entered.includes(1), `${run.runId}: 完整模式缺少第 1 关`);
  assert(
    run.startedAt >= 0 && run.lastSeen >= run.startedAt && run.lastSeen <= exportedAt,
    `${run.runId}: 时间戳倒退/未来记录`,
  );
  const validStages = (stages: number[]) =>
    new Set(stages).size === stages.length &&
    stages.every((s) => Number.isInteger(s) && s >= 1 && s <= 7);
  assert(
    validStages(run.entered) &&
      validStages(run.completed) &&
      run.completed.every((s) => run.entered.includes(s)),
    `${run.runId}: 关卡记录非法`,
  );
  assert(
    Object.keys(run.stageMs).every((s) => /^[1-7]$/.test(s)) &&
      Math.abs(sum(Object.values(run.stageMs)) - run.activeMs) < 1,
    `${run.runId}: 关卡时长与总时长不符`,
  );
  assert(Object.values(run.counts).every(Number.isSafeInteger), `${run.runId}: 事件计数非整数`);
  if (run.ending) {
    assert(
      kinds.some((k) => k === run.ending!.kind) &&
        ['completed', 'lost_order', 'bankrupt'].includes(run.ending.completion),
      `${run.runId}: 未知结局`,
    );
    if (run.ending.completion === 'completed')
      assert(
        [1, 2, 3, 4, 5, 6, 7].every((s) => run.completed.includes(s)),
        `${run.runId}: 未走完七关却标通关`,
      );
  }
  assessment(run, 'pre', pack);
  assessment(run, 'post', pack);
}
/** 快照只前进；冲突必须由组织者核实，禁止静默挑选更好的结果。 */
function assertProgress(old: PlaytestRun, next: PlaytestRun) {
  for (const key of [
    'seedHash',
    'contentVersion',
    'configVersion',
    'started',
    'mode',
    'startedAt',
  ] as const)
    assert(same(old[key], next[key]), `${old.runId}: 快照身份冲突`);
  assert(
    next.activeMs >= old.activeMs &&
      next.lastSeen >= old.lastSeen &&
      old.entered.every((s) => next.entered.includes(s)) &&
      old.completed.every((s) => next.completed.includes(s)) &&
      Object.entries(old.stageMs).every(([s, ms]) => (next.stageMs[s] ?? 0) >= ms) &&
      Object.entries(old.counts).every(([s, n]) => (next.counts[s] ?? 0) >= n),
    `${old.runId}: 快照进度回退`,
  );
  assert(!old.ending || same(old.ending, next.ending), `${old.runId}: 结局冲突`);
  assert(!old.restarted || old.restarted === next.restarted, `${old.runId}: 重开状态冲突`);
  for (const phase of ['pre', 'post'] as const) {
    assert(
      old[phase].status === 'pending' || old[phase].status === next[phase].status,
      `${old.runId}: 测评状态回退`,
    );
    assert(
      Object.entries(old[phase].answers).every(([q, a]) => same(a, next[phase].answers[q])),
      `${old.runId}: 测评答案冲突`,
    );
  }
}

export function aggregatePlaytests(input: {
  manifest: unknown;
  protocol: unknown;
  exports: Record<string, unknown>;
  pack: ContentPack;
  contentSha256: string;
}) {
  const manifest = manifestSchema.parse(input.manifest),
    protocol = protocolSchema.parse(input.protocol);
  assert(
    input.contentSha256 === protocol.contentSha256 &&
      input.pack.contentVersion === protocol.contentVersion &&
      input.pack.playtest?.configVersion === protocol.configVersion,
    '冻结内容哈希/版本不匹配',
  );
  assert(protocol.durationMinutes[0] <= protocol.durationMinutes[1], '时长区间倒置');
  const now = Date.parse(manifest.observationAt),
    warnings: string[] = [],
    runOwners = new Map<string, string>();
  const enrolled = manifest.participants.filter((p) => p.status === 'enrolled');
  const usedFiles = new Set(manifest.participants.flatMap((p) => p.exports));
  for (const name of Object.keys(input.exports))
    assert(usedFiles.has(name), `未在名单登记的输入: ${name}`);
  const participants = enrolled.map((p) => {
    const snapshots: PlaytestExport[] = [];
    for (const file of p.exports) {
      if (!(file in input.exports)) {
        warnings.push(`${p.id}: 缺少文件 ${file}`);
        continue;
      }
      const e = exportSchema.parse(input.exports[file]);
      assert(
        !e.evidenceSource || e.evidenceSource === 'human-playtest',
        `${p.id}: 自动化/非真人样本不能纳入`,
      );
      const exportedAt = Date.parse(e.exportedAt);
      assert(exportedAt <= now, `${p.id}: 导出时间晚于观察截止时间`);
      assert(
        new Set(e.runs.map((r) => r.runId)).size === e.runs.length,
        `${p.id}: 单份导出重复 runId`,
      );
      for (const r of e.runs) {
        assert(
          r.contentVersion === protocol.contentVersion &&
            r.configVersion === protocol.configVersion,
          `${p.id}: 混合内容/指标版本`,
        );
        validateRun(r, exportedAt, input.pack);
        const owner = runOwners.get(r.runId);
        assert(!owner || owner === p.id, `${r.runId}: 同一局分配给不同参与者`);
        runOwners.set(r.runId, p.id);
      }
      for (const event of e.events) {
        const r = e.runs.find((r) => r.runId === event.runId),
          time = Date.parse(event.timestamp);
        assert(
          r &&
            Number.isFinite(time) &&
            time >= r.startedAt &&
            time <= r.lastSeen &&
            event.activeElapsedMs >= 0 &&
            event.activeElapsedMs <= r.activeMs &&
            event.contentVersion === r.contentVersion &&
            event.configVersion === r.configVersion &&
            event.seedHash === r.seedHash &&
            Number.isInteger(event.stage) &&
            event.stage >= 1 &&
            event.stage <= 7,
          `${p.id}: 明细身份/时间不一致`,
        );
        if (event.eventName === 'run_finished')
          assert(
            r.ending &&
              event.data.endingKind === r.ending.kind &&
              event.data.completion === r.ending.completion,
            `${p.id}: 终局明细与汇总冲突`,
          );
        if (event.eventName === 'event_presented' || event.eventName === 'event_resolved')
          assert(
            input.pack.events.some((x) => x.id === event.data.eventType),
            `${p.id}: 未知随机事件`,
          );
        if (event.eventName === 'assessment_answered') {
          const phase = event.data.phase;
          assert(phase === 'pre' || phase === 'post', `${p.id}: 未知测评阶段`);
          const answer = r[phase].answers[String(event.data.itemId)];
          assert(answer && answer.correct === event.data.correct, `${p.id}: 测评明细与答案不符`);
        }
        if (event.eventName === 'mentor_reviewed')
          assert(
            typeof event.data.visibleMs === 'number' && event.data.visibleMs >= 0,
            `${p.id}: 复盘可见时长非法`,
          );
      }
      snapshots.push(e);
    }
    snapshots.sort(
      (a, b) => Date.parse(a.exportedAt) - Date.parse(b.exportedAt) || a.revision - b.revision,
    );
    const runs = new Map<string, PlaytestRun>(),
      events = new Map<string, TelemetryEvent>();
    for (const e of snapshots) {
      for (const r of e.runs) {
        const previous = runs.get(r.runId);
        if (previous) assertProgress(previous, r);
        runs.set(r.runId, r);
      }
      for (const event of e.events) {
        const previous = events.get(event.eventId);
        assert(!previous || same(previous, event), `${p.id}: 重复事件 ID 内容冲突`);
        events.set(event.eventId, event);
      }
    }
    for (const r of runs.values()) {
      const actual: Record<string, number> = {};
      for (const e of events.values())
        if (e.runId === r.runId) actual[e.eventName] = (actual[e.eventName] ?? 0) + 1;
      assert(
        Object.entries(actual).every(([name, n]) => n <= (r.counts[name] ?? 0)),
        `${p.id}: 明细多于汇总计数`,
      );
    }
    const full = [...runs.values()]
      .filter((r) => r.started && r.mode === 'full')
      .sort((a, b) => a.startedAt - b.startedAt || a.runId.localeCompare(b.runId));
    const run = full[0];
    if (p.primaryRunId) assert(run?.runId === p.primaryRunId, `${p.id}: 指定局不是首局，不能择优`);
    if (!run) warnings.push(`${p.id}: 缺少有效首局，保留在纳入分母`);
    const detail = [...events.values()].filter((e) => e.runId === run?.runId);
    const countTotal = run ? sum(Object.values(run.counts)) : 0;
    const detailComplete = Boolean(run && detail.length === countTotal);
    if (run && !detailComplete) warnings.push(`${p.id}: 明细不完整，分类分布只代表保留记录`);
    const finished = detail.filter((e) => e.eventName === 'run_finished');
    assert(finished.length <= 1, `${p.id}: 同一局重复终局事件`);
    const preEvents = detail.filter(
      (e) => e.eventName === 'assessment_answered' && e.data.phase === 'pre',
    );
    for (const phase of ['pre', 'post'] as const) {
      const answered = detail.filter(
        (e) => e.eventName === 'assessment_answered' && e.data.phase === phase,
      );
      assert(
        new Set(answered.map((e) => e.data.itemId)).size === answered.length,
        `${p.id}: 重复测评作答事件`,
      );
    }
    const preScore = run ? assessment(run, 'pre', input.pack) : null;
    const postScore = run ? assessment(run, 'post', input.pack) : null;
    // 从活动时钟中扣除前测和终局后的后测/补学，缺关键明细时不伪造经营用时。
    const preEnd =
      run?.pre.status === 'completed'
        ? preEvents.length === 6
          ? Math.max(...preEvents.map((e) => e.activeElapsedMs))
          : null
        : run?.pre.status === 'skipped' && Object.keys(run.pre.answers).length === 0
          ? 0
          : null;
    const end = finished[0]?.activeElapsedMs;
    const gameMs = end !== undefined && preEnd !== null ? end - preEnd : null;
    assert(gameMs === null || gameMs >= 0, `${p.id}: 前测晚于终局`);
    const complete = run?.ending?.completion === 'completed';
    if (complete && gameMs === null) warnings.push(`${p.id}: 缺少计时边界，不能判定经营时长`);
    return {
      id: p.id,
      device: p.device,
      primaryRunId: run?.runId ?? null,
      filesReceived: snapshots.length,
      allFullRuns: full.length,
      additionalRuns: Math.max(0, full.length - 1),
      excludedPracticeOrImported: runs.size - full.length,
      completed: Boolean(complete),
      ending: run?.ending ?? null,
      restarted: run?.restarted ?? null,
      activeMs: run?.activeMs ?? null,
      gameplayMs: gameMs,
      rawStageMs: run?.stageMs ?? {},
      entered: run?.entered ?? [],
      completedStages: run?.completed ?? [],
      lastSeen: run?.lastSeen ?? null,
      preStatus: run?.pre.status ?? 'missing',
      postStatus: run?.post.status ?? 'missing',
      preScore,
      postScore,
      gainPp: preScore !== null && postScore !== null ? ((postScore - preScore) * 100) / 6 : null,
      counts: run?.counts ?? {},
      detailComplete,
      droppedEvents: Math.max(0, ...snapshots.map((e) => e.droppedEvents)),
      capacityReached: snapshots.some((e) => e.capacityReached),
      eventDistribution: countBy(
        detail
          .filter((e) => e.eventName === 'event_presented')
          .map((e) => String(e.data.eventType)),
      ),
      mentorVisibleMs: sum(
        detail
          .filter((e) => e.eventName === 'mentor_reviewed')
          .map((e) => Number(e.data.visibleMs) || 0),
      ),
    };
  });
  const recorded = participants.filter((p) => p.primaryRunId),
    completed = participants.filter((p) => p.completed);
  const gains = participants.flatMap((p) => (p.gainPp === null ? [] : [p.gainPp]));
  const durations = completed.flatMap((p) => (p.gameplayMs === null ? [] : [p.gameplayMs / 60000]));
  const medianGain = median(gains),
    medianDuration = median(durations);
  const completionRate = rate(completed.length, enrolled.length);
  const enough = recorded.length >= protocol.minimumParticipants;
  const gate = (ready: boolean, pass: boolean) =>
    !ready ? 'insufficient' : pass ? 'pass' : 'fail';
  const gates = {
    sample: gate(enough, enough),
    completion: gate(enough, completionRate !== null && completionRate >= protocol.completionRate),
    knowledge: gate(
      enough && gains.length >= protocol.minimumPaired,
      medianGain !== null && medianGain >= protocol.medianGainPp,
    ),
    duration: gate(
      enough && durations.length > 0 && durations.length === completed.length,
      medianDuration !== null &&
        medianDuration >= protocol.durationMinutes[0] &&
        medianDuration <= protocol.durationMinutes[1],
    ),
  };
  return {
    format: 'first-export-human-study-summary',
    studyId: manifest.studyId,
    observationAt: manifest.observationAt,
    protocol,
    releaseDecision: 'pending-human-review',
    studyStatus: Object.values(gates).includes('fail')
      ? 'threshold-not-met'
      : Object.values(gates).includes('insufficient')
        ? 'insufficient-evidence'
        : 'numeric-thresholds-met',
    gates,
    cohort: {
      slots: manifest.participants.length,
      enrolled: enrolled.length,
      pending: manifest.participants.filter((p) => p.status === 'pending').length,
      withdrawn: manifest.participants.filter((p) => p.status === 'withdrawn').length,
      recorded: recorded.length,
      missing: enrolled.length - recorded.length,
    },
    completion: {
      completed: completed.length,
      rate: completionRate,
      anyEnding: participants.filter((p) => p.ending).length,
      endings: Object.fromEntries(
        kinds.map((kind) => [kind, participants.filter((p) => p.ending?.kind === kind).length]),
      ),
      restartedDuring: participants.filter((p) => p.restarted === 'during').length,
      restartedAfter: participants.filter((p) => p.restarted === 'after').length,
      additionalRuns: sum(participants.map((p) => p.additionalRuns)),
    },
    knowledge: {
      pairedN: gains.length,
      unpaired: enrolled.length - gains.length,
      medianGainPp: medianGain,
      preSkipped: participants.filter((p) => p.preStatus === 'skipped').length,
      preSkipRate: rate(
        participants.filter((p) => p.preStatus === 'skipped').length,
        recorded.length,
      ),
      postEligible: participants.filter((p) => p.ending).length,
      postSkipped: participants.filter((p) => p.postStatus === 'skipped').length,
      postSkipRate: rate(
        participants.filter((p) => p.postStatus === 'skipped').length,
        participants.filter((p) => p.ending).length,
      ),
      preMean: mean(participants.flatMap((p) => (p.gainPp === null ? [] : [p.preScore!]))),
      postMean: mean(participants.flatMap((p) => (p.gainPp === null ? [] : [p.postScore!]))),
    },
    duration: {
      completedN: completed.length,
      measuredN: durations.length,
      medianGameplayMinutes: medianDuration,
    },
    stages: Array.from({ length: 7 }, (_, i) => {
      const stage = i + 1,
        entered = participants.filter((p) => p.entered.includes(stage));
      const incomplete = entered.filter(
        (p) => !p.completedStages.includes(stage) && !p.ending && !p.restarted,
      );
      return {
        stage,
        entered: entered.length,
        completed: entered.filter((p) => p.completedStages.includes(stage)).length,
        medianRawActiveMinutes: median(
          entered.map((p) => (p.rawStageMs[String(stage)] ?? 0) / 60000),
        ),
        suspectedDropout: incomplete.filter((p) => now - p.lastSeen! < day).length,
        observedDropout24h: incomplete.filter((p) => now - p.lastSeen! >= day).length,
        formalEndingsHere: entered.filter((p) => p.ending && !p.completedStages.includes(stage))
          .length,
        restartsHere: entered.filter(
          (p) => p.restarted === 'during' && !p.completedStages.includes(stage),
        ).length,
      };
    }),
    counts: mergeCounts(participants.map((p) => p.counts)),
    observedEventDistribution: {
      ...Object.fromEntries(input.pack.events.map((e) => [e.id, 0])),
      ...mergeCounts(participants.map((p) => p.eventDistribution)),
    },
    detailIncompleteN: recorded.filter((p) => !p.detailComplete).length,
    warnings: [...new Set(warnings)].sort(),
    participants,
    limitations: [
      '真人、零基础与同一构建由组织者确认；导出无签名且不含内容哈希，不能独立证明来源。',
      '首局每人一次；未交数据仍在纳入分母；重开不替换首局；撤回与待招募单列。',
      '知识提升按六题原始分差 ×100/6，取个人提升中位数；跳过不作零分。',
      '经营时长扣除完整前测与终局后活动；缺少边界不估算。各关原始时长仍含测评/复盘。',
      '24 小时流失只表示截至最新提交快照的观察，须人工确认有无尚未提交的恢复。',
      '事件分类与复盘阅读只按保留明细；汇总计数不因重复导出累加。',
      '数值门槛通过不能替代专业签核、反馈缺陷关闭或发布授权。',
    ],
  };
}
function mean(xs: number[]) {
  return xs.length ? sum(xs) / xs.length : null;
}
function countBy(xs: string[]) {
  const counts: Record<string, number> = Object.create(null);
  for (const x of xs) counts[x] = (counts[x] ?? 0) + 1;
  return counts;
}
function mergeCounts(items: Record<string, number>[]) {
  const counts: Record<string, number> = Object.create(null);
  for (const item of items)
    for (const [k, n] of Object.entries(item)) counts[k] = (counts[k] ?? 0) + n;
  return counts;
}
export type StudySummary = ReturnType<typeof aggregatePlaytests>;
