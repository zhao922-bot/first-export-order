import { dispatchSlice, type RescueAction } from '../engine/slice/rescue';
import { uniqueId } from './uniqueId';
import { loadedGame } from './gameAccess';
import { formatMoney } from './formatMoney';
export { formatMoney } from './formatMoney';
import { serialQueue, storageTransaction } from '../persistence/storageTransaction';
import {
  createInputJournal,
  applyInput,
  recoverInputs,
  isInputAction,
  type InputAction,
} from '../persistence/inputJournal';
import { createLocalSink } from '../telemetry/localSink';
import type { Phase } from '../telemetry/events';
import { stageRoute } from './stageRoute';
import { buildEndingView, buildKnowledgeView } from './debriefView';
import { computed, readonly, shallowRef, toRaw, onScopeDispose } from 'vue';
import { defineStore } from 'pinia';
import { loadValidatedContent } from '../content/load';
import { createSliceSession, type SliceSession } from '../engine/slice/session';
import { currentNode, quoteDifference, matches, type SliceAction } from '../engine/slice/reducer';
import { invoiceTotal } from '../engine/economy/quote';
import { usePlayerStore } from '../stores/player';
import { useOrderStore } from '../stores/order';
import { useStoryStore } from '../stores/story';
import type { QuoteInput } from '../domain/types';
import { buildQuoteCashflow } from '../engine/slice/preview';
import { teachingText } from '../content/teachingText';
import { inquiryInbox } from '../engine/slice/inquiry';
import { buildNegotiationView } from './negotiationView';
import { buildProcurementView } from './procurementView';
import { buildCollectionView } from './collectionView';
import { buildLogisticsView } from './logisticsView';
import { eventOptionPreview } from '../engine/slice/events';
import { D } from '../engine/economy/decimal';
import {
  createSliceSaveRepository,
  encodeSave,
  importSave,
  saveMessage,
  SaveError,
  savePrefix,
  validateSavedGame,
  type SavedGame,
  type SaveHead,
  type SaveSlot,
} from '../persistence/sliceSave';
const profileKey = 'first-export.inquiry-started.v1';
const useStore = defineStore('slice', () => {
  const pack = loadValidatedContent()[0]!;
  const session = shallowRef<SliceSession | null>(null),
    error = shallowRef(''),
    storageNotice = shallowRef('');
  const parameterDraft = shallowRef<SavedGame['parameterDraft']>(null);
  const storageConflict = shallowRef(false),
    storageProblem = shallowRef(false);
  const backup = shallowRef<SaveHead | null>(null);
  let coordinationFailure: unknown = null;
  const storage = () => {
    if (coordinationFailure) throw coordinationFailure;
    return localStorage;
  };
  const repository = createSliceSaveRepository(storage, pack);
  let expectedHead: string | null = null;
  const sink = createLocalSink({
    storage,
    pack,
    sessionId: uniqueId(),
    monotonic: () => performance.now(),
  });
  const playtest = shallowRef(sink.view());
  const refreshPlaytest = () => {
    playtest.value = sink.view();
  };
  const enqueue = serialQueue();
  const saving = shallowRef(0);
  const pendingSaves = shallowRef(0);
  function transaction<T>(operation: () => T, writes = true): Promise<T> {
    saving.value++;
    if (writes) pendingSaves.value++;
    return enqueue(async () => {
      let entered = false;
      try {
        return await storageTransaction(() => {
          entered = true;
          coordinationFailure = null;
          sink.synchronize();
          return operation();
        });
      } catch (cause) {
        if (entered) throw cause; // Never replay a callback that already ran.
        coordinationFailure = cause;
        return operation(); // Memory-only mode; storage() refuses all writes.
      } finally {
        saving.value--;
        if (writes) pendingSaves.value--;
      }
    });
  }
  const metrics = (operation: () => void) => {
    void transaction(() => {
      operation();
      refreshPlaytest();
    }, false);
  };
  const inputJournal = createInputJournal(() => localStorage, uniqueId());
  function input(action: InputAction): Promise<void> {
    if (!session.value || storageConflict.value) return Promise.resolve();
    const item = { id: session.value.snapshot.runId + '.command.' + uniqueId(), action };
    try {
      inputJournal.append(item, expectedHead, session.value.snapshot.runId);
    } catch {
      /* Actual commit reports storage failures; input remains usable. */
    }
    return transaction(() => {
      try {
        if (storageConflict.value) throw new SaveError('CONFLICT', storageNotice.value);
        const before = toRaw(session.value!);
        const next = applyInput(currentSave(), pack, item);
        const previous = parameterDraft.value;
        parameterDraft.value = next.parameterDraft;
        try {
          publish(next.session);
        } catch (cause) {
          parameterDraft.value = previous;
          throw cause;
        }
        if (action.type !== 'parameters') sink.transition(before, next.session, action.type);
        if (!['parameters', 'draft', 'correctDocument', 'editDeclaration'].includes(action.type))
          refreshPlaytest();
        error.value = '';
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '草稿保存失败';
      } finally {
        try {
          inputJournal.finish(item.id, expectedHead, session.value!.snapshot.runId);
        } catch {
          /* Preserve intent for recovery when storage rejects cleanup. */
        }
      }
    });
  }
  const player = usePlayerStore(),
    order = useOrderStore(),
    story = useStoryStore();
  let startedInquiryRun = false;
  try {
    startedInquiryRun = localStorage.getItem(profileKey) === 'yes';
  } catch {
    /* 无存储时本页内仍记住首次流程。 */
  }
  function applyMemory(value: SliceSession): void {
    session.value = value;
    player.replaceState(value.snapshot.player);
    order.replaceState(value.snapshot.order);
    story.replaceState(value.snapshot.story);
  }
  function publish(value: SliceSession): void {
    try {
      expectedHead = repository.write(
        { session: value, parameterDraft: parameterDraft.value },
        expectedHead,
      );
      storageNotice.value = '已保存在此浏览器';
      storageProblem.value = false;
      backup.value = null;
    } catch (cause) {
      storageNotice.value = saveMessage(cause);
      storageProblem.value = true;
      sink.failure(cause instanceof SaveError ? cause.code : 'STORAGE', value.snapshot.revision);
      if (cause instanceof SaveError && cause.code === 'CONFLICT') {
        storageConflict.value = true;
        throw cause;
      }
    }
    applyMemory(value);
  }
  function start(practice = false, randomize = false, pretest = false): boolean {
    error.value = '';
    const next = createSliceSession(
      pack,
      'run.' + uniqueId(),
      practice,
      randomize,
      !startedInquiryRun,
    );
    const previousDraft = parameterDraft.value;
    try {
      parameterDraft.value = null;
      publish(next);
    } catch (cause) {
      parameterDraft.value = previousDraft;
      error.value = saveMessage(cause);
      return false;
    }
    sink.restart();
    sink.attach(next, practice ? 'practice' : 'full', pretest);
    // The engine may have loaded after the landing click. Explicitly start the
    // activity window now, without charging the download time to the new run.
    sink.interact();
    refreshPlaytest();
    if (!practice) {
      startedInquiryRun = true;
      try {
        localStorage.setItem(profileKey, 'yes');
      } catch {
        /* publish 会显示存储状态。 */
      }
    }
    return true;
  }
  function act(action: SliceAction | RescueAction): void {
    if (!session.value) return;
    try {
      if (storageConflict.value) throw new SaveError('CONFLICT', storageNotice.value);
      const source = toRaw(session.value);
      const next = dispatchSlice(source, pack, {
        id: source.snapshot.runId + '.command.' + uniqueId(),
        revision: source.snapshot.revision,
        action,
      });
      const previousDraft = parameterDraft.value;
      if (action.type === 'configure') parameterDraft.value = null;
      try {
        publish(next);
      } catch (cause) {
        parameterDraft.value = previousDraft;
        throw cause;
      }
      sink.transition(source, next, action.type);
      refreshPlaytest();
      error.value = '';
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '操作失败，请重试';
    }
  }
  function reloadSaved(attach = true): void {
    const loaded = repository.load();
    expectedHead = loaded.head;
    backup.value = loaded.backup;
    storageNotice.value = loaded.notice;
    storageProblem.value = loaded.problem;
    storageConflict.value = false;
    error.value = '';
    parameterDraft.value = loaded.game?.parameterDraft ?? null;
    session.value = null;
    if (loaded.game) {
      applyMemory(loaded.game.session);
      if (attach) {
        try {
          const pending = recoverInputs(storage, expectedHead, loaded.game, pack);
          if (pending) {
            parameterDraft.value = pending.game.parameterDraft;
            publish(pending.game.session);
            if (!storageProblem.value && storage().getItem(pending.key) === pending.raw)
              storage().removeItem(pending.key);
          }
        } catch {
          /* Keep the valid committed game and its recovery notice. */
        }
        sink.attach(toRaw(session.value!));
      }
      refreshPlaytest();
    }
  }
  function recoverBackup() {
    if (!backup.value) return;
    try {
      repository.recover(expectedHead, backup.value);
      reloadSaved();
    } catch (cause) {
      storageNotice.value = saveMessage(cause);
    }
  }
  function restoreGame(value: SavedGame) {
    const validated = validateSavedGame(value, pack),
      previous = parameterDraft.value;
    parameterDraft.value = validated.parameterDraft;
    try {
      publish(validated.session);
      sink.attach(validated.session);
      refreshPlaytest();
      error.value = '';
    } catch (cause) {
      parameterDraft.value = previous;
      throw cause;
    }
  }
  const currentSave = (): SavedGame => {
    if (!session.value) throw new SaveError('CORRUPT', '没有可导出的当前进度。');
    return { session: toRaw(session.value), parameterDraft: parameterDraft.value };
  };
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== `${savePrefix}:auto:head`) return;
    try {
      repository.check(expectedHead, 'auto');
    } catch (cause) {
      storageNotice.value = saveMessage(cause);
      storageProblem.value = true;
      if (cause instanceof SaveError && cause.code === 'CONFLICT') {
        storageConflict.value = true;
        sink.observeVisibility(false);
        metrics(() => sink.visibility(false, false));
      }
    }
  }
  reloadSaved(false);
  if (session.value) metrics(() => reloadSaved());
  window.addEventListener('storage', onStorage);
  const interaction = () => {
    if (!storageConflict.value) sink.interact();
  };
  const visibility = () => {
    const shown =
      document.visibilityState === 'visible' && document.hasFocus() && !storageConflict.value;
    sink.observeVisibility(shown);
    metrics(() => sink.visibility(shown, false));
  };
  const suspend = () => {
    sink.observeVisibility(false);
    metrics(() => sink.visibility(false, false));
  };
  visibility();
  document.addEventListener('pointerdown', interaction, { passive: true });
  document.addEventListener('wheel', interaction, { passive: true });
  document.addEventListener('keydown', interaction);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', visibility);
  window.addEventListener('blur', suspend);
  window.addEventListener('pagehide', suspend);
  const timer = window.setInterval(() => {
    metrics(() => sink.flush());
  }, 5000);
  onScopeDispose(() => {
    metrics(() => sink.flush());
    window.clearInterval(timer);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('pointerdown', interaction);
    document.removeEventListener('wheel', interaction);
    document.removeEventListener('keydown', interaction);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', visibility);
    window.removeEventListener('blur', suspend);
    window.removeEventListener('pagehide', suspend);
  });
  const node = computed(() => (session.value ? currentNode(pack, session.value) : null));
  const choices = computed(() =>
    node.value?.type === 'choice' && session.value
      ? node.value.choices
          .map((c) => {
            const current = toRaw(session.value!);
            const event = pack.events.find(
              (item) => item.id === current.snapshot.story.pendingEvent?.eventId,
            );
            const option = pack.eventEconomy
              ?.find((item) => item.eventId === event?.id)
              ?.options.find((item) => item.choiceId === c.id);
            const preview =
              event && option ? eventOptionPreview(current, pack, event, option) : null;
            return {
              ...c,
              enabled:
                matches(c.when, current, pack) &&
                (!preview || preview.costFen <= current.snapshot.player.cashCnyFen),
              detail: preview
                ? `本次现金支出 ${formatMoney(preview.costFen)} · 预计增加 ${preview.days} 天${preview.buyerExtraFen ? ' · 买方主运价差 ' + formatMoney(preview.buyerExtraFen) : ''}`
                : '',
            };
          })
          .filter((c) => node.value?.id !== 'L02.lead' || c.enabled)
      : [],
  );
  const inbox = computed(() =>
    session.value
      ? inquiryInbox(pack, session.value.snapshot).map((mail) => ({
          id: mail.id,
          subject: mail.subject,
          body: mail.body,
          sender: pack.customers.find((c) => c.id === mail.customerId)?.name ?? '采购联络处',
          choiceId: 'open_' + mail.senderRole,
          done: session.value!.snapshot.order.flags[mail.senderRole + 'Done'] === true,
        }))
      : [],
  );
  const activeInquiry = computed(() =>
    session.value
      ? inquiryInbox(pack, session.value.snapshot).find((mail) =>
          node.value?.tags.includes('inquiry_' + mail.senderRole),
        )
      : undefined,
  );
  const activeMail = computed(() =>
    inbox.value.find((mail) => mail.id === activeInquiry.value?.id),
  );
  const reviewedCustomer = computed(() => {
    const inquiry = activeInquiry.value;
    if (!inquiry || !session.value?.snapshot.story.completedNodeIds.includes(inquiry.replyNodeId))
      return undefined;
    return pack.customers.find((c) => c.id === inquiry.customerId);
  });
  const selectedCustomer = computed(() =>
    pack.customers.find((c) => c.id === session.value?.snapshot.order.customerId),
  );
  const lastDecision = computed(() => session.value?.snapshot.story.decisionLog.at(-1));
  const productRows = computed(() =>
    pack.products.flatMap((p) => {
      const choice = choices.value.find((c) =>
        c.effects.some(
          (e) =>
            e.op === 'set' &&
            e.target === 'order.productId' &&
            e.value.kind === 'literal' &&
            e.value.value === p.id,
        ),
      );
      return choice ? [{ ...p, choiceId: choice.id }] : [];
    }),
  );
  const supplierRows = computed(() =>
    pack.suppliers.flatMap((s) => {
      const choice = choices.value.find((c) =>
        c.effects.some(
          (e) =>
            e.op === 'set' &&
            e.target === 'order.supplierId' &&
            e.value.kind === 'literal' &&
            e.value.value === s.id,
        ),
      );
      return choice
        ? [
            {
              ...s,
              choiceId: choice.id,
              price: String(pack.parameters[s.taxInclusiveUnitPriceParam]!.value),
              depositPercent: new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(
                Number(pack.parameters[s.depositRatioParam]!.value),
              ),
            },
          ]
        : [];
    }),
  );
  const activeFields = computed(() => {
    const current = node.value;
    if (current?.type !== 'calc') return [];
    const puzzle = pack.puzzles.find((p) => p.id === current.puzzleId);
    return puzzle?.kind === 'quote' ? puzzle.inputFields : [];
  });
  const quoteSummary = computed(() => {
    const value = session.value;
    if (!value?.accepted || !value.snapshot.order.quote) return null;
    const q = value.snapshot.order.quote;
    return {
      ...q,
      fobInvoice: formatMoney(invoiceTotal(q.fobUnitUsdQuoted, value.quoteInput.quantity), 'USD'),
      cifInvoice: formatMoney(invoiceTotal(q.cifUnitUsdQuoted, value.quoteInput.quantity), 'USD'),
    };
  });
  const cashPreview = computed(() =>
    session.value?.accepted &&
    session.value.snapshot.story.stage === 3 &&
    !session.value.snapshot.order.flags.customerIsFraud
      ? buildQuoteCashflow(session.value.quoteInput, session.value.snapshot, pack)
      : null,
  );
  const quoteContext = computed(() => {
    const sampled = session.value?.snapshot.story.sampledParameters;
    return (
      (sampled?.variant ? '随机参数组 ' + sampled.variant : '黄金算例') +
      ' · FOB 宁波港 / CIF ' +
      (sampled?.destination || '新加坡港') +
      (sampled?.customized ? ' · 已自定义参数' : '')
    );
  });
  const copy = (text: string) => teachingText(text, pack);
  const selectedProduct = computed(() =>
    pack.products.find((p) => p.id === session.value?.snapshot.order.productId),
  );
  const selectedSupplier = computed(() =>
    pack.suppliers.find((s) => s.id === session.value?.snapshot.order.supplierId),
  );
  const delta = computed(() =>
    session.value?.feedback && node.value?.type === 'calc' ? quoteDifference(session.value) : null,
  );
  const canConfigure = computed(
    () =>
      node.value?.id === 'L03.main' &&
      !session.value?.feedback &&
      !session.value?.snapshot.story.decisionLog.some((d) => d.stage === 3),
  );
  function configure(input: QuoteInput): void {
    act({ type: 'configure', input });
  }
  const negotiation = computed(() =>
    session.value && !session.value.snapshot.story.pendingEvent
      ? buildNegotiationView(toRaw(session.value), pack)
      : null,
  );
  const procurement = computed(() =>
    session.value ? buildProcurementView(toRaw(session.value), pack) : null,
  );
  const logistics = computed(() =>
    session.value ? buildLogisticsView(toRaw(session.value), pack) : null,
  );
  const collection = computed(() =>
    session.value ? buildCollectionView(toRaw(session.value), pack) : null,
  );
  const eventContext = computed(() => {
    const pending = session.value?.snapshot.story.pendingEvent;
    if (!pending) return null;
    const event = pack.events.find((candidate) => candidate.id === pending.eventId);
    const review = pack.eventReviews?.find((candidate) => candidate.eventId === pending.eventId);
    const window = session.value?.snapshot.story.eventWindows.find(
      (candidate) => candidate.id === pending.windowId,
    );
    if (!event || !review) return null;
    return {
      id: event.id,
      title: event.title,
      reviewTitle: review.title,
      mentorReview: review.mentorReview,
      riskTags: review.riskTags,
      forced: event.forceWhen !== null,
      probabilityRoll: window?.probabilityRoll ?? null,
      returnNodeId: pending.returnNodeId,
      fxChange:
        event.id === 'e01'
          ? new D(String(session.value!.snapshot.story.sampledParameters.eventFxFactor))
              .minus(1)
              .mul(100)
              .toFixed(1) + '%'
          : null,
    };
  });
  const resumeRoute = computed(() =>
    session.value?.ending ? '/ending' : stageRoute(session.value?.snapshot.story.stage),
  );
  return {
    ready: () => enqueue(() => undefined),
    noteInteraction: interaction,
    saving: readonly(saving),
    pendingSaves: readonly(pendingSaves),
    playtest: readonly(playtest),
    exportPlaytest: () =>
      transaction(() => {
        const result = sink.export();
        refreshPlaytest();
        return result;
      }),
    answerAssessment: (phase: Phase, id: string, option: string) => {
      metrics(() => sink.answer(phase, id, option));
    },
    skipAssessment: (phase: Phase) => {
      metrics(() => sink.skip(phase));
    },
    playtestSurface: (shown: boolean) => sink.surface(shown),
    clearPlaytest: () =>
      transaction(() => {
        sink.clear();
        if (session.value) sink.attach(toRaw(session.value));
        refreshPlaytest();
      }),
    endingModel: computed(() => (session.value ? buildEndingView(session.value, pack) : null)),
    knowledgeCards: computed(() => buildKnowledgeView(session.value, pack)),
    resumeRoute,
    pack,
    session: readonly(session),
    node,
    choices,
    productRows,
    supplierRows,
    inbox,
    activeMail,
    reviewedCustomer,
    selectedCustomer,
    lastDecision,
    activeFields,
    quoteSummary,
    cashPreview,
    quoteContext,
    copy,
    selectedProduct,
    selectedSupplier,
    delta,
    canConfigure,
    error: readonly(error),
    storageNotice: readonly(storageNotice),
    storageProblem: readonly(storageProblem),
    storageConflict: readonly(storageConflict),
    hasBackup: computed(() => Boolean(backup.value)),
    parameterDraft: readonly(parameterDraft),
    saveParameterDraft: (value: SavedGame['parameterDraft']) =>
      input({ type: 'parameters', value }),
    reloadSaved: () => transaction(() => reloadSaved()),
    recoverBackup: () => transaction(recoverBackup),
    restoreGame: (value: SavedGame) => transaction(() => restoreGame(value)),
    exportCurrent: () => transaction(() => encodeSave(currentSave(), pack)),
    exportRaw: repository.rawExport,
    readImport: (text: string) => importSave(text, pack),
    readSlot: (slot: SaveSlot) => repository.load(slot),
    saveSlot: (slot: SaveSlot, expected: string | null) =>
      transaction(() => repository.write(currentSave(), expected, slot)),
    recoverSlot: (slot: SaveSlot, expected: string | null, previous: SaveHead) =>
      transaction(() => repository.recover(expected, previous, slot)),
    start: (practice = false, randomize = false, pretest = false) =>
      transaction(() => start(practice, randomize, pretest)),
    act: (action: SliceAction | RescueAction) =>
      isInputAction(action) ? input(action) : transaction(() => act(action)),
    editQuote: (answers: Record<string, string>) => input({ type: 'draft', answers }),
    submitQuote: () =>
      transaction(() => act({ type: 'submit', answers: { ...session.value!.answers } })),
    configure: (input: QuoteInput) => transaction(() => configure(input)),
    negotiation,
    procurement,
    logistics,
    collection,
    eventContext,
  };
});
export type GameStore = ReturnType<typeof useStore>;
export function useSliceGame(): GameStore {
  const game = useStore();
  loadedGame.value = game;
  return game;
}
