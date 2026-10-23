import { expect, type Page } from '@playwright/test';
import { handleAutoEvents, installSeed, shippingSeed } from './event-helpers';

export const next = async (page: Page) => {
  await page.getByRole('button', { name: /查看下一步/ }).click();
  await handleAutoEvents(page);
};
export const review = (page: Page) => page.getByRole('button', { name: /请林姐复盘/ }).click();
export const continueReview = async (page: Page) => {
  await page.locator('.mentor-review button.primary').click();
  await handleAutoEvents(page);
};
export const choose = (page: Page, id: string) =>
  page.locator('[data-choice-id="' + id + '"]').click();

export async function startInquiry(
  page: Page,
  supplier = '恒信制造',
  checkpoint?: (stage: number) => Promise<void>,
  assessment?: () => Promise<void>,
) {
  await installSeed(page, shippingSeed('none'), true);
  const currentUrl = page.url();
  await page.goto(
    currentUrl.startsWith('trade:')
      ? 'trade://app/'
      : currentUrl.startsWith('https://localhost')
        ? 'https://localhost/'
        : '/',
  );
  if (await page.getByRole('button', { name: /重开选品练习/ }).count())
    page.once('dialog', (dialog) => dialog.accept());
  if (assessment) {
    await page.getByRole('button', { name: '前测并开始七关试玩', exact: true }).click();
    await assessment();
    await page.getByRole('link', { name: '继续当前关卡', exact: true }).click();
  } else await page.getByRole('button', { name: /开始第 1 关|重开选品练习/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  await checkpoint?.(1);
  await page.getByRole('button', { name: /选择500ml 保温杯/ }).click();
  await next(page);
  await expect(page.locator('.supplier-card')).toHaveCount(3);
  await page.getByRole('button', { name: '选择' + supplier, exact: true }).click();
  await review(page);
  await continueReview(page);
  await page.getByRole('button', { name: /支付样品核验费并保留结果/ }).click();
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
  await review(page);
  await page.getByRole('button', { name: /进入第 2 关/ }).click();
  await expect(page).toHaveURL(/#\/mail$/);
  await checkpoint?.(2);
}

export async function readMail(page: Page, role: 'buyer' | 'competitor' | 'fraud') {
  await page
    .locator(
      role === 'buyer'
        ? '[data-testid^="mail-inquiry_buyer_"]'
        : '[data-testid="mail-inquiry_' + role + '"]',
    )
    .click();
  await next(page);
}

export async function resolveMail(
  page: Page,
  role: 'buyer' | 'competitor' | 'fraud',
  guess = role,
  reply = 'safe',
  keep = false,
) {
  await readMail(page, role);
  await choose(page, 'classify_' + role + '_' + guess);
  await review(page);
  await continueReview(page);
  await choose(page, 'reply_' + role + '_' + reply);
  await review(page);
  await continueReview(page);
  if (role === 'fraud') {
    await choose(page, keep ? 'fraud_keep' : 'fraud_stop');
    await next(page);
  }
}

export async function selectLead(page: Page, customer = 'customer_c') {
  await page.getByRole('button', { name: /三封已处理，选择报价对象/ }).click();
  await next(page);
  await choose(page, 'lead_' + customer);
  await review(page);
  await page.getByRole('button', { name: /进入第 3 关/ }).click();
  await expect(page).toHaveURL(/#\/quote$/);
}

export async function submitCurrentQuote(page: Page, continueNegotiation = false) {
  const values = await Promise.all(
    [
      '含税采购价 P',
      '数量 Q',
      '增值税率 v',
      '退税率 r',
      '国内总费用 D',
      '汇率 E',
      '成本加成率 m',
      '海运总费用 F',
      '投保比例 a',
      '保险费率 i',
    ].map(async (label) => Number(await page.getByLabel(label, { exact: true }).inputValue())),
  );
  const [p, q, v, r, d, e, m, f, a, i] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  // 独立从屏幕参数复算；不读取应用答案或调用被测引擎。
  const eligible = await page
    .getByRole('checkbox', { name: /教学核验满足预计退税资格/ })
    .isChecked();
  const rebate = eligible ? (p / (1 + v)) * r : 0,
    cost = p - rebate + d / q,
    fobRaw = (cost / e) * (1 + m),
    cifRaw = (fobRaw + f / q) / (1 - a * i);
  await page.getByLabel('每件预计退税（CNY/件）', { exact: true }).fill(rebate.toFixed(2));
  await page.getByLabel('FOB 成本基数（CNY/件）', { exact: true }).fill(cost.toFixed(2));
  await page.getByLabel('本题利润率口径', { exact: true }).selectOption('costMarkup');
  await page.getByLabel('FOB 对外单价（USD/件）', { exact: true }).fill(fobRaw.toFixed(2));
  await page.getByLabel('CIF 对外单价（USD/件）', { exact: true }).fill(cifRaw.toFixed(2));
  await page.getByRole('button', { name: /提交完整报价/ }).click();
  await review(page);
  await page.getByRole('button', { name: /完成报价，选择下一步/ }).click();
  await handleAutoEvents(page);
  if (continueNegotiation) return;
  await choose(page, 'finish_quote_practice');
  await next(page);
  await expect(page.getByRole('heading', { name: '选得有依据，算得清口径。' })).toBeVisible();
}
