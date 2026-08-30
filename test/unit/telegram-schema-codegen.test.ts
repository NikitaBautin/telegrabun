import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  generateTelegramPublicTypes,
  generateTelegramRuntimeMetadata,
  generateTelegramWireTypes,
} from '../../scripts/telegram-schema/codegen.ts';
import { parseTelegramSchemaIr } from '../../scripts/telegram-schema/ir.ts';
import {
  applyTelegramSchemaOverrides,
  loadTelegramSchemaOverrides,
} from '../../scripts/telegram-schema/overrides.ts';
import { parseCheckedInTelegramSchemaSnapshot } from '../../scripts/telegram-schema/parser.ts';
import { verifyTelegramSchemaSnapshot } from '../../scripts/telegram-schema/verify-snapshot.ts';

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

test('public type generator uses camelCase fields and emits a complete method map', async () => {
  const ir = parseTelegramSchemaIr(await Bun.file(fixturePath).json());
  const generatedTypes = generateTelegramPublicTypes(ir);

  expect(generatedTypes).toContain('readonly messageId: number;');
  expect(generatedTypes).toContain('readonly chatId: number | string;');
  expect(generatedTypes).toContain('readonly thumbnail?: InputFile;');
  expect(generatedTypes).toContain('export type InputMedia = InputMediaPhoto | InputMediaVideo;');
  expect(generatedTypes).toContain(
    'export type ChatMember = ChatMemberOwner | ChatMemberAdministrator;',
  );
  expect(generatedTypes).toContain('export interface GetMeParams {\n}');
  expect(generatedTypes).toContain('export type SendMediaGroupResult = ReadonlyArray<Message>;');
  expect(generatedTypes).toContain('readonly sendMessage: {');
  expect(generatedTypes).toContain('readonly params: SendMessageParams;');
  expect(generatedTypes).toContain('readonly result: SendMessageResult;');
  expect(generatedTypes).toContain(
    "export type ApiMethodParams<Method extends ApiMethodName> = ApiMethodMap[Method]['params'];",
  );
  expect(generatedTypes).toContain(
    "export type ApiMethodResult<Method extends ApiMethodName> = ApiMethodMap[Method]['result'];",
  );
});

test('runtime metadata generator preserves snapshot provenance and serializer data', async () => {
  const ir = parseTelegramSchemaIr(await Bun.file(fixturePath).json());
  const metadata = await verifyTelegramSchemaSnapshot();
  const generatedMetadata = generateTelegramRuntimeMetadata(ir, metadata);

  expect(generatedMetadata).toContain('export const telegramApiMetadata = {');
  expect(generatedMetadata).toContain('version: "10.3",');
  expect(generatedMetadata).toContain('url: "https://core.telegram.org/bots/api",');
  expect(generatedMetadata).toContain('name: "messageId",');
  expect(generatedMetadata).toContain('wireName: "message_id",');
  expect(generatedMetadata).toContain('containsInputFile: true,');
  expect(generatedMetadata).toContain("kind: 'input-file'");
  expect(generatedMetadata).toContain('"InputMedia": {');
  expect(generatedMetadata).toContain('discriminator: {');
  expect(generatedMetadata).toContain('name: "status",');
  expect(generatedMetadata).toMatch(
    /"sendMediaGroup": \{[\s\S]*?name: "media",\n\s+wireName: "media",\n\s+required: true,\n\s+containsInputFile: true,/,
  );
});

test('runtime metadata generation rejects a snapshot for another API version', async () => {
  const ir = parseTelegramSchemaIr(await Bun.file(fixturePath).json());
  const metadata = await verifyTelegramSchemaSnapshot();

  expect(() =>
    generateTelegramRuntimeMetadata(ir, {
      ...metadata,
      api: { ...metadata.api, version: '0.0' },
    }),
  ).toThrow('does not match IR API version');
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
  const generatedPublicPath = join(import.meta.dir, '../../src/generated/public.ts');
  const generatedMetadataPath = join(import.meta.dir, '../../src/generated/metadata.ts');
  const snapshotMetadata = await verifyTelegramSchemaSnapshot();

  expect(await Bun.file(generatedPath).text()).toBe(
    await formatGeneratedWireTypes(generateTelegramWireTypes(patchedIr)),
  );
  expect(await Bun.file(generatedPublicPath).text()).toBe(
    await formatGeneratedWireTypes(generateTelegramPublicTypes(patchedIr)),
  );
  expect(await Bun.file(generatedMetadataPath).text()).toBe(
    await formatGeneratedWireTypes(generateTelegramRuntimeMetadata(patchedIr, snapshotMetadata)),
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

  const generatedPublicTypes = await Bun.file(generatedPublicPath).text();
  for (const object of patchedIr.objects) {
    expect(generatedPublicTypes).toContain(`export interface ${object.name} {`);
    for (const field of object.fields) {
      const publicName = field.name.replace(/_([a-z0-9])/g, (_, character: string) =>
        character.toUpperCase(),
      );
      expect(generatedPublicTypes).toContain(`readonly ${publicName}${field.required ? '' : '?'}:`);
    }
  }
  for (const method of patchedIr.methods) {
    const typeName = `${method.name[0]!.toUpperCase()}${method.name.slice(1)}`;
    expect(generatedPublicTypes).toContain(`readonly ${method.name}: {`);
    expect(generatedPublicTypes).toContain(`readonly params: ${typeName}Params;`);
    expect(generatedPublicTypes).toContain(`readonly result: ${typeName}Result;`);
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
