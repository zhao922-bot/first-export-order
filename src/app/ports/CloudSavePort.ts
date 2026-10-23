import type { SaveEnvelope } from '../../domain/types';
/** 预留接口，本期不连接云服务。 */
export interface CloudSavePort {
  pull(runId: string): Promise<unknown | null>;
  push(save: SaveEnvelope, expectedRemoteRevision: number | null): Promise<{ revision: number }>;
}
