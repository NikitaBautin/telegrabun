import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { generateTelegramWireTypes } from '../../scripts/telegram-schema/codegen.ts';
import { parseTelegramSchemaIr } from '../../scripts/telegram-schema/ir.ts';
import {
  applyTelegramSchemaOverrides,
  loadTelegramSchemaOverrides,
} from '../../scripts/telegram-schema/overrides.ts';
import { parseCheckedInTelegramSchemaSnapshot } from '../../scripts/telegram-schema/parser.ts';

const fixturePath = join(
  import.meta.dir,
  '../../scripts/telegram-schema/ir/fixtures/bot-api-edge-cases.json',
);

test('wire type generator preserves snake_case fields and all IR type forms', async () => {
  const ir = parseTelegramSchemaIr(await Bun.file(fixturePath).json());
  const generatedTypes = generateTelegramWireTypes(ir);

  expect(generatedTypes).toContain('readonly caption?: string;');
  expect(generatedTypes).toContain('readonly media: InputFile | string;');
  expect(generatedTypes).toContain('readonly status: "creator";');
  expect(generatedTypes).toContain('export type InputMedia = InputMediaPhoto | InputMediaVideo;');
  expect(generatedTypes).toContain(
    'export type ChatMember = ChatMemberOwner | ChatMemberAdministrator;',
  );
  expect(generatedTypes).toContain('export interface GetMeParams {\n}');
  expect(generatedTypes).toContain('export type CloseResult = true;');
  expect(generatedTypes).toContain('readonly media: ReadonlyArray<InputMedia | Message>;');
  expect(generatedTypes).toContain('export type SendMediaGroupResult = ReadonlyArray<Message>;');
  expect(generatedTypes).toContain('readonly chat_id: number;');
  expect(generatedTypes).toContain('export type SetGameScoreResult = Message | true;');
});

test('the checked-in generated wire types are exactly reproducible from the patched IR', async () => {
  const ir = await parseCheckedInTelegramSchemaSnapshot();
  const overridesPath = join(
    import.meta.dir,
    '../../scripts/telegram-schema/overrides',
    `telegram-bot-api-${ir.apiVersion}.json`,
  );
  const { ir: patchedIr } = applyTelegramSchemaOverrides(
    ir,
    await loadTelegramSchemaOverrides(overridesPath),
  );
  const generatedPath = join(import.meta.dir, '../../src/generated/wire.ts');

  expect(await Bun.file(generatedPath).text()).toBe(
    await formatGeneratedWireTypes(generateTelegramWireTypes(patchedIr)),
  );

  const generatedTypes = await Bun.file(generatedPath).text();
  for (const object of patchedIr.objects) {
    expect(generatedTypes).toContain(`export interface ${object.name} {`);
    for (const field of object.fields) {
      expect(generatedTypes).toContain(`readonly ${field.name}${field.required ? '' : '?'}:`);
    }
  }
  for (const union of patchedIr.unions) {
    expect(generatedTypes).toContain(`export type ${union.name}`);
  }
  for (const method of patchedIr.methods) {
    const typeName = `${method.name[0]!.toUpperCase()}${method.name.slice(1)}`;
    expect(generatedTypes).toContain(`export interface ${typeName}Params {`);
    expect(generatedTypes).toContain(`export type ${typeName}Result = `);
  }
});

async function formatGeneratedWireTypes(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'telegrabun-wire-types-'));
  const path = join(directory, 'wire.ts');
  await Bun.write(path, source);
  const formatter = Bun.spawn(['bunx', 'oxfmt', '--write', path], {
    stderr: 'inherit',
    stdout: 'inherit',
  });

  expect(await formatter.exited).toBe(0);
  return Bun.file(path).text();
}
