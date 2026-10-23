import { describe, it, expect } from 'vitest';
import { pack, golden } from '../fixtures/economy';
import { createSliceSession, sliceSessionSchema } from '../../src/engine/slice/session';
import { reduceSlice, currentNode, type SliceAction } from '../../src/engine/slice/reducer';
import { parseContent, validateContent } from '../../src/content/validation';
import { quoteScenario } from '../../src/engine/slice/scenario';
import { calculateQuote } from '../../src/engine/economy/quote';
import { completeInquiries } from '../fixtures/inquiry';
const correct = {
  rebateUnitCny: '2.23',
  fobCostUnitCny: '26.47',
  rateBasis: 'costMarkup',
  fobUnitUsd: '4.08',
  cifUnitUsd: '4.68',
};
function game(practice = false) {
  let session = createSliceSession(pack, 'test.session', practice),
    count = 0;
  const act = (action: SliceAction) =>
    (session = reduceSlice(session, pack, {
      id: 'command.' + ++count,
      revision: session.snapshot.revision,
      action,
    }));
  return {
    get session() {
      return session;
    },
    act,
    advance: () => act({ type: 'advance' }),
    choose: (choiceId: string) => act({ type: 'choose', choiceId }),
    submit: (answers: Record<string, string>) => act({ type: 'submit', answers }),
  };
}
describe('JSON 驱动 L01/L02/L03', () => {
  it('三个产品、九供应商可达，MOQ 与参数全部可计算', () => {
    expect(parseContent(pack)).toEqual(pack);
    for (const supplier of pack.suppliers) {
      const input = quoteScenario(pack, supplier.id);
      expect(input.quantity).toBeGreaterThanOrEqual(supplier.moq);
      expect(calculateQuote(input).ok).toBe(true);
      expect(input.rebateEligible).toBe(supplier.credentials.every((c) => c.status === 'verified'));
    }
    expect(pack.nodes.every((n) => [1, 2, 3, 4, 5, 6, 7].includes(n.stage))).toBe(true);
  });
  it.each(['cup_500', 'tws', 'yoga'])('选品 %s → 三家供应商 → 付费核验 → 报价', (product) => {
    const g = game();
    g.choose('select_' + product);
    expect(g.session.feedback).not.toBeNull();
    g.advance();
    expect(currentNode(pack, g.session).type).toBe('choice');
    g.choose('select_' + product + '_verified');
    g.advance();
    expect(currentNode(pack, g.session).type).toBe('review');
    g.advance();
    g.choose('verify_' + product);
    expect(g.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(g.session.snapshot.player.cumulativeProfitCnyFen).toBe(-20000);
    g.advance();
    expect(g.session.snapshot.story.stage).toBe(1);
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('L02.inbox');
    completeInquiries(g);
    expect(g.session.snapshot.story.nodeId).toBe('L03.main');
    expect(g.session.snapshot.gameDay).toBe(3);
    expect(g.session.snapshot.order.deliveryDueDay).toBeNull();
  });
  it('低价凭证不足，核验不自动变资格；允许返工更换', () => {
    const g = game();
    g.choose('select_cup_500');
    g.advance();
    g.choose('select_cup_500_budget');
    g.advance();
    g.advance();
    expect(g.session.snapshot.order.flags.supplierRisk).toBe(true);
    g.choose('change_cup_500');
    g.advance();
    expect(g.session.snapshot.gameDay).toBe(2);
    g.choose('select_cup_500_budget');
    g.advance();
    g.advance();
    g.choose('verify_cup_500');
    g.advance();
    g.advance();
    completeInquiries(g);
    expect(g.session.quoteInput.rebateEligible).toBe(false);
    expect(() =>
      g.act({ type: 'configure', input: { ...g.session.quoteInput, rebateEligible: true } }),
    ).toThrow('凭证');
    expect(() =>
      g.act({ type: 'configure', input: { ...g.session.quoteInput, quantity: 1999 } }),
    ).toThrow('MOQ');
  });
  it('JSON 修改后果会改变实际显示；禁止接入未实现关卡/效果', () => {
    const modified = structuredClone(pack);
    const node = modified.nodes[0]!;
    if (node.type !== 'choice') throw new Error('fixture');
    node.choices[0]!.feedback = 'JSON 中的新后果文案';
    const original = createSliceSession(modified, 'test.changed');
    const next = reduceSlice(original, modified, {
      id: 'change',
      revision: 0,
      action: { type: 'choose', choiceId: node.choices[0]!.id },
    });
    expect(next.feedback?.text).toBe('JSON 中的新后果文案');
    node.stage = 7;
    expect(validateContent(modified).ok).toBe(false);
    node.stage = 1;
    node.choices[0]!.effects = [{ op: 'rule', ruleId: 'contract.sign', args: {} }];
    expect(validateContent(modified).ok).toBe(false);
  });
  it('漏算退税：后果 → 林姐 → 退税/成本/口径/FOB/CIF → 完整复核', () => {
    const g = game(true);
    g.submit({ ...correct, rebateUnitCny: '0', fobCostUnitCny: '28.7', fobUnitUsd: '4.42' });
    expect(g.session.feedback?.text).toContain('漏算');
    expect(g.session.snapshot.player.reputation).toBe(60);
    expect(g.session.snapshot.story.nodeId).toBe('L03.main');
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('L03.rebate.review');
    g.advance();
    for (const field of [
      'rebateUnitCny',
      'fobCostUnitCny',
      'rateBasis',
      'fobUnitUsd',
      'cifUnitUsd',
    ] as const) {
      g.submit({ [field]: correct[field] });
      g.advance();
    }
    expect(g.session.snapshot.story.nodeId).toBe('L03.final-check');
    g.submit(correct);
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('L03.success');
    g.advance();
    g.choose('finish_quote_practice');
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('slice.done');
    expect(g.session.accepted).toBe(true);
    expect(g.session.snapshot.player.reputation).toBe(60);
    expect(g.session.snapshot.gameDay).toBe(0);
    expect(g.session.snapshot.player.cashCnyFen).toBe(10000000);
  });
  it('口径误用：只从口径、FOB、CIF纠错，最终必须完整核对', () => {
    const g = game(true);
    g.submit({ ...correct, fobUnitUsd: '4.13', rateBasis: 'salesMargin' });
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('L03.margin.review');
    g.advance();
    for (const field of ['rateBasis', 'fobUnitUsd', 'cifUnitUsd'] as const) {
      g.submit({ [field]: correct[field] });
      g.advance();
    }
    g.submit(correct);
    expect(g.session.accepted).toBe(true);
  });
  it('格式错误与分步错误不重复罚分；首错不终止', () => {
    const g = game(true);
    g.submit({ ...correct, fobUnitUsd: '' });
    expect(g.session.fieldErrors[0]?.code).toBe('FORMAT');
    expect(g.session.snapshot.player.reputation).toBe(60);
    expect(g.session.feedback).toBeNull();
    g.submit({ ...correct, rebateUnitCny: '0' });
    g.advance();
    g.advance();
    g.submit({ rebateUnitCny: '999' });
    expect(g.session.snapshot.player.reputation).toBe(60);
    g.advance();
    expect(currentNode(pack, g.session).type).toBe('review');
    g.advance();
    expect(g.session.snapshot.story.nodeId).toBe('L03.step.rebate');
  });
  it('command 幂等、过期拒绝、重发不增加流水/证据/时间', () => {
    const original = createSliceSession(pack, 'test.idempotent');
    const command = {
      id: 'command.one',
      revision: 0,
      action: { type: 'choose', choiceId: 'select_cup_500' } as const,
    };
    const first = reduceSlice(original, pack, command);
    expect(reduceSlice(first, pack, command)).toBe(first);
    const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(first)) as unknown);
    expect(reduceSlice(restored, pack, command)).toEqual(first);
    expect(() => reduceSlice(first, pack, { ...command, id: 'different' })).toThrow('过期');
    expect(original.snapshot.story.decisionLog).toHaveLength(0);
  });
  it('草稿、待展示反馈、已抽取参数刷新后保留；提交后锁定参数', () => {
    const g = game(true);
    g.act({ type: 'configure', input: { ...golden, quantity: 3000 } });
    g.act({ type: 'draft', answers: { fobUnitUsd: '4.42' } });
    const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)) as unknown);
    expect(restored.quoteInput.quantity).toBe(3000);
    expect(restored.answers.fobUnitUsd).toBe('4.42');
    g.submit({ ...correct, rebateUnitCny: '0' });
    expect(() => g.act({ type: 'configure', input: golden })).toThrow('锁定');
    expect(
      sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)) as unknown).feedback,
    ).toEqual(g.session.feedback);
  });
});
