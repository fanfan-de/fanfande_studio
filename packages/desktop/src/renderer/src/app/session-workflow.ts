import type { PermissionRequest, SessionSummary } from "./types"

export interface SessionWorkflowBadge {
  description: string
  label: string
  shortLabel: string
  tone: "planning"
}

export function getSessionWorkflowBadge(
  workflow: SessionSummary["workflow"] | null | undefined,
  _pendingPermissionRequests?: PermissionRequest[] | null,
): SessionWorkflowBadge | null {
  if (!workflow) return null

  if (workflow.mode === "planning") {
    return {
      tone: "planning",
      label: "Planning",
      shortLabel: "Planning",
      description: "The session is in planning mode and limited to research and plan drafting.",
    }
  }

  return null
}
