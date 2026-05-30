import * as Automation from "#automation/automation.ts"
import * as Executor from "#automation/executor.ts"
import { Scheduler } from "#scheduler/index.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "automation.scheduler" })
const SCHEDULER_ID = "automation.scheduler"
const POLL_INTERVAL_MS = 30_000
const LEASE_MS = 10 * 60_000
const OWNER = `${SCHEDULER_ID}:${crypto.randomUUID()}`

let started = false

function startClaimedRuns(input: {
  automation: Automation.AutomationDefinition
  runs: Automation.AutomationRun[]
}) {
  const { runs } = input
  for (const run of runs) {
    Executor.startRun(run.id)
  }
  return runs
}

export async function runDueAutomations(now = Date.now()) {
  const claimed = Automation.claimDueAutomationRuns({
    now,
    owner: OWNER,
    leaseMs: LEASE_MS,
  })

  for (const claim of claimed) {
    try {
      const runs = startClaimedRuns(claim)
      log.info("queued-due-automation", {
        automationID: claim.automation.id,
        runCount: runs.length,
        nextRunAt: claim.automation.nextRunAt,
      })
    } catch (error) {
      log.error("queue-due-automation-failed", {
        automationID: claim.automation.id,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      Automation.releaseAutomationLease(claim.automation.id, OWNER)
    }
  }

  return claimed.length
}

export function startAutomationScheduler() {
  if (started) return
  started = true
  Automation.recoverInterruptedRuns()
  Scheduler.register({
    id: SCHEDULER_ID,
    interval: POLL_INTERVAL_MS,
    scope: "global",
    run: async () => {
      await runDueAutomations()
    },
  })
}
