import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { spawn } from 'node:child_process';
import { isIP, connect } from 'node:net';

export interface PackageFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface PackageManifest {
  format: 'first-export-local-playtest';
  packageVersion: string;
  contentVersion: string;
  contentSha256: string;
  configVersion: string;
  target: 'win-x64';
  defaultPort: 4173;
  runtime: { version: string; archiveSha256: string; source: string };
  files: PackageFile[];
}
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const safePath = (path: string) =>
  /^[A-Za-z0-9_./-]+$/.test(path) &&
  !path.split('/').some((p) => p === '' || p === '.' || p === '..') &&
  !isAbsolute(path);

/** 只在启动时加载并校验已登记内容；运行后也不会读取任意磁盘路径。 */
export async function loadPackage(root: string) {
  root = await realpath(root);
  const raw: unknown = JSON.parse(await readFile(resolve(root, 'package-manifest.json'), 'utf8'));
  if (!raw || typeof raw !== 'object') throw Error('试玩包清单无效，请重新解压完整 ZIP。');
  const manifest = raw as PackageManifest;
  if (
    manifest.format !== 'first-export-local-playtest' ||
    manifest.target !== 'win-x64' ||
    manifest.defaultPort !== 4173 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 500 ||
    !/^[a-f0-9]{64}$/.test(manifest.contentSha256)
  )
    throw Error('试玩包清单格式不匹配。');
  const files = new Map<string, Buffer>(),
    seen = new Set<string>();
  let bytes = 0;
  for (const entry of manifest.files) {
    if (
      typeof entry.path !== 'string' ||
      !safePath(entry.path) ||
      seen.has(entry.path) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw Error('试玩包清单文件路径、大小或摘要无效。');
    seen.add(entry.path);
    bytes += entry.bytes;
    if (bytes > 200 * 1024 * 1024) throw Error('试玩包大小超出上限。');
    const full = await realpath(resolve(root, entry.path)),
      rel = relative(root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) throw Error('试玩包文件位于包外。');
    if ((await stat(full)).size !== entry.bytes)
      throw Error(`文件大小不符：${entry.path}。请重新解压。`);
    const data = await readFile(full);
    if (sha(data) !== entry.sha256) throw Error(`文件校验失败：${entry.path}。请重新解压。`);
    if (entry.path.startsWith('web/')) files.set('/' + entry.path.slice(4), data);
  }
  if (!files.has('/index.html')) throw Error('缺少生产构建 web/index.html。请先完整解压。');
  return { manifest, files };
}
export function isPrivateIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}
export function lanAddresses(
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
) {
  const entries = Object.entries(interfaces).flatMap(([name, items]) =>
    (items ?? [])
      .filter((x) => x.family === 'IPv4' && !x.internal && isPrivateIPv4(x.address))
      .map((x) => ({ name, address: x.address })),
  );
  return entries
    .filter((x, i) => entries.findIndex((y) => y.address === x.address) === i)
    .sort(
      (a, b) =>
        Number(/vmware|virtual|vpn|wsl|docker|vbox/i.test(a.name)) -
          Number(/vmware|virtual|vpn|wsl|docker|vbox/i.test(b.name)) ||
        a.address.localeCompare(b.address),
    );
}
export function parseOptions(args: string[]) {
  let lan = false,
    open = false,
    port = 4173;
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split('=')[0]!;
    if (seen.has(key)) throw Error(`重复启动参数：${key}`);
    seen.add(key);
    if (arg === '--lan') lan = true;
    else if (arg === '--open') open = true;
    else if (arg === '--no-open') open = false;
    else if (/^--port=\d+$/.test(arg)) {
      port = Number(arg.slice(7));
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw Error('端口须为 1024–65535。');
    } else throw Error(`未知启动参数：${arg}`);
  }
  // 测试/自动化通过 --no-open 抑制启动浏览器，即使启动脚本带 --open。
  if (seen.has('--no-open')) open = false;
  return { lan, open, port };
}
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
export function makeServer(files: Map<string, Buffer>, lan: boolean, addresses = lanAddresses()) {
  const hosts = new Set([
    '127.0.0.1',
    'localhost',
    ...(lan ? addresses.map((x) => x.address) : []),
  ]);
  return createServer(
    { requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 },
    (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const deny = (status: number, message: string) => {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : message);
      };
      const remote = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
      const host = req.headers.host?.toLowerCase().replace(/:\d+$/, '');
      if ((remote !== '127.0.0.1' && !(lan && isPrivateIPv4(remote))) || !host || !hosts.has(host))
        return deny(403, '此试玩包仅供本机或受信任的 IPv4 局域网访问。');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return deny(405, '试玩包只提供静态页面，不接收数据。');
      }
      let path: string;
      try {
        path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      } catch {
        return deny(400, '地址编码无效。');
      }
      if (
        !path.startsWith('/') ||
        path.includes('\\') ||
        path.includes('\0') ||
        path.split('/').some((x) => x === '.' || x === '..')
      )
        return deny(400, '无效文件路径。');
      if (path === '/') path = '/index.html';
      const data = files.get(path);
      if (!data) return deny(404, '未找到此文件。请从 /#/ 打开游戏，勿直接双击 index.html。');
      res.writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Content-Length': data.length,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    },
  );
}
export async function listen(server: Server, port: number, lan: boolean) {
  // Windows 允许通配地址与特定地址的监听重叠，先探测本机各地址，避免模式切换抢走旧服务。
  if (port !== 0) {
    const occupied = await Promise.all(
      ['127.0.0.1', ...lanAddresses().map((x) => x.address)].map(
        (host) =>
          new Promise<boolean>((done) => {
            const socket = connect({ host, port });
            const finish = (value: boolean) => {
              socket.destroy();
              done(value);
            };
            socket.once('connect', () => finish(true));
            socket.once('error', () => finish(false));
            socket.setTimeout(500, () => finish(false));
          }),
      ),
    );
    if (occupied.some(Boolean))
      throw Object.assign(Error('Port already in use'), { code: 'EADDRINUSE' });
  }
  await new Promise<void>((ok, fail) => {
    const onError = (e: Error) => {
      server.off('listening', onListen);
      fail(e);
    };
    const onListen = () => {
      server.off('error', onError);
      ok();
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen({ port, host: lan ? '0.0.0.0' : '127.0.0.1', exclusive: true });
  });
  return (server.address() as { port: number }).port;
}
export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args),
    root = dirname(fileURLToPath(import.meta.url));
  const { manifest, files } = await loadPackage(root),
    addresses = lanAddresses();
  const server = makeServer(files, options.lan, addresses);
  let port: number;
  try {
    port = await listen(server, options.port, options.lan);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE')
      throw Error(
        `端口 ${options.port} 已被占用。请回到原试玩窗口，或关闭您自己之前启动的服务后再试。本程序不会自动换端口或结束其他进程。`,
        { cause: e },
      );
    throw e;
  }
  const url = `http://127.0.0.1:${port}/#/`;
  console.log(`出海第一单 · ${manifest.contentVersion}\n本机试玩：${url}`);
  if (options.lan) {
    console.log(
      '手机与电脑连接同一受信任 Wi-Fi/局域网；手机输入以下当前网卡地址（不要输入 127.0.0.1）：',
    );
    if (!addresses.length)
      console.log('未找到私有 IPv4 网卡。请连接 Wi-Fi/网线后重新启动手机联机。');
    for (const x of addresses) console.log(`  ${x.name}: http://${x.address}:${port}/#/`);
    console.log(
      '选择实际 Wi-Fi/网线网卡，非 VPN/虚拟网卡。如有防火墙提示，仅允许受信任的专用网络。',
    );
  } else console.log('当前仅本机可访问。手机请改用 START-PHONE.cmd。');
  console.log('保留此窗口；Ctrl+C 或关闭窗口停止服务。存档仍在各自浏览器内。\nREADY ' + url);
  if (options.open) {
    const child = spawn('explorer.exe', [url], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log('浏览器未自动打开，请复制上面的本机地址。'));
    child.unref();
  }
  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e: unknown) => {
    console.error(
      '启动失败：' +
        (e instanceof Error ? e.message : String(e)) +
        '\n请查看 TROUBLESHOOTING.txt。',
    );
    process.exitCode = 1;
  });
