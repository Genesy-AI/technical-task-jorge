import { TEMPLATE_FIELDS, TemplateFieldKey } from './templateFields'

export type Lead = { firstName: string } & Partial<Record<Exclude<TemplateFieldKey, 'firstName'>, string | number | null>>

const templateFieldKeys = new Set<string>(TEMPLATE_FIELDS.map((field) => field.key))

export function generateMessageFromTemplate(template: string, lead: Lead): string {
  let message = template

  const templateVariables = template.match(/\{(\w+)\}/g) || []

  for (const variable of templateVariables) {
    const fieldName = variable.slice(1, -1)

    if (templateFieldKeys.has(fieldName)) {
      const fieldValue = lead[fieldName as TemplateFieldKey]

      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        throw new Error(`Missing required field: ${fieldName}`)
      }

      message = message.replace(new RegExp(`\\{${fieldName}\\}`, 'g'), String(fieldValue))
    } else {
      throw new Error(`Unknown field in template: ${fieldName}`)
    }
  }

  return message
}
