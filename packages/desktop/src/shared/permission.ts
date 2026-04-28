export type PermissionRequestStatus = "pending" | "approved" | "denied" | "expired"
export type PermissionRisk = "low" | "medium" | "high" | "critical"
export type PermissionToolKind =
  | "read"
  | "write"
  | "search"
  | "exec"
  | "workflow"
  | "interaction"
  | "delegation"
  | "other"
export type PermissionDecision = "allow" | "deny"

export interface PermissionPromptDetails {
  paths?: string[]
  command?: string
  workdir?: string
  body?: string
}

export interface PermissionPromptSnapshot {
  title: string
  summary: string
  rationale: string
  risk: PermissionRisk
  detailsAvailable: boolean
  details?: PermissionPromptDetails
  allowedDecisions: PermissionDecision[]
  recommendedDecision: PermissionDecision
}

export interface PermissionRequestResolutionRecord {
  decision: PermissionDecision
  note?: string
  approved: boolean
  resolvedAt: number
}

export interface PermissionRequestPrompt {
  id: string
  approvalID: string
  sessionID: string
  messageID: string
  toolCallID: string
  projectID: string
  agent: string
  status: PermissionRequestStatus
  createdAt: number
  prompt: PermissionPromptSnapshot
  resolution?: PermissionRequestResolutionRecord
}

export interface PermissionResolveInput {
  requestID: string
  decision: PermissionDecision
  note?: string
  resume?: boolean
}

export interface PermissionResolveResult {
  request?: PermissionRequestPrompt
  resumed?: unknown
}

export function isAllowDecision(decision: PermissionDecision) {
  return decision !== "deny"
}

export function getPermissionDecisionLabel(decision: PermissionDecision) {
  switch (decision) {
    case "allow":
      return "Allow"
    case "deny":
      return "Deny"
  }
}
