import { z } from 'zod';

export const actorIds = [
  'mentor_lin',
  'customer_a',
  'customer_b',
  'customer_c',
  'customer_d',
  'customer_e',
] as const;
const copy = z.string().trim().min(1).max(160);
const atlasPath = z.string().regex(/^assets\/portraits\/[a-z0-9-]+\.png$/);
export const expressionIds = [
  'welcome',
  'thinking',
  'explaining',
  'concerned',
  'encouraging',
  'reflecting',
] as const;
export const mentorCues = [
  'home',
  'product',
  'supplier',
  'verify',
  'feedback',
  'review',
  'finish',
  'event',
  'rescue',
  'default',
  'reading',
  'checking',
  'correcting',
  'ready',
] as const;
export type MentorCue = (typeof mentorCues)[number];
export type ExpressionId = (typeof expressionIds)[number];
export const presentationSchema = z
  .strictObject({
    version: z.literal('presentation-5'),
    atlas: atlasPath,
    optimizedAtlases: z
      .array(
        z.strictObject({
          source: atlasPath,
          webp: z.string().regex(/^assets\/portraits\/[a-z0-9-]+\.webp$/),
          delivery: z.string().regex(/^assets\/portraits\/[a-z0-9-]+-delivery\.webp$/),
        }),
      )
      .length(3),
    experience: z.strictObject({
      task: copy,
      feedback: copy,
      review: copy,
      archive: copy,
      archiveNote: copy,
      inspection: copy,
      inspectPoint: copy,
      unread: copy,
      read: copy,
      source: copy,
      ledger: copy,
      cashIn: copy,
      cashOut: copy,
      cashUnchanged: copy,
      loading: copy,
      loadFailed: copy,
      loadRecovery: copy,
      reload: copy,
      saving: copy,
      oaPending: copy,
      oaDue: copy.refine((value) => value.includes('{day}'), '到期日文案必须包含 {day}'),
    }),
    customers: z.strictObject({ atlas: atlasPath, label: copy }),
    workspaces: z
      .array(
        z.strictObject({
          stage: z.number().int().min(2).max(7),
          label: copy,
          receiptTitle: copy,
          receiptNote: copy,
          phases: z
            .array(
              z.strictObject({
                label: copy,
                note: copy,
                cue: z.enum(mentorCues),
                customerExpression: z.enum(['neutral', 'considering']),
                nodeIds: z.array(z.string().regex(/^L0[2-7]\.[a-z0-9_.-]+$/)).min(1),
              }),
            )
            .length(3),
        }),
      )
      .length(6),
    receipt: z.strictObject({
      label: copy,
      cash: copy,
      profit: copy,
      time: copy,
      days: copy,
      reputation: copy,
      trust: copy,
      state: copy,
      zeroCash: copy,
      eventTitle: copy,
      eventNote: copy,
      orderStates: z.record(
        z.enum([
          'draft',
          'negotiating',
          'contracted',
          'producing',
          'ready',
          'delivered',
          'shipped',
          'collected',
          'cancelled',
        ]),
        copy,
      ),
    }),
    mentor: z.strictObject({
      atlas: atlasPath,
      expressions: z
        .array(
          z.strictObject({
            id: z.enum(expressionIds),
            label: copy,
            leftInset: z.number().min(0).max(20).default(0),
            column: z.number().int().min(0).max(2),
            row: z.number().int().min(0).max(1),
          }),
        )
        .length(6),
      cues: z.record(z.enum(mentorCues), z.enum(expressionIds)),
      nodeCues: z.record(z.string().regex(/^L0[1-7]\.[a-z0-9_.]+$/), z.enum(mentorCues)),
    }),
    interface: z.strictObject({
      menu: copy,
      closeMenu: copy,
      journey: copy,
      glossary: copy,
      sceneNote: copy,
      sampleLabel: copy,
      sampleSteps: z.array(copy).length(3),
      sampleNotes: z.array(copy).length(3),
    }),
    actors: z
      .array(
        z.strictObject({
          id: z.enum(actorIds),
          name: copy,
          role: copy,
          column: z.number().int().min(0).max(2),
          row: z.number().int().min(0).max(1),
        }),
      )
      .length(6),
    stages: z
      .array(
        z.strictObject({
          stage: z.number().int().min(1).max(7),
          navLabel: copy,
          title: copy,
          subtitle: copy,
          scene: z.enum([
            'samples',
            'inbox',
            'quote',
            'meeting',
            'warehouse',
            'harbor',
            'documents',
          ]),
        }),
      )
      .length(7),
    home: z.strictObject({
      title: copy,
      subtitle: copy,
      headline: z.array(copy).length(2),
      intro: copy,
      eyebrow: copy,
      promise: copy,
    }),
  })
  .superRefine((value, ctx) => {
    const sources = value.optimizedAtlases.map((a) => a.source);
    if (
      value.optimizedAtlases.some(
        (a) =>
          a.delivery !== a.source.replace('.png', '-delivery.webp') ||
          a.webp !== a.source.replace('.png', '.webp'),
      )
    )
      ctx.addIssue({ code: 'custom', message: '交付编码必须与原图一一对应' });
    if (
      new Set(sources).size !== 3 ||
      ![value.atlas, value.mentor.atlas, value.customers.atlas].every((a) => sources.includes(a))
    )
      ctx.addIssue({ code: 'custom', message: '优化图集必须完整且唯一对应三张原图' });
    for (const [label, keys] of [
      ['角色', value.actors.map((a) => a.id)],
      ['图集位置', value.actors.map((a) => `${a.column},${a.row}`)],
      ['关卡', value.stages.map((s) => s.stage)],
      ['场景', value.stages.map((s) => s.scene)],
      ['表情', value.mentor.expressions.map((e) => e.id)],
      ['表情位置', value.mentor.expressions.map((e) => `${e.column},${e.row}`)],
      ['工作台关卡', value.workspaces.map((w) => w.stage)],
      ['工作台节点', value.workspaces.flatMap((w) => w.phases.flatMap((p) => p.nodeIds))],
    ] as const) {
      if (new Set<string | number>(keys).size !== keys.length)
        ctx.addIssue({ code: 'custom', message: `${label}不可重复` });
    }
  });
export type Presentation = z.infer<typeof presentationSchema>;
export type ActorId = (typeof actorIds)[number];
export type Scene = Presentation['stages'][number]['scene'];
