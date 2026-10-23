import { describe, expect, it } from 'vitest';
import { pack } from '../fixtures/economy';
import {
  inquiryGame,
  resolveInquiry,
  finishInquiries,
  completeInquiries,
} from '../fixtures/inquiry';
import { initialSnapshot, sliceSessionSchema } from '../../src/engine/slice/session';
import { inquiryInbox, prepareInquiries } from '../../src/engine/slice/inquiry';
import { currentNode, matches, reduceSlice } from '../../src/engine/slice/reducer';
import { validateContent } from '../../src/content/validation';
import { calculateQuote } from '../../src/engine/economy/quote';
import { stageRoute } from '../../src/app/stageRoute';

describe('第 2 关：客户、询盘、复盘与跨关状态', () => {
  it('首次 C，三封匿名类别的来信；五类档案和六模板都有完整数据', () => {
    const game = inquiryGame();
    expect(game.session.snapshot.order.customerId).toBe('customer_c');
    expect(pack.customers.map((c) => c.persona)).toEqual([
      'precise',
      'bargainer',
      'novice',
      'fraud',
      'potential',
    ]);
    expect(pack.nodes.filter((n) => n.stage === 2)).toHaveLength(16);
    expect(
      inquiryInbox(pack, game.session.snapshot)
        .map((i) => i.senderRole)
        .sort(),
    ).toEqual(['buyer', 'competitor', 'fraud']);
    for (const c of pack.customers) {
      expect(c.identity.length).toBeGreaterThan(0);
      expect(c.bargainingStyle.length).toBeGreaterThan(10);
      expect(pack.inquiries.filter((i) => i.customerId === c.id)).toHaveLength(1);
    }
  });
  it.each([
    [1, 'customer_a'],
    [2, 'customer_b'],
    [9, 'customer_c'],
    [0, 'customer_e'],
  ] as const)('固定种子 %s 可完整推进 %s 的询盘、信任和报价', (seed, customerId) => {
    const game = inquiryGame('inquiry.seed.' + seed, false);
    const before = structuredClone(game.session.snapshot);
    expect(before.order.customerId).toBe(customerId);
    const range = pack.customers.find((c) => c.id === customerId)!.initialTrust;
    expect(before.player.trustByCustomer[customerId]).toBeGreaterThanOrEqual(range.min);
    expect(before.player.trustByCustomer[customerId]).toBeLessThanOrEqual(range.max);
    completeInquiries(game);
    expect(game.session.snapshot.story.nodeId).toBe('L03.main');
    expect(game.session.snapshot.order.customerId).toBe(customerId);
    expect(game.session.snapshot.order.supplierId).toBe(before.order.supplierId);
    expect(game.session.snapshot.order.flags.customerIsPotential).toBe(customerId === 'customer_e');
    expect(game.session.snapshot.player.trustByCustomer[customerId]).toBe(
      before.player.trustByCustomer[customerId]! + 3,
    );
    expect(game.session.snapshot.player.reputation).toBe(66);
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(game.session.snapshot.journal).toEqual(before.journal);
    expect(game.session.snapshot.story.sampledParameters.inquiryBuyerId).toBe(customerId);
    expect(game.session.quoteInput.quantity).toBeGreaterThanOrEqual(1000);
    expect(calculateQuote(game.session.quoteInput).ok).toBe(true);
  });
  it('抽样可复现，入箱顺序会变化，不消耗事件/单据流；重复准备不重抽', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const state = initialSnapshot(pack, 'inquiry.shuffle.' + i, false);
      const originalStreams = structuredClone(state.story.rngState);
      const clone = structuredClone(state);
      prepareInquiries(pack, state, false);
      prepareInquiries(pack, clone, false);
      expect(state).toEqual(clone);
      const sampled = structuredClone(state);
      prepareInquiries(pack, state, false);
      expect(state).toEqual(sampled);
      expect(state.story.rngState.events).toEqual(originalStreams.events);
      expect(state.story.rngState.documents).toEqual(originalStreams.documents);
      expect(state.story.drawCount).toBe(5);
      orders.add(
        inquiryInbox(pack, state)
          .map((i) => i.senderRole)
          .join(','),
      );
    }
    expect(orders.size).toBeGreaterThan(1);
  });
  it('未处理三封邮件不能进入报价，已处理邮件不能重复刷信誉', () => {
    const game = inquiryGame();
    const original = structuredClone(game.session);
    expect(() => game.choose('finish_inquiries')).toThrow('不可用');
    expect(game.session).toEqual(original);
    resolveInquiry(game, 'buyer');
    expect(() => game.choose('open_buyer')).toThrow('不可用');
    expect(game.session.snapshot.player.reputation).toBe(62);
    expect(game.session.snapshot.story.stage).toBe(2);
    const node = currentNode(pack, game.session);
    if (node.type !== 'choice') throw new Error('expected inbox');
    expect(
      matches(node.choices.find((c) => c.id === 'finish_inquiries')!.when, game.session, pack),
    ).toBe(false);
  });
  it.each(['buyer', 'competitor', 'fraud'] as const)(
    '%s 首次误判先给后果、林姐线索，再回复；不直接死亡',
    (role) => {
      const game = inquiryGame();
      game.choose('open_' + role);
      game.advance();
      const wrong = role === 'buyer' ? 'fraud' : 'buyer';
      game.choose('classify_' + role + '_' + wrong);
      expect(game.session.feedback?.text).toContain('信誉 −1');
      expect(game.session.snapshot.player.reputation).toBe(59);
      expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
      game.advance();
      const node = currentNode(pack, game.session);
      expect(node.type).toBe('review');
      if (node.type !== 'review') throw new Error('expected review');
      expect(node.text.length).toBeLessThanOrEqual(120);
      game.advance();
      game.choose('reply_' + role + '_safe');
      expect(game.session.feedback).not.toBeNull();
      expect(game.session.snapshot.order.flags[role + 'ClassifiedAs']).toBe(wrong);
    },
  );
  it('泄露买家底价与同行资料分别留下后果，林姐不自动抹去历史', () => {
    const game = inquiryGame();
    const initialTrust = game.session.snapshot.player.trustByCustomer.customer_c!;
    resolveInquiry(game, 'buyer', 'buyer', 'risky');
    expect(game.session.snapshot.player.trustByCustomer.customer_c).toBe(initialTrust - 3);
    expect(
      game.session.snapshot.story.decisionLog.find((d) => d.choiceId === 'reply_buyer_risky')
        ?.deltas.trust,
    ).toBe(-3);
    resolveInquiry(game, 'competitor', 'competitor', 'risky');
    expect(game.session.snapshot.order.flags.buyerPricingLeaked).toBe(true);
    expect(game.session.snapshot.order.flags.competitorPricingLeaked).toBe(true);
    expect(game.session.snapshot.player.reputation).toBe(62);
    expect(game.session.snapshot.player.cumulativeProfitCnyFen).toBe(-20000);
    expect(game.session.snapshot.scheduled).toEqual([]);
  });
  it('D 的异常付款承诺可撤回，无现金损失，风险历史保留', () => {
    const game = inquiryGame();
    resolveInquiry(game, 'fraud', 'buyer', 'risky');
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(game.session.snapshot.player.reputation).toBe(57);
    expect(game.session.snapshot.order.flags.fraudPaymentPromised).toBe(false);
    expect(game.session.snapshot.order.flags.fraudPending).toBe(false);
    expect(
      game.session.snapshot.story.decisionLog.some((d) => d.choiceId === 'reply_fraud_risky'),
    ).toBe(true);
    resolveInquiry(game, 'buyer');
    resolveInquiry(game, 'competitor');
    game.choose('finish_inquiries');
    game.advance();
    expect(() => game.choose('lead_customer_d')).toThrow('不可用');
    expect(() => game.choose('lead_customer_a')).toThrow('不可用');
    game.choose('lead_customer_c');
    game.advance();
    game.advance();
    expect(game.session.snapshot.order.flags.customerIsFraud).toBe(false);
  });
  it('固定种子可以选择 D；只带风险进报价，不生成第 4 关或实际付款', () => {
    const game = inquiryGame('inquiry.seed.2', false);
    // 特意先处理 D；之后阅读真实买家也不会抹掉风险候选。
    resolveInquiry(game, 'fraud', 'fraud', 'risky', true);
    resolveInquiry(game, 'buyer');
    resolveInquiry(game, 'competitor');
    finishInquiries(game, 'customer_d');
    expect(game.session.snapshot.order.customerId).toBe('customer_d');
    expect(game.session.snapshot.order.flags.customerIsFraud).toBe(true);
    expect(game.session.snapshot.order.flags.fraudPending).toBe(true);
    expect(game.session.snapshot.order.flags.fraudPaymentPromised).toBe(true);
    expect(game.session.snapshot.story.nodeId).toBe('L03.main');
    expect(game.session.snapshot.order.status).toBe('draft');
    expect(game.session.snapshot.order.signedDay).toBeNull();
    expect(game.session.snapshot.player.cashCnyFen).toBe(9980000);
    expect(game.session.snapshot.scheduled).toEqual([]);
    expect(game.session.snapshot.story.decisionLog.every((d) => d.stage < 4)).toBe(true);
  });
  it('正确核验仍可保留风险候选；最终选择真实买家清除待推进风险', () => {
    const game = inquiryGame();
    resolveInquiry(game, 'fraud', 'fraud', 'safe', true);
    resolveInquiry(game, 'buyer');
    resolveInquiry(game, 'competitor');
    finishInquiries(game);
    expect(game.session.snapshot.order.customerId).toBe('customer_c');
    expect(game.session.snapshot.order.flags.fraudPending).toBe(false);
  });
  it('刷新保存当前邮件、反馈、分类与随机状态；重复命令不叠加信誉', () => {
    const game = inquiryGame();
    game.choose('open_fraud');
    game.advance();
    const source = game.session;
    const command = {
      id: 'inquiry.duplicate',
      revision: source.snapshot.revision,
      action: { type: 'choose', choiceId: 'classify_fraud_fraud' } as const,
    };
    const chosen = reduceSlice(source, pack, command);
    const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(chosen)) as unknown);
    expect(restored).toEqual(chosen);
    expect(reduceSlice(restored, pack, command)).toEqual(chosen);
    expect(() => reduceSlice(restored, pack, { ...command, id: 'stale' })).toThrow('过期');
    expect(source.snapshot.player.reputation).toBe(60);
    game.restore(restored);
    game.advance();
    game.advance();
    expect(game.session.snapshot.story.nodeId).toBe('L02.fraud.reply');
    expect(game.session.snapshot.story.rngState).toEqual(chosen.snapshot.story.rngState);
  });
  it('信任与信誉使用 0–100 边界，记录实际变化', () => {
    const game = inquiryGame();
    game.session.snapshot.player.trustByCustomer.customer_c = 99;
    game.session.snapshot.player.reputation = 99;
    resolveInquiry(game, 'buyer');
    expect(game.session.snapshot.player.trustByCustomer.customer_c).toBe(100);
    expect(game.session.snapshot.player.reputation).toBe(100);
    expect(
      game.session.snapshot.story.decisionLog.find((d) => d.choiceId === 'reply_buyer_safe')?.deltas
        .trust,
    ).toBe(1);
  });
  it('剧情身份、数量、节点与信任效果错误由内容校验拒绝', () => {
    const invalid = (mutate: (copy: typeof pack) => void) => {
      const copy = structuredClone(pack);
      mutate(copy);
      expect(validateContent(copy).ok).toBe(false);
    };
    invalid((p) => {
      p.customers.pop();
    });
    invalid((p) => {
      p.parameters.firstBuyerId!.value = 'customer_d';
    });
    invalid((p) => {
      p.inquiries[0]!.customerId = 'customer_d';
    });
    invalid((p) => {
      p.inquiries[0]!.replyNodeId = 'L03.main';
    });
    invalid((p) => {
      p.inquiries[0]!.requestedQuantity = 0;
    });
    invalid((p) => {
      const n = p.nodes.find((n) => n.id === 'L02.buyer.reply')!;
      if (n.type === 'choice')
        n.choices[0]!.effects = [
          {
            op: 'rule',
            ruleId: 'customer.adjustActiveTrust',
            args: { delta: { kind: 'literal', value: 0.5 } },
          },
        ];
    });
    expect(validateContent(pack).ok).toBe(true);
  });
  it('恢复路由沿用前 3 关并可接入完整七关', () => {
    expect([1, 2, 3].map(stageRoute)).toEqual(['/supplier', '/mail', '/quote']);
    expect(stageRoute()).toBe('/supplier');
    expect(stageRoute(4)).toBe('/chat');
    expect(stageRoute(5)).toBe('/contract');
    expect(stageRoute(7)).toBe('/documents');
  });
});
