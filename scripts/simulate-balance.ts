import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { contentPackSchema } from '../src/domain/schemas/content';
import { validateContent } from '../src/content/validation';
import { strategies, seedFor, simulateRun, type BalanceRun } from './balance/simulation';
import { writeArtifacts, compact, cashCsv } from './balance/artifacts';
import type { SummaryRun } from './balance/report';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const seeds = Number(args.seeds ?? 1000),
  start = Number(args.start ?? 0);
if (
  !Number.isSafeInteger(seeds) ||
  seeds < 1 ||
  seeds > 10000 ||
  !Number.isSafeInteger(start) ||
  start < 0
)
  throw new Error('--seeds must be 1..10000; --start must be >=0');
const source = fs.readFileSync(
  path.resolve(
    args.content ??
      (args['report-only']
        ? path.join(args.out ?? 'outputs/balance-business', 'content.json')
        : 'src/content/levels/L01-L07.json'),
  ),
  'utf8',
);
const pack = contentPackSchema.parse(JSON.parse(source)),
  validation = validateContent(pack);
if (!validation.ok) throw new Error(JSON.stringify(validation));
const out = path.resolve(args.out ?? 'outputs/balance-business');
fs.mkdirSync(out, { recursive: true });
const workers = args.serial ? 1 : Number(args.workers ?? (seeds >= 50 ? 4 : 1));
if (!Number.isSafeInteger(workers) || workers < 1 || workers > 8)
  throw new Error('--workers must be 1..8');
const probeEnabled = args['probe-errors'] !== '0';
let report;
if (args['report-only']) {
  const read = <T>(name: string): T =>
    JSON.parse(fs.readFileSync(path.join(out, name), 'utf8')) as T;
  const meta = read<{ contentSha256: string; start: number; seeds: number }>('summary.json');
  if (meta.contentSha256 !== createHash('sha256').update(source).digest('hex'))
    throw new Error('Content snapshot hash mismatch');
  const runs = read<SummaryRun[]>('runs.json');
  if (
    runs.length !== meta.seeds * 3 ||
    new Set(runs.map((r) => r.seed + ':' + r.strategy)).size !== runs.length
  )
    throw new Error('Seed coverage incomplete or duplicate');
  report = writeArtifacts(
    out,
    source,
    meta.start,
    meta.seeds,
    runs,
    fs.readFileSync(path.join(out, 'cash-timeline.csv'), 'utf8'),
    read<unknown[]>('failure-seeds.json'),
    fs.existsSync(path.join(out, 'first-mistake-probe.json'))
      ? read<SummaryRun[]>('first-mistake-probe.json')
      : [],
  );
} else if (workers === 1) {
  const runs: BalanceRun[] = [],
    probe: BalanceRun[] = [];
  for (let i = start; i < start + seeds; i++) {
    for (const strategy of strategies) runs.push(simulateRun(pack, seedFor(i), strategy));
    if (probeEnabled)
      probe.push(simulateRun(pack, seedFor(i), 'cautious', { firstQuoteMistake: true }));
    if ((i - start + 1) % 25 === 0 || i === start + seeds - 1)
      console.log(
        `${i - start + 1}/${seeds} seeds; ${runs.length} strategy runs; errors=${runs.filter((r) => r.error).length}`,
      );
  }
  report = writeArtifacts(
    out,
    source,
    start,
    seeds,
    runs.map(compact),
    cashCsv(runs),
    runs
      .filter(
        (r) =>
          r.error ||
          r.ending === 'tuition' ||
          r.ending === 'bankrupt' ||
          r.completion !== 'completed',
      )
      .map(({ cashTimeline, ...run }) => ({ ...run, cashPoints: cashTimeline.length })),
    probe.map(compact),
  );
} else {
  // 子进程只重放真实 reducer，各区间不相交；快照保证并发运行中不会混入编辑后的 JSON。
  const snapshot = path.join(out, 'content.json');
  fs.writeFileSync(snapshot, source);
  const parts: string[] = [];
  const workerCount = Math.min(workers, seeds);
  await Promise.all(
    Array.from({ length: workerCount }, async (_, index) => {
      const begin = start + Math.floor((index * seeds) / workerCount),
        end = start + Math.floor(((index + 1) * seeds) / workerCount);
      if (begin === end) return;
      const part = path.resolve('work', 'balance-parts', path.basename(out), 'part-' + index);
      parts[index] = part;
      fs.mkdirSync(part, { recursive: true });
      const fd = fs.openSync(path.join(part, 'process.log'), 'w');
      console.log(`Worker ${index + 1}: ${seedFor(begin)} .. ${seedFor(end - 1)}`);
      await new Promise<void>((resolve, reject) => {
        const child = fork(
          path.resolve('scripts/simulate-balance.ts'),
          [
            `--seeds=${end - begin}`,
            `--start=${begin}`,
            `--content=${snapshot}`,
            `--out=${part}`,
            '--serial=1',
            `--probe-errors=${probeEnabled ? '1' : '0'}`,
          ],
          { execArgv: process.execArgv, stdio: ['ignore', fd, fd, 'ipc'], windowsHide: true },
        );
        child.once('error', reject);
        child.once('exit', (code) => {
          fs.closeSync(fd);
          if (code !== 0 && code !== 2)
            reject(new Error('Balance worker failed; see ' + path.join(part, 'process.log')));
          else {
            console.log(
              `Worker ${index + 1} complete (${code === 0 ? 'gates pass' : 'see aggregate gates'})`,
            );
            resolve();
          }
        });
      });
    }),
  );
  const read = <T>(part: string, name: string): T =>
    JSON.parse(fs.readFileSync(path.join(part, name), 'utf8')) as T;
  const runs = parts.flatMap((p) => read<SummaryRun[]>(p, 'runs.json'));
  if (
    runs.length !== seeds * 3 ||
    new Set(runs.map((r) => r.seed + ':' + r.strategy)).size !== runs.length
  )
    throw new Error('Parallel seed coverage incomplete or duplicate');
  const probe = parts.flatMap((p) => read<SummaryRun[]>(p, 'first-mistake-probe.json'));
  const failures = parts.flatMap((p) => read<unknown[]>(p, 'failure-seeds.json'));
  const csv = parts
    .map((p, i) => {
      const s = fs.readFileSync(path.join(p, 'cash-timeline.csv'), 'utf8');
      return i === 0 ? s : s.slice(s.indexOf('\n') + 1);
    })
    .join('');
  report = writeArtifacts(out, source, start, seeds, runs, csv, failures, probe);
}
console.log(
  JSON.stringify(
    {
      contentVersion: report.contentVersion,
      totalRuns: report.totalRuns,
      firstMistakeProbe: report.firstMistakeProbe,
      gates: report.gates,
      allAutomatedGatesPassed: report.allAutomatedGatesPassed,
    },
    null,
    2,
  ),
);
console.log('Saved ' + out);
if (!report.gates.noSimulatorErrors || report.firstMistakeProbe.errors) process.exitCode = 1;
else if (!report.allAutomatedGatesPassed && args['require-gates'] !== '0') process.exitCode = 2;
