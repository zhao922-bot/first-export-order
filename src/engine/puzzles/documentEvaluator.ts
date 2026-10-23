import type { DocumentPuzzle } from '../../domain/types';
import { D } from '../economy/decimal';
/** 源记录、题目及玩家草稿分离；只在提交时产生反馈。 */
export function evaluateDocument(
  puzzle: DocumentPuzzle,
  fieldIds: string[],
  corrections: Record<string, string>,
  source: Record<string, string>,
): { correct: boolean; missed: string[]; falsePositive: string[]; wrongCorrections: string[] } {
  const keys = puzzle.faults.map((f) => f.documentId + '.' + f.fieldPath);
  const missed = keys.filter((id) => !fieldIds.includes(id));
  const falsePositive = fieldIds.filter((id) => !keys.includes(id));
  const wrongCorrections = puzzle.faults
    .filter((f) => {
      const id = f.documentId + '.' + f.fieldPath;
      if (!fieldIds.includes(id)) return false;
      const value = corrections[id]?.trim() ?? '',
        expected = source[f.expectedFrom];
      if (expected === undefined) throw new RangeError('缺少单据核验源记录');
      const numeric = puzzle.comparisonRules.some(
        (r) => r.mode === 'number' && r.fieldPaths.includes(f.fieldPath),
      );
      return numeric
        ? !/^\d+(\.\d+)?$/.test(value) || !new D(value).eq(expected)
        : value !== expected;
    })
    .map((f) => f.documentId + '.' + f.fieldPath);
  return {
    correct: !missed.length && !falsePositive.length && !wrongCorrections.length,
    missed,
    falsePositive,
    wrongCorrections,
  };
}
