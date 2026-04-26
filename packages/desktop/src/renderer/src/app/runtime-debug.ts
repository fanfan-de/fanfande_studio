import type { SessionRuntimeDebugSnapshot, SessionRuntimeDebugState, SessionSummary } from "./types"
import { formatTime } from "./utils"

export function formatRuntimeLoadStateLabel(status: SessionRuntimeDebugState["status"]) {
  switch (status) {
    case "loading":
      return "Loading"
    case "refreshing":
      return "Refreshing"
    case "ready":
      return "Synced"
    case "error":
      return "Refresh failed"
    default:
      return "Idle"
  }
}

export function formatRuntimeBusyStateLabel(status: SessionRuntimeDebugSnapshot["status"]["type"]) {
  return status === "busy" ? "Busy" : "Idle"
}

export function formatRuntimePhaseLabel(phase?: SessionRuntimeDebugSnapshot["status"]["phase"]) {
  switch (phase) {
    case "preparing":
      return "Preparing"
    case "waiting_llm":
      return "Waiting LLM"
    case "reasoning":
      return "Reasoning"
    case "executing_tool":
      return "Running Tool"
    case "waiting_approval":
      return "Waiting Approval"
    case "responding":
      return "Responding"
    case "retrying":
      return "Retrying"
    case "blocked":
      return "Blocked"
    case "completed":
      return "Completed"
    case "cancelled":
      return "Cancelled"
    case "failed":
      return "Failed"
    default:
      return "Unknown"
  }
}

export function formatRuntimeTurnStatusLabel(status?: SessionRuntimeDebugSnapshot["turns"][number]["status"]) {
  switch (status) {
    case "running":
      return "Running"
    case "completed":
      return "Completed"
    case "blocked":
      return "Blocked"
    case "failed":
      return "Failed"
    case "stopped":
      return "Stopped"
    default:
      return "Idle"
  }
}

export function formatRuntimeDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return "—"
  if (durationMs < 1000) return `${durationMs} ms`
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function buildRuntimeStatusDescription(input: {
  activeSession: SessionSummary | null
  runtimeState: SessionRuntimeDebugState
  runtimeSnapshot: SessionRuntimeDebugSnapshot | null
}) {
  if (!input.activeSession) {
    return "Select a session to inspect the current agent runtime."
  }

  if (input.runtimeState.status === "loading") {
    return "Loading the current runtime trace for this session."
  }

  if (input.runtimeState.status === "refreshing") {
    return input.runtimeState.updatedAt
      ? `Refreshing runtime state. Last synced at ${formatTime(input.runtimeState.updatedAt)}.`
      : "Refreshing runtime state."
  }

  if (input.runtimeState.status === "error") {
    return input.runtimeState.updatedAt
      ? `The latest runtime refresh failed. Showing the most recent snapshot from ${formatTime(input.runtimeState.updatedAt)}.`
      : "The runtime snapshot could not be loaded."
  }

  const latestTurn = input.runtimeSnapshot?.latestTurn
  if (input.runtimeSnapshot?.status.type === "busy" && latestTurn) {
    return `${formatRuntimePhaseLabel(input.runtimeSnapshot.status.phase ?? latestTurn.phase)} in progress for the latest turn.`
  }

  if (latestTurn?.status === "failed") {
    return latestTurn.errorContext?.error.message ?? latestTurn.error?.message ?? "The latest turn failed."
  }

  if (input.runtimeSnapshot?.diagnostics.blockedOnApproval) {
    return "The latest turn is blocked on a tool approval request."
  }

  if (input.runtimeState.updatedAt) {
    return `Last synced at ${formatTime(input.runtimeState.updatedAt)}.`
  }

  return "Inspect the current runtime state, recent tool calls, and recent execution events."
}
