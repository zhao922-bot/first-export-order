import { test, expect, type Page } from '@playwright/test';
import { eventPack } from '../fixtures/economy';
import { eventBoundary } from '../fixtures/events';
import { seedRngState } from '../../src/engine/story/rng';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { stageRoute } from '../../src/app/stageRoute';
import { saved, decide } from './procurement-helpers';
import { installSeed, enableAutoEvents } from './event-helpers';
import { begin, documents, correct, end } from './collection-helpers';

function sourceFor(id: string) {
  const base = eventBoundary(id).session;
  for (let i = 0; i < 300; i++) {
    const source = structuredClone(base);
    source.snapshot.story.seed = 'ui.event.' + id + '.' + i;
    source.snapshot.story.rngState.events = seedRngState(source.snapshot.story.seed, 'events');
    const next = reduceSlice(source, eventPack, {
      id: 'find.window',
      revision: source.snapshot.revision,
      action: { type: 'advance' },
    });
    if (next.snapshot.story.pendingEvent?.eventId === id) return source;
  }
  throw new Error('事件不可达：' + id);
}
async function boundary(page: Page, id: string) {
  const source = sourceFor(id);
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('event-boundary-loaded')) {
      localStorage.setItem('first-export.slice.v1', JSON.stringify(s));
      sessionStorage.setItem('event-boundary-loaded', 'yes');
    }
  }, source);
  await page.goto('/#' + stageRoute(source.snapshot.story.stage));
  if (source.feedback) await page.locator('.consequence button.primary').click();
  else await page.locator('.mentor-review button.primary').click();
}
test.setTimeout(120000);
for (const event of eventPack.events) {
  test(`${event.id} ${event.title}：窗口、刷新、真实支出、林姐复盘和返回`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boundary(page, event.id);
    const panel = page.getByTestId('random-event');
    await expect(panel).toHaveAttribute('data-event-id', event.id);
    const pending = await saved(page);
    await page.reload();
    await expect(panel).toHaveAttribute('data-event-id', event.id);
    expect((await saved(page)).snapshot.story).toEqual(pending.snapshot.story);
    const option = eventPack
      .eventEconomy!.find((e) => e.eventId === event.id)!
      .options.find((o) => !o.riskFlag)!;
    const choice = page.locator('[data-choice-id="' + option.choiceId + '"]');
    await expect(choice).toBeEnabled();
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.consequence')).toBeVisible();
    const applied = await saved(page);
    expect(applied.snapshot.story.decisionLog.length).toBe(
      pending.snapshot.story.decisionLog.length + 1,
    );
    expect(applied.snapshot.player.cashCnyFen).toBeGreaterThan(0);
    await page.reload();
    expect((await saved(page)).snapshot.journal).toEqual(applied.snapshot.journal);
    await page.locator('.consequence button.primary').click();
    await expect(page.locator('.mentor-review')).toBeVisible();
    const review = eventPack.nodes.find((node) => node.id === event.reviewNodeId)!;
    await expect(page.locator('.mentor-copy')).toContainText('text' in review ? review.text : '');
    await page.reload();
    expect((await saved(page)).snapshot.story.nodeId).toBe(event.reviewNodeId);
    if (['e01', 'e03', 'e11'].includes(event.id))
      await page.screenshot({ path: info.outputPath(event.id + '-review.png'), fullPage: true });
    await page.locator('.mentor-review button.primary').click();
    await expect(panel).toHaveCount(0);
    const returned = await saved(page);
    expect(returned.snapshot.story.nodeId).toBe(pending.snapshot.story.pendingEvent!.returnNodeId);
    expect(returned.snapshot.story.pendingEvent).toBeNull();
    expect(returned.snapshot.journal).toEqual(applied.snapshot.journal);
    expect(returned.snapshot.story.rngState).toEqual(pending.snapshot.story.rngState);
    await page.reload();
    expect((await saved(page)).snapshot.story).toEqual(returned.snapshot.story);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
test('生产内容固定 UUID：实际七关含随机事件通关；同种子重开得到相同事件序列', async ({
  page,
}, info) => {
  // This case plays all seven stages twice, including every mentor review.
  test.setTimeout(180000);
  enableAutoEvents(page);
  // begin() installs the default quiet seed, so keep this explicit seed as the final init script.
  await installSeed(page, 'events.full.0');
  await begin(page, { eventSeed: 'events.full.0' });
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  const first = await saved(page);
  expect(first.snapshot.story.triggeredEventIds.length).toBeGreaterThanOrEqual(2);
  expect(first.snapshot.story.triggeredEventIds.length).toBeLessThanOrEqual(3);
  expect(first.snapshot.story.pendingEvent).toBeNull();
  await page.screenshot({ path: info.outputPath('events-full-ending.png'), fullPage: true });
  await page.evaluate(() => localStorage.clear());
  await begin(page, { eventSeed: 'events.full.0' });
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  const second = await saved(page);
  expect(second.snapshot.story.eventWindows).toEqual(first.snapshot.story.eventWindows);
  expect(second.snapshot.story.rngState).toEqual(first.snapshot.story.rngState);
  expect(second.snapshot.player).toEqual(first.snapshot.player);
});
