import { expect, test } from 'bun:test';

import type { ApiClientCore } from '../../src/api/client-core.ts';
import type {
  ApiMethodName,
  ApiMethodParams,
  ApiMethodResult,
  Message,
  User,
} from '../../src/generated/public.ts';
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
