import { expect, test } from 'bun:test';

test('public entry point imports without side effects', async () => {
  const publicApi = await import('../../src/index.ts');

  expect(publicApi.version).toBe('0.1.0');
});
