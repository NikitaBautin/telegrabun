import { expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  parseTelegramSchemaIr,
  TelegramSchemaIrValidationError,
} from '../../scripts/telegram-schema/ir.ts';

const fixturePath = join(
  import.meta.dir,
  '../../scripts/telegram-schema/ir/fixtures/bot-api-edge-cases.json',
);

async function loadFixture(): Promise<unknown> {
  return Bun.file(fixturePath).json();
}

test('the schema IR fixture documents Bot API edge cases', async () => {
  const ir = parseTelegramSchemaIr(await loadFixture());

  expect(ir).toMatchObject({
    apiVersion: '10.3',
    formatVersion: 1,
  });

  const user = ir.objects.find(({ name }) => name === 'User');
  expect(user?.fields).toEqual([
    {
      name: 'id',
      description: 'Unique identifier for this user.',
      required: true,
      type: { kind: 'primitive', name: 'integer' },
    },
    {
      name: 'username',
      description: 'Optional username of the user.',
      required: false,
      type: { kind: 'primitive', name: 'string' },
    },
  ]);

  const chatMember = ir.unions.find(({ name }) => name === 'ChatMember');
  expect(chatMember).toMatchObject({ discriminator: { field: 'status' } });

  const sendDocument = ir.methods.find(({ name }) => name === 'sendDocument');
  expect(sendDocument?.parameters).toContainEqual({
    name: 'document',
    description: 'File to send. Pass a file_id, URL, or a new file upload.',
    required: true,
    type: {
      kind: 'union',
      members: [{ kind: 'input-file' }, { kind: 'primitive', name: 'string' }],
    },
  });
  expect(sendDocument?.parameters).toContainEqual({
    name: 'thumbnail',
    description: 'Optional thumbnail of the file sent.',
    required: false,
    type: { kind: 'input-file' },
  });

  expect(ir.methods.find(({ name }) => name === 'getMe')?.parameters).toEqual([]);
  expect(ir.methods.find(({ name }) => name === 'close')?.result).toEqual({
    kind: 'primitive',
    name: 'true',
  });
  expect(ir.methods.find(({ name }) => name === 'exportChatInviteLink')?.result).toEqual({
    kind: 'primitive',
    name: 'string',
  });
  expect(ir.methods.find(({ name }) => name === 'sendMediaGroup')?.result).toEqual({
    kind: 'array',
    element: { kind: 'reference', name: 'Message' },
  });
  expect(ir.methods.find(({ name }) => name === 'setGameScore')?.result).toEqual({
    kind: 'union',
    members: [
      { kind: 'reference', name: 'Message' },
      { kind: 'primitive', name: 'true' },
    ],
  });
});

test('the schema IR rejects duplicate names and unresolved references', async () => {
  const fixture = (await loadFixture()) as {
    objects: Array<{ name: string }>;
    methods: Array<{ result: unknown }>;
  };
  const duplicateObject = structuredClone(fixture);
  duplicateObject.objects[1]!.name = duplicateObject.objects[0]!.name;

  expect(() => parseTelegramSchemaIr(duplicateObject)).toThrow(TelegramSchemaIrValidationError);
  expect(() => parseTelegramSchemaIr(duplicateObject)).toThrow('duplicate object name: User');

  const unresolvedReference = structuredClone(fixture);
  unresolvedReference.methods[0]!.result = { kind: 'reference', name: 'UnknownResult' };

  expect(() => parseTelegramSchemaIr(unresolvedReference)).toThrow(TelegramSchemaIrValidationError);
  expect(() => parseTelegramSchemaIr(unresolvedReference)).toThrow(
    'method getMe.result references unknown type UnknownResult',
  );
});
