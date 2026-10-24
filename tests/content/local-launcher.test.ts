import { expect, it } from 'vitest';
import { mkdtemp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { buildPackage } from '../../scripts/local-playtest/package';

async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
it.skipIf(process.platform !== 'win32')(
  '解压后的 CMD 在中文/空格目录、无 Node/pnpm PATH 下启动；冲突可读、停止后可再次启动',
  { timeout: 60000 },
  async () => {
    await mkdir('work', { recursive: true });
    const dir = await mkdtemp(resolve('work/一键 空格-'));
    const runtimeDir = join(dir, 'runtime-test'),
      web = join(dir, 'web-test');
    await mkdir(runtimeDir);
    await mkdir(web);
    // 用当前测试进程的运行时检验启动脚本；发行包的固定运行时另由制包校验和浏览器测试验证。
    await copyFile(process.execPath, join(runtimeDir, 'node.exe'));
    await writeFile(join(runtimeDir, 'LICENSE'), 'TEST FIXTURE ONLY');
    await writeFile(join(web, 'index.html'), '<h1>launcher fixture</h1>');
    const out = join(dir, '试玩包 空格');
    await buildPackage({ root: resolve('.'), out, web, runtimeDir, licenses: 'TEST ONLY' });
    const port = await freePort(),
      children: ReturnType<typeof spawn>[] = [];
    const launch = (name: string) => {
      const child = spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `""${join(out, name)}" --no-open --port=${port}"`],
        {
          cwd: resolve('.'),
          windowsVerbatimArguments: true,
          windowsHide: true,
          env: {
            ...process.env,
            PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
            PLAYTEST_NO_PAUSE: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.push(child);
      let text = '';
      child.stdout.on('data', (x) => (text += x.toString()));
      child.stderr.on('data', (x) => (text += x.toString()));
      return { child, text: () => text };
    };
    const stop = async (child: ReturnType<typeof spawn>) => {
      if (child.exitCode !== null || !child.pid) return;
      await new Promise<void>((done) =>
        execFile(
          'taskkill.exe',
          ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true },
          () => done(),
        ),
      );
    };
    try {
      const first = launch('START-LOCAL.cmd');
      await expect.poll(first.text, { timeout: 15000 }).toContain('READY');
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('launcher fixture');
      // LAN smoke is explicit: a new temporary node.exe path otherwise triggers
      // another Windows firewall consent dialog on every normal pnpm test run.
      const restartScript =
        process.env.PLAYTEST_LAN_SMOKE === '1' ? 'START-PHONE.cmd' : 'START-LOCAL.cmd';
      const second = launch(restartScript);
      await expect.poll(() => second.child.exitCode, { timeout: 15000 }).toBe(1);
      expect(second.text()).toContain('已被占用');
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
      await stop(first.child);
      const restarted = launch(restartScript);
      await expect.poll(restarted.text, { timeout: 15000 }).toContain('READY');
      expect(restarted.text()).toContain(
        process.env.PLAYTEST_LAN_SMOKE === '1' ? '手机与电脑' : '当前仅本机可访问',
      );
    } finally {
      for (const child of children) await stop(child);
    }
  },
);
