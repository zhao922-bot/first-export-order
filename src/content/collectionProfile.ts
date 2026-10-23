import type { ContentPack, Effect } from '../domain/types';
import { ruleDefinitions } from '../domain/registries';
import { taxEvidenceIds } from '../domain/schemas/collection';
import { D } from '../engine/economy/decimal';
export const documentSourceFields = [
  'product',
  'quantity',
  'amount',
  'term',
  'origin',
  'destination',
  'cartons',
  'weight',
  'buyer',
  'seller',
  'country',
  'consignee',
  'shipment',
];
export function validateCollectionRule(effect: Extract<Effect, { op: 'rule' }>): boolean {
  return effect.ruleId.startsWith('collection.') && !!ruleDefinitions[effect.ruleId];
}
export function validateCollectionContent(
  pack: ContentPack,
  issue: (path: string, message: string) => void,
): void {
  const c = pack.collection;
  if (!c) {
    issue('/collection', '第 7 关缺少收汇配置');
    return;
  }
  if (new D(c.collectionFxFactor).lte(0) || new D(c.collectionFxFactor).gt(2))
    issue('/collection', '收汇汇率因子须在 (0,2]');
  if (new Set(c.oaScenarios.map((s) => s.id)).size !== c.oaScenarios.length)
    issue('/collection/oaScenarios', 'OA 情境 id 必须唯一');
  for (const s of c.oaScenarios) {
    const hasLoss = new D(s.firstRatio).lt(1) && new D(s.recoveryRatio).lt(1);
    if (hasLoss !== Boolean(s.lossEvidence.trim()))
      issue('/collection/oaScenarios', '剩余无法回收须有损失核验材料，全额回收不得声明坏账');
    if (new D(s.firstRatio).eq(1) && new D(s.recoveryRatio).gt(0))
      issue('/collection/oaScenarios', '已全额到账不能再次回收');
  }
  if (new Set(c.taxEvidence.map((e) => e.id)).size !== taxEvidenceIds.length)
    issue('/collection/taxEvidence', '退税凭证须唯一完整');
  if (
    pack.documentTemplates.length !== 5 ||
    new Set(pack.documentTemplates.map((t) => t.kind)).size !== 5
  )
    issue('/documentTemplates', '须包含五类不同单据模板');
  for (const t of pack.documentTemplates) {
    if (
      new Set(t.fields.map((f) => f.id)).size !== t.fields.length ||
      t.fields.some((f) => !documentSourceFields.includes(f.sourcePath))
    )
      issue('/documentTemplates', '模板字段重复或引用了未知源记录');
  }
  const selected = [c.puzzleId, c.lcPuzzleId].map((id) => pack.puzzles.find((p) => p.id === id));
  for (const puzzle of selected) {
    if (puzzle?.kind !== 'document') {
      issue('/collection', '单据题引用不存在');
      continue;
    }
    const p = puzzle.puzzle;
    if (
      p.requiredFaultCount !== p.faults.length ||
      p.faults.length < 3 ||
      new Set(p.faults.map((f) => f.documentId)).size < 3
    )
      issue('/puzzles', '必须找齐至少三种单据中的独立错误');
    if (
      p.templateIds.length !== 4 ||
      new Set(p.templateIds).size !== 4 ||
      p.templateIds.some((id) => pack.documentTemplates.find((t) => t.id === id)?.kind === 'pi')
    )
      issue('/puzzles', 'PI 是源记录，找错须覆盖其他四份单据');
    if (new Set(p.faults.map((f) => f.documentId + '.' + f.fieldPath)).size !== p.faults.length)
      issue('/puzzles', '不能向同一字段注入多个错误');
    for (const f of p.faults) {
      const template = pack.documentTemplates.find((t) => t.id === f.documentId);
      const field = template?.fields.find((v) => v.id === f.fieldPath);
      if (
        !p.templateIds.includes(f.documentId) ||
        !field ||
        field.sourcePath !== f.expectedFrom ||
        !documentSourceFields.includes(f.expectedFrom)
      )
        issue('/puzzles', '错误位置与模板或源记录不匹配');
      if (!p.comparisonRules.some((r) => r.fieldPaths.includes(f.fieldPath)))
        issue('/puzzles', '错误字段缺少比较规则');
    }
    if (
      p.comparisonRules.some(
        (r) => r.mode === 'semantic' || r.fieldPaths.some((f) => !documentSourceFields.includes(f)),
      )
    )
      issue('/puzzles', '单据校核只支持已知字段的 exact / number 比较');
  }
  const [normal, lc] = selected;
  if (
    normal?.kind === 'document' &&
    lc?.kind === 'document' &&
    (c.puzzleId === c.lcPuzzleId ||
      !lc.puzzle.faults.some(
        (f) => f.fieldPath === 'consignee' && !normal.puzzle.faults.some((n) => n.id === f.id),
      ))
  )
    issue('/collection/lcPuzzleId', 'L/C 须额外包含信用证收货人不符点');
  if (pack.endings.length !== 4 || new Set(pack.endings.map((e) => e.kind)).size !== 4)
    issue('/endings', '须覆盖四类财务结局');
}
