import { expect, test } from 'bun:test';

import {
  deserializeApiMethodResult,
  serializeApiMethodParams,
  TelegramSerializationError,
} from '../../src/api/serializer.ts';
import type { TelegramApiRuntimeMetadata } from '../../src/generated/metadata.ts';

test('serializes method parameters and nested Telegram objects to wire JSON', () => {
  expect(
    serializeApiMethodParams('sendMessage', {
      chatId: 42,
      text: 'Hello',
      replyMarkup: {
        inlineKeyboard: [[{ callbackData: 'confirm', text: 'Confirm' }]],
      },
      replyParameters: {
        allowSendingWithoutReply: true,
        messageId: 7,
        quoteEntities: [{ length: 5, offset: 0, type: 'bold' }],
      },
    }),
  ).toEqual({
    chat_id: 42,
    reply_markup: {
      inline_keyboard: [[{ callback_data: 'confirm', text: 'Confirm' }]],
    },
    reply_parameters: {
      allow_sending_without_reply: true,
      message_id: 7,
      quote_entities: [{ length: 5, offset: 0, type: 'bold' }],
    },
    text: 'Hello',
  });
});

test('serializes scalar and array method parameter classes and omits undefined optionals', () => {
  expect(
    serializeApiMethodParams('getUpdates', {
      allowedUpdates: ['message', 'callback_query'],
      limit: 25,
    }),
  ).toEqual({
    allowed_updates: ['message', 'callback_query'],
    limit: 25,
  });
});

test('deserializes known fields while retaining unknown Telegram fields', () => {
  const result = deserializeApiMethodResult('getUpdates', [
    {
      future_update_property: { future_nested_property: true },
      message: {
        chat: { id: 42, type: 'private' },
        date: 1,
        future_message_property: 'kept',
        from: { first_name: 'Ada', id: 7, is_bot: false },
        message_id: 99,
      },
      update_id: 100,
    },
  ]);

  expect(result as unknown).toEqual([
    {
      future_update_property: { future_nested_property: true },
      message: {
        chat: { id: 42, type: 'private' },
        date: 1,
        from: { firstName: 'Ada', id: 7, isBot: false },
        future_message_property: 'kept',
        messageId: 99,
      },
      updateId: 100,
    },
  ]);
});

test('rejects ambiguous metadata and response field collisions', () => {
  const metadata = createCollisionMetadata();

  expect(() =>
    serializeApiMethodParams('getMe', { firstName: 'Ada', isBot: false } as never, metadata),
  ).toThrow(TelegramSerializationError);
  expect(() =>
    deserializeApiMethodResult('getMe', { first_name: 'Ada', firstName: 'Grace' }, metadata),
  ).toThrow(/collision/i);
});

function createCollisionMetadata(): TelegramApiRuntimeMetadata {
  return {
    api: { announcedAt: '2026-08-24', version: '10.3' },
    methods: {
      getMe: {
        parameters: [
          primitiveField('firstName', 'first_name'),
          primitiveField('firstName', 'given_name'),
        ],
        result: { kind: 'reference', name: 'User' },
      },
    },
    objects: {
      User: {
        fields: [primitiveField('firstName', 'first_name')],
      },
    },
    schemaFormatVersion: 1,
    snapshot: { bytes: 1, path: 'fixture', sha256: 'fixture' },
    source: { retrievedAt: '2026-08-29', url: 'https://example.test' },
    unions: {},
  };
}

function primitiveField(name: string, wireName: string) {
  return {
    containsInputFile: false,
    name,
    required: false,
    type: { kind: 'primitive' } as const,
    wireName,
  };
}
