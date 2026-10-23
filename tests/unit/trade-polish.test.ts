import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import raw from '../../src/content/presentation.json';
import { parsePresentation, presentation } from '../../src/content/presentation';
import { presentationSchema } from '../../src/domain/schemas/presentation';
import {
  decisionReceipt,
  mentorCue,
  mentorExpression,
  workspacePhase,
} from '../../src/app/presentation';
import { eventPack, pack } from '../fixtures/economy';
import { collectionGame, acceptDocuments, collect } from '../fixtures/collection';
import { taxEvidence } from '../../src/engine/slice/collection';
import { procurementGame, checkFunding } from '../fixtures/procurement';
import { logisticsGame, selectLogistics, declaration } from '../fixtures/logistics';
import { negotiationGame, toContract, confirmAll } from '../fixtures/negotiation';
import { importSave, encodeSave } from '../../src/persistence/sliceSave';

describe('六关业务现场 JSON 契约', () => {
  it('所有第 2–7 关操作节点恰好映射一个业务环节；未知节点不显示完成状态', () => {
    const data = parsePresentation(raw, [eventPack]);
    for (const node of eventPack.nodes.filter(
      (n) => /^L0[2-7]\./.test(n.id) && n.type !== 'review',
    )) {
      const result = workspacePhase(data, node.id);
      expect(result?.workspace.stage, node.id).toBe(node.stage);
      expect(result?.phase.note, node.id).toBeTruthy();
    }
    expect(workspacePhase(data, 'EVT.e05.choice')).toBeNull();
    expect(workspacePhase(data, 'L06.unknown')).toBeNull();
  });
  it.each(['duplicate', 'missing', 'foreign', 'review', 'path'] as const)(
    '拒绝不一致配置：%s',
    (kind) => {
      const data = structuredClone(raw);
      if (kind === 'duplicate') data.workspaces[0]!.phases[1]!.nodeIds.push('L02.inbox');
      if (kind === 'missing') data.workspaces.pop();
      if (kind === 'foreign') data.workspaces[0]!.phases[0]!.nodeIds[0] = 'L05.pi';
      if (kind === 'review') data.workspaces[0]!.phases[0]!.nodeIds[0] = 'L02.finish';
      if (kind === 'path') data.customers.atlas = 'https://example.com/portrait.png';
      expect(() => parsePresentation(data, [eventPack])).toThrow();
    },
  );
  it('新增客户图集保持 3×2 RGBA，阅读与回应使用相同规则，不按身份或信用推断表情', () => {
    const png = readFileSync('public/' + presentation.customers.atlas);
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1536, 1024, 6]);
    for (const type of ['buyer', 'competitor', 'fraud']) {
      expect(workspacePhase(presentation, `L02.${type}.classify`)?.phase.customerExpression).toBe(
        'considering',
      );
      expect(workspacePhase(presentation, `L02.${type}.reply`)?.phase.customerExpression).toBe(
        'neutral',
      );
    }
    expect(
      presentationSchema.safeParse({
        ...raw,
        customers: { ...raw.customers, riskExpression: 'evil' },
      }).success,
    ).toBe(false);
  });
  it.each([
    ['L02.inbox', 'thinking'],
    ['L03.step.cost', 'explaining'],
    ['L03.margin.review', 'concerned'],
    ['L04.signed.review', 'encouraging'],
    ['L05.inspection', 'explaining'],
    ['L06.plan', 'thinking'],
    ['L06.risk.review', 'concerned'],
    ['L07.tax', 'explaining'],
    ['L07.finish.review', 'encouraging'],
  ])('按业务情境映射林姐表情：%s → %s', (nodeId, expression) => {
    const cue = mentorCue(presentation, {
      nodeId: nodeId!,
      feedback: false,
      review: nodeId!.includes('review'),
      event: false,
    });
    expect(mentorExpression(presentation, cue).id).toBe(expression);
  });
});

describe('操作回执只读且不提前确认业务事实', () => {
  it.each(['tt', 'lc', 'oa'])('%s：PI 确认、银行核验与供应商支出分别投影', (payment) => {
    const game = procurementGame('cup_500_verified', payment, 'cif');
    for (const field of pack.procurement!.piFields)
      game.act({ type: 'confirmPi', fieldId: field.id, checked: true });
    game.choose('pi_accept');
    expect(decisionReceipt(presentation, game.session)!.deltas.cashCnyFen).toBe(0);
    game.advance();
    game.advance();
    checkFunding(game);
    game.choose('funding_verify');
    const funding = decisionReceipt(presentation, game.session)!;
    if (payment === 'tt') expect(funding.deltas.cashCnyFen).toBeGreaterThan(0);
    else if (payment === 'lc') {
      // 确认信用证会支付银行办理费，但不是收到客户定金。
      expect(funding.deltas.cashCnyFen).toBeLessThan(0);
      expect(funding.deltas.profitCnyFen).toBe(funding.deltas.cashCnyFen);
    } else expect(funding.deltas.cashCnyFen).toBe(0);
    game.advance();
    game.advance();
    game.choose('supplier_deposit');
    expect(decisionReceipt(presentation, game.session)!.deltas.cashCnyFen).toBeLessThan(0);
    expect(decisionReceipt(presentation, game.session)!.deltas.profitCnyFen).toBe(0);
  });
  it('订舱支出不把备货状态提前显示为已装船或已交付', () => {
    const game = logisticsGame('tt', 'cif');
    selectLogistics(game);
    declaration(game);
    game.choose('logistics_book');
    const receipt = decisionReceipt(presentation, game.session)!;
    expect(receipt.deltas.cashCnyFen).toBeLessThan(0);
    expect(receipt.status).toBe('备货就绪');
    expect(game.session.logistics!.shipmentDay).toBeNull();
    expect(game.session.snapshot.order.deliveryCompletedDay).toBeNull();
  });
  it('签约只展示合同状态与真实零现金变化；不回放过期的决策', () => {
    const game = negotiationGame();
    toContract(game);
    confirmAll(game);
    game.choose('contract_sign');
    const before = JSON.stringify(game.session);
    const receipt = decisionReceipt(presentation, game.session)!;
    expect(receipt.deltas.cashCnyFen).toBe(0);
    expect(receipt.deltas.profitCnyFen).toBe(0);
    expect(receipt.status).toBe('已签约 · 待履约');
    expect(JSON.stringify(game.session)).toBe(before);
    game.advance();
    expect(decisionReceipt(presentation, game.session)).toBeNull();
    const stale = JSON.parse(before) as typeof game.session;
    stale.snapshot.story.decisionLog.at(-1)!.nodeId = 'L04.price';
    expect(decisionReceipt(presentation, stale)).toBeNull();
  });
  it.each(['tt', 'lc', 'oa'])(
    '%s 收款与退税核验、到账分别显示，反复投影与存档往返不改 RNG/账本',
    (payment) => {
      const game = collectionGame(payment, 'cif');
      acceptDocuments(game);
      collect(game);
      for (const field of pack.collection!.taxEvidence)
        game.act({
          type: 'assessTax',
          fieldId: field.id,
          answer: taxEvidence(game.session, pack)[field.id] ? 'verified' : 'missing',
        });
      game.choose('tax_verify');
      expect(decisionReceipt(presentation, game.session)!.deltas.cashCnyFen).toBe(0);
      expect(decisionReceipt(presentation, game.session)!.deltas.profitCnyFen).toBeGreaterThan(0);
      game.advance();
      game.advance();
      const receiptless = decisionReceipt(presentation, game.session);
      expect(receiptless).toBeNull();
      expect(game.session.collection!.taxEligible).toBe(true);
      const before = game.session.snapshot.player.cashCnyFen;
      game.choose('tax_receive');
      const receipt = decisionReceipt(presentation, game.session)!;
      expect(receipt.deltas.cashCnyFen).toBe(game.session.snapshot.player.cashCnyFen - before);
      expect(receipt.deltas.cashCnyFen).toBeGreaterThan(0);
      const frozen = JSON.stringify(game.session);
      for (let i = 0; i < 10; i++)
        expect(decisionReceipt(presentation, game.session)).toEqual(receipt);
      expect(JSON.stringify(game.session)).toBe(frozen);
      const saved = { session: game.session, parameterDraft: null };
      expect(importSave(encodeSave(saved, pack), pack)).toEqual(saved);
      const changed = structuredClone(presentation);
      changed.workspaces[5]!.receiptTitle = '可配置的收汇回执';
      expect(decisionReceipt(changed, game.session)!.title).toBe('可配置的收汇回执');
    },
  );
  it('冻结的旧版付费存档没有新展示字段也能导入，所有演出读取不更改经营存档', () => {
    const saved = importSave(
      readFileSync('tests/fixtures/visual-v020-paid-save.json', 'utf8'),
      eventPack,
    );
    const before = JSON.stringify(saved);
    expect(decisionReceipt(presentation, saved.session)).toBeNull();
    for (const workspace of presentation.workspaces)
      for (const phase of workspace.phases)
        for (const node of phase.nodeIds) workspacePhase(presentation, node);
    expect(JSON.stringify(saved)).toBe(before);
  });
});
