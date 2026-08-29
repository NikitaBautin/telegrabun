import { expect, test } from 'bun:test';
import type * as PublicEntrypoint from '../../src/index.ts';

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? true
    : false;

// This assertion is checked by `bun run typecheck`. Keep it in sync with the
// runtime export snapshot below when the declared public API changes.
type PublicEntrypointExports = keyof typeof PublicEntrypoint;
void (true satisfies Equal<PublicEntrypointExports, 'version'>);

test('public entry point imports without side effects', async () => {
  const importedPublicApi = await import('../../src/index.ts');

  expect(importedPublicApi.version).toBe('0.1.0');
});

test('public entry point exports match the 0.1.0 snapshot', async () => {
  const publicApi = await import('../../src/index.ts');

  expect(Object.keys(publicApi).toSorted()).toMatchInlineSnapshot(`
    [
      "version",
    ]
  `);
});
