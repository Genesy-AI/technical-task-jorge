import Papa from 'papaparse'

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phoneNumber?: string
  yearsAtCompany?: number
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  rowIndex: number
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Digits with common separators, optional leading +, optional extension (x123 / ext. 123)
const PHONE_REGEX = /^\+?[\d\s().-]+(\s*(x|ext\.?)\s*\d+)?$/i
const MIN_PHONE_DIGITS = 7
const MAX_YEARS_AT_COMPANY = 80

export const isValidPhoneNumber = (phone: string): boolean => {
  if (!PHONE_REGEX.test(phone)) return false
  const mainPart = phone.split(/x|ext/i)[0]
  return mainPart.replace(/\D/g, '').length >= MIN_PHONE_DIGITS
}

/** Returns a canonical https URL for a LinkedIn profile, or null if it isn't one. */
export const normalizeLinkedinUrl = (value: string): string | null => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    const isLinkedinHost = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')
    if (!isLinkedinHost || !/^\/in\/[^/]+/.test(url.pathname)) return null
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const lead: Partial<CsvLead> = { rowIndex: index + 2 }
    const errors: string[] = []

    Object.entries(row).forEach(([header, value]) => {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '')
      const trimmedValue = value?.trim() || ''

      switch (normalizedHeader) {
        case 'firstname':
          lead.firstName = trimmedValue
          break
        case 'lastname':
          lead.lastName = trimmedValue
          break
        case 'email':
          lead.email = trimmedValue
          break
        case 'jobtitle':
          lead.jobTitle = trimmedValue || undefined
          break
        case 'countrycode':
          lead.countryCode = trimmedValue || undefined
          break
        case 'companyname':
          lead.companyName = trimmedValue || undefined
          break
        case 'phonenumber':
        case 'phone':
          if (!trimmedValue) break
          if (isValidPhoneNumber(trimmedValue)) lead.phoneNumber = trimmedValue
          else errors.push('Invalid phone number')
          break
        case 'yearsatcompany':
        case 'yearsatcurrentcompany':
        case 'yearsinrole':
          if (!trimmedValue) break
          if (/^\d+$/.test(trimmedValue) && Number(trimmedValue) <= MAX_YEARS_AT_COMPANY) {
            lead.yearsAtCompany = Number(trimmedValue)
          } else {
            errors.push(`Years at company must be a whole number between 0 and ${MAX_YEARS_AT_COMPANY}`)
          }
          break
        case 'linkedinurl':
        case 'linkedin':
        case 'linkedinprofile':
        case 'linkedinprofileurl': {
          if (!trimmedValue) break
          const linkedinUrl = normalizeLinkedinUrl(trimmedValue)
          if (linkedinUrl) lead.linkedinUrl = linkedinUrl
          else errors.push('Invalid LinkedIn profile URL')
          break
        }
      }
    })

    if (!lead.firstName?.trim()) {
      errors.push('First name is required')
    }
    if (!lead.lastName?.trim()) {
      errors.push('Last name is required')
    }
    if (!lead.email?.trim()) {
      errors.push('Email is required')
    } else if (!isValidEmail(lead.email)) {
      errors.push('Invalid email format')
    }

    data.push({
      ...lead,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      isValid: errors.length === 0,
      errors,
    } as CsvLead)
  })

  return data
}
