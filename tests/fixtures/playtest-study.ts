import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eventPack } from './economy';
import protocol from '../../docs/playtest/protocol.json';
import type { Manifest, PlaytestExport } from '../../scripts/playtest/schema';
import type { PlaytestRun, TelemetryEvent } from '../../src/telemetry/events';

export const studyPack = eventPack;
export const contentSha256 = createHash('sha256')
  .update(readFileSync('src/content/levels/L01-L07.json'))
  .digest('hex');
export function assessmentAnswers(phase: 'pre' | 'post', correct: number) {
  return Object.fromEntries(
    studyPack
      .playtest!.questions.filter((q) => q.phase === phase)
      .map((q, i) => {
        const optionId = i < correct ? q.answerId : q.options.find((o) => o.id !== q.answerId)!.id;
        return [q.id, { optionId, correct: i < correct }];
      }),
  );
}
/** 仅为单元测试造数，不输出为真人证据。 */
export function studyFixture(n = 12) {
  const start = Date.parse('2026-10-23T00:00:00Z'),
    exports: Record<string, PlaytestExport> = {};
  const manifest: Manifest = {
    studyId: 'unit-only',
    protocolVersion: 'human-playtest-1',
    observationAt: '2026-10-25T00:00:00Z',
    participants: [],
  };
  for (let i = 0; i < n; i++) {
    const id = `P${String(i + 1).padStart(2, '0')}`,
      file = `${id}.json`,
      runId = `run.unit.${id}`;
    const run: PlaytestRun = {
      runId,
      seedHash: 'abc',
      contentVersion: protocol.contentVersion,
      configVersion: protocol.configVersion,
      started: true,
      mode: 'full',
      startedAt: start,
      lastSeen: start + 50 * 60000,
      activeMs: 42 * 60000,
      stageMs: {
        '1': 7 * 60000,
        '2': 5 * 60000,
        '3': 5 * 60000,
        '4': 5 * 60000,
        '5': 5 * 60000,
        '6': 5 * 60000,
        '7': 10 * 60000,
      },
      entered: [1, 2, 3, 4, 5, 6, 7],
      completed: [1, 2, 3, 4, 5, 6, 7],
      ending: {
        kind: 'excellent',
        completion: 'completed',
        scores: { profit: 80, risk: 80, professionalism: 80, relationship: 80, compliance: 80 },
      },
      restarted: null,
      counts: {},
      pre: { status: 'completed', answers: assessmentAnswers('pre', 2) },
      post: { status: 'completed', answers: assessmentAnswers('post', 4) },
    };
    const events: TelemetryEvent[] = [];
    const add = (name: string, ms: number, data: TelemetryEvent['data']) => {
      events.push({
        eventId: `${id}.${events.length}`,
        runId,
        sessionId: id,
        eventName: name,
        timestamp: new Date(start + ms).toISOString(),
        activeElapsedMs: ms,
        stage: name === 'run_finished' ? 7 : 1,
        nodeId: 'L01.product',
        seedHash: 'abc',
        contentVersion: protocol.contentVersion,
        configVersion: protocol.configVersion,
        schemaVersion: 1,
        data,
      });
      run.counts[name] = (run.counts[name] ?? 0) + 1;
    };
    Object.keys(run.pre.answers).forEach((itemId, j) =>
      add('assessment_answered', (j + 1) * 20000, {
        phase: 'pre',
        itemId,
        correct: run.pre.answers[itemId]!.correct,
      }),
    );
    add('event_presented', 4 * 60000, { eventType: 'e01' });
    add('rescue_used', 8 * 60000, { checkpointId: 'checkpoint.unit' });
    add('mentor_reviewed', 9 * 60000, { visibleMs: 10000 });
    add('run_finished', 37 * 60000, { completion: 'completed', endingKind: 'excellent' });
    exports[file] = {
      format: 'first-export-playtest',
      exportedAt: '2026-10-23T01:00:00Z',
      limitations: 'SYNTHETIC UNIT TEST',
      schemaVersion: 1,
      revision: 10,
      runs: [run],
      events,
      droppedEvents: 0,
      capacityReached: false,
      metrics: { completionRate: 999 },
    };
    manifest.participants.push({
      id,
      status: 'enrolled',
      novice: true,
      consent: true,
      humanConfirmed: true,
      device: i < 6 ? 'desktop' : 'mobile',
      exports: [file],
      primaryRunId: null,
    });
  }
  return { manifest, protocol: structuredClone(protocol), exports, pack: studyPack, contentSha256 };
}
