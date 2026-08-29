/**
 * Entry point for the Telegram Bot API schema generator.
 *
 * Later tasks add code emitters. Parsing and applying the checked-in overrides
 * are part of the deterministic generation boundary and never access the network.
 */
import { join } from 'node:path';

import { applyTelegramSchemaOverrides, loadTelegramSchemaOverrides } from './overrides.ts';
import { parseCheckedInTelegramSchemaSnapshot } from './parser.ts';

const ir = await parseCheckedInTelegramSchemaSnapshot();
const overridesPath = join(import.meta.dir, 'overrides', `telegram-bot-api-${ir.apiVersion}.json`);
const result = applyTelegramSchemaOverrides(ir, await loadTelegramSchemaOverrides(overridesPath));

for (const application of result.applications) {
  console.info(`Applied override ${application.path}: ${application.properties.join(', ')}.`);
}
console.info(
  `Parsed Telegram Bot API ${result.ir.apiVersion}: ${result.ir.objects.length} objects, ${result.ir.unions.length} unions, ${result.ir.methods.length} methods; ${result.applications.length} overrides applied.`,
);
