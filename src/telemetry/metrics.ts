import type { TelemetryData } from './events';
export function calculateMetrics(data: TelemetryData, now = Date.now()) {
  const full = data.runs.filter((r) => r.started && r.mode === 'full');
  const paired = full.filter((r) => r.pre.status === 'completed' && r.post.status === 'completed');
  const score = (answers: (typeof paired)[number]['pre']['answers']) =>
    Object.values(answers).filter((a) => a.correct).length;
  const rate = (n: number, d: number) => (d ? n / d : null);
  const completed = full.filter((r) => r.ending?.completion === 'completed').length;
  const ended = full.filter((r) => r.ending).length;
  const restarted = full.filter((r) => r.restarted).length;
  return {
    observationAt: new Date(now).toISOString(),
    startedRuns: full.length,
    completedRuns: completed,
    completionRate: rate(completed, full.length),
    endedRuns: ended,
    anyEndingRate: rate(ended, full.length),
    restartedRuns: restarted,
    restartRate: rate(restarted, full.length),
    restartsDuring: full.filter((r) => r.restarted === 'during').length,
    restartsAfterEnding: full.filter((r) => r.restarted === 'after').length,
    excludedPracticeOrImported: data.runs.length - full.length,
    activeMs: full.reduce((sum, r) => sum + r.activeMs, 0),
    stages: Array.from({ length: 7 }, (_, i) => {
      const stage = i + 1,
        entered = full.filter((r) => r.entered.includes(stage));
      const incomplete = entered.filter(
        (r) => !r.completed.includes(stage) && !r.ending && !r.restarted,
      );
      return {
        stage,
        entered: entered.length,
        completed: entered.filter((r) => r.completed.includes(stage)).length,
        activeMs: entered.reduce((sum, r) => sum + (r.stageMs[String(stage)] ?? 0), 0),
        suspectedDropout: incomplete.filter((r) => now - r.lastSeen < 86400000).length,
        observedDropout24h: incomplete.filter((r) => now - r.lastSeen >= 86400000).length,
      };
    }),
    knowledge: {
      pairedN: paired.length,
      preMean: paired.length
        ? paired.reduce((sum, r) => sum + score(r.pre.answers), 0) / paired.length
        : null,
      postMean: paired.length
        ? paired.reduce((sum, r) => sum + score(r.post.answers), 0) / paired.length
        : null,
      improvementPoints: paired.length
        ? paired.reduce((sum, r) => sum + score(r.post.answers) - score(r.pre.answers), 0) /
          paired.length
        : null,
      preSkipped: full.filter((r) => r.pre.status === 'skipped').length,
      preSkipRate: rate(full.filter((r) => r.pre.status === 'skipped').length, full.length),
      postEligible: ended,
      postSkipped: full.filter((r) => r.ending && r.post.status === 'skipped').length,
      postSkipRate: rate(full.filter((r) => r.ending && r.post.status === 'skipped').length, ended),
      pendingOrUnpaired: full.length - paired.length,
    },
    droppedEvents: data.droppedEvents,
    capacityReached: data.capacityReached,
  };
}
