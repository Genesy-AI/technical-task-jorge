// Pure data (no Node imports): this module is bundled into the Temporal workflow sandbox.
import type { Duration } from '@temporalio/common'

export type PhoneProviderId = 'orionConnect' | 'astraDialer' | 'nimbusLookup'

export interface PhoneProviderSchedule {
  id: PhoneProviderId
  // Each provider gets its own task queue so its RPS can be capped independently (see worker.ts)
  taskQueue: string
  // Temporal activity timeout per attempt; the HTTP call itself aborts a bit earlier
  startToCloseTimeout: Duration
  maximumAttempts: number
}

// Waterfall order: best data first (slow, flaky), then fast/cheap, then the newcomer
export const PHONE_PROVIDER_SCHEDULE: readonly PhoneProviderSchedule[] = [
  {
    id: 'orionConnect',
    taskQueue: 'phone-provider-orion-connect',
    startToCloseTimeout: '10 seconds',
    maximumAttempts: 3,
  },
  {
    id: 'astraDialer',
    taskQueue: 'phone-provider-astra-dialer',
    startToCloseTimeout: '5 seconds',
    maximumAttempts: 3,
  },
  {
    id: 'nimbusLookup',
    taskQueue: 'phone-provider-nimbus-lookup',
    startToCloseTimeout: '8 seconds',
    maximumAttempts: 3,
  },
]

// Error type for failures that retrying cannot fix (bad input, bad credentials)
export const NON_RETRYABLE_PROVIDER_ERROR = 'ProviderRequestRejected'
