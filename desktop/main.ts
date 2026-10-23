import { app, BrowserWindow, Menu, protocol, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPath, isAppPage } from './policy.js';

app.setName('FirstExportOrder');
// A stable profile and origin keep saves when the portable EXE moves or updates.
const profile = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
app.setPath(
  'userData',
  profile
    ? profile.slice('--user-data-dir='.length)
    : join(app.getPath('appData'), 'FirstExportOrder'),
);
protocol.registerSchemesAsPrivileged([
  { scheme: 'trade', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const root = join(dirname(fileURLToPath(import.meta.url)), 'web');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window: BrowserWindow | null = null;
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('trade', async (request) => {
      const file = assetPath(request.url, root);
      if (!file || !['GET', 'HEAD'].includes(request.method))
        return new Response(null, { status: 403 });
      try {
        const bytes = await readFile(file);
        return new Response(request.method === 'HEAD' ? null : bytes, {
          headers: {
            'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    window = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 360,
      minHeight: 560,
      title: '出海第一单',
      backgroundColor: '#f4f5f0',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (!isAppPage(url)) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => {
      window = null;
    });
    void window.loadURL('trade://app/');
  });
}
