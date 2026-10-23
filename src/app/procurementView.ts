import type { ContentPack } from '../domain/types';
import type { SliceSession } from '../engine/slice/session';
import {
  inspectionExpected,
  procurementAmounts,
  fundingAmounts,
  cancellationAmounts,
} from '../engine/slice/procurement';
import { accountBalance } from '../engine/economy/ledger';
import { teachingText } from '../content/teachingText';
const money = (fen: number, currency = 'CNY') =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(fen / 100);
export function buildProcurementView(session: SliceSession, pack: ContentPack) {
  if (!session.procurement || session.snapshot.story.stage !== 5) return null;
  const value = session.procurement,
    state = session.snapshot,
    order = state.order,
    config = pack.procurement!;
  const product = pack.products.find((p) => p.id === order.productId)!,
    supplier = pack.suppliers.find((s) => s.id === order.supplierId)!,
    customer = pack.customers.find((c) => c.id === order.customerId)!;
  const amounts = procurementAmounts(session, pack),
    funds = fundingAmounts(session, pack);
  const fields = {
    parties: `买方：${customer.name} / 卖方：本教学外贸公司 / 供应商：${supplier.name}`,
    product: `${product.name} · ${product.description} · 已签条款与确认样作为验收基准`,
    quantity: `${order.quantity} 件 · 供应商 MOQ ${supplier.moq} 件`,
    amount: `USD ${order.contractUnitUsd}/件 × ${order.quantity} = ${money(order.invoiceUsdCent!, 'USD')}`,
    terms: `${order.incoterm} ${order.namedPlace} · 费用与风险按第 4 关已确认条款`,
    payment:
      order.payment === 'TT'
        ? `T/T 定金 ${new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(Number(order.flags.agreedDepositRatio))}，余款按合同提单副本与到账安排；未确认到账不放单`
        : order.payment === 'LC_SIGHT'
          ? '即期 L/C：无采购前定金，银行核验与相符交单条件适用'
          : `OA：无预付款，实际装运后 ${pack.parameters.oaDays!.value} 天到期；当前尚未装运`,
    delivery: `沿用签约第 ${order.signedDay} 天，交付截止第 ${order.deliveryDueDay} 天；EXW 工厂交付，FOB/CIF 装运港装船；收款账期另计`,
  };
  const key = order.flags.customerIsFraud
    ? 'fraud'
    : order.payment === 'TT'
      ? 'tt'
      : order.payment === 'LC_SIGHT'
        ? 'lc'
        : 'oa';
  const closed = ['ready', 'cancelled'].includes(order.status);
  const cancellation = closed ? null : cancellationAmounts(session, pack);
  const assessed = value.inspectionErrors.length > 0 || order.flags.inspectionCorrect === true;
  return {
    piFields: config.piFields.map((f) => ({
      ...f,
      value: fields[f.id],
      checked: value.piConfirmations.includes(f.id),
    })),
    fundingChecks: config.fundingChecks.map((f) => ({
      ...f,
      checked: value.fundingChecks.includes(f.id),
    })),
    fundingEvidence: teachingText(config.fundingEvidence[key], pack),
    fundingResult: teachingText(config.fundingMessages[value.fundingResult], pack),
    fundingDetails: [
      `合同买方 ${customer.name} / 受益人：本教学外贸公司`,
      order.payment === 'TT'
        ? `应核验定金 ${money(funds.depositUsdCent, 'USD')}；参考实际换汇率 ${session.quoteInput.fxCnyPerUsd} CNY/USD`
        : `合同总额 ${money(order.invoiceUsdCent!, 'USD')}；采购前不收定金`,
      ...(order.payment === 'LC_SIGHT'
        ? [
            `模拟通知行记录有效至第 ${value.lcExpiryDay} 天`,
            order.flags.lcSoftAccepted
              ? '尚保留买方单方控制的验收文件软条款，不能通过核验'
              : '已核对的修改版本无该买方控制条款，其他相符交单条件仍适用',
          ]
        : []),
    ],
    inspection: config.inspectionProfiles
      .find((p) => p.productId === order.productId)!
      .items.map((item) => ({
        id: item.id,
        label: item.label,
        viewed: value.viewedEvidence.includes(item.id),
        text: value.viewedEvidence.includes(item.id)
          ? teachingText(inspectionExpected(value, item.id) === 'pass' ? item.good : item.bad, pack)
          : '',
        answer: value.inspectionAnswers[item.id],
        error: value.inspectionErrors.includes(item.id),
      })),
    inspectionRevision: value.inspectionRevision,
    productionNote: value.productionDone
      ? value.delayIssue
        ? '本批排期变更已处置，事件耗时已计入原合同交期。'
        : '本批按计划取得首轮资料。'
      : `基础生产验货 ${Math.max(Number(pack.parameters[config.productionDaysParam]!.value), supplier.leadDays)} 天；排期异常由备货事件通知。`,
    qualityUnresolved: assessed && value.qualityIssue,
    documentsUnresolved: assessed && value.documentsMissing,
    amounts,
    closed,
    cancellationPreview: cancellation
      ? `本教学终止协议按当前生产阶段退还供应商已收定金的 ${new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(Number(cancellation.ratio))}：预计退还 ${money(cancellation.supplierRefundFen)}，其余 ${money(cancellation.lossFen)} 确认为损失。客户预收款应退还 ${money(value.customerAdvanceFen)}；以现有资金可退 ${money(cancellation.customerRefundFen)}，不足部分 ${money(cancellation.unpaidRefundFen)} 继续列负债。已发生准备费不退。`
      : '',
    cashAfterBalance: money(state.player.cashCnyFen - amounts.balance),
    customerReceived: money(value.customerAdvanceFen),
    supplierPaid: money(value.supplierDepositFen + value.supplierBalanceFen),
    supplierAdvance: money(accountBalance(state.journal, 'supplierAdvance')),
    inventory: money(accountBalance(state.journal, 'inventory')),
    customerLiability: money(0 - accountBalance(state.journal, 'customerAdvance')),
    unpaidRefund: money(value.customerAdvanceFen - value.customerRefundFen),
    supplierRefund: money(value.supplierRefundFen),
    cancellationLoss: money(value.cancellationLossFen),
    deadline:
      order.remainingDeliveryDays! < 0
        ? `已超过约定交期 ${-order.remainingDeliveryDays!} 天，需另行协商履约`
        : `距原约定交付截止还剩 ${order.remainingDeliveryDays} 天`,
    journal: state.journal
      .filter((e) => e.sourceNodeId.startsWith('L05.'))
      .map((e) => ({
        id: e.id,
        day: e.gameDay,
        description: e.description,
        cash: money(
          e.postings
            .filter((p) => p.account === 'cash')
            .reduce((sum, p) => sum + (p.side === 'debit' ? p.amountCnyFen : -p.amountCnyFen), 0),
        ),
      })),
  };
}
export type ProcurementView = NonNullable<ReturnType<typeof buildProcurementView>>;
