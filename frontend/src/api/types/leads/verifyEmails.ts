export type LeadsVerifyEmailsInput = {
  leadIds: number[]
}

export type LeadsVerifyEmailsOutput = {
  success: boolean
  startedLeadIds: number[]
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
