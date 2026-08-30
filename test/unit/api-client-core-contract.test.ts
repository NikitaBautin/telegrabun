import { expect, test } from 'bun:test';

import { ApiClientCore } from '../../src/api/client-core.ts';
import { TelegramSerializationError } from '../../src/api/serializer.ts';
import type {
  ApiMethodName,
  ApiMethodParams,
  ApiMethodResult,
  Message,
  User,
} from '../../src/generated/public.ts';
import type { TelegramTransport } from '../../src/transport/telegram-transport.ts';
type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? true
    : false;

type ExpectedCall = <Method extends ApiMethodName>(
  method: Method,
  params: ApiMethodParams<Method>,
) => Promise<ApiMethodResult<Method>>;
type GetMeCall = (method: 'getMe', params: {}) => Promise<User>;
type SendMessageCall = (
  method: 'sendMessage',
  params: { readonly chatId: number | string; readonly text: string },
) => Promise<Message>;

void (true satisfies Equal<ApiClientCore['call'], ExpectedCall>);
void (true satisfies ApiClientCore['call'] extends GetMeCall ? true : false);
void (true satisfies ApiClientCore['call'] extends SendMessageCall ? true : false);

function assertTypedCoreCalls(typedCore: ApiClientCore): void {
  const typedGetMeResult: Promise<User> = typedCore.call('getMe', {});
  const typedSendMessageResult: Promise<Message> = typedCore.call('sendMessage', {
    chatId: 42,
    text: 'Hello',
  });
  void typedGetMeResult;
  void typedSendMessageResult;

  // @ts-expect-error sendMessage requires text.
  void typedCore.call('sendMessage', { chatId: 42 });

  // @ts-expect-error Typed core accepts public camelCase parameters, not wire keys.
  void typedCore.call('sendMessage', { chat_id: 42, text: 'Hello' });
}
void assertTypedCoreCalls;

test('ApiClientCore contract is available for the generated API facade', () => {
  expect(true).toBe(true);
});

test('ApiClientCore serializes public parameters before delegating to transport', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return {};
    },
  };

  const core = new ApiClientCore(transport);

  await core.call('sendMessage', {
    chatId: 42,
    replyMarkup: {
      inlineKeyboard: [[{ callbackData: 'confirm', text: 'Confirm' }]],
    },
    text: 'Continue?',
  });

  expect(calls).toEqual([
    {
      method: 'sendMessage',
      params: {
        chat_id: 42,
        reply_markup: {
          inline_keyboard: [[{ callback_data: 'confirm', text: 'Confirm' }]],
        },
        text: 'Continue?',
      },
    },
  ]);
});

test('ApiClientCore deserializes transport results to the public API shape', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return { first_name: 'Ada', id: 42, is_bot: true };
    },
  };

  const core = new ApiClientCore(transport);

  expect(core.call('getMe', {})).resolves.toEqual({
    firstName: 'Ada',
    id: 42,
    isBot: true,
  });

  expect(calls).toEqual([{ method: 'getMe', params: {} }]);
});

test('ApiClientCore calls sendMessage with required wire parameters and returns a Message', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return {
        chat: { id: 42, type: 'private' },
        date: 1_725_038_400,
        from: { first_name: 'Ada', id: 7, is_bot: true },
        message_id: 99,
        text: 'Hello',
      };
    },
  };
  const core = new ApiClientCore(transport);
  const params = { chatId: 42, text: 'Hello' } satisfies ApiMethodParams<'sendMessage'>;

  const message: Message = await core.call('sendMessage', params);

  expect(calls).toEqual([
    {
      method: 'sendMessage',
      params: { chat_id: 42, text: 'Hello' },
    },
  ]);
  expect(message).toEqual({
    chat: { id: 42, type: 'private' },
    date: 1_725_038_400,
    from: { firstName: 'Ada', id: 7, isBot: true },
    messageId: 99,
    text: 'Hello',
  });
});

test('ApiClientCore serializes nested inline keyboard fields to Telegram wire names', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return {};
    },
  };
  const core = new ApiClientCore(transport);

  await core.call('sendMessage', {
    chatId: 42,
    replyMarkup: {
      inlineKeyboard: [
        [{ callbackData: 'confirm', text: 'Confirm' }],
        [{ callbackData: 'cancel', text: 'Cancel' }],
      ],
    },
    text: 'Continue?',
  });

  expect(calls).toEqual([
    {
      method: 'sendMessage',
      params: {
        chat_id: 42,
        reply_markup: {
          inline_keyboard: [
            [{ callback_data: 'confirm', text: 'Confirm' }],
            [{ callback_data: 'cancel', text: 'Cancel' }],
          ],
        },
        text: 'Continue?',
      },
    },
  ]);
});

test('ApiClientCore deserializes every getUpdates array element to the public API shape', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return [
        {
          message: {
            chat: { id: 42, type: 'private' },
            date: 1_725_038_400,
            from: { first_name: 'Ada', id: 7, is_bot: false },
            message_id: 99,
          },
          update_id: 100,
        },
        {
          message: {
            chat: { id: 43, type: 'private' },
            date: 1_725_038_401,
            from: { first_name: 'Grace', id: 8, is_bot: true },
            message_id: 101,
          },
          update_id: 102,
        },
      ];
    },
  };
  const core = new ApiClientCore(transport);

  const updates = await core.call('getUpdates', {});

  expect(calls).toEqual([{ method: 'getUpdates', params: {} }]);
  expect(updates).toEqual([
    {
      message: {
        chat: { id: 42, type: 'private' },
        date: 1_725_038_400,
        from: { firstName: 'Ada', id: 7, isBot: false },
        messageId: 99,
      },
      updateId: 100,
    },
    {
      message: {
        chat: { id: 43, type: 'private' },
        date: 1_725_038_401,
        from: { firstName: 'Grace', id: 8, isBot: true },
        messageId: 101,
      },
      updateId: 102,
    },
  ]);
});

test('ApiClientCore retains unknown result fields at every nested level', async () => {
  const transport: TelegramTransport = {
    async call() {
      return [
        {
          future_update_property: { future_nested_property: true },
          message: {
            chat: {
              future_chat_property: ['kept'],
              id: 42,
              type: 'private',
            },
            date: 1_725_038_400,
            from: {
              first_name: 'Ada',
              future_user_property: { enabled: true },
              id: 7,
              is_bot: false,
            },
            future_message_property: { nested: 'kept' },
            message_id: 99,
          },
          update_id: 100,
        },
      ];
    },
  };
  const core = new ApiClientCore(transport);
  const result: unknown = await core.call('getUpdates', {});

  expect(result).toEqual([
    {
      future_update_property: { future_nested_property: true },
      message: {
        chat: {
          future_chat_property: ['kept'],
          id: 42,
          type: 'private',
        },
        date: 1_725_038_400,
        from: {
          firstName: 'Ada',
          future_user_property: { enabled: true },
          id: 7,
          isBot: false,
        },
        future_message_property: { nested: 'kept' },
        messageId: 99,
      },
      updateId: 100,
    },
  ]);
});

test('ApiClientCore rejects invalid public parameters before calling transport', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return {};
    },
  };
  const core = new ApiClientCore(transport);

  expect(
    core.call('sendMessage', { chatId: 42, text: 'Hello', unexpected: true } as never),
  ).rejects.toThrow(TelegramSerializationError);
  expect(
    core.call('sendMessage', { chatId: 42, chat_id: 42, text: 'Hello' } as never),
  ).rejects.toThrow(TelegramSerializationError);
  expect(core.call('sendMessage', { chatId: 42 } as never)).rejects.toThrow(
    TelegramSerializationError,
  );

  expect(calls).toEqual([]);
});

test('ApiClientCore propagates a transport rejection without wrapping it', async () => {
  const error = new Error('Transport is unavailable.');
  const transport: TelegramTransport = {
    async call() {
      throw error;
    },
  };
  const core = new ApiClientCore(transport);

  expect(core.call('getMe', {})).rejects.toBe(error);
});

test('ApiClientCore does not mutate reused public parameters', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return {};
    },
  };
  const params = {
    chatId: 42,
    replyMarkup: {
      inlineKeyboard: [[{ callbackData: 'confirm', text: 'Confirm' }]],
    },
    text: 'Continue?',
  } satisfies ApiMethodParams<'sendMessage'>;
  const originalParams = structuredClone(params);
  const core = new ApiClientCore(transport);

  await core.call('sendMessage', params);
  await core.call('sendMessage', params);

  expect(params).toEqual(originalParams);
  expect(calls).toEqual([
    {
      method: 'sendMessage',
      params: {
        chat_id: 42,
        reply_markup: {
          inline_keyboard: [[{ callback_data: 'confirm', text: 'Confirm' }]],
        },
        text: 'Continue?',
      },
    },
    {
      method: 'sendMessage',
      params: {
        chat_id: 42,
        reply_markup: {
          inline_keyboard: [[{ callback_data: 'confirm', text: 'Confirm' }]],
        },
        text: 'Continue?',
      },
    },
  ]);
});

test('ApiClientCore does not mutate a fake transport result', async () => {
  const wireResult = { first_name: 'Ada', id: 42, is_bot: true };
  const originalWireResult = structuredClone(wireResult);
  const transport: TelegramTransport = {
    async call() {
      return wireResult;
    },
  };
  const core = new ApiClientCore(transport);

  expect(core.call('getMe', {})).resolves.toEqual({
    firstName: 'Ada',
    id: 42,
    isBot: true,
  });

  expect(wireResult).toEqual(originalWireResult);
});
