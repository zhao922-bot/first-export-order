import type { EndingResult } from '../../domain/types';
/** 仅抽象，不提交真实排名。 */
export interface LeaderboardPort {
  submit(result: EndingResult): Promise<void>;
  list(limit: number): Promise<readonly { displayName: string; score: number }[]>;
}
