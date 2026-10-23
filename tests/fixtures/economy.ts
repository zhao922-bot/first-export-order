import { contentPackSchema } from '../../src/domain/schemas/content';
import rawPack from '../../src/content/levels/L01-L07.json' with { type: 'json' };
import { initialSnapshot } from '../../src/engine/slice/session';
import type { QuoteInput, ScoringConfig, JournalEntry } from '../../src/domain/types';
import type { Posting } from '../../src/engine/economy/ledger';
export const eventPack = contentPackSchema.parse(rawPack);
/** 既有财务黄金值使用零普通事件概率；事件集成测试使用原始 eventPack。强制审证仍运行。 */
export const pack = structuredClone(eventPack);
pack.eventScheduling!.windowProbability = '0';
export const golden: QuoteInput = {
  taxInclusiveUnitCny: '28',
  quantity: 5000,
  vatRate: '0.13',
  rebateRate: '0.09',
  rebateEligible: true,
  domesticTotalCny: '3500',
  fxCnyPerUsd: '7.20',
  costMarkupRate: '0.11',
  oceanTotalUsd: '2850',
  insuranceCoverageFactor: '1.10',
  insuranceRate: '0.006',
};
export const note = '教学算例参数，可配置';
export function snapshot() {
  return initialSnapshot(pack, 'test.run', false);
}
export function entry(id: string, postings: Posting[], commandId = id): JournalEntry {
  return { id, commandId, sourceNodeId: 'L01.product', gameDay: 0, description: note, postings };
}
export const scoring: ScoringConfig = {
  targetReturnOnCost: {
    value: '0.10',
    unit: 'ratio',
    teachingOnly: true,
    note,
    reviewStatus: 'draft',
  },
  minimumScoreBasisCnyFen: {
    value: 100,
    unit: 'CNY fen',
    teachingOnly: true,
    note,
    reviewStatus: 'draft',
  },
  excellentReputation: 80,
  rubrics: [],
};
