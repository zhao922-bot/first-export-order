import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { studyFixture } from '../fixtures/playtest-study';
const require = createRequire(import.meta.url);
const cli = (args: string[]) =>
  spawnSync(
    process.execPath,
    [require.resolve('tsx/cli'), resolve('scripts/aggregate-playtest.ts'), ...args],
    { encoding: 'utf8', timeout: 25000 },
  );
function setup(n = 12) {
  mkdirSync('work', { recursive: true });
  const dir = mkdtempSync(resolve('work/playtest-cli-')),
    f = studyFixture(n);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(f.manifest));
  for (const [name, value] of Object.entries(f.exports))
    writeFileSync(join(dir, name), JSON.stringify(value));
  return { dir, f, args: [`--manifest=${join(dir, 'manifest.json')}`, `--input=${dir}`] };
}
it('CLI 汇总 12 人测试数据，生成可追溯 JSON/报告/字数清单；拒绝覆盖', { timeout: 60000 }, () => {
  const { dir, args } = setup(),
    out = join(dir, 'report');
  const result = cli([...args, `--out=${out}`, '--require-gates']);
  expect(result.status, result.stderr).toBe(0);
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  expect(summary.cohort.recorded).toBe(12);
  expect(summary.provenance.sources).toHaveLength(12);
  expect(summary.provenance.sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(readFileSync(join(out, 'report.md'), 'utf8')).toContain('33.33');
  expect(JSON.parse(readFileSync(join(out, 'review-budget.json'), 'utf8')).overBudget).toBe(0);
  expect(cli([...args, `--out=${out}`]).status).toBe(1);
  expect(JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'))).toEqual(summary);
});
it('CLI 数值证据不足返回 2，但仍生成报告；未知参数返回 1', { timeout: 60000 }, () => {
  const { dir, args } = setup(1),
    out = join(dir, 'report');
  expect(cli([...args, `--out=${out}`, '--require-gates']).status).toBe(2);
  expect(existsSync(join(out, 'report.md'))).toBe(true);
  expect(cli([...args, '--ignore-bad-data']).status).toBe(1);
});
it('CLI 拒绝坏 JSON 和超限文件，校验失败不创建成功报告', { timeout: 60000 }, () => {
  const { dir, args } = setup(1),
    out = join(dir, 'report');
  writeFileSync(join(dir, 'P01.json'), '{bad');
  expect(cli([...args, `--out=${out}`]).status).toBe(1);
  expect(existsSync(out)).toBe(false);
  writeFileSync(join(dir, 'P01.json'), ' '.repeat(2 * 1024 * 1024 + 1));
  const result = cli([...args, `--out=${out}`]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('超过');
});
