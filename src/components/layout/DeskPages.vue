<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { presentation } from '../../content/presentation';
import { paginate, pageAt, type PageSpan } from '../../app/deskPagination';
const props = defineProps<{ resetKey?: string; label?: string }>();
const viewport = ref<HTMLElement>();
const content = ref<HTMLElement>();
const index = ref(0);
const pages = ref<PageSpan[]>([{ start: 0, end: 0 }]);
const current = computed(() => pages.value[index.value] ?? pages.value[0]!);
const focusTargets = 'button,input,select,textarea,summary,a,[role="button"]';
let resize: ResizeObserver | undefined,
  mutation: MutationObserver | undefined,
  frame = 0;
function measure() {
  frame = 0;
  if (!viewport.value || !content.value || !viewport.value.clientHeight) return;
  const root = content.value;
  const origin = root.getBoundingClientRect().top;
  const capacity = viewport.value.clientHeight - 8;
  const spans: PageSpan[] = [];
  const preferred: PageSpan[] = [];
  const add = (r: DOMRect, padding = 3) => {
    if (r.height > 0 && r.height + padding * 2 < capacity)
      spans.push({
        start: Math.max(0, r.top - origin - padding),
        end: r.bottom - origin + padding,
      });
  };
  const rendered = (el: Element) => {
    // Chromium lays out descendants of closed <details> even though they are not painted.
    // Their invisible text must not create page breaks through visible controls.
    for (
      let parent: Element | null = el;
      parent && parent !== root;
      parent = parent.parentElement
    ) {
      if (
        parent instanceof HTMLDetailsElement &&
        !parent.open &&
        !parent.querySelector(':scope > summary')?.contains(el)
      )
        return false;
    }
    return typeof el.checkVisibility === 'function'
      ? el.checkVisibility()
      : el.getClientRects().length > 0;
  };
  root.querySelectorAll('button,input,select,textarea,summary').forEach((el) => {
    if (rendered(el)) add(el.getBoundingClientRect());
  });
  root
    .querySelectorAll(
      'label,tr,li,h1,h2,h3,article,.option-row,.document-field,.specs > div,.check-item',
    )
    .forEach((el) => {
      if (!rendered(el)) return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height + 6 < capacity)
        preferred.push({ start: Math.max(0, r.top - origin - 3), end: r.bottom - origin + 3 });
    });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    if (
      !walker.currentNode.textContent?.trim() ||
      !walker.currentNode.parentElement ||
      !rendered(walker.currentNode.parentElement)
    )
      continue;
    range.selectNodeContents(walker.currentNode);
    // Text ranges already include the full line box. Extra padding merges tight lines
    // into an oversized block and can accidentally discard a neighboring button's guard.
    for (const rect of range.getClientRects()) add(rect, 0);
  }
  const oldTop = current.value.start;
  pages.value = paginate(Math.ceil(root.scrollHeight), capacity, spans, preferred);
  const active = document.activeElement;
  const focused =
    active instanceof HTMLElement && root.contains(active) && active.matches(focusTargets)
      ? active.getBoundingClientRect()
      : null;
  index.value = Math.min(
    focused
      ? pageAt(pages.value, focused.top - origin, focused.bottom - origin)
      : pageAt(pages.value, oldTop),
    pages.value.length - 1,
  );
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(measure);
}
function reveal(event: Event) {
  if (!(event.target instanceof HTMLElement) || !content.value) return;
  // WebKit can focus a tabindex ancestor on pointer-down instead of its button.
  // Revealing that whole sheet would turn the page before pointer-up cancels the click.
  // Explicit guide requests still reveal containers; focus navigation reveals controls only.
  if (event.type === 'focusin' && !event.target.matches(focusTargets)) return;
  if (frame) {
    cancelAnimationFrame(frame);
    measure();
  }
  const rect = event.target.getBoundingClientRect();
  const origin = content.value.getBoundingClientRect().top;
  index.value = pageAt(pages.value, rect.top - origin, rect.bottom - origin);
}
function turn(offset: number) {
  index.value = Math.min(pages.value.length - 1, Math.max(0, index.value + offset));
}
watch(
  () => props.resetKey,
  () => {
    index.value = 0;
    void nextTick(schedule);
  },
);
onMounted(() => {
  resize = new ResizeObserver(schedule);
  resize.observe(viewport.value!);
  resize.observe(content.value!);
  mutation = new MutationObserver(schedule);
  mutation.observe(content.value!, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['open', 'class', 'hidden'],
  });
  schedule();
});
onBeforeUnmount(() => {
  resize?.disconnect();
  mutation?.disconnect();
  cancelAnimationFrame(frame);
});
</script>
<template>
  <section
    class="desk-pages"
    :aria-label="label ?? presentation.desk.task"
    :data-page="index + 1"
    :data-pages="pages.length"
  >
    <div ref="viewport" class="desk-viewport">
      <div
        class="desk-page-clip"
        :style="{ height: Math.max(0, current.end - current.start + 4) + 'px' }"
      >
        <div
          ref="content"
          class="desk-page-content"
          :style="{ transform: `translateY(${-current.start}px)` }"
          @focusin="reveal"
          @desk-reveal="reveal"
        >
          <slot />
        </div>
      </div>
    </div>
    <nav class="desk-pagination" :aria-label="presentation.desk.pagination">
      <button class="secondary" :disabled="index === 0" @click="turn(-1)">
        {{ presentation.desk.previous }}
      </button>
      <span aria-live="polite"
        >{{ index + 1 }} / {{ pages.length }} <small>{{ presentation.desk.page }}</small></span
      >
      <button class="primary" :disabled="index >= pages.length - 1" @click="turn(1)">
        {{ presentation.desk.next }}
      </button>
    </nav>
  </section>
</template>
