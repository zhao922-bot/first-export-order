import { describe, it, expect } from 'vitest';
import { pack } from '../fixtures/economy';
import { collectionGame, acceptDocuments } from '../fixtures/collection';
import { procurementGame, produce, clearInspection } from '../fixtures/procurement';
import { decide } from '../fixtures/negotiation';
import { dispatchSlice, type PlayCommand } from '../../src/engine/slice/rescue';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { type SliceSession } from '../../src/engine/slice/session';
import { encodeSave, importSave, validateSavedGame } from '../../src/persistence/sliceSave';

function client(initial: SliceSession) {
  let session = structuredClone(initial),
    n = 0;
  const act = (action: PlayCommand['action']) =>
    (session = dispatchSlice(session, pack, {
      id: 'rescue.test.' + ++n,
      revision: session.snapshot.revision,
      action,
    }));
  return {
    get session() {
      return session;
    },
    act,
    restore() {
      session = importSave(encodeSave({ session, parameterDraft: null }, pack), pack).session;
    },
  };
}
function tt() {
  const game = collectionGame();
  acceptDocuments(game);
  decide(game, 'tt_verify');
  return game.session;
}
function gap() {
  const game = procurementGame('cup_500_verified', 'oa', 'fob', 5000);
  produce(game);
  clearInspection(game);
  return game.session;
}
const frozen = (s: SliceSession) => ({
  journal: s.snapshot.journal,
  rng: s.snapshot.story.rngState,
  drawCount: s.snapshot.story.drawCount,
  events: s.snapshot.story.eventWindows,
  samples: s.snapshot.story.sampledParameters,
  day: s.snapshot.gameDay,
  cash: s.snapshot.player.cashCnyFen,
  qualityRoll: s.procurement?.qualityRoll,
});

describe('E05 交易检查点应用命令', () => {
  it('真实大单资金缺口→后果→林姐→刷新恢复→停止采购：不重抽、不重复扣款', () => {
    const before = gap(),
      game = client(before);
    game.act({ type: 'choose', choiceId: 'supplier_balance' });
    expect(game.session.rescue!.pending).toMatchObject({
      reason: 'cash_shortfall',
      phase: 'consequence',
    });
    expect(game.session.rescue!.pending!.gapFen).toBeGreaterThan(0);
    expect(frozen(game.session)).toEqual(frozen(before));
    game.restore();
    game.act({ type: 'rescue', step: 'review' });
    game.restore();
    game.act({ type: 'rescue', step: 'use' });
    game.restore();
    expect(frozen(game.session)).toEqual(frozen(before));
    expect(game.session.snapshot.player.rescueUsed).toBe(true);
    expect(game.session.rescue!.history[0]!.outcome).toBe('used');
    game.act({ type: 'choose', choiceId: 'procurement_cancel' });
    expect(game.session.snapshot.player.cashCnyFen).toBeGreaterThanOrEqual(0);
    const after = structuredClone(game.session.snapshot.journal);
    game.restore();
    expect(game.session.snapshot.journal).toEqual(after);
  });
  it('确认顺序和业务锁：不能略过复盘、不能继续付费或修改字段', () => {
    const game = client(gap());
    game.act({ type: 'choose', choiceId: 'supplier_balance' });
    expect(() => game.act({ type: 'rescue', step: 'use' })).toThrow('顺序');
    expect(() => game.act({ type: 'choose', choiceId: 'procurement_cancel' })).toThrow('检查点');
    expect(() => game.act({ type: 'draft', answers: {} })).toThrow('检查点');
    const altered = structuredClone(game.session);
    altered.snapshot.gameDay++;
    expect(() => validateSavedGame({ session: altered, parameterDraft: null }, pack)).toThrow(
      '校验失败',
    );
  });
  it('拒绝现金救援不会凭空扣款、借款或制造破产；再次尝试也不再提供一次性救援', () => {
    const before = gap(),
      game = client(before);
    game.act({ type: 'choose', choiceId: 'supplier_balance' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'decline' });
    game.restore();
    game.act({ type: 'rescue', step: 'confirm' });
    expect(frozen(game.session)).toEqual(frozen(before));
    expect(game.session.snapshot.player.criticalMistakeCount).toBe(2);
    game.act({ type: 'choose', choiceId: 'supplier_balance' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'decline' });
    game.act({ type: 'rescue', step: 'confirm' });
    expect(game.session.snapshot.player.criticalMistakeCount).toBe(2);
    expect(frozen(game.session)).toEqual(frozen(before));
    game.act({ type: 'choose', choiceId: 'supplier_balance' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'use' });
    expect(game.session.rescue!.history.map((h) => h.outcome)).toEqual([
      'declined',
      'declined',
      'returned',
    ]);
    expect(game.session.snapshot.player.criticalMistakeCount).toBe(2);
  });
  it('T/T 恢复核验后只收一次真实尾款，已付手续费不退不重复', () => {
    const before = tt(),
      game = client(before);
    game.act({ type: 'choose', choiceId: 'tt_release' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'use' });
    expect(frozen(game.session)).toEqual(frozen(before));
    game.act({ type: 'choose', choiceId: 'tt_chase' });
    expect(game.session.collection!.outstandingUsdCent).toBe(0);
    expect(game.session.collection!.bankFeeFen).toBe(0);
    const command: PlayCommand = {
      id: 'duplicate',
      revision: game.session.snapshot.revision,
      action: { type: 'advance' },
    };
    const once = dispatchSlice(game.session, pack, command);
    expect(dispatchSlice(once, pack, command)).toBe(once);
    expect(() => dispatchSlice(once, pack, { ...command, id: 'stale' })).toThrow('过期');
  });
  it('拒绝并再次确认才提交一次坏账，重放确认命令不再核销', () => {
    const before = tt(),
      game = client(before);
    game.act({ type: 'choose', choiceId: 'tt_release' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'decline' });
    game.restore();
    const c: PlayCommand = {
      id: 'confirm.loss',
      revision: game.session.snapshot.revision,
      action: { type: 'rescue', step: 'confirm' },
    };
    const result = dispatchSlice(game.session, pack, c);
    expect(result.collection!.badDebtFen).toBeGreaterThan(0);
    expect(result.snapshot.player.criticalMistakeCount).toBe(2);
    expect(result.snapshot.player.cashCnyFen).toBe(before.snapshot.player.cashCnyFen);
    expect(dispatchSlice(result, pack, c)).toBe(result);
    expect(
      importSave(encodeSave({ session: result, parameterDraft: null }, pack), pack).session,
    ).toEqual(result);
  });
  it('一次恢复后再次冒险仍需确认，但不会刷新救援额度', () => {
    const game = client(tt());
    for (const step of ['offer', 'review', 'use', 'offer', 'review', 'decline', 'confirm']) {
      if (step === 'offer') game.act({ type: 'choose', choiceId: 'tt_release' });
      else game.act({ type: 'rescue', step: step as 'review' | 'use' | 'decline' | 'confirm' });
    }
    expect(game.session.rescue!.history.map((h) => h.outcome)).toEqual(['used', 'declined']);
    expect(game.session.collection!.badDebtFen).toBeGreaterThan(0);
    expect(game.session.snapshot.player.criticalMistakeCount).toBe(2);
  });
  it('无救援字段的 0.10 旧存档仍能导入', () => {
    const source = tt();
    delete source.rescue;
    expect(
      importSave(encodeSave({ session: source, parameterDraft: null }, pack), pack).session,
    ).toEqual(source);
  });
  it('旧版已用首错保护的存档继续确认时，不重复累计已有重大错误', () => {
    let source = tt();
    let i = 0;
    for (const action of [
      { type: 'choose', choiceId: 'tt_release' },
      { type: 'advance' },
      { type: 'advance' },
      { type: 'choose', choiceId: 'tt_reconsider' },
      { type: 'advance' },
    ] as const)
      source = reduceSlice(source, pack, {
        id: 'legacy.' + ++i,
        revision: source.snapshot.revision,
        action,
      });
    expect(source.snapshot.player.criticalMistakeCount).toBe(1);
    const game = client(source);
    game.act({ type: 'choose', choiceId: 'tt_release' });
    game.act({ type: 'rescue', step: 'review' });
    game.act({ type: 'rescue', step: 'decline' });
    game.act({ type: 'rescue', step: 'confirm' });
    expect(game.session.snapshot.player.criticalMistakeCount).toBe(2);
  });
});
