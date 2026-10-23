import { z } from 'zod';
import type { GuideScreen, OnboardingContent } from '../domain/schemas/onboarding';

export interface GuideContext {
  screen: GuideScreen;
  phase: 'rescue' | 'feedback' | 'review' | 'event' | 'normal';
  nodeId: string;
  nodeType: string;
  tags: readonly string[];
  stage: number;
  key: string;
}
export function guideRule(content: OnboardingContent, context: GuideContext) {
  return content.rules.find(
    ({ when }) =>
      when.screen === context.screen &&
      (!when.phase || when.phase === context.phase) &&
      (!when.stage || when.stage === context.stage) &&
      (!when.nodeType || when.nodeType === context.nodeType) &&
      (!when.nodeIds || when.nodeIds.includes(context.nodeId)) &&
      (!when.tag || context.tags.includes(when.tag)),
  )!;
}
export const guideKey = 'first-export.onboarding.v1';
export const guideStateSchema = z.strictObject({
  version: z.literal('onboarding-1'),
  status: z.enum(['active', 'skipped', 'completed']),
  overview: z.number().int().min(0).max(3),
  demoStarted: z.boolean(),
});
export type GuideState = z.infer<typeof guideStateSchema>;
export const freshGuide = (): GuideState => ({
  version: 'onboarding-1',
  status: 'active',
  overview: 0,
  demoStarted: false,
});
type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function readGuide(storage: () => GuideStorage): {
  state: GuideState;
  unavailable: boolean;
} {
  try {
    const raw = storage().getItem(guideKey);
    return {
      state: raw ? guideStateSchema.parse(JSON.parse(raw)) : freshGuide(),
      unavailable: false,
    };
  } catch {
    return { state: freshGuide(), unavailable: true };
  }
}
export function writeGuide(storage: () => GuideStorage, state: GuideState): boolean {
  try {
    storage().setItem(guideKey, JSON.stringify(guideStateSchema.parse(state)));
    return true;
  } catch {
    return false;
  }
}

/** Only visible, focused foreground time counts. No wall clock or offline catch-up. */
export class GuideIdleClock {
  private key = '';
  private last = 0;
  private elapsed = 0;
  private eligible = false;
  private dismissed = false;
  reset(key: string, now: number, eligible: boolean) {
    this.key = key;
    this.last = now;
    this.elapsed = 0;
    this.eligible = eligible;
    this.dismissed = false;
  }
  activity(now: number) {
    this.last = now;
    this.elapsed = 0;
  }
  dismiss() {
    this.dismissed = true;
  }
  tick(key: string, now: number, eligible: boolean, threshold: number) {
    if (key !== this.key) this.reset(key, now, eligible);
    // Long timer gaps (suspend/sleep) are not evidence of being stuck.
    const delta = Math.max(0, now - this.last);
    if (eligible && this.eligible && delta <= 2500) this.elapsed += delta;
    this.last = now;
    this.eligible = eligible;
    return eligible && !this.dismissed && this.elapsed >= threshold;
  }
}
