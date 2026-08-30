/**
 * Entry point for the Telegram Bot API schema generator.
 *
 * Later tasks add code emitters. Parsing and applying the checked-in overrides
 * are part of the deterministic generation boundary and never access the network.
 */
import { join } from 'node:path';

import {
  generateTelegramPublicTypes,
  generateTelegramRuntimeMetadata,
  generateTelegramWireTypes,
} from './codegen.ts';
import { applyTelegramSchemaOverrides, loadTelegramSchemaOverrides } from './overrides.ts';
import { parseCheckedInTelegramSchemaSnapshot } from './parser.ts';
import { verifyTelegramSchemaSnapshot } from './verify-snapshot.ts';

const [ir, snapshotMetadata] = await Promise.all([
  parseCheckedInTelegramSchemaSnapshot(),
  verifyTelegramSchemaSnapshot(),
]);
const overridesPath = join(import.meta.dir, 'overrides', `telegram-bot-api-${ir.apiVersion}.json`);
const result = applyTelegramSchemaOverrides(ir, await loadTelegramSchemaOverrides(overridesPath));
const generatedWireTypesPath = join(import.meta.dir, '../../src/generated/wire.ts');
const generatedPublicTypesPath = join(import.meta.dir, '../../src/generated/public.ts');
const generatedRuntimeMetadataPath = join(import.meta.dir, '../../src/generated/metadata.ts');

await Promise.all([
  Bun.write(generatedWireTypesPath, generateTelegramWireTypes(result.ir)),
  Bun.write(generatedPublicTypesPath, generateTelegramPublicTypes(result.ir)),
  Bun.write(
    generatedRuntimeMetadataPath,
    generateTelegramRuntimeMetadata(result.ir, snapshotMetadata),
  ),
]);
const formatter = Bun.spawn(
  [
    'bunx',
    'oxfmt',
    '--write',
    generatedWireTypesPath,
    generatedPublicTypesPath,
    generatedRuntimeMetadataPath,
  ],
  {
    stderr: 'inherit',
    stdout: 'inherit',
  },
);
if ((await formatter.exited) !== 0) {
  throw new Error('Could not format generated Telegram types.');
}

for (const application of result.applications) {
  console.info(`Applied override ${application.path}: ${application.properties.join(', ')}.`);
}
console.info(
  `Generated wire types for Telegram Bot API ${result.ir.apiVersion}: ${result.ir.objects.length} objects, ${result.ir.unions.length} unions, ${result.ir.methods.length} methods; ${result.applications.length} overrides applied.`,
);
