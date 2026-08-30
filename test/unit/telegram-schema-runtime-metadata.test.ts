import { expect, test } from 'bun:test';

import { telegramApiMetadata } from '../../src/generated/metadata.ts';

test('generated runtime metadata is available without schema parsing', () => {
  expect(telegramApiMetadata.api).toEqual({
    announcedAt: '2026-08-24',
    version: '10.3',
  });
  expect(telegramApiMetadata.source.url).toBe('https://core.telegram.org/bots/api');

  expect(telegramApiMetadata.methods.sendMessage.parameters).toContainEqual({
    name: 'chatId',
    wireName: 'chat_id',
    required: true,
    containsInputFile: false,
    type: {
      kind: 'union',
      members: [{ kind: 'primitive' }, { kind: 'primitive' }],
    },
  });
  expect(
    telegramApiMetadata.methods.sendDocument.parameters.find(
      (parameter) => parameter.name === 'document',
    )?.containsInputFile,
  ).toBe(true);
});
