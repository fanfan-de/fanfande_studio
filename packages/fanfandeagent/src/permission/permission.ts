import * as path from "node:path"
import z from "zod"
import * as Log from "#util/log.ts"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"
import * as Config from "#config/config.ts"
import { Flag } from "#flag/flag.ts"
import { Instance } from "#project/instance.ts"
import * as Filesystem from "#util/filesystem.ts"
import * as Tool from "#tool/tool.ts"
import * as ToolRegistry from "#tool/registry.ts"
import * as Agent from "#agent/agent.ts"
import * as Message from "#session/message.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as Session from "#session/session.ts"
import * as Schema from "#permission/schema.ts"

const log = Log.create({ service: "permission" })
let permissionTablesGeneration = -1

function ensurePermissionTables() {
  const generation = db.getDatabaseGeneration()
  if (permissionTablesGeneration === generation && generation > 0) return
  if (!db.tableExists("permission_rules")) {
    db.createTableByZodObject("permission_rules", Schema.Rule)
  }
  if (!db.tableExists("permission_requests")) {
    db.createTableByZodObject("permission_requests", Schema.Request)
  }
  db.syncTableColumnsWithZodObject("permission_requests", Schema.Request)
  if (!db.tableExists("permission_audits")) {
    db.createTableByZodObject("permission_audits", Schema.Audit)
  }
  permissionTablesGeneration = db.getDatabaseGeneration()
}

export {
  Action,
  ApprovalScope,
  Audit,
  Config as PermissionConfig,
  Decision,
  ConfigDefaults as PermissionConfigDefaults,
  Request,
  RequestPrompt,
  RequestPromptView,
  RequestResolution,
  RequestResolutionRecord,
  RequestStatus,
  RequestResource,
  Risk,
  Rule,
  RuleInput,
  RuleScope,
  ToolKind,
} from "#permission/schema.ts"

type Rule = Schema.Rule
type Request = Schema.Request
type Risk = Schema.Risk
type Action = Schema.Action
type Decision = Schema.Decision

type ToolDescriptor = {
  id: string
  kind: Tool.ToolKind
  readOnly: boolean
  destructive: boolean
  needsShell: boolean
}

export type EvaluationInput = {
  sessionID: string
  messageID: string
  toolCallID?: string
  projectID: string
  agent: string
  cwd?: string
  worktree?: string
  permissionMode?: "default" | "full-access"
  tool: ToolDescriptor
  input: Record<string, unknown>
}

export type EvaluationResult = {
  action: Action
  reason: string
  matchedRuleID?: string
  matchedScope?: Schema.RuleScope
  risk: Risk
  rememberable: boolean
  derived: {
    paths: string[]
    command?: string
    workdir?: string
  }
}

type RequestFilters = {
  status?: Schema.RequestStatus
  sessionID?: string
}

const DEFAULT_SCOPE_PRIORITY: Record<Schema.RuleScope | "default", number> = {
  session: 300,
  project: 200,
  global: 100,
  default: 0,
}

const DEFAULT_ACTIONS: Record<Tool.ToolKind, Schema.Action> = {
  read: "allow",
  search: "allow",
  write: "ask",
  exec: "ask",
  other: "ask",
}

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\/(\s|$)/i,
  /\bmkfs(\.[a-z0-9_]+)?\b/i,
  /\bdd\s+.+\bof=\/dev\//i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
]

const SENSITIVE_PATH_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  ".git/**",
  "node_modules/**",
]

function asPosix(value: string) {
  return value.replaceAll("\\", "/")
}

function wildcardToRegex(pattern: string) {
  const normalized = asPosix(pattern)
  let regex = "^"

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]!
    const next = normalized[index + 1]

    if (char === "*" && next === "*") {
      regex += ".*"
      index += 1
      continue
    }

    if (char === "*") {
      regex += "[^/]*"
      continue
    }

    regex += /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char
  }

  return new RegExp(`${regex}$`, "i")
}

function matchPattern(pattern: string, value: string) {
  const normalizedValue = asPosix(value)
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    return new RegExp(pattern.slice(1, -1), "i").test(normalizedValue)
  }

  if (pattern.includes("*")) {
    return wildcardToRegex(pattern).test(normalizedValue)
  }

  return asPosix(pattern).toLowerCase() === normalizedValue.toLowerCase()
}

function summarizeInput(input: Record<string, unknown>) {
  try {
    const serialized = JSON.stringify(input)
    if (!serialized) return undefined
    return serialized.length > 800 ? `${serialized.slice(0, 800)}...` : serialized
  } catch {
    return undefined
  }
}

function normalizeExecutionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  try {
    const serialized = JSON.stringify(error)
    if (serialized) return serialized
  } catch {
    // ignore and fall through to String(error)
  }

  return String(error)
}

function defaultActionForKind(kind: Tool.ToolKind, overrides?: Partial<Record<Tool.ToolKind, Schema.Action>>) {
  return overrides?.[kind] ?? DEFAULT_ACTIONS[kind]
}

function isPermissionDisabled() {
  const value = Flag.FanFande_PERMISSION?.trim().toLowerCase()
  return value === "off" || value === "false" || value === "0" || value === "disabled"
}

function classifyCommandRisk(command: string | undefined): Risk | undefined {
  if (!command) return undefined
  if (DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return "critical"
  }

  return "high"
}

function extractPatchPaths(patch: string) {
  const matches = patch.matchAll(/^(?:---|\+\+\+)\s+(.*)$/gm)
  const result = new Set<string>()

  for (const match of matches) {
    const raw = match[1]?.trim()
    if (!raw || raw === "/dev/null") continue
    const normalized = raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw
    result.add(normalized)
  }

  return [...result]
}

function resolvePathCandidate(inputPath: string, cwd: string, worktree?: string) {
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(cwd, inputPath)
  const normalized = Filesystem.normalizePath(resolved)

  const root = worktree || cwd
  const relative = asPosix(path.relative(root, normalized))
  const inside = Filesystem.contains(root, normalized) || Filesystem.contains(cwd, normalized)

  return {
    absolute: normalized,
    relative: relative && relative !== "" && !relative.startsWith("..") ? relative : asPosix(inputPath),
    inside,
  }
}

function extractPaths(input: Record<string, unknown>, cwd: string, worktree?: string) {
  const raw = new Set<string>()

  for (const key of ["path", "workdir"]) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) {
      raw.add(value.trim())
    }
  }

  const valuePaths = input["paths"]
  if (Array.isArray(valuePaths)) {
    for (const item of valuePaths) {
      if (typeof item === "string" && item.trim()) raw.add(item.trim())
    }
  }

  const patch = input["patch"]
  if (typeof patch === "string" && patch.trim()) {
    for (const patchPath of extractPatchPaths(patch)) {
      raw.add(patchPath)
    }
  }

  const resolved = [...raw].map((value) => resolvePathCandidate(value, cwd, worktree))
  return {
    resolved,
    relativePaths: [...new Set(resolved.map((item) => item.relative))],
    hasOutsidePath: resolved.some((item) => !item.inside),
  }
}

function isSensitivePath(relativePath: string) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => matchPattern(pattern, relativePath))
}

function deriveRisk(input: EvaluationInput, derivedPaths: string[], command?: string) {
  const commandRisk = classifyCommandRisk(command)
  if (commandRisk) return commandRisk
  if (derivedPaths.some(isSensitivePath)) {
    if (input.tool.kind === "write" || input.tool.kind === "exec" || input.tool.destructive) {
      return "critical"
    }

    return "high"
  }
  if (input.tool.kind === "exec") return "high"
  if (input.tool.kind === "write") return input.tool.destructive ? "high" : "medium"
  return "low"
}

function decisionToApproved(decision: Decision) {
  return decision !== "deny"
}

function decisionToScope(decision: Decision): Schema.ApprovalScope | undefined {
  switch (decision) {
    case "allow-once":
      return "once"
    case "allow-session":
      return "session"
    case "allow-project":
      return "project"
    case "allow-forever":
      return "forever"
    case "deny":
      return undefined
  }
}

function requestedResolutionScope(resolution: Schema.RequestResolution) {
  return resolution.scope ?? decisionToScope(resolution.decision)
}

function legacyApprovalToDecision(approved: boolean, scope?: Schema.ApprovalScope): Decision {
  if (!approved) return "deny"

  switch (scope) {
    case "session":
      return "allow-session"
    case "project":
      return "allow-project"
    case "forever":
      return "allow-forever"
    case "once":
    default:
      return "allow-once"
  }
}

function allowedDecisionsFor(decision: EvaluationResult): Decision[] {
  const allowed: Decision[] = ["deny", "allow-once"]
  if (decision.rememberable) {
    allowed.push("allow-session", "allow-project")
  }
  return allowed
}

function summarizeDerivedTarget(derived: EvaluationResult["derived"]) {
  if (derived.command) return `Run ${derived.command}`
  if (derived.paths.length === 1) return derived.paths[0]!
  if (derived.paths.length > 1) return `${derived.paths.length} project paths`
  return "project resources"
}

function buildFallbackApprovalDescriptor(input: {
  tool: string
  title?: string
  derived: EvaluationResult["derived"]
}): Tool.ToolApprovalDescriptor {
  const title = input.title?.trim() || input.tool
  return {
    title,
    summary: `${title} will access ${summarizeDerivedTarget(input.derived)}.`,
    details: {
      command: input.derived.command,
      paths: input.derived.paths.length > 0 ? input.derived.paths : undefined,
      workdir: input.derived.workdir,
    },
  }
}

function buildPromptSnapshot(input: {
  descriptor: Tool.ToolApprovalDescriptor
  rationale: string
  risk: Risk
  derived: EvaluationResult["derived"]
  allowedDecisions: Decision[]
  recommendedDecision?: Decision
}): Schema.RequestPrompt {
  const details = input.descriptor.details ?? {
    command: input.derived.command,
    paths: input.derived.paths.length > 0 ? input.derived.paths : undefined,
    workdir: input.derived.workdir,
  }

  const hasDetails = Boolean(details.command || details.workdir || (details.paths?.length ?? 0) > 0)
  const recommended = input.allowedDecisions.includes(input.recommendedDecision ?? "allow-once")
    ? (input.recommendedDecision ?? "allow-once")
    : (input.allowedDecisions.find((decision) => decision !== "deny") ?? "deny")

  return Schema.RequestPrompt.parse({
    title: input.descriptor.title?.trim() || "Permission request",
    summary: input.descriptor.summary.trim(),
    rationale: input.rationale.trim(),
    risk: input.risk,
    detailsAvailable: hasDetails,
    details: hasDetails ? details : undefined,
    allowedDecisions: input.allowedDecisions,
    recommendedDecision: recommended,
  })
}

function buildRuntimeSnapshot(input: {
  tool: string
  toolKind?: Schema.ToolKind
  rawInput: Record<string, unknown>
  derived: EvaluationResult["derived"]
}): Schema.RequestRuntime {
  return Schema.RequestRuntime.parse({
    tool: input.tool,
    toolKind: input.toolKind,
    input: input.rawInput,
    resource: {
      paths: input.derived.paths.length > 0 ? input.derived.paths : undefined,
      command: input.derived.command,
      workdir: input.derived.workdir,
    },
  })
}

async function findStoredRequestForToolCall(toolCallID: string | undefined) {
  if (!toolCallID) return undefined

  return db
    .findManyWithSchema("permission_requests", Schema.Request, {
      where: [{ column: "toolCallID", value: toolCallID }],
      orderBy: [{ column: "createdAt", direction: "DESC" }],
      limit: 1,
    })[0]
}

function ruleMatches(rule: Rule, input: EvaluationInput, derived: EvaluationResult["derived"], risk: Risk) {
  if (rule.enabled === false) return false
  if (rule.projectID && rule.projectID !== input.projectID) return false
  if (rule.sessionID && rule.sessionID !== input.sessionID) return false
  if (rule.agent && rule.agent !== input.agent) return false
  if (rule.tools?.length && !rule.tools.some((item) => item === input.tool.id)) return false
  if (rule.toolKinds?.length && !rule.toolKinds.includes(input.tool.kind)) return false
  if (rule.risk?.length && !rule.risk.includes(risk)) return false
  if (rule.destructive !== undefined && rule.destructive !== input.tool.destructive) return false
  if (rule.readOnly !== undefined && rule.readOnly !== input.tool.readOnly) return false
  if (rule.needsShell !== undefined && rule.needsShell !== input.tool.needsShell) return false
  if (rule.paths?.length) {
    if (derived.paths.length === 0) return false
    if (!rule.paths.some((pattern) => derived.paths.some((candidate) => matchPattern(pattern, candidate)))) return false
  }
  if (rule.commands?.length) {
    if (!derived.command) return false
    if (!rule.commands.some((pattern) => matchPattern(pattern, derived.command!))) return false
  }

  return true
}

async function loadRuleSet(projectID: string) {
  ensurePermissionTables()
  const [globalConfig, projectConfig] = await Promise.all([
    Config.get(Config.GLOBAL_CONFIG_ID),
    Config.get(projectID),
  ])
  const storedRules = db.findManyWithSchema("permission_rules", Schema.Rule)

  const configRules = [
    ...(globalConfig.permission?.rules ?? []).map((rule) =>
      Schema.Rule.parse({
        id: Identifier.ascending("permission"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: "system",
        ...rule,
      }),
    ),
    ...(projectConfig.permission?.rules ?? []).map((rule) =>
      Schema.Rule.parse({
        id: Identifier.ascending("permission"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: "system",
        projectID,
        ...rule,
      }),
    ),
  ]

  return {
    rules: [...storedRules, ...configRules],
    defaults: {
      ...globalConfig.permission?.defaults,
      ...projectConfig.permission?.defaults,
    } satisfies Partial<Record<Tool.ToolKind, Schema.Action>>,
    autoApproveSafeRead:
      projectConfig.permission?.autoApproveSafeRead ??
      globalConfig.permission?.autoApproveSafeRead ??
      false,
  }
}

function chooseMatchingRule(matches: Rule[]) {
  const scored = matches
    .map((rule) => ({
      rule,
      score: (DEFAULT_SCOPE_PRIORITY[rule.scope] ?? 0) + (rule.priority ?? 0),
    }))
    .sort((left, right) => right.score - left.score)

  if (scored.length === 0) return undefined

  const topScore = scored[0]!.score
  const topRules = scored.filter((item) => item.score === topScore).map((item) => item.rule)
  const orderedTopRules = topRules.sort((left, right) => {
    const leftOrder = left.effect === "deny" ? 3 : left.effect === "allow" ? 2 : 1
    const rightOrder = right.effect === "deny" ? 3 : right.effect === "allow" ? 2 : 1
    return rightOrder - leftOrder
  })

  return orderedTopRules[0]
}

async function audit(input: EvaluationInput, decision: EvaluationResult) {
  ensurePermissionTables()
  const record = Schema.Audit.parse({
    id: Identifier.ascending("permission"),
    sessionID: input.sessionID,
    messageID: input.messageID,
    toolCallID: input.toolCallID,
    projectID: input.projectID,
    tool: input.tool.id,
    action: decision.action,
    reason: decision.reason,
    matchedRuleID: decision.matchedRuleID,
    matchedScope: decision.matchedScope,
    risk: decision.risk,
    inputSummary: summarizeInput(input.input),
    createdAt: Date.now(),
  })

  db.insertOneWithSchema("permission_audits", record, Schema.Audit)
}

export async function evaluate(input: EvaluationInput): Promise<EvaluationResult> {
  ensurePermissionTables()
  const command = typeof input.input.command === "string" ? input.input.command.trim() : undefined
  const cwd = input.cwd ?? Instance.directory
  const worktree = input.worktree ?? Instance.worktree
  const permissionMode = input.permissionMode ?? "default"
  const derivedPaths = extractPaths(input.input, cwd, worktree)
  const derived = {
    paths: derivedPaths.relativePaths,
    command,
    workdir: cwd,
  }

  if (isPermissionDisabled()) {
    const result: EvaluationResult = {
      action: "allow",
      reason: "Permission checks are disabled by FanFande_PERMISSION.",
      risk: deriveRisk(input, derived.paths, command),
      rememberable: false,
      derived,
    }
    await audit(input, result)
    return result
  }

  if (derivedPaths.hasOutsidePath) {
    const result: EvaluationResult = {
      action: "deny",
      reason: "Tool input referenced a path outside the active project boundary.",
      risk: "critical",
      rememberable: false,
      derived,
    }
    await audit(input, result)
    return result
  }

  const storedRequest = await findStoredRequestForToolCall(input.toolCallID)
  if (storedRequest?.status === "approved") {
    const result: EvaluationResult = {
      action: "allow",
      reason: "Tool execution was approved by the user.",
      risk: storedRequest.risk,
      rememberable: false,
      derived,
    }
    await audit(input, result)
    return result
  }

  if (storedRequest?.status === "denied") {
    const result: EvaluationResult = {
      action: "deny",
      reason: storedRequest.resolutionReason?.trim() || "Tool execution was denied by the user.",
      risk: storedRequest.risk,
      rememberable: false,
      derived,
    }
    await audit(input, result)
    return result
  }

  const risk = deriveRisk(input, derived.paths, command)
  if (permissionMode === "full-access") {
    const result: EvaluationResult = {
      action: "allow",
      reason: "Full access mode allows tool execution by default.",
      risk,
      rememberable: false,
      derived,
    }
    await audit(input, result)
    return result
  }

  const { rules, defaults, autoApproveSafeRead } = await loadRuleSet(input.projectID)
  const matches = rules.filter((rule) => ruleMatches(rule, input, derived, risk))
  const matched = chooseMatchingRule(matches)

  let result: EvaluationResult
  if (matched) {
    result = {
      action: matched.effect,
      reason: matched.reason?.trim() || `Matched permission rule ${matched.id}.`,
      matchedRuleID: matched.id,
      matchedScope: matched.scope,
      risk,
      rememberable: matched.effect !== "allow",
      derived,
    }
  } else if (autoApproveSafeRead && risk === "low" && (input.tool.kind === "read" || input.tool.kind === "search")) {
    result = {
      action: "allow",
      reason: "Safe read access is auto-approved by project configuration.",
      risk,
      rememberable: false,
      derived,
    }
  } else if (risk === "critical") {
    result = {
      action: "deny",
      reason: "Critical-risk tool execution is denied by default.",
      risk,
      rememberable: false,
      derived,
    }
  } else {
    const fallback = defaultActionForKind(input.tool.kind, defaults)
    result = {
      action: fallback,
      reason:
        fallback === "allow"
          ? "This tool is allowed by the default permission policy."
          : fallback === "ask"
            ? "This tool requires approval by the default permission policy."
            : "This tool is denied by the default permission policy.",
      matchedScope: "global",
      risk,
      rememberable: fallback !== "allow",
      derived,
    }
  }

  await audit(input, result)
  return result
}

export async function listRules() {
  ensurePermissionTables()
  return db.findManyWithSchema("permission_rules", Schema.Rule, {
    orderBy: [{ column: "createdAt", direction: "DESC" }],
  })
}

export async function createRule(input: Schema.RuleInput) {
  ensurePermissionTables()
  const now = Date.now()
  const record = Schema.Rule.parse({
    id: Identifier.ascending("permission"),
    createdAt: now,
    updatedAt: now,
    enabled: true,
    createdBy: "user",
    ...input,
  })

  db.insertOneWithSchema("permission_rules", record, Schema.Rule)
  return record
}

export async function deleteRule(id: string) {
  ensurePermissionTables()
  const existing = db.findById("permission_rules", Schema.Rule, id)
  if (!existing) return null
  db.deleteById("permission_rules", id)
  return existing
}

export async function listRequests(filters: RequestFilters = {}) {
  ensurePermissionTables()
  const where: { column: string; value: string }[] = []
  if (filters.status) where.push({ column: "status", value: filters.status })
  if (filters.sessionID) where.push({ column: "sessionID", value: filters.sessionID })
  return db.findManyWithSchema("permission_requests", Schema.Request, {
    where,
    orderBy: [{ column: "createdAt", direction: "DESC" }],
  })
}

export async function listRequestPrompts(filters: RequestFilters = {}) {
  const requests = await listRequests(filters)
  return requests.map((request) => toRequestPromptView(request))
}

export async function getRequest(id: string) {
  ensurePermissionTables()
  return db.findById("permission_requests", Schema.Request, id)
}

export async function getRequestPrompt(id: string) {
  const request = await getRequest(id)
  return request ? toRequestPromptView(request) : undefined
}

async function toolDescriptorForName(toolName: string): Promise<ToolDescriptor> {
  const toolInfo = await ToolRegistry.get(toolName)
  return {
    id: toolName,
    kind: toolInfo?.capabilities?.kind ?? "other",
    readOnly: toolInfo?.capabilities?.readOnly ?? false,
    destructive: toolInfo?.capabilities?.destructive ?? false,
    needsShell: toolInfo?.capabilities?.needsShell ?? false,
  }
}

function createPermissionPart(input: {
  sessionID: string
  messageID: string
  approvalID: string
  toolCallID: string
  tool: string
  action: Action
  scope?: Schema.ApprovalScope
  reason?: string
}) {
  return Message.PermissionPart.parse({
    id: Identifier.ascending("part"),
    sessionID: input.sessionID,
    messageID: input.messageID,
    type: "permission",
    approvalID: input.approvalID,
    toolCallID: input.toolCallID,
    tool: input.tool,
    action: input.action,
    scope: input.scope,
    reason: input.reason,
    created: Date.now(),
  })
}

function assistantModelRef(assistant: Message.Assistant) {
  return {
    providerID: assistant.providerID,
    modelID: assistant.modelID,
  }
}

function readAssistantMessage(messageID: string) {
  const message = db.findById("messages", Message.MessageInfo, messageID)
  if (!message || message.role !== "assistant") return undefined
  return message
}

function openPermissionTurn(input: {
  sessionID: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
  userMessageID?: string
  turn?: Orchestrator.TurnContext
}) {
  const active = input.turn ?? Orchestrator.activeTurn(input.sessionID)
  if (active) {
    return {
      turn: active,
      managed: false,
    }
  }

  return {
    turn: Orchestrator.startTurn({
      sessionID: input.sessionID,
      userMessageID: input.userMessageID,
      agent: input.agent,
      model: input.model,
    }),
    managed: true,
  }
}

function finishManagedTurn(
  handle: ReturnType<typeof openPermissionTurn>,
  payload: {
    status: "completed" | "blocked" | "stopped"
    finishReason?: string
    message?: Message.MessageInfo
    parts?: Message.Part[]
  },
) {
  if (!handle.managed) return
  handle.turn.emit("turn.completed", payload)
}

function failManagedTurn(
  handle: ReturnType<typeof openPermissionTurn>,
  error: unknown,
  message?: Message.MessageInfo,
  parts?: Message.Part[],
) {
  if (!handle.managed) return
  handle.turn.emit("turn.failed", {
    error: normalizeExecutionError(error),
    message,
    parts,
  })
}

export async function registerApprovalRequest(input: {
  assistant: Message.Assistant
  toolPart: Message.ToolPart
  turn?: Orchestrator.TurnContext
}) {
  ensurePermissionTables()
  if (input.toolPart.state.status !== "waiting-approval") {
    throw new Error("Tool part must be in waiting-approval state before creating an approval request.")
  }

  const descriptor = await toolDescriptorForName(input.toolPart.tool)
  const decision = await evaluate({
    sessionID: input.assistant.sessionID,
    messageID: input.assistant.id,
    toolCallID: input.toolPart.callID,
    projectID: Instance.project.id,
    agent: input.assistant.agent,
    cwd: input.assistant.path.cwd,
    worktree: input.assistant.path.root,
    tool: descriptor,
    input: input.toolPart.state.input,
  })

  const toolInfo = await ToolRegistry.get(input.toolPart.tool)
  const agentInfo = (await Agent.get(input.assistant.agent)) ?? Agent.planAgent
  const runtime = toolInfo ? await toolInfo.init({ agent: agentInfo }) : undefined
  let approvalDescriptor: Tool.ToolApprovalDescriptor | undefined
  if (runtime?.describeApproval) {
    try {
      approvalDescriptor = await runtime.describeApproval(input.toolPart.state.input, {
        sessionID: input.assistant.sessionID,
        messageID: input.assistant.id,
        cwd: input.assistant.path.cwd,
        worktree: input.assistant.path.root,
        toolCallID: input.toolPart.callID,
      })
    } catch (error) {
      log.warn("tool-specific approval description failed", {
        tool: input.toolPart.tool,
        error: normalizeExecutionError(error),
      })
    }
  }

  const prompt = buildPromptSnapshot({
    descriptor: approvalDescriptor ?? buildFallbackApprovalDescriptor({
      tool: input.toolPart.tool,
      title: input.toolPart.state.title,
      derived: decision.derived,
    }),
    rationale: decision.reason,
    risk: decision.risk,
    derived: decision.derived,
    allowedDecisions: allowedDecisionsFor(decision),
    recommendedDecision: "allow-once",
  })
  const runtimeSnapshot = buildRuntimeSnapshot({
    tool: input.toolPart.tool,
    toolKind: descriptor.kind,
    rawInput: input.toolPart.state.input,
    derived: decision.derived,
  })

  const record = Schema.Request.parse({
    id: Identifier.ascending("permission"),
    approvalID: input.toolPart.state.approvalID,
    sessionID: input.assistant.sessionID,
    messageID: input.assistant.id,
    toolCallID: input.toolPart.callID,
    projectID: Instance.project.id,
    agent: input.assistant.agent,
    tool: input.toolPart.tool,
    toolKind: descriptor.kind,
    title: input.toolPart.state.title,
    risk: decision.risk,
    status: "pending",
    input: input.toolPart.state.input,
    resource: {
      paths: decision.derived.paths.length > 0 ? decision.derived.paths : undefined,
      command: decision.derived.command,
      workdir: decision.derived.workdir,
    },
    prompt,
    runtime: runtimeSnapshot,
    createdAt: Date.now(),
  })

  const part = createPermissionPart({
    sessionID: record.sessionID,
    messageID: record.messageID,
    approvalID: record.approvalID,
    toolCallID: record.toolCallID,
    tool: record.tool,
    action: "ask",
    reason: decision.reason,
  })

  const handle = openPermissionTurn({
    sessionID: record.sessionID,
    userMessageID: input.assistant.parentID || undefined,
    agent: input.assistant.agent,
    model: assistantModelRef(input.assistant),
    turn: input.turn,
  })

  try {
    if (handle.managed) {
      handle.turn.emit("tool.call.waiting_approval", {
        part: input.toolPart,
      })
    }

    handle.turn.emit("permission.requested", {
      request: record,
      part,
    })

    finishManagedTurn(handle, {
      status: "blocked",
      finishReason: "tool-approval",
      message: input.assistant,
      parts: [input.toolPart, part],
    })

    return record
  } catch (error) {
    failManagedTurn(handle, error, input.assistant, [input.toolPart, part])
    throw error
  } finally {
    if (handle.managed) {
      Orchestrator.finishTurn(handle.turn)
    }
  }
}

function ensureRequestResolutionRecord(request: Request): Schema.RequestResolutionRecord | undefined {
  if (request.resolution) return request.resolution
  if (!request.resolvedAt) return undefined

  const decision = legacyApprovalToDecision(request.status === "approved", request.resolutionScope)
  return Schema.RequestResolutionRecord.parse({
    decision,
    note: request.resolutionReason,
    approved: decisionToApproved(decision),
    scope: request.resolutionScope ?? decisionToScope(decision),
    resolvedAt: request.resolvedAt,
  })
}

function ensureRequestPrompt(request: Request): Schema.RequestPrompt {
  if (request.prompt) return request.prompt

  const derived = {
    paths: request.runtime?.resource?.paths ?? request.resource?.paths ?? [],
    command: request.runtime?.resource?.command ?? request.resource?.command,
    workdir: request.runtime?.resource?.workdir ?? request.resource?.workdir,
  }

  return buildPromptSnapshot({
    descriptor: buildFallbackApprovalDescriptor({
      tool: request.runtime?.tool ?? request.tool,
      title: request.title,
      derived,
    }),
    rationale: "This tool requires approval before it can continue.",
    risk: request.risk,
    derived,
    allowedDecisions: ["deny", "allow-once", "allow-session", "allow-project"],
    recommendedDecision: "allow-once",
  })
}

function toRequestPromptView(request: Request): Schema.RequestPromptView {
  return Schema.RequestPromptView.parse({
    id: request.id,
    approvalID: request.approvalID,
    sessionID: request.sessionID,
    messageID: request.messageID,
    toolCallID: request.toolCallID,
    projectID: request.projectID,
    agent: request.agent,
    status: request.status,
    createdAt: request.createdAt,
    prompt: ensureRequestPrompt(request),
    resolution: ensureRequestResolutionRecord(request),
  })
}

function approvalRuleFromRequest(request: Request, resolution: Schema.RequestResolution): Schema.RuleInput | undefined {
  const scope = requestedResolutionScope(resolution)
  if (!scope || scope === "once") return undefined

  return Schema.RuleInput.parse({
    scope:
      scope === "session"
        ? "session"
        : scope === "project"
          ? "project"
          : "global",
    projectID: scope === "project" ? request.projectID : undefined,
    sessionID: scope === "session" ? request.sessionID : undefined,
    agent: scope === "session" ? request.agent : undefined,
    effect: decisionToApproved(resolution.decision) ? "allow" : "deny",
    tools: [request.tool],
    toolKinds: request.toolKind ? [request.toolKind] : undefined,
    paths: request.resource?.paths,
    commands: request.resource?.command ? [request.resource.command] : undefined,
    risk: [request.risk],
    destructive: request.toolKind === "write" || request.toolKind === "exec" ? true : undefined,
    readOnly: request.toolKind === "read" || request.toolKind === "search" ? true : undefined,
    needsShell: request.tool === "exec_command" ? true : undefined,
    reason: resolution.note?.trim() || `Created from approval request ${request.id}.`,
    createdBy: "approval",
  })
}

function findToolPart(sessionID: string, toolCallID: string) {
  ensurePermissionTables()
  const parts = db.findManyWithSchema("parts", Message.Part, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [{ column: "id", direction: "ASC" }],
  })

  return parts.find(
    (part): part is Message.ToolPart => part.type === "tool" && part.callID === toolCallID,
  )
}

function toAttachmentPart(
  value: Tool.ToolAttachment | undefined,
  toolPart: Message.ToolPart,
): Message.FilePart | undefined {
  if (!value) return undefined

  return Message.FilePart.parse({
    id: Identifier.ascending("part"),
    sessionID: toolPart.sessionID,
    messageID: toolPart.messageID,
    type: "file",
    url: value.url,
    mime: value.mime,
    filename: value.filename,
  })
}

async function completeApprovedRequest(
  request: Request,
  turn?: Orchestrator.TurnContext,
) {
  const session = Session.DataBaseRead("sessions", request.sessionID) as Session.SessionInfo | null
  if (!session) {
    throw new Error(`Session '${request.sessionID}' not found.`)
  }

  return Instance.provide({
    directory: session.directory,
    fn: async () => {
      const existing = findToolPart(request.sessionID, request.toolCallID)
      if (!existing || existing.state.status !== "waiting-approval") {
        throw new Error(`Waiting approval tool call '${request.toolCallID}' was not found.`)
      }

      const toolInfo = await ToolRegistry.get(request.tool)
      if (!toolInfo) {
        throw new Error(`Tool '${request.tool}' is not registered.`)
      }

      const agentInfo = (await Agent.get(request.agent)) ?? Agent.planAgent
      const runtime = await toolInfo.init({ agent: agentInfo })
      try {
        const output = Tool.normalizeToolOutput(
          await runtime.execute(request.input, {
            sessionID: request.sessionID,
            messageID: request.messageID,
            cwd: session.directory,
            worktree: Instance.worktree,
            abort: new AbortController().signal,
            toolCallID: request.toolCallID,
          }),
        )

        const attachments = (output.attachments ?? [])
          .map((attachment) => toAttachmentPart(attachment, existing))
          .filter((attachment): attachment is Message.FilePart => Boolean(attachment))

        const completed = Message.ToolPart.parse({
          ...existing,
          state: {
            status: "completed",
            input: existing.state.input,
            output: output.text,
            title: output.title ?? existing.state.title ?? existing.tool,
            metadata: output.metadata ?? {},
            time: {
              start: existing.state.time.start,
              end: Date.now(),
            },
            attachments: attachments.length > 0 ? attachments : undefined,
          },
        })

        if (turn) {
          turn.emit("tool.call.completed", {
            part: completed,
          })
        } else {
          await Session.updatePart(completed)
        }
        return completed
      } catch (error) {
        const failed = Message.ToolPart.parse({
          ...existing,
          state: {
            status: "error",
            input: existing.state.input,
            error: normalizeExecutionError(error),
            metadata: {},
            time: {
              start: existing.state.time.start,
              end: Date.now(),
            },
          },
        })

        if (turn) {
          turn.emit("tool.call.failed", {
            part: failed,
          })
        } else {
          await Session.updatePart(failed)
        }
        return failed
      }
    },
  })
}

async function denyApprovedRequest(
  request: Request,
  turn?: Orchestrator.TurnContext,
) {
  const existing = findToolPart(request.sessionID, request.toolCallID)
  if (!existing || existing.state.status !== "waiting-approval") {
    throw new Error(`Waiting approval tool call '${request.toolCallID}' was not found.`)
  }

  const denied = Message.ToolPart.parse({
    ...existing,
    state: {
      status: "denied",
      approvalID: existing.state.approvalID,
      input: existing.state.input,
      reason: request.resolutionReason?.trim() || "Tool execution was denied by the user.",
      metadata: {},
      time: {
        start: existing.state.time.start,
        end: Date.now(),
      },
    },
  })

  if (turn) {
    turn.emit("tool.call.denied", {
      part: denied,
    })
  } else {
    await Session.updatePart(denied)
  }
  return denied
}

export async function resolveRequest(id: string, resolution: Schema.RequestResolution) {
  ensurePermissionTables()
  const existing = await getRequest(id)
  if (!existing) {
    throw new Error(`Permission request '${id}' was not found.`)
  }
  if (existing.status !== "pending") {
    return {
      request: existing,
      rule: undefined,
    }
  }

  const approved = decisionToApproved(resolution.decision)
  const scope = requestedResolutionScope(resolution)

  let next = Schema.Request.parse({
    ...existing,
    status: approved ? "approved" : "denied",
    resolvedAt: Date.now(),
    resolutionScope: scope,
    resolutionReason: resolution.note,
    resolution: {
      decision: resolution.decision,
      note: resolution.note,
      approved,
      scope,
      resolvedAt: Date.now(),
    },
  })

  const part = createPermissionPart({
    sessionID: next.sessionID,
    messageID: next.messageID,
    approvalID: next.approvalID,
    toolCallID: next.toolCallID,
    tool: next.tool,
    action: approved ? "allow" : "deny",
    scope,
    reason: resolution.note,
  })

  const derivedRule = approvalRuleFromRequest(next, resolution)
  const createdRule = derivedRule ? await createRule(derivedRule) : undefined
  if (createdRule) {
    next = Schema.Request.parse({
      ...next,
      resolution: Schema.RequestResolutionRecord.parse({
        ...next.resolution,
        createdRuleID: createdRule.id,
      }),
    })
  }

  const assistant = readAssistantMessage(next.messageID)
  const handle = openPermissionTurn({
    sessionID: next.sessionID,
    userMessageID: assistant?.parentID || undefined,
    agent: assistant?.agent ?? next.agent,
    model: assistant ? assistantModelRef(assistant) : undefined,
  })

  let latestToolPart: Message.ToolPart | undefined
  try {
    handle.turn.emit("permission.resolved", {
      request: next,
      part,
      rule: createdRule,
    })

    if (approved) {
      const waiting = findToolPart(next.sessionID, next.toolCallID)
      if (!waiting || waiting.state.status !== "waiting-approval") {
        throw new Error(`Waiting approval tool call '${next.toolCallID}' was not found.`)
      }

      handle.turn.emit("tool.call.approved", {
        part: waiting,
      })
      latestToolPart = await completeApprovedRequest(next, handle.turn)
    } else {
      latestToolPart = await denyApprovedRequest(next, handle.turn)
    }

    finishManagedTurn(handle, {
      status: "completed",
      finishReason: approved ? "approval-resolved" : "approval-denied",
      message: assistant,
      parts: latestToolPart ? [part, latestToolPart] : [part],
    })

    return {
      request: next,
      rule: createdRule,
    }
  } catch (error) {
    failManagedTurn(handle, error, assistant, latestToolPart ? [part, latestToolPart] : [part])
    throw error
  } finally {
    if (handle.managed) {
      Orchestrator.finishTurn(handle.turn)
    }
  }
}
