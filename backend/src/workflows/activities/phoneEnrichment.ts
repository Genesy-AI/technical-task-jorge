import { Context } from '@temporalio/activity'
import { prisma } from '../../db'
import { PHONE_PROVIDER_ADAPTERS } from '../../phoneProviders/adapters'
import type { PhoneProviderId } from '../../phoneProviders/catalog'
import { lookupPhoneWithAdapter } from '../../phoneProviders/lookupPhone'
import type { PhoneLookupInput, PhoneLookupResult } from '../../phoneProviders/types'

export type PhoneEnrichmentStatus = 'pending' | 'found' | 'not_found' | 'failed'

export async function loadPhoneLookupInput(leadId: number): Promise<PhoneLookupInput | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return null
  return { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, jobTitle: lead.jobTitle }
}

export async function lookupPhone(
  providerId: PhoneProviderId,
  input: PhoneLookupInput
): Promise<PhoneLookupResult> {
  return lookupPhoneWithAdapter(
    PHONE_PROVIDER_ADAPTERS[providerId],
    input,
    Context.current().cancellationSignal
  )
}

// Progress marker so the UI can show which provider is being queried right now
export async function savePhoneEnrichmentProgress(
  leadId: number,
  providerId: PhoneProviderId
): Promise<void> {
  // updateMany so a lead deleted mid-enrichment is a no-op instead of an error
  await prisma.lead.updateMany({
    where: { id: leadId },
    data: { phoneEnrichmentStatus: 'pending', phoneEnrichmentProvider: providerId },
  })
}

export async function savePhoneEnrichmentResult(
  leadId: number,
  result: { status: 'found'; phone: string; providerId: PhoneProviderId } | { status: 'not_found' | 'failed' }
): Promise<void> {
  await prisma.lead.updateMany({
    where: { id: leadId },
    data:
      result.status === 'found'
        ? {
            phoneEnrichmentStatus: 'found',
            phoneEnrichmentProvider: result.providerId,
            phoneNumber: result.phone,
          }
        : // An existing phone (e.g. from CSV import) is kept when no provider has a better one
          { phoneEnrichmentStatus: result.status, phoneEnrichmentProvider: null },
  })
}
