import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { request, type Server } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';
import {
  loadPackage,
  makeServer,
  listen,
  parseOptions,
  isPrivateIPv4,
  lanAddresses,
  type PackageManifest,
} from '../../scripts/local-playtest/server';
import { hash, buildPackage } from '../../scripts/local-playtest/package';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
});
async function start(lan = false) {
  const server = makeServer(
    new Map([
      ['/index.html', Buffer.from('<h1>出海第一单</h1>')],
      ['/assets/app.js', Buffer.from('export const ok=true;')],
    ]),
    lan,
    [{ name: 'Wi-Fi', address: '192.168.1.3' }],
  );
  servers.push(server);
  const port = await listen(server, 0, lan);
  return { server, port };
}
function get(port: number, path = '/', method = 'GET', host = `127.0.0.1:${port}`) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
    (done, fail) => {
      const req = request(
        { host: '127.0.0.1', port, path, method, headers: { Host: host } },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (x) => (body += x));
          res.on('end', () => done({ status: res.statusCode!, body, headers: res.headers }));
        },
      );
      req.on('error', fail);
      req.end();
    },
  );
}
async function fixture() {
  await mkdir('work', { recursive: true });
  const root = await mkdtemp(resolve('work/local-server-'));
  await mkdir(join(root, 'web'));
  const bytes = Buffer.from('<p>Test build</p>');
  await writeFile(join(root, 'web/index.html'), bytes);
  const manifest: PackageManifest = {
    format: 'first-export-local-playtest',
    packageVersion: 'unit-only',
    contentVersion: 'unit',
    contentSha256: 'a'.repeat(64),
    configVersion: 'unit',
    target: 'win-x64',
    defaultPort: 4173,
    runtime: { version: 'unit', archiveSha256: 'b'.repeat(64), source: 'unit' },
    files: [{ path: 'web/index.html', bytes: bytes.length, sha256: hash(bytes) }],
  };
  const save = () => writeFile(join(root, 'package-manifest.json'), JSON.stringify(manifest));
  await save();
  return { root, manifest, save };
}
describe('可分发静态服务', () => {
  it('GET/HEAD、JS MIME、query、hash 首页与不缓存', async () => {
    const { port, server } = await start();
    expect(server.address()).toMatchObject({ address: '127.0.0.1' });
    const page = await get(port, '/?a=1');
    expect(page.status).toBe(200);
    expect(page.body).toContain('出海第一单');
    expect(page.headers['cache-control']).toBe('no-store');
    const head = await get(port, '/', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(page.headers['content-length']);
    expect((await get(port, '/assets/app.js')).headers['content-type']).toContain('javascript');
  });
  it.each([
    '/runtime/node.exe',
    '/package-manifest.json',
    '/README.txt',
    '/assets/',
    '/unknown.js',
  ])('不暴露包内私有文件或目录 %s', async (path) => {
    expect((await get((await start()).port, path)).status).toBe(404);
  });
  it.each([
    '/../runtime/node.exe',
    '/%2e%2e/runtime/node.exe',
    '/%5c..%5cruntime',
    '/%00',
    '/%E0%A4%A',
  ])('拒绝路径穿越或坏编码 %s', async (path) => {
    expect((await get((await start()).port, path)).status).toBe(400);
  });
  it('拒绝写入、外部 Host、绝对请求目标，不接收试玩上传', async () => {
    const { port } = await start();
    expect((await get(port, '/', 'POST')).status).toBe(405);
    expect((await get(port, '/', 'GET', 'example.com')).status).toBe(403);
    expect((await get(port, 'http://example.com/')).status).toBe(400);
  });
  it('手机模式才监听所有 IPv4；端口冲突不抢占也不自动改端口', async () => {
    const { port, server } = await start(true);
    expect(server.address()).toMatchObject({ address: '0.0.0.0' });
    expect((await get(port, '/', 'GET', `192.168.1.3:${port}`)).status).toBe(200);
    const second = makeServer(new Map(), false);
    servers.push(second);
    await expect(listen(second, port, false)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect((await get(port)).status).toBe(200);
  });
});
describe('启动配置与发布完整性', () => {
  it('默认本机固定 4173，可手动换端口；自动化可抑制浏览器', () => {
    expect(parseOptions([])).toEqual({ lan: false, open: false, port: 4173 });
    expect(parseOptions(['--lan', '--open', '--no-open', '--port=4180'])).toEqual({
      lan: true,
      open: false,
      port: 4180,
    });
    for (const args of [
      ['--port=0'],
      ['--port=65536'],
      ['--port=x'],
      ['--host=8.8.8.8'],
      ['--lan', '--lan'],
    ])
      expect(() => parseOptions(args)).toThrow();
  });
  it('只列私有 IPv4，排除 loopback/公网/代理测试段/IPv6，真实网卡优先', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.3'])
      expect(isPrivateIPv4(ip)).toBe(true);
    for (const ip of [
      '127.0.0.1',
      '172.32.0.1',
      '8.8.8.8',
      '198.18.0.0',
      '169.254.1.1',
      '::1',
      '192.168.999.1',
    ])
      expect(isPrivateIPv4(ip)).toBe(false);
    const item = (address: string, internal = false) =>
      ({ address, family: 'IPv4', internal }) as NetworkInterfaceInfo;
    expect(
      lanAddresses({
        VMware: [item('192.168.0.1')],
        'Wi-Fi': [item('192.168.1.3')],
        proxy: [item('198.18.0.0')],
        loop: [item('127.0.0.1', true)],
        dup: [item('192.168.1.3')],
      }),
    ).toEqual([
      { name: 'Wi-Fi', address: '192.168.1.3' },
      { name: 'VMware', address: '192.168.0.1' },
    ]);
    expect(lanAddresses({})).toEqual([]);
  });
  it('逐文件摘要校验，加载后只保留 web 文件，运行不再读取磁盘', async () => {
    const f = await fixture(),
      loaded = await loadPackage(f.root);
    expect(loaded.files.size).toBe(1);
    await writeFile(join(f.root, 'web/index.html'), '<p>Damaged...</p>');
    expect(loaded.files.get('/index.html')!.toString()).toContain('Test build');
    await expect(loadPackage(f.root)).rejects.toThrow(/大小不符|校验失败/);
  });
  it.each(['digest', 'missing', 'duplicate', 'traversal', 'oversize', 'format'])(
    '拒绝 %s 损坏的包',
    async (kind) => {
      const f = await fixture();
      const entry = f.manifest.files[0]!;
      if (kind === 'digest') entry.sha256 = '0'.repeat(64);
      if (kind === 'missing') entry.path = 'web/missing.html';
      if (kind === 'duplicate') f.manifest.files.push(entry);
      if (kind === 'traversal') entry.path = '../outside';
      if (kind === 'oversize') entry.bytes = 201 * 1024 * 1024;
      if (kind === 'format') Object.assign(f.manifest, { format: 'another-app' });
      await f.save();
      await expect(loadPackage(f.root)).rejects.toThrow();
    },
  );
  it('打包限定生产构建/玩家文档/运行时；不含真人记录；不覆盖历史目录', async () => {
    const f = await fixture(),
      runtimeDir = join(f.root, 'test-runtime');
    await mkdir(runtimeDir);
    await writeFile(join(runtimeDir, 'node.exe'), 'SYNTHETIC TEST FILE, NOT EXECUTABLE');
    await writeFile(join(runtimeDir, 'LICENSE'), 'UNIT LICENSE');
    const out = join(f.root, '分发 空格'),
      options = {
        root: resolve('.'),
        out,
        web: join(f.root, 'web'),
        runtimeDir,
        licenses: 'UNIT NOTICES',
      };
    const manifest = await buildPackage(options);
    expect(manifest.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'runtime/node.exe',
        'web/index.html',
        'server.mjs',
        'START-LOCAL.cmd',
        'START-PHONE.cmd',
        'README.txt',
      ]),
    );
    expect(
      manifest.files.some((f) =>
        /manifest.template|summary|test-results|node_modules|\.ts$/.test(f.path),
      ),
    ).toBe(false);
    expect(await readFile(join(out, 'START-LOCAL.cmd'), 'utf8')).toContain(
      '"%~dp0runtime\\node.exe"',
    );
    await expect(buildPackage(options)).rejects.toThrow();
  });
});
