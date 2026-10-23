import { Capacitor, registerPlugin } from '@capacitor/core';

const nativeFiles = registerPlugin<{
  save(options: { filename: string; text: string }): Promise<{ saved: boolean }>;
}>('LocalJson');

/** Native uses Android's document picker; browser/Electron use their normal downloads. */
export async function exportJson(text: string, filename: string): Promise<string> {
  if (!/^[^\\/]+\.json$/i.test(filename) || [...filename].some((c) => c.charCodeAt(0) < 32))
    throw Error('导出文件名无效。');
  if (Capacitor.isNativePlatform()) {
    const result = await nativeFiles.save({ text, filename });
    return result.saved ? '文件已保存到所选位置。' : '已取消导出，原有记录仍保留。';
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return '已发起下载，请在下载目录或保存对话框中查看文件。';
}
