import type { GuideTarget } from '../domain/schemas/onboarding';

/** Audited UI hooks only; content cannot inject selectors, scripts or business commands. */
const selectors: Record<GuideTarget, string> = {
  start: '[data-guide="start"]',
  resume: '[data-guide="resume"]',
  progress: '[data-guide="progress"]',
  resources: '[data-guide="resources"]',
  glossary: '[data-guide="glossary"]',
  product: '[data-guide="product"]',
  supplier: '[data-guide="supplier"]',
  feedback: '.legacy-feedback button.primary',
  review: '.mentor-review button.primary',
  choices: '.contract-checklist input:not(:checked), .choice-list button',
  mail: '.mail-inbox button',
  quote:
    '.worksheet [aria-invalid="true"], .worksheet input, .worksheet select, .worksheet button, .parameters button',
  pi: '.pi-confirm input:not(:checked)',
  funding: '.funding-record input:not(:checked)',
  inspection: '.inspection-list button, .inspection-list input',
  declaration: '.declaration-panel input',
  transport: '.choice-list button',
  documents: '.document-workspace input, .document-workspace button, [role="tab"]',
  tax: '[aria-label="退税核验"] select',
  rescue: '.rescue-panel button',
  ending: '.decision-replay summary',
  assessment: '.assessment-options button, .assessment-options input, #main-content a.primary',
  recovery: '#main-content a.save-link, #main-content button',
};
export function guideElements(target: GuideTarget): HTMLElement[] {
  const visible = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
      (el) =>
        el.getClientRects().length > 0 &&
        !el.matches(':disabled') &&
        !el.closest('[inert], [data-onboarding]'),
    );
  if (target === 'quote') {
    if (document.querySelector('.worksheet button:disabled')) return visible('.parameters button');
    const invalid = visible('.worksheet [aria-invalid="true"]');
    if (invalid.length) return invalid;
    const empty = visible('.worksheet input').filter(
      (el) => !(el as HTMLInputElement).value.trim(),
    );
    if (empty.length) return empty;
    return visible('.worksheet select, .worksheet button');
  }
  const found = visible(selectors[target]);
  return found.length ? found : visible('#main-content .choice-list button');
}
