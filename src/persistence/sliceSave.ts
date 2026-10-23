import { z } from 'zod';
import { validateRescue } from '../engine/slice/rescue';
import type { ContentPack } from '../domain/types';
import { sliceSessionSchema } from '../engine/slice/session';
import { currentNode } from '../engine/slice/reducer';
import { projectLedger } from '../engine/economy/ledger';
import { calculateQuote } from '../engine/economy/quote';
import { validateFrozenEnding } from '../engine/debrief/runtime';
import { validateEventState } from '../engine/slice/events';
import { hasStorageTransaction } from './storageTransaction';

export const legacyKey = 'first-export.slice.v1';
export const savePrefix = 'first-export.slice.v2';
export const maxSaveBytes = 512 * 1024;
export const slots = ['auto', 'manual1', 'manual2', 'manual3'] as const;
export type SaveSlot = (typeof slots)[number];
export const draftSchema = z.record(z.string(), z.union([z.string().max(100), z.boolean()]));
export const savedGameSchema = z.strictObject({
  session: sliceSessionSchema,
  parameterDraft: draftSchema.nullable(),
});
export type SavedGame = z.infer<typeof savedGameSchema>;
const envelopeSchema = z.strictObject({
  format: z.literal('first-export-local'),
  schemaVersion: z.literal(2),
  contentVersion: z.string(),
  generation: z.number().int().nonnegative(),
  savedAt: z.iso.datetime(),
  payload: savedGameSchema,
  checksum: z.string(),
});
type Envelope = z.infer<typeof envelopeSchema>;
const tokenSchema = z.strictObject({
  side: z.enum(['a', 'b']),
  generation: z.number().int().nonnegative(),
  checksum: z.string(),
});
const headSchema = tokenSchema.extend({ previous: tokenSchema.nullable() });
export type SaveHead = z.infer<typeof headSchema>;
export type SaveCode =
  'CORRUPT' | 'VERSION' | 'CONTENT' | 'SIZE' | 'UNAVAILABLE' | 'QUOTA' | 'CONFLICT';
export class SaveError extends Error {
  readonly code: SaveCode;
  constructor(code: SaveCode, message: string) {
    super(message);
    this.code = code;
  }
}
export function saveMessage(cause: unknown): string {
  if (cause instanceof SaveError) return cause.message;
  if (cause instanceof Error && cause.name === 'QuotaExceededError')
    return '存储空间不足，当前进度未保存；请先导出当前进度。';
  return '浏览器存储不可用，当前进度仅在本页；请先导出，关闭页面会丢失未保存的修改。';
}
const bytes = (text: string) => new TextEncoder().encode(text).length;
/** 意外损坏检测，不是签名、防篡改或排行榜认证。 */
export function checksum(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return 'fnv1a32:' + (h >>> 0).toString(16).padStart(8, '0');
}
function parse(text: string): unknown {
  if (text.length > maxSaveBytes || bytes(text) > maxSaveBytes)
    throw new SaveError('SIZE', '存档超过 512 KiB，未载入或覆盖现有进度。');
  try {
    return JSON.parse(text, (key, value: unknown) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('unsafe key');
      return value;
    }) as unknown;
  } catch {
    throw new SaveError('CORRUPT', '存档格式损坏，原记录已保留，可导出或恢复备份。');
  }
}
export function validateSavedGame(value: unknown, pack: ContentPack): SavedGame {
  try {
    const game = savedGameSchema.parse(value),
      s = game.session,
      state = s.snapshot;
    if (s.contentVersion !== pack.contentVersion)
      throw new SaveError('CONTENT', '本地进度与当前内容不兼容；原记录已保留，请导出后重开。');
    if (!calculateQuote(s.quoteInput).ok) throw new Error('invalid quote parameters');
    const node = currentNode(pack, s);
    if (node.stage !== state.story.stage) throw new Error('node stage');
    if (s.feedback && !pack.nodes.some((n) => n.id === s.feedback!.nextNodeId))
      throw new Error('feedback');
    for (const [id, items] of [
      [state.order.productId, pack.products],
      [state.order.supplierId, pack.suppliers],
      [state.order.customerId, pack.customers],
    ] as const)
      if (id && !items.some((item) => item.id === id)) throw new Error('reference');
    if (
      state.order.supplierId &&
      pack.suppliers.find((s) => s.id === state.order.supplierId)!.productId !==
        state.order.productId
    )
      throw new Error('supplier product');
    // 独立报价练习可以进入谈判；产品与供应商仅在进入真实备货后必需。
    if (state.story.stage >= 4 && (!s.negotiation || !state.order.quote || !state.order.customerId))
      throw new Error('negotiation missing');
    if (
      s.negotiation?.offerId &&
      !pack.negotiation?.offers.some((offer) => offer.id === s.negotiation!.offerId)
    )
      throw new Error('offer');
    if (
      state.story.stage >= 5 &&
      (!s.procurement ||
        !state.order.productId ||
        !state.order.supplierId ||
        !state.order.payment ||
        !state.order.incoterm ||
        !state.order.namedPlace ||
        state.order.quantity <= 0 ||
        state.order.invoiceUsdCent === null ||
        state.order.contractUnitUsd === null ||
        state.order.signedDay === null ||
        state.order.deliveryDueDay === null)
    )
      throw new Error('contract or procurement missing');
    if (state.story.stage >= 6 && !s.logistics) throw new Error('logistics missing');
    if (
      state.story.stage >= 7 &&
      (!s.collection || !s.logistics?.forwarderId || state.order.deliveryCompletedDay === null)
    )
      throw new Error('delivery or collection missing');
    if (s.logistics?.forwarderId && !pack.forwarders.some((f) => f.id === s.logistics!.forwarderId))
      throw new Error('forwarder');
    if (
      s.collection?.oaScenarioId &&
      !pack.collection?.oaScenarios.some((c) => c.id === s.collection!.oaScenarioId)
    )
      throw new Error('OA scenario');
    const ledger = projectLedger(state.journal);
    if (
      ledger.cashCnyFen !== state.player.cashCnyFen ||
      ledger.cumulativeProfitCnyFen !== state.player.cumulativeProfitCnyFen
    )
      throw new Error('ledger');
    validateFrozenEnding(s, pack);
    validateEventState(s, pack);
    validateRescue(s, pack);
    if (
      game.parameterDraft &&
      Object.entries(game.parameterDraft).some(
        ([key, value]) =>
          !Object.hasOwn(s.quoteInput, key) ||
          typeof value !== (key === 'rebateEligible' ? 'boolean' : 'string'),
      )
    )
      throw new Error('parameter draft');
    return game;
  } catch (cause) {
    if (cause instanceof SaveError) throw cause;
    throw new SaveError(
      'CORRUPT',
      '存档内容或账本校验失败，未覆盖当前进度；可恢复备份或导出原记录。',
    );
  }
}
export function encodeSave(game: SavedGame, pack: ContentPack, generation = 0): string {
  return encodeEnvelope(game, pack, generation).text;
}
function encodeEnvelope(game: SavedGame, pack: ContentPack, generation: number) {
  const payload = validateSavedGame(game, pack);
  const data = {
    format: 'first-export-local' as const,
    schemaVersion: 2 as const,
    contentVersion: pack.contentVersion,
    generation,
    savedAt: new Date().toISOString(),
    payload,
  };
  const envelope = { ...data, checksum: checksum(JSON.stringify(data)) };
  const text = JSON.stringify(envelope);
  if (bytes(text) > maxSaveBytes)
    throw new SaveError('SIZE', '存档超过 512 KiB，当前修改未保存，请导出当前进度。');
  return { text, envelope };
}
export function decodeSave(text: string, pack: ContentPack): Envelope {
  const parsed = parse(text);
  if (
    parsed &&
    typeof parsed === 'object' &&
    'schemaVersion' in parsed &&
    parsed.schemaVersion !== 2
  )
    throw new SaveError('VERSION', '存档版本不受支持，需要匹配的应用版本；原文件未修改。');
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) throw new SaveError('CORRUPT', '存档结构损坏，原记录已保留。');
  const { checksum: digest, ...data } = result.data;
  if (checksum(JSON.stringify(data)) !== digest)
    throw new SaveError('CORRUPT', '存档摘要不一致，原记录已保留，可恢复备份。');
  if (data.contentVersion !== pack.contentVersion)
    throw new SaveError('CONTENT', '本地进度与当前内容不兼容；请保留原文件并使用匹配版本。');
  validateSavedGame(data.payload, pack);
  return result.data;
}
/** 只接收同内容版本的实际旧切片，不凭旧余额伪造交易或迁移 0.9 业务事实。 */
export function importSave(text: string, pack: ContentPack): SavedGame {
  const value = parse(text);
  if (value && typeof value === 'object' && 'version' in value) {
    if (value.version !== 1) throw new SaveError('VERSION', '旧存档版本不受支持，原文件未修改。');
    return validateSavedGame({ session: value, parameterDraft: null }, pack);
  }
  return decodeSave(text, pack).payload;
}
export interface LoadedSave {
  game: SavedGame | null;
  head: string | null;
  backup: SaveHead | null;
  notice: string;
  problem: boolean;
}
export function createSliceSaveRepository(storage: () => Storage, pack: ContentPack) {
  function requireWriter() {
    if (typeof window !== 'undefined' && !hasStorageTransaction())
      throw new SaveError('UNAVAILABLE', '存档协调不可用，当前修改未保存；请先导出当前进度。');
  }
  // Cache only exact bytes already validated by this repository. External changes,
  // corruption and imports still go through all structure/business checks.
  const validated = new Map<string, { raw: string; envelope: Envelope }>();
  const key = (slot: SaveSlot, suffix: string) => `${savePrefix}:${slot}:${suffix}`;
  const head = (slot: SaveSlot = 'auto') => storage().getItem(key(slot, 'head'));
  function check(expected: string | null, slot: SaveSlot) {
    if (head(slot) !== expected)
      throw new SaveError(
        'CONFLICT',
        '另一标签页已更新存档，当前页面已停止写入；请载入最新进度或先导出本页进度。',
      );
  }
  function readToken(slot: SaveSlot, token: z.infer<typeof tokenSchema>) {
    const raw = storage().getItem(key(slot, token.side));
    if (!raw) throw new SaveError('CORRUPT', '存档记录缺失，可尝试恢复上一有效版本。');
    const cached = validated.get(key(slot, token.side));
    const envelope = cached?.raw === raw ? cached.envelope : decodeSave(raw, pack);
    validated.set(key(slot, token.side), { raw, envelope });
    if (envelope.generation !== token.generation || envelope.checksum !== token.checksum)
      throw new SaveError('CORRUPT', '存档提交标记不一致，可尝试恢复备份。');
    return structuredClone(envelope.payload);
  }
  function load(slot: SaveSlot = 'auto'): LoadedSave {
    let raw: string | null = null;
    try {
      raw = head(slot);
      if (!raw) {
        const legacy = slot === 'auto' ? storage().getItem(legacyKey) : null;
        return {
          game: legacy ? importSave(legacy, pack) : null,
          head: raw,
          backup: null,
          notice: legacy ? '已读取兼容旧进度，下次保存升级本地格式' : '',
          problem: false,
        };
      }
      const record = headSchema.parse(JSON.parse(raw));
      try {
        return {
          game: readToken(slot, record),
          head: raw,
          backup: null,
          notice: '已保存在此浏览器',
          problem: false,
        };
      } catch (cause) {
        if (record.previous) {
          readToken(slot, record.previous);
          return {
            game: null,
            head: raw,
            backup: { ...record.previous, previous: null },
            notice: '当前存档校验失败，找到上一有效版本；可在存档与恢复页确认恢复。',
            problem: true,
          };
        }
        throw cause;
      }
    } catch (cause) {
      return {
        game: null,
        head: raw,
        backup: null,
        notice:
          cause instanceof SaveError
            ? cause.message
            : cause instanceof SyntaxError || cause instanceof z.ZodError
              ? '存档提交标记损坏，原记录已保留，请导出后恢复。'
              : saveMessage(cause),
        problem: true,
      };
    }
  }
  /** Synchronous commit primitive. Browser callers must hold storageTransaction
   * for the ENTIRE check/write/head-switch (also recover), never just setItem. */
  function write(game: SavedGame, expected: string | null, slot: SaveSlot = 'auto'): string {
    requireWriter();
    check(expected, slot);
    let old: SaveHead | null = null;
    if (expected) {
      try {
        const parsed = headSchema.safeParse(JSON.parse(expected));
        if (parsed.success) old = parsed.data;
      } catch {
        /* 用户明确重开时允许替换损坏标记。 */
      }
    }
    // 即使主动重开，损坏提交标记也不能使原始记录被静默删除。
    const side = old?.side === 'a' ? 'b' : 'a';
    const generation = (old?.generation ?? -1) + 1;
    const { text, envelope } = encodeEnvelope(game, pack, generation);
    let total = 0;
    for (const s of slots)
      for (const suffix of ['a', 'b', 'head']) {
        const k = key(s, suffix);
        total += bytes(k === key(slot, side) ? text : (storage().getItem(k) ?? ''));
      }
    if (total > 3 * 1024 * 1024)
      throw new SaveError('QUOTA', '本地存档达到 3 MiB 预算，当前修改未保存，请先导出。');
    let previous: SaveHead['previous'] = null;
    if (old) {
      try {
        readToken(slot, old);
        const { previous: _previous, ...token } = old;
        previous = token;
      } catch {
        /* 不将坏档标成可恢复备份。 */
      }
    }
    storage().setItem(key(slot, side), text);
    if (storage().getItem(key(slot, side)) !== text)
      throw new SaveError('CORRUPT', '写入校验失败，上一提交仍保留。');
    check(expected, slot);
    const next = JSON.stringify({ side, generation, checksum: envelope.checksum, previous });
    storage().setItem(key(slot, 'head'), next);
    validated.set(key(slot, side), { raw: text, envelope });
    return next;
  }
  function recover(expected: string | null, backup: SaveHead, slot: SaveSlot = 'auto') {
    requireWriter();
    check(expected, slot);
    readToken(slot, backup);
    storage().setItem(key(slot, 'head'), JSON.stringify(backup));
    return load(slot);
  }
  function rawExport() {
    const pending: string[] = [];
    for (let i = 0; i < storage().length; i++) {
      const k = storage().key(i);
      if (k?.startsWith('first-export.pending-input.v1:')) pending.push(k);
    }
    return JSON.stringify(
      Object.fromEntries(
        [
          legacyKey,
          ...pending,
          ...slots.flatMap((s) => ['a', 'b', 'head'].map((suffix) => key(s, suffix))),
        ].map((k) => [k, storage().getItem(k)]),
      ),
      null,
      2,
    );
  }
  return { load, head, write, recover, rawExport, check };
}
