/**
 * Entry point for the Telegram Bot API schema generator.
 *
 * Later tasks add overrides and code emitters. Parsing is already part of the
 * deterministic generation boundary and reads only the checked-in snapshot.
 */
import { parseCheckedInTelegramSchemaSnapshot } from './parser.ts';

const ir = await parseCheckedInTelegramSchemaSnapshot();
console.info(
  `Parsed Telegram Bot API ${ir.apiVersion}: ${ir.objects.length} objects, ${ir.unions.length} unions, ${ir.methods.length} methods.`,
);
