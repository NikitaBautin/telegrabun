import { expect, test } from 'bun:test';

import { Api } from '../../src/generated/client.ts';
import type { Message, User } from '../../src/generated/public.ts';
import type { TelegramTransport } from '../../src/transport/telegram-transport.ts';

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? true
    : false;

type GetMe = () => Promise<User>;
type GetUpdates = (params?: { readonly limit?: number }) => Promise<ReadonlyArray<unknown>>;
type SendMessage = (params: {
  readonly chatId: number | string;
  readonly text: string;
}) => Promise<Message>;

void (true satisfies Equal<Api['getMe'], GetMe>);
void (true satisfies Api['getUpdates'] extends GetUpdates ? true : false);
void (true satisfies Api['sendMessage'] extends SendMessage ? true : false);

test('generated Api delegates named methods to ApiClientCore', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return method === 'getMe'
        ? { first_name: 'Ada', id: 42, is_bot: true }
        : {
            chat: { id: 42, type: 'private' },
            date: 1_725_038_400,
            message_id: 99,
            text: 'Hello',
          };
    },
  };
  const api = new Api(transport);

  expect(api.getMe()).resolves.toEqual({ firstName: 'Ada', id: 42, isBot: true });
  expect(api.sendMessage({ chatId: 42, text: 'Hello' })).resolves.toMatchObject({
    messageId: 99,
    text: 'Hello',
  });

  expect(calls).toEqual([
    { method: 'getMe', params: {} },
    { method: 'sendMessage', params: { chat_id: 42, text: 'Hello' } },
  ]);
});

test('generated Api supplies an empty object for all-optional method parameters', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return [];
    },
  };
  const api = new Api(transport);

  await api.getUpdates();
  await api.getUpdates({ limit: 10 });

  expect(calls).toEqual([
    { method: 'getUpdates', params: {} },
    { method: 'getUpdates', params: { limit: 10 } },
  ]);
});
