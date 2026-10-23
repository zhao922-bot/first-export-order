import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import raw from '../../src/content/presentation.json';
import report from '../../public/assets/portraits/encoding-report.json';
import { presentationSchema } from '../../src/domain/schemas/presentation';
import { presentation } from '../../src/content/presentation';
import { portraitCandidates, taskLabel } from '../../src/app/presentation';
import { buildCollectionView } from '../../src/app/collectionView';
import { collectionGame } from '../fixtures/collection';
import { pack } from '../fixtures/economy';

describe('无损资源与回退契约', () => {
  it.each(report)('$webp 保持无损 VP8L、尺寸和编码指纹，并至少节省 30%', (entry) => {
    const webp = readFileSync('public/assets/portraits/' + entry.webp);
    const png = readFileSync('public/assets/portraits/' + entry.source);
    expect(webp.subarray(0, 4).toString()).toBe('RIFF');
    expect(webp.subarray(8, 12).toString()).toBe('WEBP');
    expect(webp.subarray(12, 16).toString()).toBe('VP8L');
    // Lossless VP8L stores dimensions in the first four payload bytes after 0x2f.
    const bits = webp.readUInt32LE(21);
    expect([(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]).toEqual([1536, 1024]);
    expect(webp.length).toBe(entry.webpBytes);
    expect(png.length).toBe(entry.pngBytes);
    expect(webp.length / png.length).toBeLessThan(0.7);
    expect(createHash('sha256').update(webp).digest('hex')).toBe(entry.webpSha256);
  });
  it.each([presentation.mentor.atlas, presentation.customers.atlas])(
    '表情 %s 优先保留同一姿态的 PNG，再回退身份',
    (source) => {
      expect(portraitCandidates(presentation, source)).toEqual([
        { source, url: source.replace('.png', '-delivery.webp') },
        { source, url: source.replace('.png', '.webp') },
        { source, url: source },
        { source: presentation.atlas, url: presentation.atlas.replace('.png', '-delivery.webp') },
        { source: presentation.atlas, url: presentation.atlas.replace('.png', '.webp') },
        { source: presentation.atlas, url: presentation.atlas },
      ]);
      expect(portraitCandidates(presentation, presentation.atlas)).toHaveLength(3);
    },
  );
  it.each(['missing', 'duplicate', 'remote', 'traversal', 'copy', 'unknown'])(
    '拒绝无效体验配置 %s',
    (kind) => {
      const data = structuredClone(raw);
      if (kind === 'missing') data.optimizedAtlases.pop();
      if (kind === 'duplicate') data.optimizedAtlases[1] = data.optimizedAtlases[0]!;
      if (kind === 'remote') data.optimizedAtlases[0]!.webp = 'https://example.com/a.webp';
      if (kind === 'traversal') data.optimizedAtlases[0]!.webp = '../a.webp';
      if (kind === 'copy') data.experience.task = ' ';
      if (kind === 'unknown') Object.assign(data.experience, { command: 'pay' });
      expect(presentationSchema.safeParse(data).success).toBe(false);
    },
  );
});
describe('就近操作只读投影', () => {
  it.each([
    [false, false, 'task'],
    [true, false, 'feedback'],
    [false, true, 'review'],
    [true, true, 'feedback'],
  ] as const)('快捷按钮随反馈 %s / 复盘 %s 变化', (feedback, review, key) => {
    expect(taskLabel(presentation, feedback, review)).toBe(presentation.experience[key]);
  });
  it.each(['tt', 'lc', 'oa'])('%s 单据对照来自既有源记录，未标记也不自动纠错或记账', (payment) => {
    const game = collectionGame(payment, 'cif');
    const before = JSON.stringify(game.session);
    const model = buildCollectionView(game.session, pack)!;
    for (const doc of model.documents)
      for (const field of doc.fields) {
        const template = pack.documentTemplates
          .find((t) => t.id === doc.id)!
          .fields.find((f) => doc.id + '.' + f.id === field.key)!;
        expect(field.source).toBe(
          String(model.sources.find((s) => s.id === template.sourcePath)!.value),
        );
        expect(field.correction).toBe('');
        expect(field.marked).toBe(false);
      }
    expect(JSON.stringify(game.session)).toBe(before);
  });
});
