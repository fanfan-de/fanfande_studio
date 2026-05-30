import * as db from "#database/Sqlite.ts"
import * as Automation from "#automation/automation.ts"
import * as Project from "#project/project.ts"
import { Instance } from "#project/instance.ts"
import * as Session from "#session/core/session.ts"
import * as Message from "#session/core/message.ts"
import * as Prompt from "#session/core/prompt.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "automation.executor" })

type ActiveRunHandle = {
  cancel: () => void
  sessionID?: string
  turnID?: string
}

type PromptExecutionResult = {
  latest?: {
    info?: {
      id?: string
      role?: string
    }
    parts?: unknown[]
  }
  status?: "completed" | "blocked" | "failed"
  finishReason?: string
  errorInfo?: {
    message?: string
  }
}

const activeRuns = new Map<string, ActiveRunHandle>()

function parseModelReference(value: string | undefined) {
  if (!value) return undefined
  const [providerID, ...modelParts] = value.split("/")
  const modelID = modelParts.join("/")
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

function compactText(value: string | undefined, maxLength = 1000) {
  const compacted = value?.replace(/\s+/g, " ").trim()
  if (!compacted) return undefined
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 3).trimEnd()}...` : compacted
}

function buildAutomationPrompt(automation: Automation.AutomationDefinition) {
  return [
    automation.prompt.trim(),
    "<automation_report_instruction>",
    "At the end of this automation run, output a compact Automation Report as a fenced JSON block.",
    'Use this shape: {"findings":[{"title":"","severity":"","evidence":"","suggested_next_action":""}],"summary":"","no_findings_reason":""}.',
    "Only include actionable findings with evidence. If nothing actionable was found, return an empty findings array.",
    "</automation_report_instruction>",
  ].join("\n\n")
}

function extractTextFromParts(parts: unknown[] | undefined) {
  return (parts ?? [])
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const record = part as Record<string, unknown>
      return record.type === "text" && typeof record.text === "string" ? record.text : ""
    })
    .filter(Boolean)
    .join("\n\n")
}

function parseJsonCandidate(candidate: string) {
  try {
    const value = JSON.parse(candidate)
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseAutomationReport(text: string) {
  const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const match of fencedMatches) {
    const parsed = parseJsonCandidate(match[1]?.trim() ?? "")
    if (parsed && Array.isArray(parsed.findings)) return parsed
  }

  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const parsed = parseJsonCandidate(text.slice(firstBrace, lastBrace + 1))
    if (parsed && Array.isArray(parsed.findings)) return parsed
  }

  return null
}

function summarizeReport(result: PromptExecutionResult) {
  const text = extractTextFromParts(result.latest?.parts)
  const report = parseAutomationReport(text)
  const findings = Array.isArray(report?.findings) ? report.findings : []
  const summary = typeof report?.summary === "string"
    ? compactText(report.summary)
    : compactText(text)

  return {
    findingCount: findings.length,
    summary,
    metadata: report ? { report } : undefined,
  }
}

function triageStatusForResult(input: {
  automation: Automation.AutomationDefinition
  findingCount: number
  status: Automation.AutomationRunStatus
}) {
  if (input.status === "failed" || input.status === "blocked") return "inbox"
  if (input.automation.outputPolicy.triage === "never") return "none"
  if (input.automation.outputPolicy.triage === "always") return "inbox"
  if (input.findingCount > 0) return "inbox"
  return input.automation.outputPolicy.autoArchiveNoFindings ? "archived" : "none"
}

function applyReadOnlyPolicy(session: Session.SessionInfo, automation: Automation.AutomationDefinition) {
  if (automation.execution.permissionMode !== "read-only") return

  db.updateByIdWithSchema(
    "sessions",
    session.id,
    {
      ...session,
      policy: {
        toolPolicy: "read-only",
        ignoreFullAccess: true,
      },
    },
    Session.SessionInfo,
  )
}

function resolveProjectRunDirectory(input: {
  automation: Automation.AutomationDefinition
  run: Automation.AutomationRun
}) {
  const directory = input.run.directory?.trim()
  if (directory) return directory

  const projectID = input.run.projectID?.trim()
  if (!projectID) {
    throw new Error(`Automation '${input.automation.id}' run '${input.run.id}' has no project target.`)
  }

  const project = Project.get(projectID)
  if (!project) throw new Error(`Project '${projectID}' was not found.`)
  return Project.getRepositoryRoot(project)
}

async function enqueuePrompt(input: {
  automation: Automation.AutomationDefinition
  directory: string
  projectID?: string
  runID: string
  sessionID: string
  worktreeID?: string
  worktreePath?: string
}) {
  const handle = await Instance.provide({
    directory: input.directory,
    fn: () => Prompt.promptExecution({
      sessionID: input.sessionID,
      parts: [
        {
          type: "text",
          text: buildAutomationPrompt(input.automation),
        },
      ],
      model: parseModelReference(input.automation.execution.model),
      reasoningEffort: input.automation.execution.reasoning_effort,
      skills: input.automation.execution.selectedSkillIDs,
      displayText: input.automation.prompt,
    }),
  })

  activeRuns.set(input.runID, {
    cancel: handle.cancel,
    sessionID: input.sessionID,
    turnID: handle.turnID,
  })

  Automation.markRunStarted(input.runID, {
    directory: input.directory,
    projectID: input.projectID,
    sessionID: input.sessionID,
    turnID: handle.turnID,
    worktreeID: input.worktreeID,
    worktreePath: input.worktreePath,
  })

  return {
    handle,
    result: await handle.promise as PromptExecutionResult,
  }
}

async function runProjectAutomation(input: {
  automation: Automation.AutomationDefinition
  run: Automation.AutomationRun
}) {
  const directory = resolveProjectRunDirectory(input)
  const { project } = await Project.fromDirectory(directory)
  const worktree = input.automation.execution.environment === "worktree"
    ? await Project.createManagedWorktree(project.id, {
        ownerRunID: input.run.id,
        ownerType: "automation-run",
        cleanupPolicy: "on-success-if-clean",
      })
    : null
  const runDirectory = worktree?.path ?? directory

  const session = await Session.createSession({
    directory: runDirectory,
    projectID: project.id,
    title: input.automation.name,
    automation: {
      automationID: input.automation.id,
      runID: input.run.id,
      name: input.automation.name,
      trigger: input.run.trigger,
    },
  })

  applyReadOnlyPolicy(session, input.automation)
  Automation.markRunStarted(input.run.id, {
    directory: runDirectory,
    projectID: session.projectID,
    sessionID: session.id,
    worktreeID: worktree?.id,
    worktreePath: worktree?.path,
  })

  return enqueuePrompt({
    automation: input.automation,
    directory: runDirectory,
    projectID: session.projectID,
    runID: input.run.id,
    sessionID: session.id,
    worktreeID: worktree?.id,
    worktreePath: worktree?.path,
  })
}

async function runThreadAutomation(input: {
  automation: Automation.AutomationDefinition
  run: Automation.AutomationRun
}) {
  const sessionID = input.run.sessionID ?? input.automation.scope.sessionID
  if (!sessionID) throw new Error(`Automation '${input.automation.id}' has no session target.`)

  const session = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
  if (!session) throw new Error(`Session '${sessionID}' was not found.`)

  return enqueuePrompt({
    automation: input.automation,
    directory: session.directory,
    projectID: session.projectID,
    runID: input.run.id,
    sessionID,
  })
}

async function cleanupCompletedRunWorktree(runID: string, status: Automation.AutomationRunStatus) {
  if (status !== "completed") return

  const run = Automation.getRun(runID)
  if (!run?.projectID || !run.worktreeID) return

  try {
    await Project.removeManagedWorktree(run.projectID, run.worktreeID, {
      ownerRunID: run.id,
    })
  } catch (error) {
    log.warn("worktree-cleanup-skipped", {
      runID,
      worktreeID: run.worktreeID,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function executeRun(runID: string) {
  const run = Automation.getRun(runID)
  if (!run) throw new Error(`Automation run '${runID}' was not found.`)

  const automation = Automation.getAutomation(run.automationID)
  if (!automation || automation.status === "deleted") {
    Automation.finishRun(runID, {
      status: "skipped",
      error: "Automation definition no longer exists.",
      triageStatus: "none",
    })
    return
  }

  log.info("run-started", {
    automationID: automation.id,
    runID,
    kind: automation.kind,
    trigger: run.trigger,
  })

  try {
    Automation.touchAutomationRunState(automation.id, {
      lastRunAt: Date.now(),
      runningRunID: runID,
    })

    const execution = automation.kind === "project"
      ? await runProjectAutomation({ automation, run })
      : await runThreadAutomation({ automation, run })
    const promptResult = execution.result
    const report = summarizeReport(promptResult)
    const status: Automation.AutomationRunStatus = promptResult.status === "blocked"
      ? "blocked"
      : promptResult.status === "failed"
        ? "failed"
        : "completed"
    const triageStatus = triageStatusForResult({
      automation,
      findingCount: report.findingCount,
      status,
    })

    Automation.finishRun(runID, {
      status,
      summary: report.summary,
      findingCount: report.findingCount,
      triageStatus,
      metadata: report.metadata,
      sessionID: execution.handle.sessionID,
      turnID: execution.handle.turnID,
      error: promptResult.errorInfo?.message,
    })
    await cleanupCompletedRunWorktree(runID, status)
  } catch (error) {
    const current = Automation.getRun(runID)
    if (current?.status === "cancelled") return

    const message = error instanceof Error ? error.message : String(error)
    log.error("run-failed", {
      automationID: automation.id,
      runID,
      error: message,
    })
    Automation.finishRun(runID, {
      status: "failed",
      error: message,
      triageStatus: "inbox",
    })
  } finally {
    activeRuns.delete(runID)
    const currentAutomation = Automation.getAutomation(automation.id)
    if (currentAutomation?.runningRunID === runID) {
      Automation.touchAutomationRunState(automation.id, {
        runningRunID: undefined,
      })
    }
  }
}

export function startRun(runID: string) {
  void executeRun(runID).catch((error) => {
    log.error("background-run-failed", {
      runID,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

export function cancelRun(runID: string) {
  const handle = activeRuns.get(runID)
  if (handle) {
    handle.cancel()
  }

  return Automation.cancelRunRecord(runID)
}
