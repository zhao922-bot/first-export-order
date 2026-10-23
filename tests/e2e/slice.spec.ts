import { test, expect, type Page } from '@playwright/test';
import {
  startInquiry,
  readMail,
  resolveMail,
  selectLead,
  choose,
  review,
  continueReview,
  submitCurrentQuote,
} from './inquiry-helpers';

test('随机参数固定到本局；未应用的参数修改不能提交报价', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新开随机报价练习', exact: true }).click();
  await expect(page.getByText(/随机参数组 [123] · FOB/)).toBeVisible();
  const quantity = await page.getByLabel('数量 Q', { exact: true }).inputValue();
  const fx = await page.getByLabel('汇率 E', { exact: true }).inputValue();
  await page.reload();
  await expect(page.getByLabel('数量 Q', { exact: true })).toHaveValue(quantity);
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue(fx);
  await page.getByLabel('汇率 E', { exact: true }).fill('7.50');
  await expect(page.getByRole('button', { name: /提交完整报价/ })).toBeDisabled();
  await page.getByLabel(labels.rebate, { exact: true }).fill('2.23');
  await expect(page.getByLabel('汇率 E', { exact: true })).toHaveValue('7.50');
  await expect(page.getByRole('button', { name: /提交完整报价/ })).toBeDisabled();
  await page.getByRole('button', { name: '应用参数并清空草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: /提交完整报价/ })).toBeEnabled();
  await expect(page.getByLabel(labels.rebate, { exact: true })).toHaveValue('');
});
const labels = {
  rebate: '每件预计退税（CNY/件）',
  cost: 'FOB 成本基数（CNY/件）',
  fob: 'FOB 对外单价（USD/件）',
  cif: 'CIF 对外单价（USD/件）',
};
async function startQuote(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
}
async function fillMain(page: Page, rebate = '2.23', fob = '4.08') {
  await page.getByLabel(labels.rebate, { exact: true }).fill(rebate);
  await page.getByLabel(labels.cost, { exact: true }).fill('26.47');
  await page.getByLabel(labels.fob, { exact: true }).fill(fob);
  await page.getByLabel(labels.cif, { exact: true }).fill('4.68');
}
async function next(page: Page) {
  await page.getByRole('button', { name: /查看下一步/ }).click();
}
async function step(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: /校核这一步/ }).click();
  await next(page);
}
async function complete(page: Page) {
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await page.getByRole('button', { name: /请林姐复盘/ }).click();
  await page.getByRole('button', { name: /完成报价，选择下一步/ }).click();
  await choose(page, 'finish_quote_practice');
  await next(page);
  await expect(page.getByRole('heading', { name: '选得有依据，算得清口径。' })).toBeVisible();
  await expect(page.getByText('发票金额 US$23,400.00', { exact: true })).toBeVisible();
}
test('第 1→2→3 关：核验、三封询盘、林姐复盘、报价完成与刷新', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startInquiry(page);
  await expect(page.locator('.mail-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /三封已处理，选择报价对象/ })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('inquiry-inbox.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await readMail(page, 'buyer');
  await expect(page.getByRole('article', { name: '询盘原文' })).toContainText('Emma');
  await expect(page.getByRole('region', { name: '客户沟通档案' })).toHaveCount(0);
  const originalMail = await page.locator('.mail-message').innerText();
  await page.reload();
  await expect(page.locator('.mail-message')).toHaveText(originalMail, { useInnerText: true });
  await choose(page, 'classify_buyer_buyer');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('判断有依据');
  await review(page);
  await expect(page.getByRole('region', { name: '客户沟通档案' })).toContainText('Emma');
  await page.screenshot({ path: testInfo.outputPath('inquiry-review.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await continueReview(page);
  await choose(page, 'reply_buyer_safe');
  await review(page);
  await continueReview(page);
  await expect(page.getByTestId('mail-inquiry_buyer_c')).toBeDisabled();
  await resolveMail(page, 'competitor');
  await resolveMail(page, 'fraud');
  await selectLead(page);
  await expect(page.getByText(/Emma · 澳大利亚小店店主/)).toBeVisible();
  await expect(page.getByTestId('reputation')).toHaveText('66 / 100');
  const quantity = await page.getByLabel('数量 Q', { exact: true }).inputValue();
  expect(['1600', '2000', '2400']).toContain(quantity);
  await page.screenshot({ path: testInfo.outputPath('quote-workbench.png'), fullPage: true });
  await expect(page.getByText('第 3 天', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await expect(page.getByLabel('数量 Q', { exact: true })).toHaveValue(quantity);
  await submitCurrentQuote(page);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('漏算退税：保存后果、分步纠错直到完整报价通过', async ({ page }) => {
  await startQuote(page);
  await fillMain(page, '0', '4.42');
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await expect(page.getByRole('status')).toContainText('合资格退税被漏算');
  await expect(page.getByTestId('reputation')).toHaveText('60 / 100');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('合资格退税被漏算');
  await page.getByRole('button', { name: /请林姐复盘/ }).click();
  await expect(page.getByRole('heading', { name: '林姐 · 漏算退税' })).toBeVisible();
  await page.getByRole('button', { name: /继续练习/ }).click();
  await step(page, labels.rebate, '2.23');
  await step(page, labels.cost, '26.47');
  await page.getByLabel('本题利润率口径', { exact: true }).selectOption('costMarkup');
  await page.getByRole('button', { name: /校核这一步/ }).click();
  await next(page);
  await step(page, labels.fob, '4.08');
  await step(page, labels.cif, '4.68');
  await complete(page);
  await expect(page.getByTestId('reputation')).toHaveText('60 / 100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('利润率口径误用：后果、林姐、口径和报价重算', async ({ page }) => {
  await startQuote(page);
  await fillMain(page, '2.23', '4.13');
  await page.getByLabel('本题利润率口径', { exact: true }).selectOption('salesMargin');
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await expect(page.getByRole('status')).toContainText('当成销售毛利率');
  await page.getByRole('button', { name: /请林姐复盘/ }).click();
  await expect(page.getByRole('heading', { name: '林姐 · 利润率口径误用' })).toBeVisible();
  await page.getByRole('button', { name: /继续练习/ }).click();
  await page.getByLabel('本题利润率口径', { exact: true }).selectOption('costMarkup');
  await page.getByRole('button', { name: /校核这一步/ }).click();
  await next(page);
  await step(page, labels.fob, '4.08');
  await step(page, labels.cif, '4.68');
  await complete(page);
});
test('空白输入不罚分，草稿刷新保留，直接访问其他关卡会回到当前进度', async ({ page }) => {
  await startQuote(page);
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await expect(page.getByTestId('reputation')).toHaveText('60 / 100');
  await page.getByLabel(labels.rebate, { exact: true }).fill('2.23');
  await page.reload();
  await expect(page.getByLabel(labels.rebate, { exact: true })).toHaveValue('2.23');
  await page.goto('/#/documents');
  await expect(page).toHaveURL(/#\/quote$/);
  await expect(page.getByLabel(labels.rebate, { exact: true })).toHaveValue('2.23');
});
