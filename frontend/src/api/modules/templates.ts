import { TemplatesFieldsInput, TemplatesFieldsOutput } from '../types/templates/fields'
import { ApiModule, endpoint } from '../utils'

export const templatesApi = {
  fields: endpoint<TemplatesFieldsOutput, TemplatesFieldsInput>('get', '/templates/fields'),
} as const satisfies ApiModule
