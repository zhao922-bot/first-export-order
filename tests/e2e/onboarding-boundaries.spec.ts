import { inDesk } from './desk-helpers';
import { test, expect, type Page } from '@playwright/test';
import { begin, documents, correct, end } from './collection-helpers';
import { decide, saved } from './procurement-helpers';

test('报价定位跟随未应用参数和字段错误，收起高亮保留读屏错误说明', async ({ page }) => {
  await page.goto('/');
  await (await inDesk(page.getByRole('button', { name: '跳过引导', exact: true }))).click();
  await (await inDesk(page.getByRole('button', { name: '直接练习报价', exact: true }))).click();
  await expect(page.getByLabel('汇率 E', { exact: true })).toBeVisible();
  await (await inDesk(page.getByRole('button', { name: '下一步提示', exact: true }))).click();
  await (await inDesk(page.getByLabel('汇率 E', { exact: true }))).fill('7.50');
  const apply = page.getByRole('button', { name: '应用参数并清空草稿', exact: true });
  await expect(apply).toHaveClass(/onboarding-highlight/);
  await guideClick(page, '定位当前操作');
  await expect(apply).toBeFocused();
  await (await inDesk(apply)).click();
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  const field = page.getByLabel('每件预计退税（CNY/件）', { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', /error-rebateUnitCny/);
  await guideClick(page, '定位当前操作');
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-describedby', /onboarding-text/);
  await guideClick(page, '收起提示');
  await expect(field).toHaveAttribute('aria-describedby', 'error-rebateUnitCny');
  await expect(page.locator('.onboarding-highlight')).toHaveCount(0);
});

test('明确跳过后不主动提醒，手动提示仍可用；刷新保留关闭偏好', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await (await inDesk(page.getByRole('button', { name: '跳过引导', exact: true }))).click();
  await (await inDesk(page.getByRole('button', { name: '直接练习报价', exact: true }))).click();
  await expect(page.getByLabel('汇率 E', { exact: true })).toBeVisible();
  await page.clock.runFor(125000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
  await (await inDesk(page.getByRole('button', { name: '下一步提示', exact: true }))).click();
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-guide-step', 'quote');
  await guideClick(page, '收起提示');
  await page.reload();
  await page.clock.runFor(125000);
  await expect(page.getByTestId('onboarding-idle')).toHaveCount(0);
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
});

test('七关各入口与结局主动求助可定位，始终不提交业务操作', async ({ page }) => {
  test.setTimeout(120000);
  const stages: number[] = [];
  await begin(page, {
    checkpoint: async (stage) => {
      stages.push(stage);
      const before = await saved(page);
      await (await inDesk(page.getByRole('button', { name: '下一步提示', exact: true }))).click();
      await expect(page.getByTestId('onboarding')).toBeVisible();
      await guideClick(page, '定位当前操作');
      await expect(page.locator('.onboarding-highlight').first()).toBeVisible();
      expect(await saved(page)).toEqual(before);
      // Locating a paginated control collapses the overlay so the player can use it.
      if (!(await page.getByTestId('onboarding').count()))
        await page.getByRole('button', { name: '下一步提示', exact: true }).click();
      const skip = page.getByRole('button', { name: '跳过引导', exact: true });
      if (await skip.count()) await (await inDesk(skip)).click();
      else await guideClick(page, '收起提示');
    },
  });
  expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  await documents(page);
  await correct(page);
  await decide(page, 'tt_verify');
  await decide(page, 'tt_chase');
  await end(page);
  const before = await saved(page);
  await (await inDesk(page.getByRole('button', { name: '下一步提示', exact: true }))).click();
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-guide-step', 'ending');
  await guideClick(page, '定位当前操作');
  await expect(page.locator('.decision-replay summary').first()).toBeFocused();
  expect(await saved(page)).toEqual(before);
});

async function guideClick(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.count()))
    await page.getByRole('button', { name: '下一步提示', exact: true }).click();
  await button.click();
}
