import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"
import { ReasoningEffort } from "#session/core/message.ts"
import * as AutomationEvents from "#automation/events.ts"
import { AutomationSchedule, computeNextRunAt } from "#automation/schedule.ts"

export { AutomationSchedule, computeNextRunAt }

export const AutomationKind = z.enum(["project", "thread"])
export type AutomationKind = z.output<typeof AutomationKind>

export const AutomationStatus = z.enum(["active", "paused", "deleted"])
export type AutomationStatus = z.output<typeof AutomationStatus>

export const AutomationRunStatus = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled",
  "skipped",
])
export type AutomationRunStatus = z.output<typeof AutomationRunStatus>

export const AutomationRunTrigger = z.enum(["manual", "schedule"])
export type AutomationRunTrigger = z.output<typeof AutomationRunTrigger>

export const AutomationTriageStatus = z.enum(["inbox", "read", "archived", "none"])
export type AutomationTriageStatus = z.output<typeof AutomationTriageStatus>

export const AutomationExecution = z.object({
  environment: z.enum(["local", "worktree"]),
  model: z.string().optional(),
  small_model: z.string().optional(),
  reasoning_effort: ReasoningEffort.optional(),
  permissionMode: z.enum(["read-only", "default", "full_access"]).optional(),
  selectedSkillIDs: z.array(z.string()).optional(),
  selectedPluginIDs: z.array(z.string()).optional(),
  selectedMcpServerIDs: z.array(z.string()).optional(),
})
export type AutomationExecution = z.output<typeof AutomationExecution>

export const AutomationScope = z.object({
  projectIDs: z.array(z.string()).optional(),
  directories: z.array(z.string()).optional(),
  sessionID: z.string().optional(),
})
export type AutomationScope = z.output<typeof AutomationScope>

export const AutomationOutputPolicy = z.object({
  triage: z.enum(["findings-only", "always", "never"]),
  autoArchiveNoFindings: z.boolean(),
})
export type AutomationOutputPolicy = z.output<typeof AutomationOutputPolicy>

export const AutomationDefinition = z.object({
  id: Identifier.schema("automation"),
  name: z.string(),
  kind: AutomationKind,
  status: AutomationStatus,
  schedule: AutomationSchedule,
  scope: AutomationScope,
  execution: AutomationExecution,
  prompt: z.string(),
  promptVersion: z.number(),
  outputPolicy: AutomationOutputPolicy,
  createdAt: z.number(),
  updatedAt: z.number(),
  lastRunAt: z.number().optional(),
  nextRunAt: z.number().optional(),
  leaseOwner: z.string().optional(),
  leaseExpiresAt: z.number().optional(),
  runningRunID: z.string().optional(),
})
export type AutomationDefinition = z.output<typeof AutomationDefinition>

export const AutomationRun = z.object({
  id: Identifier.schema("automationRun"),
  automationID: Identifier.schema("automation"),
  trigger: AutomationRunTrigger,
  status: AutomationRunStatus,
  projectID: z.string().optional(),
  directory: z.string().optional(),
  sessionID: z.string().optional(),
  turnID: z.string().optional(),
  promptSnapshot: z.string().optional(),
  promptVersion: z.number().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  summary: z.string().optional(),
  findingCount: z.number(),
  triageStatus: AutomationTriageStatus,
  error: z.string().optional(),
  worktreeID: Identifier.schema("worktree").optional(),
  worktreePath: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type AutomationRun = z.output<typeof AutomationRun>

const AUTOMATIONS_TABLE = "automations"
const AUTOMATION_RUNS_TABLE = "automation_runs"
let automationTablesGeneration = -1

function ensureAutomationTables() {
  const generation = db.getDatabaseGeneration()
  if (automationTablesGeneration === generation && generation > 0) return

  db.syncTableColumnsWithZodObject(AUTOMATIONS_TABLE, AutomationDefinition)
  db.syncTableColumnsWithZodObject(AUTOMATION_RUNS_TABLE, AutomationRun)

  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_automations_status_next_run"
    ON "automations" ("status", "nextRunAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_automation_runs_automation_started"
    ON "automation_runs" ("automationID", "startedAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_automation_runs_triage"
    ON "automation_runs" ("triageStatus", "completedAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_automation_runs_session"
    ON "automation_runs" ("sessionID");
  `)

  automationTablesGeneration = db.getDatabaseGeneration()
}

export function createAutomationID() {
  return Identifier.descending("automation")
}

export function createAutomationRunID() {
  return Identifier.descending("automationRun")
}

export function insertAutomation(automation: AutomationDefinition) {
  ensureAutomationTables()
  db.insertOneWithSchema(AUTOMATIONS_TABLE, automation, AutomationDefinition)
  return automation
}

export function updateAutomationRecord(automation: AutomationDefinition) {
  ensureAutomationTables()
  db.updateByIdWithSchema(AUTOMATIONS_TABLE, automation.id, automation, AutomationDefinition)
  return automation
}

export function getAutomation(id: string) {
  ensureAutomationTables()
  return db.findById(AUTOMATIONS_TABLE, AutomationDefinition, id)
}

export function listAutomations(options: { includeDeleted?: boolean } = {}) {
  ensureAutomationTables()
  const rows = db.findManyWithSchema(AUTOMATIONS_TABLE, AutomationDefinition, {
    orderBy: [
      { column: "updatedAt", direction: "DESC" },
      { column: "id", direction: "DESC" },
    ],
  })

  return options.includeDeleted ? rows : rows.filter((automation) => automation.status !== "deleted")
}

export function insertRun(run: AutomationRun) {
  ensureAutomationTables()
  db.insertOneWithSchema(AUTOMATION_RUNS_TABLE, run, AutomationRun)
  AutomationEvents.publish("automation.run.created", { run })
  return run
}

function insertRunWithoutPublishing(run: AutomationRun) {
  ensureAutomationTables()
  db.insertOneWithSchema(AUTOMATION_RUNS_TABLE, run, AutomationRun)
  return run
}

export function updateRunRecord(run: AutomationRun) {
  ensureAutomationTables()
  db.updateByIdWithSchema(AUTOMATION_RUNS_TABLE, run.id, run, AutomationRun)
  AutomationEvents.publish("automation.run.updated", { run })
  return run
}

export function getRun(id: string) {
  ensureAutomationTables()
  return db.findById(AUTOMATION_RUNS_TABLE, AutomationRun, id)
}

export function listRuns(options: {
  automationID?: string
  triageStatus?: AutomationTriageStatus
  limit?: number
} = {}) {
  ensureAutomationTables()
  const where: Array<{ column: string; value: string }> = []
  if (options.automationID) where.push({ column: "automationID", value: options.automationID })
  if (options.triageStatus) where.push({ column: "triageStatus", value: options.triageStatus })

  return db.findManyWithSchema(AUTOMATION_RUNS_TABLE, AutomationRun, {
    where,
    orderBy: [
      { column: "createdAt", direction: "DESC" },
      { column: "id", direction: "DESC" },
    ],
    limit: Math.max(1, Math.min(options.limit ?? 100, 500)),
  })
}

export function createRun(input: {
  automation: AutomationDefinition
  trigger: AutomationRunTrigger
  projectID?: string
  directory?: string
  sessionID?: string
}) {
  return insertRun(buildRun({
    automation: input.automation,
    trigger: input.trigger,
    now: Date.now(),
    projectID: input.projectID,
    directory: input.directory,
    sessionID: input.sessionID,
  }))
}

function buildRun(input: {
  automation: AutomationDefinition
  trigger: AutomationRunTrigger
  now: number
  projectID?: string
  directory?: string
  sessionID?: string
}) {
  return AutomationRun.parse({
    id: createAutomationRunID(),
    automationID: input.automation.id,
    trigger: input.trigger,
    status: "queued",
    projectID: input.projectID,
    directory: input.directory,
    sessionID: input.sessionID,
    promptSnapshot: input.automation.prompt,
    promptVersion: input.automation.promptVersion,
    findingCount: 0,
    triageStatus: "none",
    createdAt: input.now,
    updatedAt: input.now,
  })
}

function runTargetsForAutomation(automation: AutomationDefinition) {
  if (automation.kind === "thread") {
    const sessionID = automation.scope.sessionID?.trim()
    return sessionID ? [{ sessionID }] : [{}]
  }

  const projectTargets = (automation.scope.projectIDs ?? [])
    .map((projectID) => projectID.trim())
    .filter(Boolean)
    .map((projectID) => ({ projectID }))
  const directoryTargets = (automation.scope.directories ?? [])
    .map((directory) => directory.trim())
    .filter(Boolean)
    .map((directory) => ({ directory }))
  const targets = [...projectTargets, ...directoryTargets]

  return targets.length > 0 ? targets : [{}]
}

export function createRunsForAutomation(
  automation: AutomationDefinition,
  trigger: AutomationRunTrigger,
) {
  const now = Date.now()
  return runTargetsForAutomation(automation).map((target) =>
    insertRun(buildRun({
      automation,
      trigger,
      now,
      projectID: "projectID" in target ? target.projectID : undefined,
      directory: "directory" in target ? target.directory : undefined,
      sessionID: "sessionID" in target ? target.sessionID : undefined,
    })),
  )
}

export function markRunStarted(runID: string, input: {
  directory?: string
  projectID?: string
  sessionID?: string
  turnID?: string
  worktreeID?: string
  worktreePath?: string
} = {}) {
  const existing = getRun(runID)
  if (!existing || existing.status === "cancelled") return existing
  const updated = updateRunRecord(AutomationRun.parse({
    ...existing,
    ...input,
    status: "running",
    startedAt: existing.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  }))
  AutomationEvents.publish("automation.run.started", { run: updated })

  const sessionID = input.sessionID?.trim()
  const directory = input.directory?.trim()
  if (sessionID && directory && existing.sessionID !== sessionID) {
    AutomationEvents.publish("automation.session.created", {
      automationID: updated.automationID,
      runID: updated.id,
      sessionID,
      directory,
      projectID: input.projectID,
      name: getAutomation(updated.automationID)?.name ?? "Automation",
      trigger: updated.trigger,
    })
  }

  return updated
}

export function finishRun(runID: string, input: {
  status: AutomationRunStatus
  summary?: string
  findingCount?: number
  triageStatus?: AutomationTriageStatus
  error?: string
  metadata?: Record<string, unknown>
  sessionID?: string
  turnID?: string
}) {
  const existing = getRun(runID)
  if (!existing || existing.status === "cancelled") return existing
  return updateRunRecord(AutomationRun.parse({
    ...existing,
    status: input.status,
    summary: input.summary,
    findingCount: input.findingCount ?? existing.findingCount,
    triageStatus: input.triageStatus ?? existing.triageStatus,
    error: input.error,
    metadata: input.metadata ?? existing.metadata,
    sessionID: input.sessionID ?? existing.sessionID,
    turnID: input.turnID ?? existing.turnID,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  }))
}

export function cancelRunRecord(runID: string, error = "Automation run was cancelled.") {
  const existing = getRun(runID)
  if (!existing || existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled") {
    return existing
  }

  return updateRunRecord(AutomationRun.parse({
    ...existing,
    status: "cancelled",
    triageStatus: existing.triageStatus === "none" ? "archived" : existing.triageStatus,
    error,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  }))
}

export function updateRunTriage(runID: string, triageStatus: AutomationTriageStatus) {
  const existing = getRun(runID)
  if (!existing) return null
  return updateRunRecord(AutomationRun.parse({
    ...existing,
    triageStatus,
    updatedAt: Date.now(),
  }))
}

export function touchAutomationRunState(automationID: string, input: {
  lastRunAt?: number
  runningRunID?: string
}) {
  const existing = getAutomation(automationID)
  if (!existing) return null
  return updateAutomationRecord(AutomationDefinition.parse({
    ...existing,
    lastRunAt: input.lastRunAt ?? existing.lastRunAt,
    runningRunID: input.runningRunID,
    updatedAt: Date.now(),
  }))
}

export function claimDueAutomationRuns(input: {
  now: number
  owner: string
  leaseMs: number
  limit?: number
}) {
  ensureAutomationTables()
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100))
  const candidates = db.findManyWithSchema(AUTOMATIONS_TABLE, AutomationDefinition, {
    where: [
      { column: "status", value: "active" },
      { column: "nextRunAt", operator: "<=", value: input.now },
    ],
    orderBy: [
      { column: "nextRunAt", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ],
    limit,
  })
  const claimed: Array<{ automation: AutomationDefinition; runs: AutomationRun[] }> = []

  const claimAndCreateTransaction = db.db.transaction((automation: AutomationDefinition) => {
    const current = getAutomation(automation.id)
    if (!current) return null
    if (current.status !== "active") return null
    if (!current.nextRunAt || current.nextRunAt > input.now) return null
    if (current.leaseExpiresAt && current.leaseExpiresAt > input.now && current.leaseOwner !== input.owner) {
      return null
    }

    const nextRunAt = computeNextRunAt(current.schedule, input.now)
    const next = AutomationDefinition.parse({
      ...current,
      nextRunAt,
      leaseOwner: input.owner,
      leaseExpiresAt: input.now + input.leaseMs,
      updatedAt: input.now,
    })
    const runs = runTargetsForAutomation(next).map((target) =>
      buildRun({
        automation: next,
        trigger: "schedule",
        now: input.now,
        projectID: "projectID" in target ? target.projectID : undefined,
        directory: "directory" in target ? target.directory : undefined,
        sessionID: "sessionID" in target ? target.sessionID : undefined,
      }),
    )

    db.updateByIdWithSchema(AUTOMATIONS_TABLE, next.id, next, AutomationDefinition)
    for (const run of runs) {
      insertRunWithoutPublishing(run)
    }

    return { automation: next, runs }
  })

  for (const candidate of candidates) {
    const next = claimAndCreateTransaction(candidate)
    if (!next) continue
    claimed.push(next)
    for (const run of next.runs) {
      AutomationEvents.publish("automation.run.created", { run })
    }
  }

  return claimed
}

export function releaseAutomationLease(automationID: string, owner: string) {
  const existing = getAutomation(automationID)
  if (!existing || existing.leaseOwner !== owner) return existing
  return updateAutomationRecord(AutomationDefinition.parse({
    ...existing,
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    runningRunID: undefined,
    updatedAt: Date.now(),
  }))
}

export function recoverInterruptedRuns(now = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  ensureAutomationTables()
  const threshold = now - maxAgeMs
  const staleRuns = db.findManyWithSchema(AUTOMATION_RUNS_TABLE, AutomationRun, {
    orderBy: [{ column: "createdAt", direction: "ASC" }],
  }).filter((run) => {
    if (run.status !== "queued" && run.status !== "running") return false
    return (run.startedAt ?? run.createdAt) <= threshold
  })

  for (const run of staleRuns) {
    finishRun(run.id, {
      status: "failed",
      error: "Automation run did not complete before the agent stopped.",
      triageStatus: "inbox",
    })
  }

  return staleRuns.length
}
