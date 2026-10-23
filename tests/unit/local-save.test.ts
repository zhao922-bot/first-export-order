import { describe, it, expect } from 'vitest';
import { eventPack as pack } from '../fixtures/economy';
import { createSliceSession } from '../../src/engine/slice/session';
import { reduceSlice } from '../../src/engine/slice/reducer';
import { collectionGame } from '../fixtures/collection';
import { negotiationGame } from '../fixtures/negotiation';
import {
  createSliceSaveRepository,
  encodeSave,
  importSave,
  decodeSave,
  checksum,
  legacyKey,
  savePrefix,
  maxSaveBytes,
  type SavedGame,
} from '../../src/persistence/sliceSave';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failKey = '';
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new DOMException('full', 'QuotaExceededError');
    this.values.set(key, value);
  }
}
const initial = (): SavedGame => ({
  session: createSliceSession(pack, 'save.test', true),
  parameterDraft: null,
});
const edit = (game: SavedGame): SavedGame => ({
  ...game,
  session: reduceSlice(game.session, pack, {
    id: 'draft.' + game.session.snapshot.revision,
    revision: game.session.snapshot.revision,
    action: { type: 'draft', answers: { rebateUnitCny: '2.23' } },
  }),
});
function fixture() {
  const storage = new MemoryStorage(),
    repository = createSliceSaveRepository(() => storage, pack);
  return { storage, repository, prefix: `${savePrefix}:auto:` };
}
describe('本地双槽提交、恢复与导入边界', () => {
  it('导出导入精确保留会话、参数草稿和 RNG，读取不修改记录', () => {
    const game = edit(initial());
    game.parameterDraft = { quantity: 'abc', fxCnyPerUsd: '7.50' };
    const text = encodeSave(game, pack);
    expect(importSave(text, pack)).toEqual(game);
    const { storage, repository } = fixture();
    const head = repository.write(game, null),
      before = [...storage.values];
    expect(repository.load()).toMatchObject({ game, head, problem: false });
    expect([...storage.values]).toEqual(before);
  });
  it('受控旧切片升级不改业务事实，不删除旧原文', () => {
    const { storage, repository } = fixture(),
      game = initial();
    const raw = JSON.stringify(game.session);
    storage.setItem(legacyKey, raw);
    expect(repository.load().game).toEqual(game);
    repository.write(edit(game), null);
    expect(storage.getItem(legacyKey)).toBe(raw);
    expect(repository.load().game).toEqual(edit(game));
  });
  it.each(['a', 'head'])('首次写入在 %s 中断：不把暂存数据当成成功提交', (suffix) => {
    const { storage, repository, prefix } = fixture();
    storage.failKey = prefix + suffix;
    expect(() => repository.write(initial(), null)).toThrow();
    expect(repository.load().game).toBeNull();
  });
  it.each(['b', 'head'])('后续写入在 %s 中断：仍读取上一完整提交', (suffix) => {
    const { storage, repository, prefix } = fixture(),
      game = initial();
    const head = repository.write(game, null);
    storage.failKey = prefix + suffix;
    expect(() => repository.write(edit(game), head)).toThrow();
    expect(repository.load()).toMatchObject({ game, head, problem: false });
  });
  it('主档坏时只提供已提交备份，显式恢复不会执行命令或重抽', () => {
    const { storage, repository, prefix } = fixture(),
      game = initial();
    const h1 = repository.write(game, null);
    const h2 = repository.write(edit(game), h1);
    storage.setItem(prefix + 'b', '{broken');
    const found = repository.load();
    expect(found.game).toBeNull();
    expect(found.backup).not.toBeNull();
    expect(found.problem).toBe(true);
    const restored = repository.recover(h2, found.backup!);
    expect(restored.game).toEqual(game);
    expect(storage.getItem(prefix + 'b')).toBe('{broken');
    repository.write(edit(game), restored.head);
    expect(repository.load().game).toEqual(edit(game));
  });
  it('恢复切换标记失败也保住有效备份；两个坏槽不自动重开', () => {
    const { storage, repository, prefix } = fixture();
    const h1 = repository.write(initial(), null),
      h2 = repository.write(edit(initial()), h1);
    storage.setItem(prefix + 'b', 'broken');
    const backup = repository.load().backup!;
    storage.failKey = prefix + 'head';
    expect(() => repository.recover(h2, backup)).toThrow();
    expect(repository.load().backup).toEqual(backup);
    storage.setItem(prefix + 'a', 'also broken');
    expect(repository.load()).toMatchObject({ game: null, backup: null, problem: true });
  });
  it('已知较新提交阻止旧标签页写入，包括相同游戏 revision 的参数草稿', () => {
    const { repository, storage } = fixture(),
      game = initial();
    const old = repository.write(game, null);
    const next = repository.write({ ...game, parameterDraft: { fxCnyPerUsd: '7.5' } }, old);
    const before = [...storage.values];
    expect(() => repository.write(edit(game), old)).toThrow('另一标签页');
    expect([...storage.values]).toEqual(before);
    expect(repository.load().head).toBe(next);
  });
  it('三个手动槽独立且均保留上一提交，不改自动档', () => {
    const { repository } = fixture();
    const auto = repository.write(initial(), null);
    for (const slot of ['manual1', 'manual2', 'manual3'] as const) {
      const head = repository.write(initial(), null, slot);
      repository.write(edit(initial()), head, slot);
      expect(repository.load(slot).game).toEqual(edit(initial()));
    }
    expect(repository.load().head).toBe(auto);
    expect(repository.load().game).toEqual(initial());
  });
  it.each(['unknown-version', 'old-content', 'broken', 'huge', 'prototype'])(
    '拒绝 %s，导入不写现有记录',
    (kind) => {
      const { repository, storage } = fixture();
      repository.write(initial(), null);
      const before = [...storage.values];
      const raw = JSON.parse(encodeSave(initial(), pack));
      if (kind === 'unknown-version') raw.schemaVersion = 99;
      if (kind === 'old-content') raw.contentVersion = '0.9.0-slice';
      const { checksum: _digest, ...data } = raw;
      const text =
        kind === 'broken'
          ? '{'
          : kind === 'huge'
            ? ' '.repeat(maxSaveBytes + 1)
            : kind === 'prototype'
              ? '{"__proto__":{"polluted":true}}'
              : JSON.stringify({ ...data, checksum: checksum(JSON.stringify(data)) });
      expect(() => importSave(text, pack)).toThrow();
      expect([...storage.values]).toEqual(before);
      expect(Object.hasOwn({}, 'polluted')).toBe(false);
    },
  );
  it.each(['ledger', 'reference', 'stage', 'missing-state', 'digest'])(
    '拒绝 %s 不一致，即使重新计算摘要也不绕过业务校验',
    (kind) => {
      const raw = JSON.parse(encodeSave(initial(), pack));
      if (kind === 'ledger') raw.payload.session.snapshot.player.cashCnyFen++;
      if (kind === 'reference') raw.payload.session.snapshot.order.productId = 'missing';
      if (kind === 'stage') raw.payload.session.snapshot.story.stage = 1;
      if (kind === 'missing-state') {
        raw.payload.session.snapshot.story.stage = 7;
        raw.payload.session.snapshot.story.nodeId = 'L07.documents';
      }
      const { checksum: _digest, ...data } = raw;
      expect(() =>
        decodeSave(
          JSON.stringify({
            ...data,
            checksum: kind === 'digest' ? 'wrong' : checksum(JSON.stringify(data)),
          }),
          pack,
        ),
      ).toThrow();
    },
  );
  it('禁用读取时给出恢复提示，不假装读到空白档', () => {
    const repository = createSliceSaveRepository(() => {
      throw new DOMException('blocked', 'SecurityError');
    }, pack);
    expect(repository.load()).toMatchObject({ problem: true, game: null });
    expect(repository.load().notice).toContain('存储不可用');
  });
  it('报价练习进入谈判不要求虚构供应商，仍可持久化与恢复', () => {
    const game = { session: negotiationGame().session, parameterDraft: null };
    expect(game.session.snapshot.order.supplierId).toBeNull();
    expect(importSave(encodeSave(game, pack), pack)).toEqual(game);
  });
  it.each([
    'customer',
    'quote',
    'payment',
    'invoice',
    'supplier',
    'delivery',
    'forwarder',
    'offer',
  ])('拒绝缺失 %s 的后续业务状态，防止恢复后投影白屏', (kind) => {
    const game = { session: collectionGame().session, parameterDraft: null };
    const raw = JSON.parse(encodeSave(game, pack)),
      s = raw.payload.session,
      o = s.snapshot.order;
    if (kind === 'customer') o.customerId = null;
    if (kind === 'quote') o.quote = null;
    if (kind === 'payment') o.payment = null;
    if (kind === 'invoice') o.invoiceUsdCent = null;
    if (kind === 'supplier') o.supplierId = null;
    if (kind === 'delivery') o.deliveryCompletedDay = null;
    if (kind === 'forwarder') s.logistics.forwarderId = null;
    if (kind === 'offer') s.negotiation.offerId = 'unknown';
    const { checksum: _digest, ...data } = raw;
    expect(() =>
      importSave(JSON.stringify({ ...data, checksum: checksum(JSON.stringify(data)) }), pack),
    ).toThrow('校验失败');
  });
  it.each([{ rebateEligible: 'false' }, { quantity: false }])(
    '拒绝参数草稿的错误字段类型 %j',
    (parameterDraft) => {
      expect(() => encodeSave({ ...initial(), parameterDraft }, pack)).toThrow('校验失败');
    },
  );
  it.each(['denominator', 'overflow'])('旧档数值 %s 也需通过公式边界校验', (kind) => {
    const game = initial();
    if (kind === 'denominator') {
      game.session.quoteInput.insuranceCoverageFactor = '2';
      game.session.quoteInput.insuranceRate = '0.5';
    } else game.session.quoteInput.taxInclusiveUnitCny = '9999999999999999999999999999999999999';
    expect(() => importSave(JSON.stringify(game.session), pack)).toThrow('校验失败');
  });
});
