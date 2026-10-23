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
export const presentationSchema = z
  .strictObject({
    version: z.literal('presentation-1'),
    atlas: z.string().regex(/^assets\/portraits\/[a-z0-9-]+\.png$/),
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
    home: z.strictObject({ title: copy, subtitle: copy }),
  })
  .superRefine((value, ctx) => {
    for (const [label, keys] of [
      ['角色', value.actors.map((a) => a.id)],
      ['图集位置', value.actors.map((a) => `${a.column},${a.row}`)],
      ['关卡', value.stages.map((s) => s.stage)],
      ['场景', value.stages.map((s) => s.scene)],
    ] as const) {
      if (new Set<string | number>(keys).size !== keys.length)
        ctx.addIssue({ code: 'custom', message: `${label}不可重复` });
    }
  });
export type Presentation = z.infer<typeof presentationSchema>;
export type ActorId = (typeof actorIds)[number];
export type Scene = Presentation['stages'][number]['scene'];
