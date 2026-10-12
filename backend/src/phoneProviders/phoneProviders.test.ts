import { ApplicationFailure } from '@temporalio/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { astraDialer, companyWebsiteFromEmail, nimbusLookup, orionConnect } from './adapters'
import { NON_RETRYABLE_PROVIDER_ERROR } from './catalog'
import { lookupPhoneWithAdapter } from './lookupPhone'
import type { PhoneLookupInput } from './types'

const lead: PhoneLookupInput = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@analytical.io',
  jobTitle: 'CTO',
}

const mockFetch = (status: number, body: string) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('companyWebsiteFromEmail', () => {
  it('uses corporate email domains', () => {
    expect(companyWebsiteFromEmail('ada@Analytical.io')).toBe('analytical.io')
  })

  it('ignores personal mailboxes and malformed emails', () => {
    expect(companyWebsiteFromEmail('ada@gmail.com')).toBeNull()
    expect(companyWebsiteFromEmail('ada@yahoo.com')).toBeNull()
    expect(companyWebsiteFromEmail('not-an-email')).toBeNull()
  })
})

describe('provider adapters', () => {
  it('builds the Orion Connect request from name and email domain', () => {
    vi.stubEnv('ORION_CONNECT_API_KEY', 'orion-key')
    expect(orionConnect.buildRequest(lead)).toEqual({
      url: 'https://api.enginy.ai/api/tmp/orionConnect',
      headers: { 'x-auth-me': 'orion-key' },
      body: { fullName: 'Ada Lovelace', companyWebsite: 'analytical.io' },
    })
  })

  it('skips Orion Connect for personal email domains', () => {
    expect(orionConnect.buildRequest({ ...lead, email: 'ada@gmail.com' })).toHaveProperty('skip')
  })

  it('passes the Nimbus Lookup key as a query param and skips leads without job title', () => {
    vi.stubEnv('NIMBUS_LOOKUP_API_KEY', 'nimbus-key')
    const request = nimbusLookup.buildRequest(lead)
    expect('url' in request && request.url).toBe('https://api.enginy.ai/api/tmp/numbusLookup?api=nimbus-key')
    expect(nimbusLookup.buildRequest({ ...lead, jobTitle: null })).toHaveProperty('skip')
  })

  it('normalizes each provider response shape', () => {
    expect(orionConnect.parseResponse({ phone: '1699883476' })).toBe('1699883476')
    expect(orionConnect.parseResponse({ phone: null })).toBeNull()

    expect(astraDialer.parseResponse({ phoneNmbr: '4574414875' })).toBe('4574414875')
    expect(astraDialer.parseResponse({ phoneNmbr: null })).toBeNull()
    expect(astraDialer.parseResponse({})).toBeNull()

    expect(nimbusLookup.parseResponse({ number: 3386555599, countryCode: 'ES' })).toBe('+34 3386555599')
    // The live API uses `phoneNmbr` instead of the documented `number`
    expect(nimbusLookup.parseResponse({ phoneNmbr: 3386555599, countryCode: 'us' })).toBe('+1 3386555599')
    expect(nimbusLookup.parseResponse({ number: 123, countryCode: 'XX' })).toBe('123 (XX)')
    expect(nimbusLookup.parseResponse({ number: null, countryCode: 'ES' })).toBeNull()
  })
})

describe('lookupPhoneWithAdapter', () => {
  it('returns the normalized phone when found', async () => {
    const fetchMock = mockFetch(200, JSON.stringify({ phoneNmbr: 3386555599, countryCode: 'ES' }))
    await expect(lookupPhoneWithAdapter(nimbusLookup, lead)).resolves.toEqual({
      outcome: 'found',
      phone: '+34 3386555599',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: lead.email, jobTitle: 'CTO' })
  })

  it('returns not_found for an empty answer', async () => {
    mockFetch(200, '{}')
    await expect(lookupPhoneWithAdapter(astraDialer, lead)).resolves.toEqual({ outcome: 'not_found' })
  })

  it('does not call the provider when inputs are missing', async () => {
    const fetchMock = mockFetch(200, '{}')
    const result = await lookupPhoneWithAdapter(nimbusLookup, { ...lead, jobTitle: null })
    expect(result.outcome).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws a retryable error on 5xx and 429', async () => {
    for (const status of [500, 429]) {
      mockFetch(status, '{"message":"Internal server error"}')
      const error = await lookupPhoneWithAdapter(orionConnect, lead).catch((e) => e)
      expect(error).not.toBeInstanceOf(ApplicationFailure)
      expect(error.message).toBe(`Orion Connect responded ${status}`)
    }
  })

  it('throws a non-retryable failure on other 4xx', async () => {
    mockFetch(401, 'Unauthorized')
    const error = await lookupPhoneWithAdapter(astraDialer, lead).catch((e) => e)
    expect(error).toBeInstanceOf(ApplicationFailure)
    expect(error.nonRetryable).toBe(true)
    expect(error.type).toBe(NON_RETRYABLE_PROVIDER_ERROR)
  })
})
