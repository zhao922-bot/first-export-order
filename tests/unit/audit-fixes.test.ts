import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pack } from '../fixtures/economy';
import { collectionGame, openDocuments } from '../fixtures/collection';
import { createSliceSession } from '../../src/engine/slice/session';
import { dispatchSlice } from '../../src/engine/slice/rescue';
import { applyTextDraft } from '../../src/engine/slice/drafts';
import { logisticsGame, selectLogistics } from '../fixtures/logistics';
import { createSliceSaveRepository, type SavedGame } from '../../src/persistence/sliceSave';
import { serialQueue } from '../../src/persistence/storageTransaction';
import {
  createInputJournal,
  applyInput,
  recoverInputs,
  inputJournalPrefix,
} from '../../src/persistence/inputJournal';
import { createLocalSink } from '../../src/telemetry/localSink';
import { presentation } from '../../src/content/presentation';
import deliveries from '../../public/assets/portraits/delivery-report.json';
import { useTextDrafts } from '../../src/app/useTextDrafts';
import { effectScope, shallowRef, nextTick } from 'vue';
import { negotiationGame, toContract } from '../fixtures/negotiation';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  writes = 0;
  get length() {
    return this.values.size;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  clear() {
    this.values.clear();
  }
}
const initial = (): SavedGame => ({
  session: createSliceSession(pack, 'audit.fix', true),
  parameterDraft: null,
});

describe('提交协调和输入恢复', () => {
  it('合同勾选在刷新后恢复，仍须另行签约，不执行任何付款或时间推进', () => {
    const g = negotiationGame();
    toContract(g);
    const game = { session: g.session, parameterDraft: null };
    const storage = new MemoryStorage(),
      journal = createInputJournal(() => storage, 'checks');
    for (const field of pack.negotiation!.checklist)
      journal.append(
        {
          id: 'check.' + field.id,
          action: { type: 'confirmContract', fieldId: field.id, checked: true },
        },
        'head',
        game.session.snapshot.runId,
      );
    const restored = recoverInputs(() => storage, 'head', game, pack)!.game;
    expect(restored.session.negotiation!.confirmations).toHaveLength(6);
    expect(restored.session.snapshot.order.status).toBe(game.session.snapshot.order.status);
    expect(restored.session.snapshot.journal).toEqual(game.session.snapshot.journal);
    expect(restored.session.snapshot.gameDay).toBe(game.session.snapshot.gameDay);
    expect(restored.session.snapshot.story.rngState).toEqual(game.session.snapshot.story.rngState);
  });
  it('单据标记、改字、取消、重新标记按顺序恢复，不复活已清除的文字', () => {
    const g = collectionGame();
    openDocuments(g);
    const game = { session: g.session, parameterDraft: null };
    const storage = new MemoryStorage(),
      journal = createInputJournal(() => storage, 'marks');
    const actions = [
      { type: 'markDocument' as const, fieldId: 'invoice.quantity', marked: true },
      { type: 'correctDocument' as const, fieldId: 'invoice.quantity', value: '2000' },
      { type: 'markDocument' as const, fieldId: 'invoice.quantity', marked: false },
      { type: 'markDocument' as const, fieldId: 'invoice.quantity', marked: true },
    ];
    actions.forEach((action, i) =>
      journal.append({ id: 'mark.' + i, action }, 'head', game.session.snapshot.runId),
    );
    const restored = recoverInputs(() => storage, 'head', game, pack)!.game;
    expect(restored.session.collection!.marks).toContain('invoice.quantity');
    expect(restored.session.collection!.corrections['invoice.quantity']).toBeUndefined();
    expect(restored.session.snapshot.journal).toEqual(game.session.snapshot.journal);
  });
  it('旧输入回执不覆盖新键入文字；最后回执后仍接受外部恢复值', async () => {
    const source = shallowRef({ quantity: '' });
    const scope = effectScope();
    const text = scope.run(() => useTextDrafts(() => source.value))!;
    text.edit('quantity', '2');
    text.edit('quantity', '2000');
    source.value = { quantity: '2' };
    await nextTick();
    expect(text.draft.quantity).toBe('2000');
    source.value = { quantity: '2000' };
    await nextTick();
    source.value = { quantity: '5000' };
    await nextTick();
    expect(text.draft.quantity).toBe('5000');
    scope.stop();
  });
  it('同一字段积压只保留最新恢复意图，旧回执不会删除新字', () => {
    const storage = new MemoryStorage(),
      journal = createInputJournal(() => storage, 'typing');
    const game = initial();
    for (let i = 0; i < 100; i++)
      journal.append(
        { id: 'key.' + i, action: { type: 'draft', answers: { rebateUnitCny: String(i) } } },
        'head',
        game.session.snapshot.runId,
      );
    expect(JSON.parse(storage.getItem(inputJournalPrefix + 'typing')!).items).toHaveLength(1);
    journal.finish('key.0', 'new-head', game.session.snapshot.runId);
    expect(
      recoverInputs(() => storage, 'new-head', game, pack)!.game.session.answers.rebateUnitCny,
    ).toBe('99');
  });
  it('轻量文本路径与完整 reducer 结果一致，不修改原会话或业务凭证', () => {
    const documents = collectionGame();
    openDocuments(documents);
    documents.act({ type: 'markDocument', fieldId: 'invoice.quantity', marked: true });
    const logistics = logisticsGame();
    selectLogistics(logistics);
    const examples = [
      {
        session: initial().session,
        action: { type: 'draft' as const, answers: { rebateUnitCny: '2.23' } },
      },
      {
        session: documents.session,
        action: { type: 'correctDocument' as const, fieldId: 'invoice.quantity', value: '2000' },
      },
      {
        session: logistics.session,
        action: { type: 'editDeclaration' as const, fieldId: 'quantity' as const, value: '2000' },
      },
    ];
    for (const { session, action } of examples) {
      const before = JSON.stringify(session);
      const expected = dispatchSlice(session, pack, {
        id: 'same-id',
        revision: session.snapshot.revision,
        action,
      });
      const actual = applyTextDraft(session, pack, 'same-id', action);
      expect(actual).toEqual(expected);
      expect(JSON.stringify(session)).toBe(before);
      expect(actual.snapshot.journal).toBe(session.snapshot.journal);
      expect(actual.snapshot.story.rngState).toBe(session.snapshot.story.rngState);
    }
  });
  it('队列按调用顺序执行，失败不会吞掉后续操作', async () => {
    const queue = serialQueue(),
      order: number[] = [];
    const a = queue(async () => {
      await Promise.resolve();
      order.push(1);
      throw Error('failure');
    });
    const b = queue(() => {
      order.push(2);
      return 2;
    });
    await expect(a).rejects.toThrow('failure');
    await expect(b).resolves.toBe(2);
    expect(order).toEqual([1, 2]);
  });
  it('浏览器调用者不能绕过事务直接改保存槽', () => {
    const storage = new MemoryStorage(),
      repo = createSliceSaveRepository(() => storage, pack);
    vi.stubGlobal('window', {});
    try {
      expect(() => repo.write(initial(), null)).toThrow('协调');
      expect(storage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('输入队列被刷新打断时恢复每个字段，保留命令身份且不重抽/记账', () => {
    const storage = new MemoryStorage(),
      journal = createInputJournal(() => storage, 'tab-a'),
      game = initial();
    const before = structuredClone(game.session.snapshot);
    const items = [
      { id: 'input.1', action: { type: 'draft' as const, answers: { rebateUnitCny: '2.23' } } },
      { id: 'input.2', action: { type: 'draft' as const, answers: { fobCostUnitCny: '26.47' } } },
    ];
    for (const item of items) journal.append(item, 'head0', game.session.snapshot.runId);
    const recovered = recoverInputs(() => storage, 'head0', game, pack)!;
    expect(recovered.game).toEqual(items.reduce((s, item) => applyInput(s, pack, item), game));
    expect(recovered.game.session.answers).toEqual({
      rebateUnitCny: '2.23',
      fobCostUnitCny: '26.47',
    });
    expect(recovered.game.session.snapshot.journal).toEqual(before.journal);
    expect(recovered.game.session.snapshot.story.rngState).toEqual(before.story.rngState);
    expect(recovered.game.session.snapshot.story.appliedCommandIds.slice(-2)).toEqual([
      'input.1',
      'input.2',
    ]);
    journal.finish('input.1', 'head1', game.session.snapshot.runId);
    expect(recoverInputs(() => storage, 'head0', game, pack)).toBeNull();
    journal.finish('input.2', 'head2', game.session.snapshot.runId);
    expect(storage.length).toBe(0);
  });
  it('单据草稿恢复仍要求已标记字段；不能从恢复记录执行付款', () => {
    const storage = new MemoryStorage(),
      journal = createInputJournal(() => storage, 'tab-a');
    const g = collectionGame();
    openDocuments(g);
    const game = { session: g.session, parameterDraft: null };
    journal.append(
      {
        id: 'bad-field',
        action: { type: 'correctDocument', fieldId: 'invoice.quantity', value: '2000' },
      },
      'head',
      game.session.snapshot.runId,
    );
    expect(recoverInputs(() => storage, 'head', game, pack)).toBeNull();
    const raw = JSON.parse(storage.getItem(inputJournalPrefix + 'tab-a')!);
    raw.items = [{ id: 'payment', action: { type: 'choose', choiceId: 'tt_chase' } }];
    storage.setItem(inputJournalPrefix + 'tab-a', JSON.stringify(raw));
    expect(recoverInputs(() => storage, 'head', game, pack)).toBeNull();
    expect(storage.getItem(inputJournalPrefix + 'tab-a')).toContain('tt_chase');
  });
  it('读取缓存不会被调用者修改；相同 key 的损坏字节仍重新校验', () => {
    const storage = new MemoryStorage(),
      repo = createSliceSaveRepository(() => storage, pack);
    const head = repo.write(initial(), null);
    repo.load().game!.session.snapshot.player.cashCnyFen++;
    expect(repo.load().game).toEqual(initial());
    const side = JSON.parse(head).side;
    storage.setItem('first-export.slice.v2:auto:' + side, 'broken');
    expect(repo.load().problem).toBe(true);
  });
});

describe('试玩记录协调与按需写盘', () => {
  it('写锁等待不把失焦后的时间计为有效时长', () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const sink = createLocalSink({
      storage: () => storage,
      pack,
      sessionId: 'focus',
      now: () => now,
    });
    sink.attach(initial().session, 'practice');
    sink.visibility(true);
    sink.interact();
    now += 1000;
    sink.observeVisibility(false);
    now += 20000;
    sink.synchronize();
    sink.visibility(false, false);
    sink.flush();
    expect(sink.view().run!.activeMs).toBe(1000);
  });
  it('无局、无事件、无有效时间增量的 flush/重复隐藏不写盘', () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const sink = createLocalSink({
      storage: () => storage,
      pack,
      sessionId: 'idle',
      now: () => now,
    });
    for (let i = 0; i < 20; i++) {
      now += 5000;
      sink.flush();
      sink.visibility(false);
    }
    expect(storage.writes).toBe(0);
    sink.attach(initial().session, 'practice');
    const writes = storage.writes;
    for (let i = 0; i < 20; i++) {
      now += 5000;
      sink.flush();
      sink.visibility(false);
    }
    expect(storage.writes).toBe(writes);
  });
  it('第二页只读后同步新数据，原页继续记录且未提交有效时长只合并一次', () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const make = (id: string) =>
      createLocalSink({ storage: () => storage, pack, sessionId: id, now: () => now });
    const a = make('a'),
      s = initial().session;
    a.attach(s, 'practice');
    a.visibility(true);
    a.interact();
    now += 1000;
    a.interact();
    const b = make('b');
    b.attach(s);
    b.visibility(false);
    a.synchronize();
    a.flush();
    expect(a.view().notice).not.toContain('暂停');
    expect(a.view().run!.activeMs).toBe(1000);
    a.synchronize();
    a.flush();
    expect(a.view().run!.activeMs).toBe(1000);
    now += 1000;
    a.flush();
    expect(a.view().run!.activeMs).toBe(2000);
    expect(a.view().run!.counts.run_resumed).toBe(1);
  });
  it('草稿输入不逐字持久化统计；导出会结算有效时间', () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const sink = createLocalSink({
      storage: () => storage,
      pack,
      sessionId: 'typing',
      now: () => now,
    });
    const s = initial().session;
    sink.attach(s, 'practice');
    sink.visibility(true);
    sink.interact();
    const writes = storage.writes;
    for (let i = 0; i < 20; i++) {
      now += 100;
      sink.transition(s, { ...s, answers: { rebateUnitCny: String(i) } }, 'draft');
    }
    expect(storage.writes).toBe(writes);
    expect(JSON.parse(sink.export()).runs[0].activeMs).toBe(2000);
    expect(storage.writes).toBe(writes + 1);
  });
});

describe('交付资源与业务文案', () => {
  it.each(deliveries)('$delivery 保留本地原图，发布编码不超过 320 KB', (entry) => {
    const data = readFileSync('public/assets/portraits/' + entry.delivery);
    expect(data.length).toBe(entry.bytes);
    expect(data.length).toBeLessThan(320000);
    expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
    expect(readFileSync('public/assets/portraits/' + entry.source).length).toBeGreaterThan(
      data.length,
    );
    expect(presentation.optimizedAtlases.some((a) => a.delivery.endsWith(entry.delivery))).toBe(
      true,
    );
  });
  it('未装船核验的 OA 日期由 JSON 解释，不伪造到期日', () => {
    expect(collectionGame('oa', 'exw').session.snapshot.order.collectionDueDay).toBeNull();
    expect(presentation.experience.oaPending).toContain('核验实际装船日期');
    expect(presentation.experience.oaDue.replace('{day}', '88')).toContain('第 88 天');
  });
});
