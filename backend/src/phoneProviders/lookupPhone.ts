import { ApplicationFailure } from '@temporalio/common'
import { NON_RETRYABLE_PROVIDER_ERROR } from './catalog'
import type { PhoneLookupInput, PhoneLookupResult, PhoneProviderAdapter } from './types'

// Retryable failures are thrown as plain Errors (Temporal retries them with backoff);
// 4xx other than 429 means our request is wrong, so retrying would only waste quota.
export async function lookupPhoneWithAdapter(
  adapter: PhoneProviderAdapter,
  input: PhoneLookupInput,
  cancellationSignal?: AbortSignal
): Promise<PhoneLookupResult> {
  const request = adapter.buildRequest(input)
  if ('skip' in request) return { outcome: 'skipped', reason: request.skip }

  const timeout = AbortSignal.timeout(adapter.httpTimeoutMs)
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...request.headers },
    body: JSON.stringify(request.body),
    signal: cancellationSignal ? AbortSignal.any([timeout, cancellationSignal]) : timeout,
  })

  if (!response.ok) {
    const message = `${adapter.name} responded ${response.status}`
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw ApplicationFailure.nonRetryable(message, NON_RETRYABLE_PROVIDER_ERROR)
    }
    throw new Error(message)
  }

  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`${adapter.name} returned a non-JSON body`)
  }

  const phone = adapter.parseResponse(body)
  return phone ? { outcome: 'found', phone } : { outcome: 'not_found' }
}
