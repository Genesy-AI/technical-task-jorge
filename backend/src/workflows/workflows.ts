import { ActivityFailure, proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
})

const { saveEmailVerificationResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 5 },
})

export async function verifyEmailWorkflow(leadId: number, email: string): Promise<activities.EmailVerificationStatus> {
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
