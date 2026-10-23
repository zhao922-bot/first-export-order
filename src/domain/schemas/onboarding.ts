import { z } from 'zod';

export const guideTargets = [
  'start',
  'resume',
  'progress',
  'resources',
  'glossary',
  'product',
  'supplier',
  'feedback',
  'review',
  'choices',
  'mail',
  'quote',
  'pi',
  'funding',
  'inspection',
  'declaration',
  'transport',
  'documents',
  'tax',
  'rescue',
  'ending',
  'assessment',
  'recovery',
] as const;
export const guideScreens = [
  'home',
  'resume',
  'game',
  'ending',
  'assessment',
  'recovery',
  'reference',
] as const;
const copy = z.string().trim().min(1).max(240);
const card = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: copy,
  text: copy,
  target: z.enum(guideTargets),
});
export const onboardingSchema = z
  .strictObject({
    version: z.literal('onboarding-1'),
    idleSeconds: z.number().int().min(30).max(120),
    labels: z.strictObject({
      title: copy,
      skip: copy,
      replay: copy,
      next: copy,
      practice: copy,
      locate: copy,
      help: copy,
      dismiss: copy,
      complete: copy,
      unavailable: copy,
      storage: copy,
      idle: copy,
    }),
    overview: z.array(card).length(3),
    rules: z
      .array(
        card.extend({
          when: z.strictObject({
            screen: z.enum(guideScreens),
            phase: z.enum(['rescue', 'feedback', 'review', 'event', 'normal']).optional(),
            nodeIds: z.array(z.string()).min(1).optional(),
            tag: z.string().optional(),
            nodeType: z.string().optional(),
            stage: z.number().int().min(1).max(7).optional(),
          }),
        }),
      )
      .min(10)
      .max(50),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const card of [...data.overview, ...data.rules]) {
      if (ids.has(card.id)) ctx.addIssue({ code: 'custom', message: `重复引导 id：${card.id}` });
      ids.add(card.id);
    }
    for (const screen of guideScreens) {
      if (!data.rules.some((r) => r.when.screen === screen && Object.keys(r.when).length === 1))
        ctx.addIssue({ code: 'custom', message: `缺少 ${screen} 默认提示` });
    }
  });
export type OnboardingContent = z.infer<typeof onboardingSchema>;
export type GuideTarget = (typeof guideTargets)[number];
export type GuideScreen = (typeof guideScreens)[number];
