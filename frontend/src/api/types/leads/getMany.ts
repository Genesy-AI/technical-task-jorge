export type LeadsGetManyInput = undefined

export type EmailVerificationStatus = 'pending' | 'verified' | 'invalid' | 'failed'

export type PhoneEnrichmentStatus = 'pending' | 'found' | 'not_found' | 'failed'

export type PhoneProviderId = 'orionConnect' | 'astraDialer' | 'nimbusLookup'

export type LeadsGetManyOutput = {
  id: number
  createdAt: string
  updatedAt: string
  firstName: string
  lastName: string | null
  email: string | null
  jobTitle: string | null
  countryCode: string | null
  companyName: string | null
  message: string | null
  phoneNumber: string | null
  yearsAtCompany: number | null
  linkedinUrl: string | null
  emailVerified: boolean | null
  emailVerificationStatus: EmailVerificationStatus | null
  phoneEnrichmentStatus: PhoneEnrichmentStatus | null
  // Provider being queried while pending, or the one that found the phone
  phoneEnrichmentProvider: PhoneProviderId | null
}[]
