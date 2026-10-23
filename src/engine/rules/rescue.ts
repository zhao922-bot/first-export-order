/** 运行时救援使用交易检查点命令，不执行任意路径回滚效果。 */
export { dispatchSlice, validateRescue } from '../slice/rescue';
export type { RescueAction, PlayCommand } from '../slice/rescue';
