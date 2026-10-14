// Single source of truth for the fields usable in message templates.
// The frontend fetches this list (GET /templates/fields), so adding a field here
// makes it available in the composer without touching the UI.
export interface TemplateField {
  key: string
  label: string
  group: 'Person' | 'Contact' | 'Company'
  example: string
}

export const TEMPLATE_FIELDS = [
  { key: 'firstName', label: 'First name', group: 'Person', example: 'Jane' },
  { key: 'lastName', label: 'Last name', group: 'Person', example: 'Doe' },
  { key: 'jobTitle', label: 'Job title', group: 'Person', example: 'Head of Sales' },
  { key: 'countryCode', label: 'Country', group: 'Person', example: 'ES' },
  { key: 'email', label: 'Email', group: 'Contact', example: 'jane@acme.com' },
  { key: 'phoneNumber', label: 'Phone number', group: 'Contact', example: '+34 600 000 000' },
  { key: 'linkedinUrl', label: 'LinkedIn profile', group: 'Contact', example: 'https://linkedin.com/in/janedoe' },
  { key: 'companyName', label: 'Company', group: 'Company', example: 'Acme Inc.' },
  { key: 'yearsAtCompany', label: 'Years at company', group: 'Company', example: '3' },
] as const satisfies readonly TemplateField[]

export type TemplateFieldKey = (typeof TEMPLATE_FIELDS)[number]['key']
