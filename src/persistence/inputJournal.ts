import { z } from 'zod';
import type { ContentPack } from '../domain/types';
import { applyTextDraft } from '../engine/slice/drafts';
import { draftSchema, validateSavedGame, type SavedGame } from './sliceSave';
import { declarationIds } from '../domain/schemas/logistics';
import { inspectionItemIds } from '../domain/schemas/procurement';
import { taxEvidenceIds } from '../domain/schemas/collection';
import { dispatchSlice } from '../engine/slice/rescue';

const inputAction = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('draft'),
    answers: z.record(z.string().max(60), z.string().max(100)),
  }),
  z.strictObject({
    type: z.literal('correctDocument'),
    fieldId: z.string().max(100),
    value: z.string().max(200),
  }),
  z.strictObject({
    type: z.literal('editDeclaration'),
    fieldId: z.enum(declarationIds),
    value: z.string().max(200),
  }),
  z.strictObject({ type: z.literal('parameters'), value: draftSchema.nullable() }),
  z.strictObject({
    type: z.literal('confirmContract'),
    fieldId: z.string().max(100),
    checked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('confirmPi'),
    fieldId: z.string().max(100),
    checked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('checkFunding'),
    fieldId: z.string().max(100),
    checked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('markDocument'),
    fieldId: z.string().max(100),
    marked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('checkDeclaration'),
    fieldId: z.enum(declarationIds),
    checked: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('assessTax'),
    fieldId: z.enum(taxEvidenceIds),
    answer: z.enum(['verified', 'missing']),
  }),
  z.strictObject({ type: z.literal('viewEvidence'), itemId: z.enum(inspectionItemIds) }),
  z.strictObject({
    type: z.literal('assessInspection'),
    itemId: z.enum(inspectionItemIds),
    answer: z.enum(['pass', 'issue']),
  }),
]);
export type InputAction = z.infer<typeof inputAction>;
const inputTypes: readonly InputAction['type'][] = [
  'draft',
  'correctDocument',
  'editDeclaration',
  'parameters',
  'confirmContract',
  'confirmPi',
  'checkFunding',
  'markDocument',
  'checkDeclaration',
  'assessTax',
  'viewEvidence',
  'assessInspection',
];
export const isInputAction = (action: { type: string }): action is InputAction =>
  inputTypes.some((type) => type === action.type);
const itemSchema = z.strictObject({ id: z.string().max(160), action: inputAction });
export type PendingInput = z.infer<typeof itemSchema>;
const journalSchema = z.strictObject({
  version: z.literal(1),
  head: z.string().nullable(),
  runId: z.string(),
  at: z.number(),
  items: z.array(itemSchema).max(1000),
});
export const inputJournalPrefix = 'first-export.pending-input.v1:';

/** Only form drafts/checks are recoverable: never choices, payment, time or RNG. */
export function applyInput(game: SavedGame, pack: ContentPack, item: PendingInput): SavedGame {
  const action = item.action;
  if (action.type === 'parameters') return { ...game, parameterDraft: action.value };
  const session =
    action.type === 'draft' ||
    action.type === 'correctDocument' ||
    action.type === 'editDeclaration'
      ? applyTextDraft(
          game.session,
          pack,
          item.id,
          action.type === 'draft'
            ? { ...action, answers: { ...game.session.answers, ...action.answers } }
            : action,
        )
      : dispatchSlice(game.session, pack, {
          id: item.id,
          revision: game.session.snapshot.revision,
          action,
        });
  return { ...game, session };
}
export function createInputJournal(storage: () => Storage, owner: string) {
  const key = inputJournalPrefix + owner;
  let items: PendingInput[] = [];
  function persist(head: string | null, runId: string) {
    if (!items.length) {
      storage().removeItem(key);
      return;
    }
    storage().setItem(key, JSON.stringify({ version: 1, head, runId, at: Date.now(), items }));
  }
  return {
    append(item: PendingInput, head: string | null, runId: string) {
      const parsed = itemSchema.parse(item);
      const field = (value: PendingInput) =>
        value.action.type === 'draft'
          ? 'draft:' + Object.keys(value.action.answers).sort().join(',')
          : value.action.type === 'parameters'
            ? 'parameters'
            : 'fieldId' in value.action
              ? value.action.type + ':' + value.action.fieldId
              : value.action.type + ':' + value.action.itemId;
      // Superseded text is not a business transaction. Keep only the latest
      // pending value per field so a long blocked writer cannot grow this log.
      if (
        ['draft', 'parameters', 'correctDocument', 'editDeclaration'].includes(parsed.action.type)
      )
        items = items.filter((value) => field(value) !== field(parsed));
      // Checks retain their order: unmarking a document also clears its text.
      items.push(parsed);
      persist(head, runId);
    },
    finish(id: string, head: string | null, runId: string) {
      items = items.filter((item) => item.id !== id);
      persist(head, runId);
    },
  };
}
export function recoverInputs(
  storage: () => Storage,
  head: string | null,
  game: SavedGame,
  pack: ContentPack,
) {
  const candidates: { key: string; value: z.infer<typeof journalSchema> }[] = [];
  const source = storage();
  for (let i = 0; i < source.length; i++) {
    const key = source.key(i);
    if (!key?.startsWith(inputJournalPrefix)) continue;
    const raw = source.getItem(key);
    if (!raw || raw.length > 256 * 1024) continue;
    try {
      const value = journalSchema.parse(JSON.parse(raw));
      if (value.head === head && value.runId === game.session.snapshot.runId && value.items.length)
        candidates.push({ key, value });
    } catch {
      /* Preserve malformed diagnostics; committed save remains usable. */
    }
  }
  candidates.sort((a, b) => b.value.at - a.value.at || a.key.localeCompare(b.key));
  for (const candidate of candidates) {
    try {
      const next = candidate.value.items.reduce(
        (value, item) => applyInput(value, pack, item),
        game,
      );
      return {
        game: validateSavedGame(next, pack),
        key: candidate.key,
        raw: source.getItem(candidate.key),
      };
    } catch {
      /* A draft from an invalid node never changes the committed state. */
    }
  }
  return null;
}
