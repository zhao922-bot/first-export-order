import { inDesk } from './desk-helpers';
import { expect, type Page } from '@playwright/test';
export async function useRescue(page: Page) {
  await expect(page.getByTestId('rescue-checkpoint')).toBeVisible();
  await (
    await inDesk(page.getByRole('button', { name: '查看林姐的救援复盘', exact: true }))
  ).click();
  await (
    await inDesk(page.getByRole('button', { name: '使用一次纠错，恢复检查点', exact: true }))
  ).click();
  await expect(page.getByTestId('rescue-checkpoint')).toHaveCount(0);
}
export async function declineRescue(page: Page) {
  await (
    await inDesk(page.getByRole('button', { name: '查看林姐的救援复盘', exact: true }))
  ).click();
  await (
    await inDesk(page.getByRole('button', { name: '拒绝纠错，查看风险确认', exact: true }))
  ).click();
  await (
    await inDesk(page.getByRole('button', { name: '确认仍放单并承担坏账', exact: true }))
  ).click();
}
