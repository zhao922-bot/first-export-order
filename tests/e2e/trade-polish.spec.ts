import { inDesk } from './desk-helpers';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { begin, documents, correct, end } from './collection-helpers';
import { saved, decide } from './procurement-helpers';
import { businessSeed } from './event-helpers';
import { choose, next, review, continueReview, startInquiry, readMail } from './inquiry-helpers';

const money = (fen: number) =>
  (fen < 0 ? '-¥' : '¥') +
  (Math.abs(fen) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function receipt(page: Page, id: string, info: TestInfo) {
  const before = await saved(page);
  await choose(page, id);
  const after = await saved(page);
  await expect(page.locator('.business-receipt')).toHaveCount(0);
  await expect(page.getByTestId('cash')).toHaveText(money(after.snapshot.player.cashCnyFen));
  await expect(page.getByTestId('profit')).toHaveText(
    money(after.snapshot.player.cumulativeProfitCnyFen),
  );
  expect(after.snapshot.story.decisionLog.at(-1)!.deltas.cashCnyFen).toBe(
    after.snapshot.player.cashCnyFen - before.snapshot.player.cashCnyFen,
  );
  await (await inDesk(page.getByLabel('界面动效', { exact: true }))).selectOption('off');
  await page.reload();
  expect(await saved(page)).toEqual(after);
  await expect(page.locator('.hud-delta')).toHaveCount(0);
  await noOverflow(page);
  await page
    .locator('.resource-hud')
    .screenshot({ path: info.outputPath(`${id}-hud.png`), animations: 'disabled' });
  await review(page);
  await continueReview(page);
}

for (const payment of ['tt', 'lc', 'oa']) {
  test(`六关精修现场与 ${payment} 回执：手机、刷新、单据草稿及完整结局`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const mobile = info.project.name.includes('mobile');
    if (mobile) await page.setViewportSize({ width: 360, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await begin(page, {
      payment,
      term: 'cif',
      ...(payment === 'oa' ? { eventSeed: businessSeed({ oa: 'oa_delayed' }) } : {}),
      checkpoint: async (stage) => {
        if (stage === 1) return;
        const scene = page.locator('.trade-stage');
        await expect(scene.locator('.trade-steps li')).toHaveCount(3);
        await expect(scene.locator('[aria-current="step"]')).toHaveCount(1);
        await expect(scene.locator('.trade-artwork')).toBeVisible();
        await expect(scene.locator('.character-crop img')).toHaveJSProperty('naturalWidth', 1536);
        if (stage === 4)
          await expect(scene.locator('.character-portrait')).toHaveAttribute(
            'data-expression',
            'considering',
          );
        const before = await saved(page);
        await page.reload();
        await expect(scene).toBeVisible();
        expect(await saved(page)).toEqual(before);
        await noOverflow(page);
        if (mobile) {
          const copy = await scene.locator('.scene-copy > p').boundingBox();
          const person = await scene.locator('.character-portrait').boundingBox();
          expect(copy!.x + copy!.width).toBeLessThanOrEqual(person!.x);
        }
        await scene.screenshot({
          path: info.outputPath(`chapter-${stage}.png`),
          animations: 'disabled',
        });
      },
    });
    await documents(page);
    const quantity = page.locator('[data-doc-key="invoice.quantity"]');
    await (await inDesk(quantity.getByRole('checkbox'))).check();
    await (
      await inDesk(quantity.getByRole('textbox'))
    ).fill(await page.locator('[data-document-source="quantity"]').innerText());
    const draft = await saved(page);
    await page.reload();
    await expect(quantity.getByRole('checkbox')).toBeChecked();
    expect(await saved(page)).toEqual(draft);
    await correct(page);
    await receipt(
      page,
      payment === 'tt' ? 'tt_verify' : payment === 'lc' ? 'lc_present' : 'oa_due',
      info,
    );
    await receipt(
      page,
      payment === 'tt' ? 'tt_chase' : payment === 'lc' ? 'lc_collect' : 'oa_chase',
      info,
    );
    if (payment === 'oa') {
      await receipt(page, 'oa_recover', info);
      await decide(page, 'oa_complete');
    }
    await end(page);
    expect(errors).toEqual([]);
  });
}

test('询盘表情随阅读和回复切换，客户图集故障回退原图，未知发件人不冒用身份', async ({
  page,
}, info) => {
  await startInquiry(page);
  await readMail(page, 'buyer');
  const portrait = page.locator('.story-stage .character-portrait');
  await expect(portrait).toHaveAttribute('data-expression', 'considering');
  const before = await saved(page);
  await page.route('**/cast-thinking-v1*', (route) => route.abort());
  await page.reload();
  await expect(portrait).toHaveAttribute('data-portrait-fallback', 'true');
  await expect(portrait.locator('img')).toHaveAttribute('src', /cast-v1-delivery\.webp$/);
  expect(await saved(page)).toEqual(before);
  await page.unroute('**/cast-thinking-v1*');
  await page.reload();
  await expect(portrait).toHaveAttribute('data-portrait-fallback', 'false');
  await expect(portrait.locator('img')).toHaveJSProperty('naturalWidth', 1536);
  await page
    .locator('.story-stage')
    .screenshot({ path: info.outputPath('customer-reading.png'), animations: 'disabled' });
  await choose(page, 'classify_buyer_buyer');
  await review(page);
  await continueReview(page);
  await expect(portrait.locator('img')).toHaveAttribute('src', /cast-v1-delivery\.webp$/);
  await choose(page, 'reply_buyer_safe');
  await review(page);
  await continueReview(page);
  await readMail(page, 'competitor');
  await expect(portrait).toHaveAttribute('data-actor', 'unknown');
  await expect(portrait.locator('.character-fallback')).toHaveText('?');
  await choose(page, 'classify_competitor_competitor');
  await review(page);
  await continueReview(page);
  await choose(page, 'reply_competitor_safe');
  await review(page);
  await continueReview(page);
  await readMail(page, 'fraud');
  await expect(portrait).toHaveAttribute('data-actor', 'customer_d');
  await expect(portrait).toHaveAttribute('data-expression', 'considering');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(portrait.locator('.character-crop')).toHaveCSS('animation-name', 'none');
  await choose(page, 'classify_fraud_fraud');
  await review(page);
  await continueReview(page);
  await choose(page, 'reply_fraud_safe');
  await review(page);
  await continueReview(page);
  await choose(page, 'fraud_stop');
  await next(page);
  await noOverflow(page);
});
