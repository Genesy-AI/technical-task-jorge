import type { PhoneProviderId } from './catalog'

// Normalized lead data every provider adapter can pick from
export interface PhoneLookupInput {
  firstName: string
  lastName: string
  email: string
  jobTitle: string | null
}

export type PhoneLookupResult =
  | { outcome: 'found'; phone: string }
  | { outcome: 'not_found' }
  // The lead lacks the inputs this provider needs, so it was never called
  | { outcome: 'skipped'; reason: string }

export interface ProviderRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

export interface PhoneProviderAdapter {
  id: PhoneProviderId
  name: string
  httpTimeoutMs: number
  // Returns a skip reason instead of a request when the lead lacks required inputs
  buildRequest(input: PhoneLookupInput): ProviderRequest | { skip: string }
  // Returns the phone in a display-ready format, or null when the provider has no data
  parseResponse(body: unknown): string | null
}
