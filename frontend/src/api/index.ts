import { leadsApi } from './modules/leads'
import { templatesApi } from './modules/templates'
import { ApiModule } from './utils'

export const api = {
  leads: leadsApi,
  templates: templatesApi,
} as const satisfies ApiModule

export { useApiMutation } from './mutations/useApiMutation'
export type { ApiInput, ApiOutput } from './utils'
