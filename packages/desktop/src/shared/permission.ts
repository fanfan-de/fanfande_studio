export type PermissionRequestStatus = "pending" | "approved" | "denied" | "expired"
export type PermissionRisk = "low" | "medium" | "high" | "critical"
export type PermissionToolKind = "read" | "write" | "search" | "exec" | "other"
export type PermissionDecision = "allow-once" | "allow-session" | "allow-project" | "allow-forever" | "deny"

export interface PermissionPromptDetails {
  paths?: string[]
  command?: string
  workdir?: string
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
  scope?: "once" | "session" | "project" | "forever"
  resolvedAt: number
  createdRuleID?: string
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
  rule?: {
    id: string
    scope: "global" | "project" | "session"
    effect: "allow" | "deny" | "ask"
  }
  resumed?: unknown
}

export function isAllowDecision(decision: PermissionDecision) {
  return decision !== "deny"
}

export function isPersistentAllowDecision(decision: PermissionDecision) {
  return decision === "allow-session" || decision === "allow-project" || decision === "allow-forever"
}

export function getPermissionDecisionLabel(decision: PermissionDecision) {
  switch (decision) {
    case "allow-once":
      return "Allow once"
    case "allow-session":
      return "Allow this session"
    case "allow-project":
      return "Allow this project"
    case "allow-forever":
      return "Allow always"
    case "deny":
      return "Deny"
  }
}
