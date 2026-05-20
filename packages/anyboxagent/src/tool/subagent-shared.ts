import type { SubtaskView } from "#session/tasks/subtask.ts"

const DEFAULT_SUMMARY_PREVIEW_CHARS = 4_000

export function truncateSummary(summary: string | undefined, maxChars = DEFAULT_SUMMARY_PREVIEW_CHARS) {
  if (!summary) return undefined
  if (summary.length <= maxChars) return summary
  return `${summary.slice(0, maxChars)}\n\n[truncated]`
}

export function renderSubtaskText(
  task: SubtaskView,
  options?: {
    maxSummaryChars?: number
  },
) {
  const summary = truncateSummary(task.summary, options?.maxSummaryChars)
  const lines = [
    `Subagent Task ID: ${task.id}`,
    `Child Session ID: ${task.childSessionID}`,
    `Title: ${task.title}`,
    `Agent: ${task.agent}`,
    `Model: ${task.model.providerID}/${task.model.modelID}`,
    `Status: ${task.status}${task.active ? " (active)" : ""}`,
    `Run Mode: ${task.runInBackground ? "background" : "synchronous"}`,
    task.finishReason ? `Finish Reason: ${task.finishReason}` : undefined,
    task.error ? `Error: ${task.error}` : undefined,
    task.parentNotification
      ? `Parent Notification: ${task.parentNotification.status}${task.parentNotification.reason ? ` - ${task.parentNotification.reason}` : ""}`
      : undefined,
    summary ? ["", "SUMMARY:", summary].join("\n") : undefined,
  ].filter(Boolean)

  return lines.join("\n")
}

export function toSubtaskModelValue(
  task: SubtaskView,
  options?: {
    maxSummaryChars?: number
    instruction?: string
    action?: "spawn" | "read" | "cancel"
  },
) {
  return {
    kind: "subagent",
    action: options?.action,
    id: task.id,
    childSessionID: task.childSessionID,
    title: task.title,
    agent: task.agent,
    model: task.model,
    status: task.status,
    active: task.active,
    runInBackground: task.runInBackground,
    finishReason: task.finishReason,
    summary: truncateSummary(task.summary, options?.maxSummaryChars),
    error: task.error,
    parentNotification: task.parentNotification,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    instruction: options?.instruction,
  }
}
