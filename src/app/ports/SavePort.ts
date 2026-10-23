import type { SaveEnvelope } from '../../domain/types';
export interface SavePort {
  load(slotId: string): Promise<unknown | null>;
  save(slotId: string, envelope: SaveEnvelope): Promise<void>;
  remove(slotId: string): Promise<void>;
}
