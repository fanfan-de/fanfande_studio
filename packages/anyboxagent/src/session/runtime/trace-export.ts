import type * as Message from "#session/core/message.ts"
import type * as RuntimeEvent from "#session/runtime/runtime-event.ts"
import type { SessionRuntimeDebugSnapshot } from "#session/runtime/runtime-debug.ts"

const MAX_SAFE_STRING_LENGTH = 20_000
const REDACTED_VALUE = "[REDACTED]"
const SENSITIVE_KEY_PATTERN = /apiKey|token|secret|authorization|password|credential|cookie|privateKey/i
const STRUCTURED_RAW_STRING_KEY_PATTERN = /^raw(Input)?$/i
const SENSITIVE_INLINE_VALUE_PATTERN = new RegExp(
  `((?:"|')?(?:${SENSITIVE_KEY_PATTERN.source})(?:"|')?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;}\\]]+)`,
  "gi",
)

export interface TraceExportRedactionStats {
  redactedCount: number
  truncatedCount: number
}

export interface AgentSessionTraceExport {
  schemaVersion: 1
  generatedAt: number
  mode: "safe"
  session: SessionRuntimeDebugSnapshot["session"]
  stats: {
    messageCount: number
    eventCount: number
    turnCount: number
    toolCallCount: number
    redactedCount: number
    truncatedCount: number
  }
  redaction: {
    enabled: true
    maxStringLength: number
    redactedKeyPattern: string
  }
  messages: unknown[]
  events: Array<{
    eventID: string
    sessionID: string
    turnID: string
    seq: number
    timestamp: number
    type: string
    payload: unknown
  }>
  runtime: SessionRuntimeDebugSnapshot
  toolCalls: Array<{
    callID: string
    tool: string
    status: string
    turnID?: string
    messageID?: string
    title?: string
    input?: unknown
    rawInput?: string
    output?: unknown
    modelOutput?: unknown
    error?: string
    approvalID?: string
    startedAt?: number
    endedAt?: number
    durationMs?: number
    eventIDs: string[]
  }>
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function sanitizeString(value: string, stats: TraceExportRedactionStats) {
  const redactedValue = value.replace(SENSITIVE_INLINE_VALUE_PATTERN, (_match, prefix: string) => {
    stats.redactedCount += 1
    return `${prefix}"${REDACTED_VALUE}"`
  })
  const dataUrlMatch = /^data:([^;,]+)[;,]/i.exec(value)
  if (dataUrlMatch) {
    stats.redactedCount += 1
    return `[DATA_URL:${dataUrlMatch[1]};length=${value.length}]`
  }

  if (redactedValue.length <= MAX_SAFE_STRING_LENGTH) return redactedValue

  stats.truncatedCount += 1
  return `${redactedValue.slice(0, MAX_SAFE_STRING_LENGTH)}\n[TRUNCATED originalLength=${redactedValue.length} maxLength=${MAX_SAFE_STRING_LENGTH}]`
}

function sanitizeStructuredRawString(value: string, stats: TraceExportRedactionStats) {
  const trimmed = value.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined

  try {
    return JSON.stringify(sanitizeTraceExportValue(JSON.parse(trimmed), stats))
  } catch {
    return undefined
  }
}

export function sanitizeTraceExportValue(
  value: unknown,
  stats: TraceExportRedactionStats,
  key = "",
  seen = new WeakSet<object>(),
): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    stats.redactedCount += 1
    return REDACTED_VALUE
  }

  if (typeof value === "string") {
    if (STRUCTURED_RAW_STRING_KEY_PATTERN.test(key)) {
      const safeRaw = sanitizeStructuredRawString(value, stats)
      if (safeRaw !== undefined) return sanitizeString(safeRaw, stats)
    }

    return sanitizeString(value, stats)
  }

  if (typeof value !== "object" || value === null) {
    return value
  }

  if (seen.has(value)) {
    stats.redactedCount += 1
    return "[CIRCULAR]"
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTraceExportValue(item, stats, "", seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeTraceExportValue(entryValue, stats, entryKey, seen),
    ]),
  )
}

function readToolEventCallID(event: RuntimeEvent.RuntimeEvent) {
  const payload = readRecord(event.payload)
  const part = readRecord(payload?.part)
  const request = readRecord(payload?.request)

  return (
    readString(part?.callID) ||
    readString(part?.toolCallID) ||
    readString(payload?.toolCallID) ||
    readString(request?.toolCallID)
  )
}

function buildToolEventIDsByCallID(events: RuntimeEvent.RuntimeEvent[]) {
  const eventIDsByCallID = new Map<string, string[]>()

  for (const event of events) {
    const callID = readToolEventCallID(event)
    if (!callID) continue

    const eventIDs = eventIDsByCallID.get(callID) ?? []
    eventIDs.push(event.eventID)
    eventIDsByCallID.set(callID, eventIDs)
  }

  return eventIDsByCallID
}

function buildRuntimeToolSummaryByCallID(runtime: SessionRuntimeDebugSnapshot) {
  const summaries = new Map<string, SessionRuntimeDebugSnapshot["turns"][number]["tools"][number]>()

  for (const turn of runtime.turns) {
    for (const tool of turn.tools) {
      summaries.set(tool.callID, tool)
    }
  }

  return summaries
}

function buildToolCalls(input: {
  events: RuntimeEvent.RuntimeEvent[]
  messages: Message.WithParts[]
  runtime: SessionRuntimeDebugSnapshot
}) {
  const eventIDsByCallID = buildToolEventIDsByCallID(input.events)
  const runtimeToolSummaryByCallID = buildRuntimeToolSummaryByCallID(input.runtime)
  const toolCalls = new Map<string, AgentSessionTraceExport["toolCalls"][number]>()

  for (const message of input.messages) {
    for (const part of message.parts) {
      if (part.type !== "tool") continue

      const state = part.state
      const runtimeTool = runtimeToolSummaryByCallID.get(part.callID)
      const time = "time" in state ? state.time : undefined
      const endedAt = time && "end" in time && typeof time.end === "number" ? time.end : runtimeTool?.endedAt
      const status = state.status
      const toolCall: AgentSessionTraceExport["toolCalls"][number] = {
        callID: part.callID,
        tool: part.tool,
        status,
        turnID: message.info.turnID,
        messageID: part.messageID,
        title: "title" in state ? state.title : runtimeTool?.title,
        input: state.input,
        rawInput: "raw" in state ? state.raw : undefined,
        output: "output" in state ? state.output : undefined,
        modelOutput: "modelOutput" in state ? state.modelOutput : undefined,
        error: "error" in state ? state.error : "reason" in state ? state.reason : runtimeTool?.error,
        approvalID: "approvalID" in state ? state.approvalID : runtimeTool?.approvalID,
        startedAt: time?.start ?? runtimeTool?.startedAt,
        endedAt,
        durationMs: runtimeTool?.durationMs,
        eventIDs: eventIDsByCallID.get(part.callID) ?? [],
      }

      toolCalls.set(part.callID, toolCall)
    }
  }

  return [...toolCalls.values()]
}

export function buildAgentSessionTraceExport(input: {
  events: RuntimeEvent.RuntimeEvent[]
  generatedAt?: number
  messages: Message.WithParts[]
  runtime: SessionRuntimeDebugSnapshot
}): AgentSessionTraceExport {
  const generatedAt = input.generatedAt ?? Date.now()
  const redactionStats: TraceExportRedactionStats = {
    redactedCount: 0,
    truncatedCount: 0,
  }
  const rawToolCalls = buildToolCalls(input)
  const safeMessages = sanitizeTraceExportValue(input.messages, redactionStats) as unknown[]
  const safeEvents = input.events.map((event) => ({
    eventID: event.eventID,
    sessionID: event.sessionID,
    turnID: event.turnID,
    seq: event.seq,
    timestamp: event.timestamp,
    type: event.type,
    payload: sanitizeTraceExportValue(event.payload, redactionStats),
  }))
  const safeRuntime = sanitizeTraceExportValue(input.runtime, redactionStats) as SessionRuntimeDebugSnapshot
  const safeToolCalls = sanitizeTraceExportValue(
    rawToolCalls,
    redactionStats,
  ) as AgentSessionTraceExport["toolCalls"]

  return {
    schemaVersion: 1,
    generatedAt,
    mode: "safe",
    session: safeRuntime.session,
    stats: {
      messageCount: input.messages.length,
      eventCount: input.events.length,
      turnCount: input.runtime.turns.length,
      toolCallCount: safeToolCalls.length,
      redactedCount: redactionStats.redactedCount,
      truncatedCount: redactionStats.truncatedCount,
    },
    redaction: {
      enabled: true,
      maxStringLength: MAX_SAFE_STRING_LENGTH,
      redactedKeyPattern: SENSITIVE_KEY_PATTERN.source,
    },
    messages: safeMessages,
    events: safeEvents,
    runtime: safeRuntime,
    toolCalls: safeToolCalls,
  }
}
