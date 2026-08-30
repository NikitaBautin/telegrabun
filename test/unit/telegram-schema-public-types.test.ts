import { expect, test } from 'bun:test';
import type {
  ApiMethodMap,
  ApiMethodName,
  ApiMethodParams,
  ApiMethodResult,
  ChatMember,
  ChatMemberOwner,
  GetMeResult,
  InputFile,
  Message,
  SendMessageParams,
} from '../../src/generated/public.ts';

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2
    ? true
    : false;

type ExpectedMethods = keyof ApiMethodMap;
void (true satisfies Equal<ApiMethodName, ExpectedMethods>);
void (true satisfies Equal<ApiMethodParams<'getMe'>, {}>);
void (true satisfies Equal<ApiMethodParams<'sendMessage'>, SendMessageParams>);
void (true satisfies Equal<ApiMethodResult<'getMe'>, GetMeResult>);
void (true satisfies Equal<ApiMethodResult<'sendMessage'>, Message>);

const validSendMessage: ApiMethodParams<'sendMessage'> = {
  chatId: 42,
  text: 'Hello',
};
void validSendMessage;

const validSendDocument: ApiMethodParams<'sendDocument'> = {
  chatId: '@telegrabun',
  document: {} as InputFile,
};
void validSendDocument;

// @ts-expect-error Public API parameters use camelCase, not Telegram wire names.
const invalidSnakeCaseArgs: ApiMethodParams<'sendMessage'> = { chat_id: 42, text: 'Hello' };
void invalidSnakeCaseArgs;

// @ts-expect-error Required public parameters cannot be omitted.
const missingRequiredArgs: ApiMethodParams<'sendMessage'> = { chatId: 42 };
void missingRequiredArgs;

function assertChatMemberDiscriminator(member: ChatMember): void {
  if (member.status !== 'creator') {
    return;
  }
  void (member satisfies ChatMemberOwner);
}

test('generated public type declarations load in the test suite', () => {
  expect(true).toBe(true);
  void assertChatMemberDiscriminator;
});
