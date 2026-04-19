import type { PermissionRequest, SessionSummary } from "./types"

export interface SessionWorkflowBadge {
  description: string
  label: string
  shortLabel: string
  tone: "planning" | "pending" | "approved"
}

function hasPendingPlanApprovalRequest(requests: PermissionRequest[] | null | undefined) {
  return Boolean(requests?.some((request) => Boolean(request.prompt.details?.body?.trim())))
}

export function getSessionWorkflowBadge(
  workflow: SessionSummary["workflow"] | null | undefined,
  pendingPermissionRequests?: PermissionRequest[] | null,
): SessionWorkflowBadge | null {
  if (!workflow) return null

  const planStatus = workflow.plan.status
  const pendingApproval =
    planStatus === "pending-approval" ||
    (workflow.mode === "planning" && hasPendingPlanApprovalRequest(pendingPermissionRequests))

  if (pendingApproval) {
    return {
      tone: "pending",
      label: "Plan Pending Approval",
      shortLabel: "Pending",
      description: "The drafted implementation plan is waiting for approval.",
    }
  }

  if (workflow.mode === "planning") {
    return {
      tone: "planning",
      label: "Planning",
      shortLabel: "Planning",
      description: "The session is in planning mode and limited to research and plan drafting.",
    }
  }

  if (planStatus === "approved") {
    return {
      tone: "approved",
      label: "Executing Approved Plan",
      shortLabel: "Approved plan",
      description: "The session is executing after a plan was approved.",
    }
  }

  return null
}
