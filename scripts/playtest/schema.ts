import { z } from 'zod';
import { telemetrySchema } from '../../src/telemetry/events';

const code = z.string().regex(/^P\d{2,3}$/);
export const protocolSchema = z.strictObject({
  protocolVersion: z.literal('human-playtest-1'),
  contentVersion: z.string().min(1),
  configVersion: z.string().min(1),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  minimumParticipants: z.number().int().min(12),
  minimumPaired: z.number().int().min(12),
  completionRate: z.number().min(0.7).max(1),
  medianGainPp: z.number().min(20).max(100),
  durationMinutes: z.tuple([z.number().positive(), z.number().positive()]),
  maxReviewCharacters: z.literal(120),
});
export const manifestSchema = z
  .strictObject({
    studyId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    protocolVersion: z.literal('human-playtest-1'),
    observationAt: z.iso.datetime(),
    participants: z
      .array(
        z.strictObject({
          id: code,
          status: z.enum(['pending', 'enrolled', 'withdrawn']),
          novice: z.boolean().nullable(),
          consent: z.boolean().nullable(),
          humanConfirmed: z.boolean().nullable(),
          device: z.enum(['desktop', 'mobile', 'tablet', 'unknown']),
          exports: z.array(z.string().regex(/^[a-zA-Z0-9_.-]+\.json$/)).max(10),
          // 空值自动选最早完整模式开局；显式值也只能指向该首局，不能择优。
          primaryRunId: z.string().min(1).nullable(),
        }),
      )
      .max(100),
  })
  .superRefine((m, ctx) => {
    const ids = m.participants.map((p) => p.id);
    const files = m.participants.flatMap((p) => p.exports);
    if (new Set(ids).size !== ids.length || new Set(files).size !== files.length)
      ctx.addIssue({ code: 'custom', message: '参与者编号或导出文件重复分配' });
    if (files.length > 120)
      ctx.addIssue({ code: 'custom', message: '每批最多 120 份导出，请分批归档' });
    for (const p of m.participants) {
      if (p.status === 'enrolled' && (!p.novice || !p.consent || !p.humanConfirmed))
        ctx.addIssue({ code: 'custom', message: `${p.id}: 纳入须确认零基础、主动导出同意和真人` });
      if (p.status !== 'enrolled' && p.exports.length)
        ctx.addIssue({ code: 'custom', message: `${p.id}: 待招募/撤回者不能纳入导出` });
    }
  });
export const exportSchema = telemetrySchema.extend({
  format: z.literal('first-export-playtest'),
  exportedAt: z.iso.datetime(),
  limitations: z.string(),
  metrics: z.unknown(), // 不信任浏览器预计算统计，始终重新计算。
  evidenceSource: z.string().optional(),
});
export type Protocol = z.infer<typeof protocolSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type PlaytestExport = z.infer<typeof exportSchema>;
