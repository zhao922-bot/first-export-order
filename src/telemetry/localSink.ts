import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import {
  telemetrySchema,
  type TelemetryData,
  type PlaytestRun,
  type TelemetryEvent,
  type Phase,
} from './events';
import { ActiveClock } from './activeClock';
import { calculateMetrics } from './metrics';

export const telemetryKey = 'first-export.playtest.v1';
export const maxTelemetryBytes = 256 * 1024;
const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};
const empty = (): TelemetryData => ({
  schemaVersion: 1,
  revision: 0,
  runs: [],
  events: [],
  droppedEvents: 0,
  capacityReached: false,
});
/** 存储失败隔离于游戏事务；只记录白名单字段，没有草稿、自由文本或答案文本。 */
export function createLocalSink(options: {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  pack: ContentPack;
  sessionId: string;
  now?: () => number;
  monotonic?: () => number;
}) {
  const now = options.now ?? Date.now,
    clock = new ActiveClock(options.monotonic ?? now, options.pack.playtest?.idleMs);
  let data = empty(),
    raw: string | null = null,
    notice = '',
    blocked = false,
    conflict = false,
    dirty = false,
    visible = false;
  const timeDeltas = new Map<string, Record<string, number>>();
  let current: SliceSession | null = null,
    run: PlaytestRun | undefined,
    serial = 0,
    visibleMs = 0,
    nodeShown = false;
  try {
    raw = options.storage().getItem(telemetryKey);
    if (raw) {
      if (new TextEncoder().encode(raw).length > maxTelemetryBytes) throw Error('size');
      data = telemetrySchema.parse(JSON.parse(raw));
    }
  } catch {
    blocked = true;
    notice = '试玩记录无法读取，已保留原数据；本页可继续试玩并导出新记录。';
  }
  function persist() {
    if (!dirty) return;
    while (data.events.length > 2000 || size(data) > maxTelemetryBytes) {
      if (!data.events.length) {
        data.capacityReached = true;
        notice = '试玩汇总已满，请导出后清理记录。';
        return;
      }
      data.events.shift();
      data.droppedEvents++;
      data.capacityReached = true;
    }
    if (data.capacityReached) notice = '试玩明细达到上限，较早明细已移除，汇总仍保留；请导出记录。';
    if (blocked || conflict) return;
    try {
      if (options.storage().getItem(telemetryKey) !== raw) {
        conflict = true;
        clock.visibility(false);
        notice = '另一标签页已更新试玩记录，本页暂停记录；刷新后继续。';
        return;
      }
      data.revision++;
      const next = JSON.stringify(data);
      options.storage().setItem(telemetryKey, next);
      raw = next;
      dirty = false;
      timeDeltas.clear();
    } catch {
      blocked = true;
      notice = '试玩记录暂时无法保存；可导出本页记录，游戏操作不受影响。';
    }
  }
  function addTime(ms: number) {
    if (conflict || !run || !current || !ms) return;
    run.activeMs += ms;
    const stage = String(current.snapshot.story.stage);
    run.stageMs[stage] = (run.stageMs[stage] ?? 0) + ms;
    if (nodeShown) visibleMs += ms;
    run.lastSeen = now();
    dirty = true;
    const delta = timeDeltas.get(run.runId) ?? {};
    delta[stage] = (delta[stage] ?? 0) + ms;
    timeDeltas.set(run.runId, delta);
  }
  function flush() {
    addTime(clock.tick());
    persist();
  }
  function record(eventName: string, fields: TelemetryEvent['data'] = {}) {
    if (conflict || !run || !current) return;
    run.counts[eventName] = (run.counts[eventName] ?? 0) + 1;
    run.lastSeen = now();
    dirty = true;
    data.events.push({
      eventId: options.sessionId + '.' + ++serial,
      runId: run.runId,
      sessionId: options.sessionId,
      eventName,
      timestamp: new Date(now()).toISOString(),
      activeElapsedMs: run.activeMs,
      stage: current.snapshot.story.stage,
      nodeId: current.snapshot.story.nodeId,
      seedHash: run.seedHash,
      contentVersion: run.contentVersion,
      configVersion: run.configVersion,
      schemaVersion: 1,
      data: fields,
    });
  }
  function stageEntered(stage: number) {
    if (run && !run.entered.includes(stage)) {
      run.entered.push(stage);
      record('stage_entered', { stage });
    }
  }
  function attach(s: SliceSession, mode: PlaytestRun['mode'] = 'imported', pre = false) {
    if (conflict) return;
    addTime(clock.tick());
    current = s;
    visibleMs = 0;
    run = data.runs.find((r) => r.runId === s.snapshot.runId);
    if (!run) {
      if (data.runs.length >= 40) {
        data.capacityReached = true;
        dirty = true;
        persist();
        notice = '已达 40 局汇总上限，新局未纳入统计；请导出并清理试玩记录。';
        return;
      }
      run = {
        runId: s.snapshot.runId,
        seedHash: hash(s.snapshot.story.seed),
        contentVersion: s.contentVersion,
        configVersion: options.pack.playtest?.configVersion ?? 'none',
        started: mode !== 'imported',
        mode,
        startedAt: now(),
        lastSeen: now(),
        activeMs: 0,
        stageMs: {},
        entered: [],
        completed: [],
        ending: null,
        restarted: null,
        counts: {},
        pre: {
          status:
            mode === 'imported' || mode === 'practice'
              ? 'unavailable'
              : pre
                ? 'pending'
                : 'skipped',
          answers: {},
        },
        post: { status: mode === 'practice' ? 'unavailable' : 'pending', answers: {} },
      };
      data.runs.push(run);
      if (run.started) record('run_started', { productMode: mode, isFirstRun: s.firstInquiryRun });
      if (run.pre.status === 'skipped') record('assessment_skipped', { phase: 'pre' });
    }
    if (mode === 'imported')
      record('run_resumed', {
        saveRevision: s.snapshot.revision,
        resumeStage: s.snapshot.story.stage,
      });
    stageEntered(s.snapshot.story.stage);
    if (s.ending) finish(s);
    persist();
  }
  function finish(s: SliceSession) {
    if (!run || run.ending || !s.ending) return;
    const result = s.ending.result;
    run.ending = { kind: result.kind, completion: result.completion, scores: result.scores };
    if (result.completion === 'completed' && !run.completed.includes(7)) {
      run.completed.push(7);
      record('stage_completed', { stage: 7, durationActiveMs: run.stageMs['7'] ?? 0 });
    }
    record('run_finished', {
      endingKind: result.kind,
      completion: result.completion,
      ...result.scores,
    });
  }
  function transition(before: SliceSession, after: SliceSession, type: string) {
    if (conflict || !run || before === after) return;
    addTime(clock.tick());
    const previousNode = options.pack.nodes.find((n) => n.id === before.snapshot.story.nodeId);
    if (type === 'advance' && previousNode?.type === 'review' && !before.feedback)
      record('mentor_reviewed', { reviewId: previousNode.id, visibleMs });
    if (before.rescue?.pending?.phase === 'mentor' && after.rescue?.pending?.phase !== 'mentor')
      record('mentor_reviewed', { reviewId: 'rescue.' + before.rescue.pending.reason, visibleMs });
    const changed =
      before.snapshot.story.nodeId !== after.snapshot.story.nodeId ||
      Boolean(before.feedback) !== Boolean(after.feedback) ||
      before.rescue?.pending?.phase !== after.rescue?.pending?.phase;
    current = after;
    if (changed) visibleMs = 0;
    if (run.pre.status === 'pending') skip('pre');
    // Draft edits carry no business event. Accrued active time is batched by the
    // existing timer/blur/export, not serialized once per key.
    if (['draft', 'correctDocument', 'editDeclaration'].includes(type)) return;
    const stage = before.snapshot.story.stage;
    if (stage !== after.snapshot.story.stage) {
      if (!run.completed.includes(stage)) {
        run.completed.push(stage);
        record('stage_completed', { stage, durationActiveMs: run.stageMs[String(stage)] ?? 0 });
      }
      stageEntered(after.snapshot.story.stage);
    }
    const decision = after.snapshot.story.decisionLog.at(-1);
    if (decision && decision.id !== before.snapshot.story.decisionLog.at(-1)?.id) {
      record('choice_committed', {
        choiceId: decision.choiceId,
        riskTag: decision.majorRisk ?? false,
        ...decision.deltas,
      });
      if (decision.choiceId === 'documents_submit')
        record('document_submitted', {
          attempt: after.collection!.attempts,
          missed: after.collection!.omissions.length,
          falsePositive: after.collection!.falsePositives.length,
          found: after.collection!.marks.length - after.collection!.falsePositives.length,
        });
    }
    if (type === 'submit')
      record('quote_submitted', {
        attempt: (run.counts.quote_submitted ?? 0) + 1,
        correct: after.fieldErrors.length === 0 && decision?.choiceId === 'quote.correct',
        errorCode: after.fieldErrors.map((e) => e.code).join(','),
      });
    const oldPending = before.snapshot.story.pendingEvent,
      pending = after.snapshot.story.pendingEvent;
    if (pending && oldPending?.eventId !== pending.eventId)
      record('event_presented', { eventType: pending.eventId });
    if (oldPending && !pending)
      record('event_resolved', {
        eventType: oldPending.eventId,
        choiceId:
          [...after.snapshot.story.decisionLog]
            .reverse()
            .find((d) => d.familyId === oldPending.eventId)?.choiceId ?? '',
      });
    if (after.rescue?.pending && !before.rescue?.pending)
      record('rescue_offered', {
        reason: after.rescue.pending.reason,
        checkpointId: after.rescue.pending.checkpointId,
      });
    if ((after.rescue?.history.length ?? 0) > (before.rescue?.history.length ?? 0)) {
      const h = after.rescue!.history.at(-1)!;
      record(
        h.outcome === 'used'
          ? 'rescue_used'
          : h.outcome === 'declined'
            ? 'rescue_declined'
            : 'rescue_returned',
        {
          reason: h.reason,
          checkpointId: h.checkpointId,
        },
      );
    }
    for (const e of after.learning.events.slice(before.learning.events.length))
      record(e.type, { termId: e.termId });
    finish(after);
    persist();
  }
  function skip(phase: Phase) {
    if (conflict || !run || run[phase].status !== 'pending') return;
    if (phase === 'post' && !current?.ending) return;
    run[phase].status = 'skipped';
    record('assessment_skipped', { phase });
    persist();
  }
  function answer(phase: Phase, itemId: string, optionId: string): boolean {
    if (
      conflict ||
      !run ||
      !current ||
      run[phase].status !== 'pending' ||
      (phase === 'post' && !current.ending)
    )
      return false;
    if (
      phase === 'pre' &&
      (current.snapshot.story.decisionLog.length || current.learning.events.length)
    ) {
      skip('pre');
      return false;
    }
    const q = options.pack.playtest?.questions.find((q) => q.id === itemId && q.phase === phase);
    if (!q || !q.options.some((o) => o.id === optionId) || run[phase].answers[itemId]) return false;
    addTime(clock.tick());
    run[phase].answers[itemId] = { optionId, correct: q.answerId === optionId };
    record('assessment_answered', {
      itemId,
      knowledgeId: q.knowledgeId,
      correct: q.answerId === optionId,
      phase,
    });
    if (
      options.pack
        .playtest!.questions.filter((q) => q.phase === phase)
        .every((q) => run![phase].answers[q.id])
    )
      run[phase].status = 'completed';
    persist();
    return true;
  }
  return {
    /** Call under the same cross-tab mutex as mutations. Only unflushed time can
     * exist between operations; merge that delta without replacing newer events. */
    synchronize() {
      if (blocked) return;
      try {
        const latest = options.storage().getItem(telemetryKey);
        if (latest === raw) return;
        if (latest && new TextEncoder().encode(latest).length > maxTelemetryBytes)
          throw Error('size');
        const next = latest ? telemetrySchema.parse(JSON.parse(latest)) : empty();
        for (const [id, stages] of timeDeltas) {
          const target = next.runs.find((r) => r.runId === id);
          if (!target) continue;
          for (const [stage, ms] of Object.entries(stages)) {
            target.activeMs += ms;
            target.stageMs[stage] = (target.stageMs[stage] ?? 0) + ms;
          }
          target.lastSeen = now();
        }
        data = next;
        raw = latest;
        run = current ? data.runs.find((r) => r.runId === current!.snapshot.runId) : undefined;
        conflict = false;
        dirty = timeDeltas.size > 0;
        notice = '';
      } catch {
        blocked = true;
        notice = '试玩记录无法读取，已保留原数据；本页可继续试玩并导出新记录。';
      }
    },
    attach,
    transition,
    answer,
    skip,
    flush,
    surface(shown: boolean) {
      addTime(clock.tick());
      if (shown !== nodeShown) visibleMs = 0;
      nodeShown = shown;
    },
    clear() {
      try {
        options.storage().setItem(telemetryKey, JSON.stringify(empty()));
      } catch {
        notice = '无法清理试玩记录，请先导出。';
        return;
      }
      data = empty();
      raw = JSON.stringify(data);
      blocked = false;
      conflict = false;
      notice = '';
      run = undefined;
      current = null;
      dirty = false;
      timeDeltas.clear();
    },
    restart() {
      if (!conflict && run) {
        addTime(clock.tick());
        run.restarted = run.ending ? 'after' : 'during';
        record('run_restarted', {
          previousStage: current!.snapshot.story.stage,
          previousEnding: run.ending?.kind ?? null,
        });
        persist();
      }
    },
    interact() {
      addTime(clock.interact());
    },
    observeVisibility(shown: boolean) {
      addTime(clock.visibility(shown && !conflict));
    },
    visibility(shown: boolean, updateClock = true) {
      if (updateClock) addTime(clock.visibility(shown && !conflict));
      if (visible && !shown) record('session_suspended');
      visible = shown;
      persist();
    },
    failure(errorCode: string, revision: number) {
      record('save_failed', { errorCode, revision });
      persist();
    },
    view() {
      return {
        run: run ? structuredClone(run) : null,
        metrics: calculateMetrics(data, now()),
        notice,
      };
    },
    export() {
      flush();
      return JSON.stringify(
        {
          format: 'first-export-playtest',
          exportedAt: new Date(now()).toISOString(),
          limitations:
            '仅本浏览器匿名教学记录；刷新、离线间隔和闲置不计时；练习与导入局不纳入完整试玩分母；不证明真实学习效果。',
          ...data,
          metrics: calculateMetrics(data, now()),
        },
        null,
        2,
      );
    },
  };
}
