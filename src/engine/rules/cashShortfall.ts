/** 可预览的未提交付款失败；没有授信，不产生负现金或虚构借款。 */
export class CashShortfall extends RangeError {
  readonly gapFen: number;
  constructor(gapFen: number, message: string) {
    super(message);
    this.gapFen = gapFen;
  }
}
