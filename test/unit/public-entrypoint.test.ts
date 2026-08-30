import { expect, test } from 'bun:test';
import { Api } from '../../src/index.ts';
import type * as PublicEntrypoint from '../../src/index.ts';
import type {
  ApiMethodName,
  ApiMethodParams,
  ApiMethodResult,
  TelegramTransport,
} from '../../src/index.ts';

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? true
    : false;

// This assertion is checked by `bun run typecheck`. Keep it in sync with the
// runtime export snapshot below when the declared public API changes.
type PublicEntrypointExports = keyof typeof PublicEntrypoint;
void (true satisfies Equal<PublicEntrypointExports, 'Api' | 'version'>);

const transport: TelegramTransport = {
  async call() {
    return {};
  },
};
const api = new Api(transport);
const method = 'getMe' satisfies ApiMethodName;
const params = {} satisfies ApiMethodParams<typeof method>;
const user: ApiMethodResult<typeof method> = { firstName: 'Ada', id: 42, isBot: true };

void transport;
void api;
void params;
void user;

test('public entry point imports without side effects', async () => {
  const importedPublicApi = await import('../../src/index.ts');

  expect(importedPublicApi.Api).toBe(Api);
  expect(importedPublicApi.version).toBe('0.1.0');
});

test('public entry point exports match the 0.1.0 snapshot', async () => {
  const publicApi = await import('../../src/index.ts');

  expect(Object.keys(publicApi).toSorted()).toMatchInlineSnapshot(`
    [
      "Api",
      "version",
    ]
  `);
});
