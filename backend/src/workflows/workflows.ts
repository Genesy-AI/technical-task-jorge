import { ActivityFailure, log, proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import { NON_RETRYABLE_PROVIDER_ERROR, PHONE_PROVIDER_SCHEDULE } from '../phoneProviders/catalog'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
})

const {
  saveEmailVerificationResult,
  loadPhoneLookupInput,
  savePhoneEnrichmentProgress,
  savePhoneEnrichmentResult,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 5 },
})

export async function verifyEmailWorkflow(
  leadId: number,
  email: string
): Promise<activities.EmailVerificationStatus> {
  let status: activities.EmailVerificationStatus
  try {
    status = (await verifyEmail(email)) ? 'verified' : 'invalid'
  } catch (err) {
    // Retries exhausted: record the failure so the lead doesn't stay pending forever
    if (!(err instanceof ActivityFailure)) throw err
    status = 'failed'
  }

  await saveEmailVerificationResult(leadId, status)
  return status
}

// One proxy per provider: each runs on its own task queue (rate-limited by its worker) with its own timeout
const providerLookups = PHONE_PROVIDER_SCHEDULE.map((provider) => ({
  id: provider.id,
  lookupPhone: proxyActivities<typeof activities>({
    taskQueue: provider.taskQueue,
    startToCloseTimeout: provider.startToCloseTimeout,
    retry: {
      initialInterval: '1 second',
      backoffCoefficient: 2,
      maximumAttempts: provider.maximumAttempts,
      nonRetryableErrorTypes: [NON_RETRYABLE_PROVIDER_ERROR],
    },
  }).lookupPhone,
}))

// Waterfall: query providers in order and stop at the first phone found.
// A provider that keeps failing is skipped rather than failing the whole enrichment.
export async function enrichPhoneWorkflow(leadId: number): Promise<activities.PhoneEnrichmentStatus> {
  const input = await loadPhoneLookupInput(leadId)
  if (!input) return 'failed' // lead deleted before the workflow started

  // Only claim "no data found" if at least one provider actually answered
  let anyProviderAnswered = false

  for (const provider of providerLookups) {
    await savePhoneEnrichmentProgress(leadId, provider.id)
    try {
      const result = await provider.lookupPhone(provider.id, input)
      if (result.outcome === 'skipped') {
        log.info('Phone provider skipped', { leadId, provider: provider.id, reason: result.reason })
        continue
      }
      anyProviderAnswered = true
      if (result.outcome === 'found') {
        await savePhoneEnrichmentResult(leadId, {
          status: 'found',
          phone: result.phone,
          providerId: provider.id,
        })
        return 'found'
      }
    } catch (err) {
      if (!(err instanceof ActivityFailure)) throw err
      log.warn('Phone provider failed, trying next one', {
        leadId,
        provider: provider.id,
        error: err.cause?.message,
      })
    }
  }

  const status = anyProviderAnswered ? 'not_found' : 'failed'
  await savePhoneEnrichmentResult(leadId, { status })
  return status
}
