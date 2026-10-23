import { resolve, sep } from 'node:path';

export function assetPath(address: string, root: string): string | null {
  try {
    const url = new URL(address);
    if (url.protocol !== 'trade:' || url.host !== 'app' || url.username || url.password)
      return null;
    const path = decodeURIComponent(url.pathname);
    if (path.includes('\\') || path.includes('\0') || path.includes(':')) return null;
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    return file.startsWith(resolve(root) + sep) ? file : null;
  } catch {
    return null;
  }
}

export function isAppPage(address: string): boolean {
  try {
    const url = new URL(address);
    return (
      url.protocol === 'trade:' &&
      url.host === 'app' &&
      !url.username &&
      !url.password &&
      ['/', '/index.html'].includes(url.pathname)
    );
  } catch {
    return false;
  }
}
