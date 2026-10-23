<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSliceGame } from '../../app/useSliceGame';
import { useOnboarding } from '../../app/useOnboarding';
import { GuideIdleClock, guideRule, type GuideContext } from '../../app/onboarding';
import { guideElements } from '../../app/guideTargets';
import type { GuideScreen } from '../../domain/schemas/onboarding';

const game = useSliceGame(),
  guide = useOnboarding(),
  route = useRoute();
const labels = guide.content.labels;
const manual = ref(false),
  idle = ref(false),
  missing = ref(false);
const heading = ref<HTMLElement | null>(null);
const context = computed<GuideContext>(() => {
  const session = game.session,
    node = game.node;
  const screen: GuideScreen =
    route.path === '/'
      ? session
        ? 'resume'
        : 'home'
      : route.path === '/playtest'
        ? 'assessment'
        : route.path === '/recovery' || game.storageConflict
          ? 'recovery'
          : route.path === '/glossary'
            ? 'reference'
            : route.path === '/ending'
              ? 'ending'
              : 'game';
  const phase = session?.rescue?.pending
    ? 'rescue'
    : session?.feedback
      ? 'feedback'
      : node?.type === 'review'
        ? 'review'
        : game.eventContext
          ? 'event'
          : 'normal';
  return {
    screen,
    phase,
    nodeId: node?.id ?? '',
    nodeType: node?.type ?? '',
    tags: node?.tags ?? [],
    stage: session?.snapshot.story.stage ?? 0,
    key: [
      route.path,
      session?.snapshot.runId,
      node?.id,
      phase,
      session?.feedback?.nextNodeId,
      session?.rescue?.pending?.phase,
    ].join('|'),
  };
});
const overview = computed(
  () =>
    guide.state.status === 'active' &&
    !manual.value &&
    guide.state.overview < guide.content.overview.length &&
    context.value.screen === 'game' &&
    context.value.phase === 'normal',
);
const card = computed(() =>
  overview.value
    ? guide.content.overview[guide.state.overview]!
    : guideRule(guide.content, context.value),
);
const open = computed(() => guide.state.status === 'active' || manual.value);
const clock = new GuideIdleClock();
let timer = 0;
let disposed = false;
let marked: { el: HTMLElement; tabindex: string | null }[] = [];
function clearMarks() {
  for (const { el, tabindex } of marked) {
    el.classList.remove('onboarding-highlight');
    // Vue may have added a new field error since highlighting. Remove only our token.
    const described = (el.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== 'onboarding-text')
      .join(' ');
    if (described) el.setAttribute('aria-describedby', described);
    else el.removeAttribute('aria-describedby');
    if (tabindex === null) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', tabindex);
  }
  marked = [];
}
function mark() {
  clearMarks();
  if (disposed || !open.value || game.storageConflict) return;
  marked = guideElements(card.value.target).map((el) => ({
    el,
    tabindex: el.getAttribute('tabindex'),
  }));
  for (const { el } of marked) {
    el.classList.add('onboarding-highlight');
    el.setAttribute(
      'aria-describedby',
      [el.getAttribute('aria-describedby'), 'onboarding-text'].filter(Boolean).join(' '),
    );
  }
}
function locate() {
  mark();
  const target = marked[0]?.el;
  missing.value = !target;
  if (!target) return;
  if (!target.matches('button, input, select, a, summary, textarea'))
    target.setAttribute('tabindex', '-1');
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  target.focus({ preventScroll: true });
}
function focusPanel() {
  void nextTick(() => {
    heading.value?.scrollIntoView({ block: 'center' });
    heading.value?.focus({ preventScroll: true });
  });
}
function help() {
  manual.value = true;
  idle.value = false;
  clock.dismiss();
  focusPanel();
}
function replay() {
  guide.replay();
  if (context.value.screen === 'game' && context.value.stage === 1)
    guide.update({ demoStarted: true });
  manual.value = false;
  idle.value = false;
  focusPanel();
}
function close(status?: 'skipped' | 'completed') {
  if (status) guide.update({ status });
  manual.value = false;
  idle.value = false;
  if (status === 'completed') clock.reset(context.value.key, performance.now(), eligible());
  else clock.dismiss();
}
const eligible = () =>
  guide.state.status === 'completed' &&
  !open.value &&
  context.value.screen === 'game' &&
  !game.storageConflict &&
  document.visibilityState === 'visible' &&
  document.hasFocus();
function tick() {
  idle.value = clock.tick(
    context.value.key,
    performance.now(),
    eligible(),
    guide.content.idleSeconds * 1000,
  );
}
function activity(event: Event) {
  if (event.target instanceof Element && event.target.closest('[data-onboarding]')) return;
  clock.activity(performance.now());
  idle.value = false;
}
watch(
  () => context.value.key,
  () => {
    manual.value = false;
    idle.value = false;
    missing.value = false;
    clock.reset(context.value.key, performance.now(), eligible());
    if (guide.state.status === 'active' && context.value.screen === 'game') {
      if (context.value.stage === 1 && !guide.state.demoStarted)
        guide.update({ demoStarted: true });
      if (context.value.stage > 1 && guide.state.demoStarted) guide.update({ status: 'completed' });
    }
  },
  { immediate: true },
);
watch(
  () => [
    open.value,
    card.value.id,
    game.session?.snapshot.revision,
    game.parameterDraft,
    game.storageConflict,
  ],
  () => {
    void nextTick(mark);
  },
  { immediate: true },
);
onMounted(() => {
  timer = window.setInterval(tick, 1000);
  document.addEventListener('input', activity);
  document.addEventListener('pointerdown', activity);
  document.addEventListener('keydown', activity);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  window.addEventListener('blur', tick);
});
onBeforeUnmount(() => {
  disposed = true;
  clearMarks();
  window.clearInterval(timer);
  document.removeEventListener('input', activity);
  document.removeEventListener('pointerdown', activity);
  document.removeEventListener('keydown', activity);
  document.removeEventListener('visibilitychange', tick);
  window.removeEventListener('focus', tick);
  window.removeEventListener('blur', tick);
});
</script>
<template>
  <div data-onboarding class="onboarding">
    <div class="onboarding-toolbar">
      <span>{{ labels.title }}</span>
      <div class="actions">
        <button class="secondary" @click="help">{{ labels.help }}</button>
        <button class="secondary" @click="replay">{{ labels.replay }}</button>
      </div>
    </div>
    <section
      v-if="open"
      class="onboarding-card"
      aria-labelledby="onboarding-title"
      data-testid="onboarding"
      :data-guide-step="card.id"
    >
      <p v-if="overview" class="eyebrow">
        认识工作台 {{ guide.state.overview + 1 }} / {{ guide.content.overview.length }}
      </p>
      <h2 id="onboarding-title" ref="heading" tabindex="-1">{{ card.title }}</h2>
      <p id="onboarding-text" aria-live="polite">{{ card.text }}</p>
      <p v-if="missing" role="alert">{{ labels.unavailable }}</p>
      <p v-if="guide.storageUnavailable" class="muted">{{ labels.storage }}</p>
      <div class="actions">
        <button class="secondary" @click="locate">{{ labels.locate }}</button>
        <button
          v-if="overview"
          class="primary"
          @click="guide.update({ overview: guide.state.overview + 1 })"
        >
          {{ guide.state.overview === 2 ? labels.practice : labels.next }}
        </button>
        <button
          v-else-if="guide.state.status === 'active' && (context.stage > 1 || card.id === 'finish')"
          class="primary"
          @click="close('completed')"
        >
          {{ labels.complete }}
        </button>
        <button v-if="guide.state.status === 'active'" class="secondary" @click="close('skipped')">
          {{ labels.skip }}
        </button>
        <button v-else class="secondary" @click="close()">{{ labels.dismiss }}</button>
      </div>
    </section>
    <aside
      v-if="idle && !open"
      class="onboarding-nudge"
      data-testid="onboarding-idle"
      aria-live="polite"
    >
      <p>{{ labels.idle }}{{ card.title }}</p>
      <div class="actions">
        <button class="primary" @click="help">{{ labels.help }}</button
        ><button class="secondary" @click="close()">{{ labels.dismiss }}</button>
      </div>
    </aside>
  </div>
</template>
