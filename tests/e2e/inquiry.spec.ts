import { test, expect } from '@playwright/test';
import { readBrowserSession, waitForSave } from './save-helpers';
import {
  startInquiry,
  readMail,
  resolveMail,
  selectLead,
  choose,
  review,
  continueReview,
  next,
  submitCurrentQuote,
} from './inquiry-helpers';

test('误判异常询盘、承诺付款后可撤回，刷新不丢纠错与风险历史', async ({ page }) => {
  test.setTimeout(60000);
  await startInquiry(page);
  await readMail(page, 'fraud');
  await choose(page, 'classify_fraud_buyer');
  await expect(page.getByRole('status')).toContainText('信誉 −1');
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await review(page);
  await expect(page.getByRole('heading', { name: '林姐 · 异常付款信号' })).toBeVisible();
  await continueReview(page);
  await choose(page, 'reply_fraud_risky');
  await expect(page.getByRole('status')).toContainText('本关没有实际扣款');
  await review(page);
  await continueReview(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '给异常询盘设一道边界' })).toBeVisible();
  await choose(page, 'fraud_stop');
  await next(page);
  await expect(page.getByTestId('reputation')).toHaveText('57 / 100');
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await page.getByRole('button', { name: /三封已处理，选择报价对象/ }).click();
  await next(page);
  await expect(page.locator('[data-choice-id="lead_customer_d"]')).toHaveCount(0);
  await choose(page, 'lead_customer_c');
  await review(page);
  await page.getByRole('button', { name: /进入第 3 关/ }).click();
  await expect(page).toHaveURL(/#\/quote$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('.decision-log summary').click();
  await expect(page.locator('.decision-log')).toContainText('已作出危险承诺');
  await expect(page.locator('.decision-log')).toContainText('已撤回异常承诺');
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
});

test('坚持跟进 D：风险进入报价，保持未签约且不显示客户回款预览', async ({ page }) => {
  test.setTimeout(60000);
  await startInquiry(page);
  await resolveMail(page, 'fraud', 'fraud', 'risky', true);
  await resolveMail(page, 'buyer');
  await resolveMail(page, 'competitor');
  await selectLead(page, 'customer_d');
  await expect(page.getByRole('alert')).toContainText('身份未核验');
  await expect(page.getByText(/环球急采 · 自称跨国采购代理/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('后续风险标记已保留');
  await submitCurrentQuote(page);
  await expect(page.locator('.cashflow-table')).toHaveCount(0);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  const save = await page.evaluate(readBrowserSession);
  expect(save.snapshot.order).toMatchObject({ customerId: 'customer_d', status: 'draft' });
  expect(save.snapshot.scheduled).toEqual([]);
});

test('独立报价不占用首次 C 引导；完整流程重开保存再次抽样标记', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '直接练习报价', exact: true }).click();
  await expect(page.getByLabel('数量 Q', { exact: true })).toHaveValue('5000');
  await startInquiry(page);
  await expect(page.getByTestId('mail-inquiry_buyer_c')).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /继续本地进度/ }).click();
  await expect(page).toHaveURL(/#\/mail$/);
  await page.goto('/');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /重开选品练习/ }).click();
  await waitForSave(page);
  const firstRun = (await page.evaluate(readBrowserSession)).firstInquiryRun;
  expect(firstRun).toBe(false);
});
