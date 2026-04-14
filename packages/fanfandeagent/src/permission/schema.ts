import z from "zod"
import * as Identifier from "#id/id.ts"

export const Action = z.enum(["allow", "deny", "ask"]).meta({
  ref: "PermissionAction",
})
export type Action = z.infer<typeof Action>

export const RuleScope = z.enum(["global", "project", "session"]).meta({
  ref: "PermissionRuleScope",
})
export type RuleScope = z.infer<typeof RuleScope>

export const ApprovalScope = z.enum(["once", "session", "project", "forever"]).meta({
  ref: "PermissionApprovalScope",
})
export type ApprovalScope = z.infer<typeof ApprovalScope>

export const Decision = z.enum(["allow-once", "allow-session", "allow-project", "allow-forever", "deny"]).meta({
  ref: "PermissionDecision",
})
export type Decision = z.infer<typeof Decision>

export const RequestStatus = z.enum(["pending", "approved", "denied", "expired"]).meta({
  ref: "PermissionRequestStatus",
})
export type RequestStatus = z.infer<typeof RequestStatus>

export const Risk = z.enum(["low", "medium", "high", "critical"]).meta({
  ref: "PermissionRisk",
})
export type Risk = z.infer<typeof Risk>

export const ToolKind = z.enum(["read", "write", "search", "exec", "other"]).meta({
  ref: "PermissionToolKind",
})
export type ToolKind = z.infer<typeof ToolKind>

export const Rule = z
  .object({
    id: Identifier.schema("permission"),
    scope: RuleScope,
    projectID: z.string().optional(),
    sessionID: Identifier.schema("session").optional(),
    agent: z.string().optional(),
    effect: Action,
    tools: z.array(z.string()).optional(),
    toolKinds: z.array(ToolKind).optional(),
    paths: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    risk: z.array(Risk).optional(),
    destructive: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    needsShell: z.boolean().optional(),
    priority: z.number().int().optional(),
    enabled: z.boolean().optional(),
    reason: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    createdBy: z.enum(["system", "user", "approval"]).optional(),
  })
  .meta({
    ref: "PermissionRule",
  })
export type Rule = z.infer<typeof Rule>

export const RuleInput = Rule.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
  .partial({
    enabled: true,
    priority: true,
    reason: true,
    projectID: true,
    sessionID: true,
    agent: true,
    tools: true,
    toolKinds: true,
    paths: true,
    commands: true,
    risk: true,
    destructive: true,
    readOnly: true,
    needsShell: true,
    createdBy: true,
  })
  .meta({
    ref: "PermissionRuleInput",
  })
export type RuleInput = z.infer<typeof RuleInput>

export const RequestResource = z
  .object({
    paths: z.array(z.string()).optional(),
    command: z.string().optional(),
    workdir: z.string().optional(),
  })
  .meta({
    ref: "PermissionRequestResource",
  })
export type RequestResource = z.infer<typeof RequestResource>

export const RequestPrompt = z
  .object({
    title: z.string(),
    summary: z.string(),
    rationale: z.string(),
    risk: Risk,
    detailsAvailable: z.boolean(),
    details: RequestResource.optional(),
    allowedDecisions: z.array(Decision),
    recommendedDecision: Decision,
  })
  .meta({
    ref: "PermissionRequestPrompt",
  })
export type RequestPrompt = z.infer<typeof RequestPrompt>

export const RequestRuntime = z
  .object({
    tool: z.string(),
    toolKind: ToolKind.optional(),
    input: z.record(z.string(), z.any()),
    resource: RequestResource.optional(),
  })
  .meta({
    ref: "PermissionRequestRuntime",
  })
export type RequestRuntime = z.infer<typeof RequestRuntime>

export const RequestResolutionRecord = z
  .object({
    decision: Decision,
    note: z.string().optional(),
    approved: z.boolean(),
    scope: ApprovalScope.optional(),
    resolvedAt: z.number(),
    createdRuleID: Identifier.schema("permission").optional(),
  })
  .meta({
    ref: "PermissionRequestResolutionRecord",
  })
export type RequestResolutionRecord = z.infer<typeof RequestResolutionRecord>

export const Request = z
  .object({
    id: Identifier.schema("permission"),
    approvalID: z.string(),
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    toolCallID: z.string(),
    projectID: z.string(),
    agent: z.string(),
    tool: z.string(),
    toolKind: ToolKind.optional(),
    title: z.string().optional(),
    risk: Risk,
    status: RequestStatus,
    input: z.record(z.string(), z.any()),
    resource: RequestResource.optional(),
    prompt: RequestPrompt.optional(),
    runtime: RequestRuntime.optional(),
    createdAt: z.number(),
    resolvedAt: z.number().optional(),
    resolutionScope: ApprovalScope.optional(),
    resolutionReason: z.string().optional(),
    resolution: RequestResolutionRecord.optional(),
  })
  .meta({
    ref: "PermissionRequest",
  })
export type Request = z.infer<typeof Request>

export const RequestResolution = z
  .object({
    decision: Decision,
    scope: ApprovalScope.optional(),
    note: z.string().optional(),
  })
  .meta({
    ref: "PermissionRequestResolution",
  })
export type RequestResolution = z.infer<typeof RequestResolution>

export const RequestPromptView = z
  .object({
    id: Identifier.schema("permission"),
    approvalID: z.string(),
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    toolCallID: z.string(),
    projectID: z.string(),
    agent: z.string(),
    status: RequestStatus,
    createdAt: z.number(),
    prompt: RequestPrompt,
    resolution: RequestResolutionRecord.optional(),
  })
  .meta({
    ref: "PermissionRequestPromptView",
  })
export type RequestPromptView = z.infer<typeof RequestPromptView>

export const Audit = z
  .object({
    id: Identifier.schema("permission"),
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    toolCallID: z.string().optional(),
    projectID: z.string().optional(),
    tool: z.string(),
    action: Action,
    reason: z.string(),
    matchedRuleID: Identifier.schema("permission").optional(),
    matchedScope: RuleScope.optional(),
    risk: Risk,
    inputSummary: z.string().optional(),
    createdAt: z.number(),
  })
  .meta({
    ref: "PermissionAudit",
  })
export type Audit = z.infer<typeof Audit>

export const ConfigDefaults = z
  .object({
    read: Action.optional(),
    write: Action.optional(),
    search: Action.optional(),
    exec: Action.optional(),
    other: Action.optional(),
  })
  .meta({
    ref: "PermissionConfigDefaults",
  })
export type ConfigDefaults = z.infer<typeof ConfigDefaults>

export const Config = z
  .object({
    defaults: ConfigDefaults.optional(),
    rules: z.array(RuleInput).optional(),
    autoApproveSafeRead: z.boolean().optional(),
    rememberApprovalsByDefault: z.boolean().optional(),
  })
  .meta({
    ref: "PermissionConfig",
  })
export type Config = z.infer<typeof Config>
