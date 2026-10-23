export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`尚未实现：${feature}（当前仅脚手架）`);
    this.name = 'NotImplementedError';
  }
}
export function notImplemented(feature: string): never {
  throw new NotImplementedError(feature);
}
