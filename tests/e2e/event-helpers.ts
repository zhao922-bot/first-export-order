import { inDesk, acknowledge } from './desk-helpers';
import { type Page } from '@playwright/test';
import { seedRngState, nextRandom } from '../../src/engine/story/rng';
import { eventPack } from '../fixtures/economy';
import { businessDraw } from '../../src/engine/story/businessRandom';
import { waitForSave } from './save-helpers';
const autoPages = new WeakSet<Page>();
export const enableAutoEvents = (page: Page) => autoPages.add(page);
export async function handleAutoEvents(page: Page) {
  if (!autoPages.has(page)) return;
  // A mentor click can return before its async commit publishes the event.
  // Inspect only the committed UI; a transient zero count is not "no event".
  await waitForSave(page);
  const panel = page.getByTestId('random-event');
  for (let i = 0; i < 3; i++) {
    if (!(await panel.count())) return;
    const id = await panel.getAttribute('data-event-id');
    if (id === 'e11') return;
    const choices: Record<string, string> = {
      e01: 'e01_reprice',
      e02: 'e02_accept',
      e03: 'customs_standard',
      e04: 'e04_expedite',
      e05: 'e05_accept',
      e06: 'e06_reprice',
      e07: 'e07_absorb',
      e08: 'rollover_priority',
      e09: 'e09_evidence',
      e10: 'e10_compensate',
      e12: 'e12_coordinate',
    };
    await (await inDesk(page.locator('[data-choice-id="' + choices[id!] + '"]'))).click();
    await acknowledge(page);
    await (await inDesk(page.locator('.mentor-review button.primary'))).click();
    await waitForSave(page);
  }
}
export async function installSeed(page: Page, id: string, fallback = false) {
  await page.addInitScript(
    ({ id, fallback }) => {
      const w = window as Window & { eventTestSeed?: string };
      if (fallback && w.eventTestSeed) return;
      w.eventTestSeed = id;
      const original = crypto.randomUUID.bind(crypto);
      Object.defineProperty(crypto, 'randomUUID', {
        configurable: true,
        value: () =>
          localStorage.getItem('first-export.slice.v1') ||
          localStorage.getItem('first-export.slice.v2:auto:head')
            ? original()
            : w.eventTestSeed!,
      });
    },
    { id, fallback },
  );
}
/** 全部先导窗口均未触发；运输事件单独按生产权重定位。只注入 UUID。 */
export function shippingSeed(risk: 'none' | 'customs' | 'rollover', term = 'fob') {
  for (let i = 0; i < 100000; i++) {
    const id = 'shipping.ui.' + i;
    let state = seedRngState('run.' + id, 'events');
    const draws: number[] = [];
    for (let j = 0; j < 8; j++) {
      const d = nextRandom(state);
      draws.push(d.value);
      state = d.state;
    }
    if (
      risk === 'none' &&
      draws.slice(0, 6).every((n) => n >= Number(eventPack.eventScheduling!.windowProbability))
    )
      return id;
    const before = term === 'cif' ? 4 : 3;
    if (
      risk !== 'none' &&
      draws.slice(0, before).every((n) => n >= 0.65) &&
      draws[before]! < 0.65 &&
      (risk === 'customs'
        ? draws[before + 1]! < 0.3
        : draws[before + 1]! >= 0.3 && draws[before + 1]! < 0.6)
    )
      return id;
  }
  throw new Error('seed not found');
}

/** 只选种子，不改存档/参数；普通事件为空，业务情境仍按生产权重运行。 */
export function businessSeed(options: { oa?: string; quality?: boolean; supplier?: string }) {
  for (let i = 0; i < 100000; i++) {
    const id = 'business.ui.' + i,
      run = 'run.' + id;
    let rng = seedRngState(run, 'events');
    let clear = true;
    for (let n = 0; n < 6; n++) {
      const draw = nextRandom(rng);
      rng = draw.state;
      if (draw.value < Number(eventPack.eventScheduling!.windowProbability)) clear = false;
    }
    if (!clear) continue;
    const supplier = options.supplier ?? 'cup_500_verified';
    const quality =
      businessDraw(run, 'quality:order.' + run + ':' + supplier) <
      Number(eventPack.suppliers.find((s) => s.id === supplier)!.qualityRisk);
    if (options.quality !== undefined && quality !== options.quality) continue;
    const scenarios = eventPack.collection!.oaScenarios;
    let weight =
      businessDraw(run, 'oa:order.' + run + ':customer_c') *
      scenarios.reduce((n, s) => n + s.weight, 0);
    const oa = scenarios.find((s) => (weight -= s.weight) < 0)!.id;
    if (!options.oa || options.oa === oa) return id;
  }
  throw new Error('business seed not found');
}
