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
import * as Session from "#session/session.ts"
import * as Schema from "#permission/schema.ts"

const log = Log.create({ service: "permission" })

export {
  Action,
  ApprovalScope,
  Audit,
  Config as PermissionConfig,
  ConfigDefaults as PermissionConfigDefaults,
  Request,
  RequestResolution,
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
  }
}

type RequestFilters = {
  status?: Schema.RequestStatus
  sessionID?: string
}

if (!db.tableExists("permission_rules")) {
  db.createTableByZodObject("permission_rules", Schema.Rule)
}
if (!db.tableExists("permission_requests")) {
  db.createTableByZodObject("permission_requests", Schema.Request)
}
if (!db.tableExists("permission_audits")) {
  db.createTableByZodObject("permission_audits", Schema.Audit)
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

  const root = worktree && worktree !== "/" ? worktree : cwd
  const relative = asPosix(path.relative(root, normalized))
  const inside =
    worktree === "/"
      ? true
      : Filesystem.contains(root, normalized) || Filesystem.contains(cwd, normalized)

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
  const command = typeof input.input.command === "string" ? input.input.command.trim() : undefined
  const cwd = input.cwd ?? Instance.directory
  const worktree = input.worktree ?? Instance.worktree
  const derivedPaths = extractPaths(input.input, cwd, worktree)
  const derived = {
    paths: derivedPaths.relativePaths,
    command,
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
  return db.findManyWithSchema("permission_rules", Schema.Rule, {
    orderBy: [{ column: "createdAt", direction: "DESC" }],
  })
}

export async function createRule(input: Schema.RuleInput) {
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
  const existing = db.findById("permission_rules", Schema.Rule, id)
  if (!existing) return null
  db.deleteById("permission_rules", id)
  return existing
}

export async function listRequests(filters: RequestFilters = {}) {
  const where: { column: string; value: string }[] = []
  if (filters.status) where.push({ column: "status", value: filters.status })
  if (filters.sessionID) where.push({ column: "sessionID", value: filters.sessionID })
  return db.findManyWithSchema("permission_requests", Schema.Request, {
    where,
    orderBy: [{ column: "createdAt", direction: "DESC" }],
  })
}

export async function getRequest(id: string) {
  return db.findById("permission_requests", Schema.Request, id)
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

export async function registerApprovalRequest(input: {
  assistant: Message.Assistant
  toolPart: Message.ToolPart
}) {
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
      workdir: input.assistant.path.cwd,
    },
    createdAt: Date.now(),
  })

  db.insertOneWithSchema("permission_requests", record, Schema.Request)
  await Session.updatePart(
    createPermissionPart({
      sessionID: record.sessionID,
      messageID: record.messageID,
      approvalID: record.approvalID,
      toolCallID: record.toolCallID,
      tool: record.tool,
      action: "ask",
      reason: decision.reason,
    }),
  )

  return record
}

function approvalRuleFromRequest(request: Request, resolution: Schema.RequestResolution): Schema.RuleInput | undefined {
  if (resolution.scope === "once") return undefined

  return Schema.RuleInput.parse({
    scope:
      resolution.scope === "session"
        ? "session"
        : resolution.scope === "project"
          ? "project"
          : "global",
    projectID: resolution.scope === "project" ? request.projectID : undefined,
    sessionID: resolution.scope === "session" ? request.sessionID : undefined,
    agent: resolution.scope === "session" ? request.agent : undefined,
    effect: resolution.approved ? "allow" : "deny",
    tools: [request.tool],
    toolKinds: request.toolKind ? [request.toolKind] : undefined,
    paths: request.resource?.paths,
    commands: request.resource?.command ? [request.resource.command] : undefined,
    risk: [request.risk],
    destructive: request.toolKind === "write" || request.toolKind === "exec" ? true : undefined,
    readOnly: request.toolKind === "read" || request.toolKind === "search" ? true : undefined,
    needsShell: request.tool === "exec_command" ? true : undefined,
    reason: resolution.reason?.trim() || `Created from approval request ${request.id}.`,
    createdBy: "approval",
  })
}

function findToolPart(sessionID: string, toolCallID: string) {
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

async function completeApprovedRequest(request: Request) {
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

        await Session.updatePart(completed)
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

        await Session.updatePart(failed)
        return failed
      }
    },
  })
}

async function denyApprovedRequest(request: Request) {
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

  await Session.updatePart(denied)
  return denied
}

export async function resolveRequest(id: string, resolution: Schema.RequestResolution) {
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

  const next = Schema.Request.parse({
    ...existing,
    status: resolution.approved ? "approved" : "denied",
    resolvedAt: Date.now(),
    resolutionScope: resolution.scope,
    resolutionReason: resolution.reason,
  })

  db.updateByIdWithSchema("permission_requests", existing.id, next, Schema.Request)

  const part = createPermissionPart({
    sessionID: next.sessionID,
    messageID: next.messageID,
    approvalID: next.approvalID,
    toolCallID: next.toolCallID,
    tool: next.tool,
    action: resolution.approved ? "allow" : "deny",
    scope: resolution.scope,
    reason: resolution.reason,
  })
  await Session.updatePart(part)

  const derivedRule = approvalRuleFromRequest(next, resolution)
  const createdRule = derivedRule ? await createRule(derivedRule) : undefined

  if (resolution.approved) {
    await completeApprovedRequest(next)
  } else {
    await denyApprovedRequest(next)
  }

  return {
    request: next,
    rule: createdRule,
  }
}
