import { describe, it, expect } from 'vitest'
import { parseCsv, isValidEmail, isValidPhoneNumber, normalizeLinkedinUrl } from './csvParser'

describe('isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('first.last+tag@example.org')).toBe(true)
    expect(isValidEmail('123@456.com')).toBe(true)
  })

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test.example.com')).toBe(false)
    expect(isValidEmail('test@.com')).toBe(false)
    expect(isValidEmail('test@example')).toBe(false)
  })
})

describe('parseCsv', () => {
  it('should throw error for empty content', () => {
    expect(() => parseCsv('')).toThrow('CSV content cannot be empty')
    expect(() => parseCsv('   ')).toThrow('CSV content cannot be empty')
  })

  it('should throw error for CSV with only headers', () => {
    const csv = 'firstName,lastName,email'
    expect(() => parseCsv(csv)).toThrow('CSV file appears to be empty or contains no valid data')
  })

  it('should throw error for malformed CSV content', () => {
    const malformedCsv = `firstName,lastName,email
"John,Doe,john@example.com,extra"field`
    expect(() => parseCsv(malformedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with mismatched field count', () => {
    const mismatchedCsv = `firstName,lastName,email
John,Doe,john@example.com,ExtraField,AnotherExtra
Jane,Smith`
    expect(() => parseCsv(mismatchedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with critical delimiter issues', () => {
    const noDelimiterCsv = `firstName lastName email
John Doe john@example.com`
    expect(() => parseCsv(noDelimiterCsv)).toThrow()
  })

  it('should parse valid CSV with all required fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode,companyName
John,Doe,john.doe@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      jobTitle: 'Developer',
      countryCode: 'US',
      companyName: 'Tech Corp',
      isValid: true,
      errors: [],
      rowIndex: 2,
    })
  })

  it('should handle missing required fields and mark as invalid', () => {
    const csv = `firstName,lastName,email
,Smith,john@example.com
John,,john@example.com
John,Smith,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('First name is required')

    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('Last name is required')

    expect(result[2].isValid).toBe(false)
    expect(result[2].errors).toContain('Email is required')
  })

  it('should validate email format', () => {
    const csv = `firstName,lastName,email
John,Doe,invalid-email
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid email format')
    expect(result[1].isValid).toBe(true)
  })

  it('should handle CSV with quoted values', () => {
    const csv = `firstName,lastName,email,jobTitle
"John","Doe","john.doe@example.com","Software Engineer"`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john.doe@example.com')
    expect(result[0].jobTitle).toBe('Software Engineer')
  })

  it('should skip empty rows', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,,
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('John')
    expect(result[1].firstName).toBe('Jane')
  })

  it('should handle case-insensitive headers', () => {
    const csv = `FIRSTNAME,LASTNAME,EMAIL,JOBTITLE,COUNTRYCODE,COMPANYNAME
John,Doe,john@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].jobTitle).toBe('Developer')
  })

  it('should handle missing optional fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode
John,Doe,john@example.com,,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].jobTitle).toBeUndefined()
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should preserve row index correctly', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
Jane,Smith,jane@example.com
Bob,Johnson,bob@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].rowIndex).toBe(2)
    expect(result[1].rowIndex).toBe(3)
    expect(result[2].rowIndex).toBe(4)
  })

  it('should handle multiple validation errors per lead', () => {
    const csv = `firstName,lastName,email
 , ,invalid-email`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toHaveLength(3)
    expect(result[0].errors).toContain('First name is required')
    expect(result[0].errors).toContain('Last name is required')
    expect(result[0].errors).toContain('Invalid email format')
  })

  it('should handle extra columns not in header mapping', () => {
    const csv = `firstName,lastName,email,unknownColumn
John,Doe,john@example.com,someValue`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })

  it('should handle mixed valid and invalid leads', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,Smith,invalid-email
Jane,Johnson,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].isValid).toBe(true)
    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('First name is required')
    expect(result[1].errors).toContain('Invalid email format')
    expect(result[2].isValid).toBe(true)
  })

  it('should handle whitespace in fields', () => {
    const csv = `firstName,lastName,email
 John , Doe , john@example.com `

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })
})

describe('isValidPhoneNumber', () => {
  it('should accept common formats, including extensions', () => {
    expect(isValidPhoneNumber('+1-280-754-0462x2154')).toBe(true)
    expect(isValidPhoneNumber('(731)123-9702')).toBe(true)
    expect(isValidPhoneNumber('063.430.8860x4762')).toBe(true)
    expect(isValidPhoneNumber('+34 600 111 222')).toBe(true)
    expect(isValidPhoneNumber('7549075690')).toBe(true)
    expect(isValidPhoneNumber('555-1234 ext. 12')).toBe(true)
  })

  it('should reject text and too-short numbers', () => {
    expect(isValidPhoneNumber('call me')).toBe(false)
    expect(isValidPhoneNumber('12345')).toBe(false)
    expect(isValidPhoneNumber('123x4567890')).toBe(false)
  })
})

describe('normalizeLinkedinUrl', () => {
  it('should normalize profile URLs to https', () => {
    expect(normalizeLinkedinUrl('https://www.linkedin.com/in/jane-doe')).toBe('https://www.linkedin.com/in/jane-doe')
    expect(normalizeLinkedinUrl('linkedin.com/in/jane-doe')).toBe('https://linkedin.com/in/jane-doe')
    expect(normalizeLinkedinUrl('http://es.linkedin.com/in/jane')).toBe('https://es.linkedin.com/in/jane')
  })

  it('should reject non-profile and non-LinkedIn URLs', () => {
    expect(normalizeLinkedinUrl('https://www.linkedin.com/company/acme')).toBeNull()
    expect(normalizeLinkedinUrl('https://linkedin.com.evil.com/in/jane')).toBeNull()
    expect(normalizeLinkedinUrl('https://twitter.com/in/jane')).toBeNull()
    expect(normalizeLinkedinUrl('not a url')).toBeNull()
  })
})

describe('parseCsv new lead fields', () => {
  it('should parse phone, years (yearsInRole alias) and LinkedIn', () => {
    const csv = `firstName,lastName,email,yearsInRole,phoneNumber,linkedinUrl
Jane,Doe,jane@example.com,5,+1-280-754-0462x2154,linkedin.com/in/janedoe`

    const [lead] = parseCsv(csv)

    expect(lead.isValid).toBe(true)
    expect(lead.yearsAtCompany).toBe(5)
    expect(lead.phoneNumber).toBe('+1-280-754-0462x2154')
    expect(lead.linkedinUrl).toBe('https://linkedin.com/in/janedoe')
  })

  it('should accept the yearsAtCompany header and 0 years', () => {
    const [lead] = parseCsv(`firstName,lastName,email,Years At Company
Jane,Doe,jane@example.com,0`)
    expect(lead.yearsAtCompany).toBe(0)
  })

  it('should leave empty optional fields undefined', () => {
    const [lead] = parseCsv(`firstName,lastName,email,yearsInRole,phoneNumber,linkedinUrl
Jane,Doe,jane@example.com,,,`)
    expect(lead.isValid).toBe(true)
    expect(lead.yearsAtCompany).toBeUndefined()
    expect(lead.phoneNumber).toBeUndefined()
    expect(lead.linkedinUrl).toBeUndefined()
  })

  it('should flag invalid values in the new fields', () => {
    const [lead] = parseCsv(`firstName,lastName,email,yearsInRole,phoneNumber,linkedinUrl
Jane,Doe,jane@example.com,two,call me,https://twitter.com/jane`)
    expect(lead.isValid).toBe(false)
    expect(lead.errors).toEqual([
      'Years at company must be a whole number between 0 and 80',
      'Invalid phone number',
      'Invalid LinkedIn profile URL',
    ])
  })
})
