import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const svg = await readFile('desktop/icon.svg', 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  await page.setContent('<style>body{margin:0}</style>' + svg);
  const png = await page.screenshot({ omitBackground: true });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile('desktop/icon.ico', Buffer.concat([header, png]));
  for (const [density, size] of [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent('<style>body{margin:0}svg{width:100vw;height:100vh}</style>' + svg);
    const image = await page.screenshot({ omitBackground: true });
    for (const name of ['ic_launcher', 'ic_launcher_round'])
      await writeFile(`android/app/src/main/res/mipmap-${density}/${name}.png`, image);
  }
} finally {
  await browser.close();
}
