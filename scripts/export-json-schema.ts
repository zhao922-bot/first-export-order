import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { contentPackSchema, contentManifestSchema } from '../src/domain/schemas/content';
import { saveEnvelopeSchema } from '../src/domain/schemas/save';
import { onboardingSchema } from '../src/domain/schemas/onboarding';
import { presentationSchema } from '../src/domain/schemas/presentation';

await mkdir('schemas/generated', { recursive: true });
for (const [name, schema] of Object.entries({
  content: contentPackSchema,
  manifest: contentManifestSchema,
  save: saveEnvelopeSchema,
  onboarding: onboardingSchema,
  presentation: presentationSchema,
})) {
  await writeFile(
    `schemas/generated/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n',
  );
}
console.log(
  '已生成内容包、manifest、存档 JSON Schema；跨引用及自定义约束仍由 Zod/语义校验器检查。',
);
