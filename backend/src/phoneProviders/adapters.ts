import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js'
import type { PhoneProviderId } from './catalog'
import type { PhoneProviderAdapter } from './types'

// Read lazily so values from .env are picked up regardless of import order
const baseUrl = () => process.env.PHONE_PROVIDERS_BASE_URL ?? 'https://api.enginy.ai/api/tmp'

// Missing keys fail the call with a non-retryable error instead of crashing the worker at boot
const env = (name: string): string => process.env[name] ?? ''

// Personal mailbox domains say nothing about the lead's company
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'yandex.com',
  'mail.com',
])

export function companyWebsiteFromEmail(email: string): string | null {
  const domain = email.split('@')[1]?.trim().toLowerCase()
  if (!domain || !domain.includes('.') || FREE_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

const asPhoneString = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

const isObject = (body: unknown): body is Record<string, unknown> => typeof body === 'object' && body !== null

export const orionConnect: PhoneProviderAdapter = {
  id: 'orionConnect',
  name: 'Orion Connect',
  httpTimeoutMs: 8_000,
  buildRequest(input) {
    // Orion needs the company website, which we only have through a corporate email domain
    const companyWebsite = companyWebsiteFromEmail(input.email)
    if (!companyWebsite) return { skip: 'no company website (personal email domain)' }
    return {
      url: `${baseUrl()}/orionConnect`,
      headers: { 'x-auth-me': env('ORION_CONNECT_API_KEY') },
      body: { fullName: `${input.firstName} ${input.lastName}`.trim(), companyWebsite },
    }
  },
  parseResponse(body) {
    return isObject(body) ? asPhoneString(body.phone) : null
  },
}

export const astraDialer: PhoneProviderAdapter = {
  id: 'astraDialer',
  name: 'Astra Dialer',
  httpTimeoutMs: 3_000,
  buildRequest(input) {
    return {
      url: `${baseUrl()}/astraDialer`,
      headers: { apiKey: env('ASTRA_DIALER_API_KEY') },
      body: { email: input.email },
    }
  },
  parseResponse(body) {
    return isObject(body) ? asPhoneString(body.phoneNmbr) : null
  },
}

export const nimbusLookup: PhoneProviderAdapter = {
  id: 'nimbusLookup',
  name: 'Nimbus Lookup',
  httpTimeoutMs: 6_000,
  buildRequest(input) {
    if (!input.jobTitle) return { skip: 'no job title' }
    const url = new URL(`${baseUrl()}/numbusLookup`) // sic: the provider's path is misspelled
    url.searchParams.set('api', env('NIMBUS_LOOKUP_API_KEY'))
    return { url: url.toString(), headers: {}, body: { email: input.email, jobTitle: input.jobTitle } }
  },
  parseResponse(body) {
    if (!isObject(body)) return null
    // Docs say `number`, the live API answers `phoneNmbr`: accept both
    const number = asPhoneString(body.number ?? body.phoneNmbr)
    if (!number) return null
    const country = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
    if (isSupportedCountry(country)) return `+${getCountryCallingCode(country)} ${number}`
    return country ? `${number} (${country})` : number
  },
}

export const PHONE_PROVIDER_ADAPTERS: Record<PhoneProviderId, PhoneProviderAdapter> = {
  orionConnect,
  astraDialer,
  nimbusLookup,
}
