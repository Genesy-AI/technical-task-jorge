import './env'
import express, { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client'
import { lead as Lead } from '@prisma/client'
import { prisma } from './db'
import { enrichPhoneWorkflow, verifyEmailWorkflow } from './workflows'
import { generateMessageFromTemplate } from './utils/messageGenerator'
import { TEMPLATE_FIELDS } from './utils/templateFields'
import { runTemporalWorker } from './worker'

let temporalClient: Promise<Client> | undefined
function getTemporalClient(): Promise<Client> {
  temporalClient ??= Connection.connect({ address: 'localhost:7233' })
    .then((connection) => new Client({ connection, namespace: 'default' }))
    .catch((err) => {
      temporalClient = undefined // allow a later request to retry the connection
      throw err
    })
  return temporalClient
}

type LeadWorkflowErrors = Array<{ leadId: number; leadName: string; error: string }>

// Fire-and-forget start of one workflow per lead; per-lead start failures are collected instead of thrown
async function startLeadWorkflows(
  leads: Lead[],
  start: (client: Client, lead: Lead) => Promise<unknown>
): Promise<{ startedLeadIds: number[]; errors: LeadWorkflowErrors }> {
  const client = await getTemporalClient()
  const outcomes = await Promise.allSettled(leads.map((lead) => start(client, lead)))

  const startedLeadIds: number[] = []
  const errors: LeadWorkflowErrors = []
  outcomes.forEach((outcome, i) => {
    const lead = leads[i]
    if (outcome.status === 'fulfilled') {
      startedLeadIds.push(lead.id)
    } else {
      errors.push({
        leadId: lead.id,
        leadName: `${lead.firstName} ${lead.lastName}`.trim(),
        error: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error',
      })
    }
  })
  return { startedLeadIds, errors }
}

const app = express()
app.use(express.json())

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body
  const lead = await prisma.lead.update({
    where: {
      id: Number(id),
    },
    data: {
      firstName: String(name),
      email: String(email),
    },
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
})

app.get('/templates/fields', (req: Request, res: Response) => {
  res.json(TEMPLATE_FIELDS)
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
})

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const optionalNonNegativeInt = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    const errors: Array<{ lead: any; error: string }> = []

    for (const lead of uniqueLeads) {
      try {
        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode: lead.countryCode ? lead.countryCode.trim() : null,
            companyName: lead.companyName ? lead.companyName.trim() : null,
            phoneNumber: optionalString(lead.phoneNumber),
            yearsAtCompany: optionalNonNegativeInt(lead.yearsAtCompany),
            linkedinUrl: optionalString(lead.linkedinUrl),
          },
        })
        importedCount++
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      errors,
    })
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    // Fail fast if Temporal is unreachable, before marking anything as pending
    await getTemporalClient()

    await prisma.lead.updateMany({
      where: { id: { in: leads.map((lead) => lead.id) } },
      data: { emailVerificationStatus: 'pending' },
    })

    // Fire-and-forget: the workflow persists its own result, the client polls GET /leads
    const { startedLeadIds, errors } = await startLeadWorkflows(leads, (client, lead) =>
      client.workflow.start(verifyEmailWorkflow, {
        taskQueue: 'myQueue',
        // Stable id + USE_EXISTING: re-clicking while a check is running doesn't start a duplicate
        workflowId: `verify-email-${lead.id}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [lead.id, lead.email],
      })
    )

    if (errors.length > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: errors.map((e) => e.leadId) } },
        data: { emailVerificationStatus: 'failed' },
      })
    }

    res.status(202).json({ success: errors.length === 0, startedLeadIds, errors })
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
})

app.post('/leads/enrich-phones', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, overwrite } = req.body as { leadIds?: number[]; overwrite?: boolean }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    // Provider lookups cost money: by default don't re-enrich leads that already have a phone
    const toEnrich = overwrite === true ? leads : leads.filter((lead) => !lead.phoneNumber)
    const skippedLeadIds = leads.filter((lead) => !toEnrich.includes(lead)).map((lead) => lead.id)

    if (toEnrich.length === 0) {
      return res.status(202).json({ success: true, startedLeadIds: [], skippedLeadIds, errors: [] })
    }

    // Fail fast if Temporal is unreachable, before marking anything as pending
    await getTemporalClient()

    await prisma.lead.updateMany({
      where: { id: { in: toEnrich.map((lead) => lead.id) } },
      data: { phoneEnrichmentStatus: 'pending', phoneEnrichmentProvider: null },
    })

    const { startedLeadIds, errors } = await startLeadWorkflows(toEnrich, (client, lead) =>
      client.workflow.start(enrichPhoneWorkflow, {
        taskQueue: 'myQueue',
        // One enrichment per lead: a second click while one is running attaches to it.
        // Once it has finished, the same id can be started again (default reuse policy) to retry.
        workflowId: `enrich-phone-${lead.id}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [lead.id],
      })
    )

    if (errors.length > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: errors.map((e) => e.leadId) } },
        data: { phoneEnrichmentStatus: 'failed', phoneEnrichmentProvider: null },
      })
    }

    res.status(202).json({ success: errors.length === 0, startedLeadIds, skippedLeadIds, errors })
  } catch (error) {
    console.error('Error enriching phones:', error)
    res.status(500).json({ error: 'Failed to enrich phones' })
  }
})

app.listen(4000, () => {
  console.log('Express server is running on port 4000')
})

runTemporalWorker().catch((err) => {
  console.error(err)
  process.exit(1)
})
