import { expect, test } from 'bun:test';

import type { TelegramTransport } from '../../src/transport/telegram-transport.ts';

test('transport receives a Telegram method and serialized wire parameters', async () => {
  const calls: Array<{ method: string; params: Readonly<Record<string, unknown>> }> = [];
  const transport: TelegramTransport = {
    async call(method, params) {
      calls.push({ method, params });
      return { first_name: 'Ada', id: 42, is_bot: true };
    },
  };

  const result = await transport.call('getMe', { allowed_updates: ['message'] });

  expect(calls).toEqual([{ method: 'getMe', params: { allowed_updates: ['message'] } }]);
  expect(result).toEqual({ first_name: 'Ada', id: 42, is_bot: true });
});
