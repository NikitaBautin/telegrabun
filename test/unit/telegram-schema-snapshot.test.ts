import { expect, test } from 'bun:test';

import { verifyTelegramSchemaSnapshot } from '../../scripts/telegram-schema/verify-snapshot.ts';

test('the checked-in Telegram Bot API snapshot matches its metadata', async () => {
  const metadata = await verifyTelegramSchemaSnapshot();

  expect(metadata).toMatchObject({
    api: {
      announcedAt: '2026-08-24',
      version: '10.3',
    },
    source: {
      retrievedAt: '2026-08-29',
      url: 'https://core.telegram.org/bots/api',
    },
  });
  expect(metadata.snapshot.path).toBe('snapshots/telegram-bot-api-10.3.html');
  expect(metadata.snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
});
