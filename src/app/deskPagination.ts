export interface PageSpan {
  start: number;
  end: number;
}

/** Cut only in whitespace between text lines / controls; never scale business text. */
export function paginate(
  height: number,
  capacity: number,
  protectedSpans: PageSpan[],
  preferredSpans: PageSpan[] = [],
): PageSpan[] {
  if (!(height > 0) || !(capacity > 0)) return [{ start: 0, end: 0 }];
  const sorted = protectedSpans
    .filter((s) => s.end > s.start && s.end - s.start <= capacity)
    .sort((a, b) => a.start - b.start);
  const merged: PageSpan[] = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  const spans = merged.filter((s) => s.end - s.start <= capacity);
  const safeEnd = (start: number, target: number) => {
    const crossing = spans.find((s) => s.start < target && s.end > target && s.start > start);
    return crossing ? crossing.start : target;
  };
  const pages: PageSpan[] = [];
  let start = 0;
  while (start < height) {
    let end = safeEnd(start, Math.min(height, start + capacity));
    const preferred = preferredSpans
      .filter((s) => s.start < end && s.end > end && s.start > start + capacity * 0.35)
      .sort((a, b) => b.start - a.start)[0];
    if (preferred) {
      const candidate = safeEnd(start, preferred.start);
      if (candidate > start + capacity * 0.35) end = candidate;
    }
    if (end <= start + 1) end = Math.min(height, start + capacity);
    pages.push({ start, end });
    start = end;
  }
  return pages;
}

export function pageAt(pages: PageSpan[], top: number, bottom = top): number {
  const complete = pages.findIndex((p) => top >= p.start - 1 && bottom <= p.end + 1);
  if (complete >= 0) return complete;
  return Math.max(
    0,
    pages.findIndex((p) => top < p.end),
  );
}
