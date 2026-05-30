import z from "zod"
import * as Automation from "#automation/automation.ts"
import * as Executor from "#automation/executor.ts"
import { ApiError } from "#server/error.ts"

const TrimmedString = z.string().transform((value) => value.trim()).pipe(z.string().min(1))

const AutomationScheduleInput = Automation.AutomationSchedule.extend({
  timezone: z.string().trim().min(1).optional().default("UTC"),
})

const AutomationExecutionInput = Automation.AutomationExecution.partial().extend({
  environment: z.enum(["local", "worktree"]).optional().default("local"),
})

const AutomationScopeInput = z.object({
  projectIDs: z.array(z.string()).optional(),
  directories: z.array(z.string()).optional(),
  sessionID: z.string().optional(),
})

const AutomationOutputPolicyInput = Automation.AutomationOutputPolicy.partial()

export const CreateAutomationBody = z.object({
  name: TrimmedString,
  kind: Automation.AutomationKind.default("project"),
  status: z.enum(["active", "paused"]).optional().default("active"),
  schedule: AutomationScheduleInput,
  scope: AutomationScopeInput.default({}),
  execution: AutomationExecutionInput.default({ environment: "local" }),
  prompt: TrimmedString,
  outputPolicy: AutomationOutputPolicyInput.default({}),
})

export const UpdateAutomationBody = z.object({
  name: TrimmedString.optional(),
  kind: Automation.AutomationKind.optional(),
  status: Automation.AutomationStatus.optional(),
  schedule: AutomationScheduleInput.optional(),
  scope: AutomationScopeInput.optional(),
  execution: AutomationExecutionInput.optional(),
  prompt: TrimmedString.optional(),
  outputPolicy: AutomationOutputPolicyInput.optional(),
})

export const ListAutomationRunsQuery = z.object({
  automationID: z.string().optional(),
  triageStatus: Automation.AutomationTriageStatus.optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().max(500).optional()),
})

export const UpdateAutomationRunTriageBody = z.object({
  triageStatus: Automation.AutomationTriageStatus,
})

type CreateAutomationInput = z.output<typeof CreateAutomationBody>
type UpdateAutomationInput = z.output<typeof UpdateAutomationBody>

function uniqueTrimmed(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function normalizeScope(scope: z.output<typeof AutomationScopeInput>) {
  return {
    projectIDs: uniqueTrimmed(scope.projectIDs),
    directories: uniqueTrimmed(scope.directories),
    sessionID: scope.sessionID?.trim() || undefined,
  } satisfies Automation.AutomationScope
}

function normalizeExecution(execution: z.output<typeof AutomationExecutionInput>) {
  return {
    environment: execution.environment,
    model: execution.model?.trim() || undefined,
    small_model: execution.small_model?.trim() || undefined,
    reasoning_effort: execution.reasoning_effort,
    permissionMode: execution.permissionMode ?? "default",
    selectedSkillIDs: uniqueTrimmed(execution.selectedSkillIDs),
    selectedPluginIDs: uniqueTrimmed(execution.selectedPluginIDs),
    selectedMcpServerIDs: uniqueTrimmed(execution.selectedMcpServerIDs),
  } satisfies Automation.AutomationExecution
}

function normalizeOutputPolicy(outputPolicy: z.output<typeof AutomationOutputPolicyInput>) {
  return {
    triage: outputPolicy.triage ?? "findings-only",
    autoArchiveNoFindings: outputPolicy.autoArchiveNoFindings ?? true,
  } satisfies Automation.AutomationOutputPolicy
}

function validateAutomationShape(automation: Pick<Automation.AutomationDefinition, "kind" | "scope" | "execution">) {
  if (automation.kind === "thread") {
    if (!automation.scope.sessionID?.trim()) {
      throw new ApiError(400, "INVALID_AUTOMATION_SCOPE", "Thread automations must include scope.sessionID")
    }
    return
  }

  const projectCount = automation.scope.projectIDs?.length ?? 0
  const directoryCount = automation.scope.directories?.length ?? 0
  if (projectCount + directoryCount === 0) {
    throw new ApiError(400, "INVALID_AUTOMATION_SCOPE", "Project automations must include projectIDs or directories")
  }

  if (automation.execution.environment === "worktree") {
    throw new ApiError(400, "UNSUPPORTED_AUTOMATION_ENVIRONMENT", "Worktree automation is planned but not available in this MVP")
  }
}

function resolveNextRunAt(input: {
  schedule: Automation.AutomationSchedule
  status: Automation.AutomationStatus
  after?: number
}) {
  if (input.status !== "active") return undefined
  try {
    return Automation.computeNextRunAt(input.schedule, input.after)
  } catch (error) {
    throw new ApiError(
      400,
      "INVALID_AUTOMATION_SCHEDULE",
      error instanceof Error ? error.message : String(error),
    )
  }
}

function requireAutomation(id: string) {
  const automation = Automation.getAutomation(id)
  if (!automation || automation.status === "deleted") {
    throw new ApiError(404, "AUTOMATION_NOT_FOUND", `Automation '${id}' not found`)
  }
  return automation
}

function requireRun(id: string) {
  const run = Automation.getRun(id)
  if (!run) throw new ApiError(404, "AUTOMATION_RUN_NOT_FOUND", `Automation run '${id}' not found`)
  return run
}

export function listAutomations() {
  return Automation.listAutomations()
}

export function createAutomation(input: CreateAutomationInput) {
  const now = Date.now()
  const scope = normalizeScope(input.scope)
  const execution = normalizeExecution(input.execution)
  const outputPolicy = normalizeOutputPolicy(input.outputPolicy)

  validateAutomationShape({
    kind: input.kind,
    scope,
    execution,
  })

  return Automation.insertAutomation(Automation.AutomationDefinition.parse({
    id: Automation.createAutomationID(),
    name: input.name,
    kind: input.kind,
    status: input.status,
    schedule: input.schedule,
    scope,
    execution,
    prompt: input.prompt,
    promptVersion: 1,
    outputPolicy,
    createdAt: now,
    updatedAt: now,
    nextRunAt: resolveNextRunAt({
      schedule: input.schedule,
      status: input.status,
      after: now,
    }),
  }))
}

export function getAutomation(id: string) {
  return requireAutomation(id)
}

export function updateAutomation(id: string, input: UpdateAutomationInput) {
  const existing = requireAutomation(id)
  const nextKind = input.kind ?? existing.kind
  const nextStatus = input.status ?? existing.status
  const nextSchedule = input.schedule ?? existing.schedule
  const nextScope = input.scope ? normalizeScope(input.scope) : existing.scope
  const nextExecution = input.execution
    ? normalizeExecution({
      ...existing.execution,
      ...input.execution,
    })
    : existing.execution
  const nextPrompt = input.prompt ?? existing.prompt
  const promptChanged = input.prompt !== undefined && input.prompt !== existing.prompt
  const scheduleChanged = input.schedule !== undefined || input.status !== undefined

  validateAutomationShape({
    kind: nextKind,
    scope: nextScope,
    execution: nextExecution,
  })

  const now = Date.now()
  return Automation.updateAutomationRecord(Automation.AutomationDefinition.parse({
    ...existing,
    name: input.name ?? existing.name,
    kind: nextKind,
    status: nextStatus,
    schedule: nextSchedule,
    scope: nextScope,
    execution: nextExecution,
    prompt: nextPrompt,
    promptVersion: promptChanged ? existing.promptVersion + 1 : existing.promptVersion,
    outputPolicy: input.outputPolicy
      ? normalizeOutputPolicy({
        ...existing.outputPolicy,
        ...input.outputPolicy,
      })
      : existing.outputPolicy,
    nextRunAt: scheduleChanged
      ? resolveNextRunAt({
        schedule: nextSchedule,
        status: nextStatus,
        after: now,
      })
      : existing.nextRunAt,
    updatedAt: now,
  }))
}

export function deleteAutomation(id: string) {
  const existing = requireAutomation(id)
  const deleted = Automation.updateAutomationRecord(Automation.AutomationDefinition.parse({
    ...existing,
    status: "deleted",
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    runningRunID: undefined,
    updatedAt: Date.now(),
  }))

  return {
    automationID: deleted.id,
    deleted: true,
  }
}

export function runAutomation(id: string) {
  const automation = requireAutomation(id)
  const runs = Automation.createRunsForAutomation(automation, "manual")
  for (const run of runs) {
    Executor.startRun(run.id)
  }
  return { runs }
}

export function listAutomationRuns(id: string) {
  requireAutomation(id)
  return Automation.listRuns({ automationID: id })
}

export function listRuns(input: z.output<typeof ListAutomationRunsQuery>) {
  return Automation.listRuns(input)
}

export function getRun(id: string) {
  return requireRun(id)
}

export function archiveRun(id: string) {
  requireRun(id)
  return Automation.updateRunTriage(id, "archived")
}

export function markRunRead(id: string) {
  requireRun(id)
  return Automation.updateRunTriage(id, "read")
}

export function updateRunTriage(id: string, input: z.output<typeof UpdateAutomationRunTriageBody>) {
  requireRun(id)
  return Automation.updateRunTriage(id, input.triageStatus)
}

export function cancelRun(id: string) {
  requireRun(id)
  return Executor.cancelRun(id)
}
