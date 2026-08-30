import { expect, test } from 'bun:test';

import { ApiClientCore } from '../../src/api/client-core.ts';
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
  const transport: TelegramTransport = {
    async call() {
      return { first_name: 'Ada', id: 42, is_bot: true };
    },
  };

  const core = new ApiClientCore(transport);

  expect(core.call('getMe', {})).resolves.toEqual({
    firstName: 'Ada',
    id: 42,
    isBot: true,
  });
});
