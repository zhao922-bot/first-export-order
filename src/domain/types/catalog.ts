import type { z } from 'zod';
import type {
  productSchema,
  supplierSchema,
  customerSchema,
  mentorSchema,
  inquirySchema,
  glossarySchema,
  forwarderSchema,
} from '../schemas/catalog';

/** 公开类型从 Zod schema 推导，禁止在此复制结构。 */
export type Product = z.infer<typeof productSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Mentor = z.infer<typeof mentorSchema>;
export type Inquiry = z.infer<typeof inquirySchema>;
export type GlossaryCard = z.infer<typeof glossarySchema>;
export type Forwarder = z.infer<typeof forwarderSchema>;
