import { inDesk } from './desk-helpers';
import { expect, test, type Page } from '@playwright/test';
import {
  startInquiry,
  resolveMail,
  selectLead,
  review,
  continueReview,
  next,
} from './inquiry-helpers';
import { saved } from './procurement-helpers';

async function beginQuote(page: Page) {
  await startInquiry(page);
  for (const role of ['buyer', 'competitor', 'fraud'] as const) await resolveMail(page, role);
  await selectLead(page);
  await expect(page.getByTestId('cash')).toHaveText('¥99,800.00');
}
const labels = [
  '每件预计退税（CNY/件）',
  'FOB 成本基数（CNY/件）',
  '本题利润率口径',
  'FOB 对外单价（USD/件）',
  'CIF 对外单价（USD/件）',
];
async function wrong(page: Page) {
  for (const label of labels) {
    const input = page.getByLabel(label, { exact: true });
    if (await input.count()) {
      if (label === '本题利润率口径') await (await inDesk(input)).selectOption('salesMargin');
      else await (await inDesk(input)).fill('0');
    }
  }
  await (await inDesk(page.getByRole('button', { name: /提交完整报价|校核这一步/ }))).click();
}
test.setTimeout(90000);
test('连续四次数值错误：可继续纠错，刷新不扣费、不丢单、不改变客户关系', async ({ page }) => {
  await beginQuote(page);
  const initial = await saved(page);
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  expect((await saved(page)).snapshot.journal).toEqual(initial.snapshot.journal);
  for (let i = 0; i < 4; i++) {
    await wrong(page);
    expect((await saved(page)).ending).toBeNull();
    await page.reload();
    await review(page);
    await continueReview(page);
  }
  const current = await saved(page);
  expect(current.snapshot.order.status).toBe('draft');
  expect(current.snapshot.player).toEqual(initial.snapshot.player);
  expect(current.snapshot.gameDay).toBe(initial.snapshot.gameDay);
  expect(current.snapshot.journal).toEqual(initial.snapshot.journal);
  expect(current.snapshot.story.rngState).toEqual(initial.snapshot.story.rngState);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('完整流程首次数值错误仍可分步改正，不会提前终止询价', async ({ page }) => {
  await beginQuote(page);
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
  const rebate = (p / (1 + v)) * r,
    cost = p - rebate + d / q,
    fob = (cost / e) * (1 + m),
    cif = (fob + f / q) / (1 - a * i);
  const answers = [
    rebate.toFixed(2),
    cost.toFixed(2),
    'costMarkup',
    fob.toFixed(2),
    cif.toFixed(2),
  ];
  await wrong(page);
  await review(page);
  await continueReview(page);
  for (let step = 0; step < 5; step++) {
    const input = page.getByLabel(labels[step]!, { exact: true });
    if (step === 2) await (await inDesk(input)).selectOption(answers[step]!);
    else await (await inDesk(input)).fill(answers[step]!);
    await (await inDesk(page.getByRole('button', { name: /校核这一步/ }))).click();
    await next(page);
  }
  await (await inDesk(page.getByRole('button', { name: /提交完整报价/ }))).click();
  await review(page);
  await continueReview(page);
  const corrected = await saved(page);
  expect(corrected.snapshot.story.nodeId).toBe('L03.handoff');
  expect(corrected.accepted).toBe(true);
  expect(corrected.ending).toBeNull();
});
