import { prisma } from '../../db'

export type EmailVerificationStatus = 'pending' | 'verified' | 'invalid' | 'failed'

export async function saveEmailVerificationResult(leadId: number, status: EmailVerificationStatus): Promise<void> {
  // updateMany so a lead deleted mid-verification is a no-op instead of an error
  await prisma.lead.updateMany({
    where: { id: leadId },
    data: {
      emailVerificationStatus: status,
      emailVerified: status === 'verified' ? true : status === 'invalid' ? false : null,
    },
  })
}
