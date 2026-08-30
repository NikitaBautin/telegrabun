/**
 * Public entry point for telegrabun.
 *
 * The library intentionally has no runtime side effects when imported.
 */
export { Api } from './generated/client.ts';
export type * from './generated/public.ts';
export type { TelegramTransport } from './transport/telegram-transport.ts';

export const version = '0.1.0' as const;
