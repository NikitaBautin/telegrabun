/**
 * Boundary between the typed API client and a Telegram Bot API transport.
 *
 * Implementations receive a method name and parameters already converted to
 * Telegram's snake_case wire shape. They resolve with the decoded `result`
 * value from a successful Telegram response, and may reject with their own
 * transport-specific error.
 *
 * This interface deliberately contains no HTTP, token, timeout, or retry
 * concerns so the API client can be exercised with an in-memory transport.
 */
export interface TelegramTransport {
  call(method: string, params: Readonly<Record<string, unknown>>): Promise<unknown>;
}
