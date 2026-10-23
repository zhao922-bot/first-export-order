import { describe, expect, it } from 'vitest';
import { pack } from '../fixtures/economy';
import { procurementGame, produce, acceptPi, verifyFunding } from '../fixtures/procurement';
import { collectionGame, acceptDocuments, finishCollection } from '../fixtures/collection';
import { decide } from '../fixtures/negotiation';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { sliceSessionSchema } from '../../src/engine/slice/session';
import { businessDraw } from '../../src/engine/story/businessRandom';
import { buildCollectionView } from '../../src/app/collectionView';
import { accountBalance } from '../../src/engine/economy/ledger';
import { validateContent } from '../../src/content/validation';

describe('业务因果校正：OA 回款', () => {
  it.each([
    ['realism.0', 'oa_delayed'],
    ['realism.2', 'oa_full'],
    ['realism.4', 'oa_partial_loss'],
    ['realism.13', 'oa_default'],
  ])('生产权重种子 %s 锁定 %s，恢复后核验结果不变', (seed, expected) => {
    const g = collectionGame('oa', 'fob', 'cup_500_verified', 2000, pack, seed);
    acceptDocuments(g);
    decide(g, 'oa_due');
    expect(g.session.collection!.oaScenarioId).toBe(expected);
    const before = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)));
    const cmd = {
      id: seed + '.first',
      revision: before.snapshot.revision,
      action: { type: 'choose', choiceId: 'oa_chase' } as const,
    };
    expect(reduceSlice(before, pack, cmd)).toEqual(reduceSlice(g.session, pack, cmd));
  });
  it.each([
    ['oa_full', 816000, 0, 0],
    ['oa_delayed', 0, 816000, 21],
    ['oa_partial_loss', 408000, 204000, 37],
    ['oa_default', 0, 0, 74],
  ] as const)('%s 只按实际流水记账，不保证催齐', (id, first, second, days) => {
    const content = structuredClone(pack);
    const scenario = content.collection!.oaScenarios.find((s) => s.id === id)!;
    // 两个合法配置具有相同业务事实，边界测试不依赖抽样选中了哪项。
    content.collection!.oaScenarios = [scenario, { ...scenario, id: id + '.copy' }];
    expect(validateContent(content).ok).toBe(true);
    const game = collectionGame('oa', 'fob', 'cup_500_verified', 2000, content);
    acceptDocuments(game);
    const before = structuredClone(game.session);
    const cmd = {
      id: 'oa.lock',
      revision: before.snapshot.revision,
      action: { type: 'choose', choiceId: 'oa_due' } as const,
    };
    const locked = reduceSlice(before, content, cmd);
    const restored = sliceSessionSchema.parse(JSON.parse(JSON.stringify(locked)));
    expect(reduceSlice(restored, content, cmd)).toEqual(locked);
    expect(locked.snapshot.journal).toEqual(before.snapshot.journal);
    expect(locked.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
    expect(locked.snapshot.story.drawCount).toBe(before.snapshot.story.drawCount + 1);
    game.restore(restored);
    game.advance();
    game.advance();
    expect(buildCollectionView(game.session, content)!.oaEvidence).not.toContain(
      scenario.recoveryEvidence,
    );
    decide(game, 'oa_chase');
    expect(game.session.collection!.receivedUsdCent).toBe(first);
    expect(buildCollectionView(game.session, content)!.oaEvidence).toBe(scenario.firstEvidence);
    const partial = structuredClone(game.session);
    if (!first) {
      expect(partial.snapshot.journal).toEqual(before.snapshot.journal);
      expect(partial.collection!.bankFeeFen).toBe(0);
    }
    if (!game.session.collection!.collectionClosed) {
      expect(() => game.choose('oa_writeoff')).toThrow('不可用');
      game.restore(sliceSessionSchema.parse(JSON.parse(JSON.stringify(partial))));
      decide(game, 'oa_recover');
      expect(game.session.collection!.receivedUsdCent).toBe(first + second);
      expect(game.session.snapshot.gameDay).toBe(before.snapshot.order.collectionDueDay! + days);
      expect(() => game.choose('oa_recover')).toThrow('不可用');
      expect(game.session.snapshot.story.rngState).toEqual(before.snapshot.story.rngState);
      if (first + second < 816000) {
        const remainder = 816000 - first - second;
        expect(game.session.collection!.outstandingUsdCent).toBe(remainder);
        expect(game.session.collection!.collectionClosed).toBe(false);
        expect(game.session.collection!.badDebtFen).toBe(0);
        const cash = game.session.snapshot.player.cashCnyFen;
        const receivable = accountBalance(game.session.snapshot.journal, 'receivable');
        expect(receivable).toBe(remainder * 7.2);
        expect(buildCollectionView(game.session, content)!.oaEvidence).toContain(
          scenario.lossEvidence,
        );
        decide(game, 'oa_writeoff');
        expect(game.session.snapshot.player.cashCnyFen).toBe(cash);
        expect(game.session.collection!.badDebtFen).toBe(receivable);
      }
    }
    if (first + second === 816000) decide(game, 'oa_complete');
    expect(game.session.collection!.bankFeeFen).toBe(
      first + second ? content.collection!.oaBankFeeFen : 0,
    );
    finishCollection(game);
    expect(game.session.ending).not.toBeNull();
    expect(accountBalance(game.session.snapshot.journal, 'receivable')).toBe(0);
    expect(game.session.snapshot.order.overdueDaysCharged).toBe(
      before.snapshot.order.overdueDaysCharged,
    );
    expect(game.session.collection!.taxEligible).toBe(first + second === 816000);
  });
  it('跨种子覆盖四种 OA 情境且同种子固定', () => {
    const seen = new Set<string>();
    const scenarios = pack.collection!.oaScenarios;
    const total = scenarios.reduce((n, s) => n + s.weight, 0);
    for (let i = 0; i < 1000; i++) {
      const seed = 'business.coverage.' + i,
        fact = 'oa:order.' + seed + ':customer_c';
      const value = businessDraw(seed, fact);
      expect(businessDraw(seed, fact)).toBe(value);
      let cursor = value * total;
      seen.add(scenarios.find((s) => (cursor -= s.weight) < 0)!.id);
    }
    expect([...seen].sort()).toEqual(scenarios.map((s) => s.id).sort());
  });
});

describe('业务因果校正：供应商信息与实物证据分离', () => {
  it.each([
    ['cup_500_verified', 'batch.37', true],
    ['cup_500_budget', 'batch.0', false],
  ] as const)('生产概率：%s / %s 的实物异常为 %s', (supplier, seed, issue) => {
    const g = procurementGame(supplier, 'tt', 'fob', 2000, 'customer_c', seed);
    produce(g);
    expect(g.session.procurement!.qualityIssue).toBe(issue);
    expect(g.session.procurement!.documentsMissing).toBe(supplier.endsWith('budget'));
  });
  it.each(['cup_500_verified', 'cup_500_budget'])(
    '%s 风险边界独立于资质，批次判定只执行一次',
    (supplier) => {
      for (const risk of ['0', '1']) {
        const content = structuredClone(pack);
        content.suppliers.find((s) => s.id === supplier)!.qualityRisk = risk;
        const g = procurementGame(
          supplier,
          'tt',
          'fob',
          2000,
          'customer_c',
          'quality.boundary',
          'amend',
          content,
        );
        expect(g.session.procurement!.qualityIssue).toBe(false);
        expect(g.session.procurement!.qualityRoll).toBeNull();
        acceptPi(g);
        verifyFunding(g);
        decide(g, 'supplier_deposit');
        const stream = structuredClone(g.session.snapshot.story.rngState);
        g.choose('production_wait');
        g.advance();
        expect(g.session.procurement!.qualityIssue).toBe(risk === '1');
        expect(g.session.procurement!.documentsMissing).toBe(supplier.endsWith('budget'));
        expect(g.session.snapshot.story.rngState).toEqual(stream);
        const reloaded = sliceSessionSchema.parse(JSON.parse(JSON.stringify(g.session)));
        expect(reloaded.procurement).toEqual(g.session.procurement);
        const same = procurementGame(
          supplier,
          'tt',
          'fob',
          2000,
          'customer_c',
          'quality.boundary',
          'amend',
          content,
        );
        produce(same);
        expect(same.session.procurement!.qualityRoll).toBe(reloaded.procurement!.qualityRoll);
        expect(same.session.snapshot.journal).toEqual(reloaded.snapshot.journal);
      }
    },
  );
  it('生产风险概率不是凭证缺失的必然判罚：核验供应商有异常，未核验也有合格批次', () => {
    for (const supplier of ['cup_500_verified', 'cup_500_budget']) {
      const risk = Number(pack.suppliers.find((s) => s.id === supplier)!.qualityRisk);
      const outcomes = new Set<boolean>();
      for (let i = 0; i < 1000; i++) {
        const seed = 'quality.population.' + i;
        outcomes.add(businessDraw(seed, 'quality:order.' + seed + ':' + supplier) < risk);
      }
      expect(outcomes).toEqual(new Set([false, true]));
    }
  });
});

describe('校正配置回归', () => {
  it.each([
    (p: typeof pack) => {
      p.collection!.oaScenarios[0]!.weight = 0;
    },
    (p: typeof pack) => {
      p.collection!.oaScenarios[1]!.id = p.collection!.oaScenarios[0]!.id;
    },
    (p: typeof pack) => {
      p.collection!.oaScenarios[3]!.lossEvidence = '';
    },
    (p: typeof pack) => {
      p.collection!.oaScenarios[0]!.lossEvidence = '无依据核销';
    },
    (p: typeof pack) => {
      p.collection!.oaScenarios[0]!.recoveryRatio = '1';
    },
    (p: typeof pack) => {
      p.suppliers[0]!.qualityRisk = '1.1';
    },
    (p: typeof pack) => {
      p.nodes.find((n) => n.id === 'L03.main')!.onEnterEffects = [
        {
          op: 'rule',
          ruleId: 'ledger.preparationExpense',
          args: { parameterId: { kind: 'literal', value: 'sampleFee' } },
        },
      ];
    },
    (p: typeof pack) => {
      const n = p.nodes.find((n) => n.id === 'L03.main')!;
      if (n.type === 'calc') n.results[0]!.nextNodeId = 'L04.cancelled';
    },
  ])('拒绝失真或损坏的业务配置 %#', (mutate) => {
    const content = structuredClone(pack);
    mutate(content);
    expect(validateContent(content).ok).toBe(false);
  });
});
