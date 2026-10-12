export type LeadsEnrichPhonesInput = {
  leadIds: number[]
  // Also re-enrich leads that already have a phone number
  overwrite?: boolean
}

export type LeadsEnrichPhonesOutput = {
  success: boolean
  startedLeadIds: number[]
  // Leads that already had a phone and were left untouched
  skippedLeadIds: number[]
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
