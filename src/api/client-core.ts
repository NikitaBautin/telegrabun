import type { ApiMethodName, ApiMethodParams, ApiMethodResult } from '../generated/public.ts';
import type { TelegramTransport } from '../transport/telegram-transport.ts';

/**
 * Internal contract for the handwritten layer shared by the generated typed API façade.
 *
 * The core is intentionally limited to the public generated API shape: callers provide
 * camelCase parameters, while its transport receives an already serialized snake_case
 * payload. A successful call resolves to the corresponding camelCase result. HTTP,
 * authentication, request cancellation, retries, hooks, Telegram response envelopes, and
 * multipart handling belong to transport implementations, not to this layer.
 *
 * The runtime implementation is introduced in R020-10.2.3 through R020-10.2.7.
 */
export declare class ApiClientCore {
  constructor(transport: TelegramTransport);

  call<Method extends ApiMethodName>(
    method: Method,
    params: ApiMethodParams<Method>,
  ): Promise<ApiMethodResult<Method>>;
}
