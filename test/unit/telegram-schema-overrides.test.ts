import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { parseTelegramSchemaIr } from '../../scripts/telegram-schema/ir.ts';
import {
  applyTelegramSchemaOverrides,
  parseTelegramSchemaOverrides,
  TelegramSchemaOverrideApplicationError,
  TelegramSchemaOverridesValidationError,
} from '../../scripts/telegram-schema/overrides.ts';

const fixturePath = join(
  import.meta.dir,
  '../../scripts/telegram-schema/ir/fixtures/bot-api-edge-cases.json',
);

async function loadFixture() {
  return parseTelegramSchemaIr(await Bun.file(fixturePath).json());
}

test('overrides patch a named existing IR node and report the application', async () => {
  const ir = await loadFixture();
  const result = applyTelegramSchemaOverrides(
    ir,
    parseTelegramSchemaOverrides({
      formatVersion: 1,
      irFormatVersion: 1,
      apiVersion: '10.3',
      overrides: [
        {
          path: '/objects/User/fields/username',
          patch: { required: true, description: 'Username required by this corrected schema.' },
        },
      ],
    }),
  );

  expect(result.applications).toEqual([
    {
      index: 0,
      path: '/objects/User/fields/username',
      properties: ['required', 'description'],
    },
  ]);
  expect(result.ir.objects.find(({ name }) => name === 'User')?.fields[1]).toMatchObject({
    name: 'username',
    required: true,
    description: 'Username required by this corrected schema.',
  });
  expect(ir.objects.find(({ name }) => name === 'User')?.fields[1]?.required).toBe(false);
});

test('overrides reject malformed paths and paths that do not select an IR node', async () => {
  expect(() =>
    parseTelegramSchemaOverrides({
      formatVersion: 1,
      irFormatVersion: 1,
      apiVersion: '10.3',
      overrides: [{ path: '/objects/User/parameters/nope', patch: { required: true } }],
    }),
  ).toThrow(TelegramSchemaOverridesValidationError);

  const ir = await loadFixture();
  expect(() =>
    applyTelegramSchemaOverrides(
      ir,
      parseTelegramSchemaOverrides({
        formatVersion: 1,
        irFormatVersion: 1,
        apiVersion: '10.3',
        overrides: [{ path: '/objects/Unknown/fields/value', patch: { required: true } }],
      }),
    ),
  ).toThrow(TelegramSchemaOverrideApplicationError);
  expect(() =>
    applyTelegramSchemaOverrides(
      ir,
      parseTelegramSchemaOverrides({
        formatVersion: 1,
        irFormatVersion: 1,
        apiVersion: '10.3',
        overrides: [{ path: '/objects/User/fields/missing', patch: { required: true } }],
      }),
    ),
  ).toThrow('path selects a field that does not exist in the IR: User.fields.missing');
});

test('overrides must be created for the parser API version', async () => {
  const ir = await loadFixture();
  expect(() =>
    applyTelegramSchemaOverrides(
      ir,
      parseTelegramSchemaOverrides({
        formatVersion: 1,
        irFormatVersion: 1,
        apiVersion: '10.4',
        overrides: [],
      }),
    ),
  ).toThrow('override API version 10.4 does not match IR API version 10.3');
});
