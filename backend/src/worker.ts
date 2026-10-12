import { NativeConnection, Worker } from '@temporalio/worker'
import * as activities from './workflows/activities'
import { PHONE_PROVIDER_SCHEDULE, PhoneProviderId } from './phoneProviders/catalog'

// e.g. ORION_CONNECT_MAX_RPS=5. Unset = unlimited (providers have no rate limits yet)
const PROVIDER_RPS_ENV: Record<PhoneProviderId, string> = {
  orionConnect: 'ORION_CONNECT_MAX_RPS',
  astraDialer: 'ASTRA_DIALER_MAX_RPS',
  nimbusLookup: 'NIMBUS_LOOKUP_MAX_RPS',
}

function maxRps(providerId: PhoneProviderId): number | undefined {
  const value = Number(process.env[PROVIDER_RPS_ENV[providerId]])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export async function runTemporalWorker() {
  const connection = await NativeConnection.connect({
    address: 'localhost:7233',
  })
  try {
    const mainWorker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'myQueue',
      workflowsPath: require.resolve('./workflows'),
      activities,
    })

    // maxTaskQueueActivitiesPerSecond is enforced by the Temporal server across all workers polling the
    // queue, so the limit holds even when the backend is scaled horizontally
    const providerWorkers = await Promise.all(
      PHONE_PROVIDER_SCHEDULE.map((provider) =>
        Worker.create({
          connection,
          namespace: 'default',
          taskQueue: provider.taskQueue,
          activities: { lookupPhone: activities.lookupPhone },
          maxTaskQueueActivitiesPerSecond: maxRps(provider.id),
        })
      )
    )

    await Promise.all([mainWorker, ...providerWorkers].map((worker) => worker.run()))
  } finally {
    await connection.close()
  }
}
