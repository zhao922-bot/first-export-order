import type { z } from 'zod';
import type { saveEnvelopeSchema } from '../schemas/save';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type SaveEnvelope = z.infer<typeof saveEnvelopeSchema>;
export interface Migration {
  from: number;
  to: number;
  migrate(input: unknown): unknown;
}
