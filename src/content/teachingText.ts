import type { ContentPack } from '../domain/types';
/** 只插入已登记的标量，Vue 按纯文本显示，不执行 HTML。 */
export function teachingText(value: string, pack: ContentPack): string {
  return value.replace(
    /\{\{([a-zA-Z][\w.:-]*)(?:\|([a-z]+))?\}\}/g,
    (_, key: string, format?: string) => {
      const parameter = pack.parameters[key];
      if (!parameter) throw new RangeError('未声明的文案参数：' + key);
      if (format) {
        if (
          format !== 'percent' ||
          !['string', 'number'].includes(typeof parameter.value) ||
          !Number.isFinite(Number(parameter.value))
        )
          throw new RangeError('无效文案格式：' + key);
        return new Intl.NumberFormat('zh-CN', {
          style: 'percent',
          maximumFractionDigits: 2,
        }).format(Number(parameter.value));
      }
      return String(parameter.value);
    },
  );
}
