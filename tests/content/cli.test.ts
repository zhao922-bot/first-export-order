import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import sample from '../fixtures/scaffold.json';

const require = createRequire(import.meta.url);
// Windows 启动独立 tsx 进程在并发检查下可能超过 5 秒；仍校验真实退出码和定位信息。
it('CLI 对缺失节点返回非零退出码，并输出定位信息', { timeout: 15000 }, () => {
  const root = resolve('work');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'content-validator-'));
  const file = join(dir, 'invalid.json');
  writeFileSync(file, JSON.stringify({ ...sample, entryNodeIds: ['missing_entry'] }));
  const result = spawnSync(
    process.execPath,
    [require.resolve('tsx/cli'), resolve('scripts/validate-content.ts'), '--file', file],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('#/entryNodeIds/0');
  expect(result.stderr).toContain('missing_entry');
});
