import type { StudySummary } from './aggregate';

const n = (value: number | null) => (value === null ? '无有效数据' : value.toFixed(2));
export function renderReport(s: StudySummary) {
  return `# 12 人试玩数值汇总（待人工签核）

批次：${s.studyId}；观察截止：${s.observationAt}；状态：${s.studyStatus}。

内容：${s.protocol.contentVersion} / ${s.protocol.configVersion}；SHA-256：${s.protocol.contentSha256}。

| 项目 | 结果 | 门槛 / 状态 |
| --- | --- | --- |
| 纳入 / 有首局 / 缺失 | ${s.cohort.enrolled} / ${s.cohort.recorded} / ${s.cohort.missing} | 至少 ${s.protocol.minimumParticipants} 名有效零基础真人 / ${s.gates.sample} |
| 待招募 / 已撤回 | ${s.cohort.pending} / ${s.cohort.withdrawn} | 单列、不假定已试玩 |
| 首局完整七关 | ${s.completion.completed} / ${s.cohort.enrolled}（${n(s.completion.rate === null ? null : s.completion.rate * 100)}%） | ≥${s.protocol.completionRate * 100}% / ${s.gates.completion} |
| 任意正式结局 | ${s.completion.anyEnding} | 不替代完整通关 |
| 配对 / 不配对 | ${s.knowledge.pairedN} / ${s.knowledge.unpaired} | 本协议至少 ${s.protocol.minimumPaired} 对才判知识门槛 |
| 前测 / 后测跳过 | ${s.knowledge.preSkipped}（${n(s.knowledge.preSkipRate === null ? null : s.knowledge.preSkipRate * 100)}%）/ ${s.knowledge.postSkipped}（${n(s.knowledge.postSkipRate === null ? null : s.knowledge.postSkipRate * 100)}%） | 分母为有效首局 / 已有正式结局 |
| 前测 / 后测均分 | ${n(s.knowledge.preMean)} / ${n(s.knowledge.postMean)}（满分 6） | 仅同一配对样本 |
| 个人提升中位数 | ${n(s.knowledge.medianGainPp)} 个百分点 | ≥${s.protocol.medianGainPp} / ${s.gates.knowledge} |
| 正常完成经营时长中位数 | ${n(s.duration.medianGameplayMinutes)} 分钟，${s.duration.measuredN}/${s.duration.completedN} 可计时 | ${s.protocol.durationMinutes.join('–')} 分钟 / ${s.gates.duration} |
| 明细不全 | ${s.detailIncompleteN} 人 | 事件分布与阅读时长可能低估 |
| 局中 / 终局后重开 / 额外局 | ${s.completion.restartedDuring} / ${s.completion.restartedAfter} / ${s.completion.additionalRuns} | 不替换首局 |

## 四类结局

${Object.entries(s.completion.endings)
  .map(([k, v]) => `- ${k}：${v}`)
  .join('\n')}

## 各关观察

原始有效时长包含该关测评、复盘及终局后的活动；经营时长门槛使用上表扣除前后测后的数值。

| 关 | 进入 | 完成 | 原始时长中位数（分） | 待观察退出 | ≥24h 未恢复 | 提前终局 | 局中重开 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${s.stages.map((x) => `| ${x.stage} | ${x.entered} | ${x.completed} | ${n(x.medianRawActiveMinutes)} | ${x.suspectedDropout} | ${x.observedDropout24h} | ${x.formalEndingsHere} | ${x.restartsHere} |`).join('\n')}

## 核对事项

${s.warnings.length ? s.warnings.map((w) => `- ${w}`).join('\n') : '- 无数据格式警告；不代表已完成真人或专业审校。'}

${s.limitations.map((w) => `- ${w}`).join('\n')}

## 尚待人工完成

专业审校、逐人反馈、问题关闭/解释、阅读负担与移动端观察均应填写验收报告模板。本文件不会给出发布通过结论。输入文件 SHA-256 清单及逐人结果见同目录 summary.json；文件级哈希仅用于追溯，不证明真实性。
`;
}

/** 公开文案预算清单；只量长度，专业正确性仍需顾问逐项签核。 */
export function auditReviews(content: unknown, limit = 120) {
  const reviews: { path: string; characters: number; withinBudget: boolean; text: string }[] = [];
  function walk(v: unknown, path: string) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}/${i}`));
      return;
    }
    const obj = v as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (
        typeof value === 'string' &&
        (key === 'mentorReview' ||
          key === 'cashReview' ||
          key === 'releaseReview' ||
          (obj.type === 'review' && key === 'text'))
      ) {
        const characters = [...value.replace(/\s/g, '')].length;
        reviews.push({
          path: `${path}/${key}`,
          characters,
          withinBudget: characters <= limit,
          text: value,
        });
      } else walk(value, `${path}/${key}`);
    }
  }
  walk(content, '');
  return {
    count: reviews.length,
    limit,
    method: 'Unicode code points excluding whitespace; punctuation included',
    overBudget: reviews.filter((r) => !r.withinBudget).length,
    reviews,
  };
}
