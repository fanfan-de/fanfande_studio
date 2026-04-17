import { STREAM_PENDING_PREFIX } from "./constants"
import type {
  AgentStreamEvent,
  AssistantTraceDebugEntry,
  AssistantTraceItem,
  AssistantTraceStatus,
  AssistantTurn,
  AssistantTurnPhase,
  AssistantTurnRuntime,
  LoadedSessionHistoryMessage,
  SessionSummary,
  Turn,
} from "./types"
import { compactText, createID } from "./utils"

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function describeStructuredValue(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return compactText(value) || fallback
  }

  if (value == null) return fallback

  try {
    const serialized = JSON.stringify(value)
    return compactText(serialized, 220) || fallback
  } catch {
    return fallback
  }
}

function createTraceItem(
  input: Omit<AssistantTraceItem, "id" | "timestamp"> & {
    id?: string
    timestamp?: number
  },
): AssistantTraceItem {
  return {
    id: input.id ?? createID("trace"),
    timestamp: input.timestamp ?? Date.now(),
    ...input,
  }
}

function formatDebugTimestamp(value: number) {
  return new Date(value).toISOString()
}

function stringifyDebugValue(value: unknown, maxLength = 240) {
  if (typeof value === "string") {
    return compactText(value, maxLength)
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (value == null) return ""

  try {
    const serialized = JSON.stringify(value)
    return compactText(serialized, maxLength)
  } catch {
    return compactText(String(value), maxLength)
  }
}

function appendDebugEntry(entries: AssistantTraceDebugEntry[], label: string, value: unknown, maxLength = 240) {
  const normalized = stringifyDebugValue(value, maxLength)
  if (!normalized) return

  entries.push({
    label,
    value: normalized,
  })
}

function mergeDebugEntries(
  existing?: AssistantTraceDebugEntry[],
  next?: AssistantTraceDebugEntry[],
) {
  if ((!existing || existing.length === 0) && (!next || next.length === 0)) {
    return undefined
  }

  if (!existing || existing.length === 0) return next
  if (!next || next.length === 0) return existing

  const merged = [...existing]
  const indexByLabel = new Map(existing.map((entry, index) => [entry.label, index]))

  for (const entry of next) {
    const existingIndex = indexByLabel.get(entry.label)
    if (existingIndex === undefined) {
      indexByLabel.set(entry.label, merged.length)
      merged.push(entry)
      continue
    }

    merged[existingIndex] = entry
  }

  return merged
}

function formatDebugTimeRange(value: unknown) {
  const range = readRecord(value)
  if (!range) return ""

  const start = typeof range.start === "number" ? formatDebugTimestamp(range.start) : ""
  const end = typeof range.end === "number" ? formatDebugTimestamp(range.end) : ""
  const compacted = typeof range.compacted === "number" ? formatDebugTimestamp(range.compacted) : ""

  if (start && end && compacted) {
    return `${start} -> ${end} (compacted ${compacted})`
  }

  if (start && end) {
    return `${start} -> ${end}`
  }

  return start || end || compacted
}

function buildPartDebugEntries(input: unknown) {
  const part = readRecord(input)
  if (!part) return undefined

  const entries: AssistantTraceDebugEntry[] = []
  const type = readString(part.type)

  appendDebugEntry(entries, "part.id", readString(part.id))
  appendDebugEntry(entries, "message.id", readString(part.messageID))

  if (type === "text" || type === "reasoning") {
    appendDebugEntry(entries, "part.time", formatDebugTimeRange(part.time))
    appendDebugEntry(entries, "part.metadata", part.metadata, 320)
  }

  if (type === "tool") {
    const state = readRecord(part.state)
    appendDebugEntry(entries, "tool.call", readString(part.callID))
    appendDebugEntry(entries, "tool.status", readString(state?.status))
    appendDebugEntry(entries, "tool.input", state?.input, 320)
    appendDebugEntry(entries, "tool.metadata", state?.metadata ?? part.metadata, 320)
    appendDebugEntry(entries, "tool.time", formatDebugTimeRange(state?.time))
    if (typeof part.providerExecuted === "boolean") {
      appendDebugEntry(entries, "tool.providerExecuted", part.providerExecuted)
    }
  }

  if (type === "patch") {
    appendDebugEntry(entries, "patch.hash", readString(part.hash))
  }

  if (type === "snapshot") {
    const snapshot = readString(part.snapshot)
    appendDebugEntry(entries, "snapshot.size", snapshot ? `${snapshot.length} chars` : "")
  }

  if (type === "permission") {
    appendDebugEntry(entries, "approval.id", readString(part.approvalID))
    appendDebugEntry(entries, "tool.call", readString(part.toolCallID))
    appendDebugEntry(entries, "approval.scope", readString(part.scope))
    if (typeof part.created === "number") {
      appendDebugEntry(entries, "approval.created", formatDebugTimestamp(part.created))
    }
  }

  if (type === "subtask") {
    const model = readRecord(part.model)
    appendDebugEntry(entries, "subtask.agent", readString(part.agent))
    appendDebugEntry(entries, "subtask.model", model ? `${readString(model.providerID)}/${readString(model.modelID)}` : "")
    appendDebugEntry(entries, "subtask.command", readString(part.command))
  }

  if (type === "step-start") {
    const snapshot = readString(part.snapshot)
    appendDebugEntry(entries, "snapshot.size", snapshot ? `${snapshot.length} chars` : "")
  }

  if (type === "step-finish") {
    const tokens = readRecord(part.tokens)
    const cache = readRecord(tokens?.cache)
    appendDebugEntry(entries, "step.cost", part.cost)
    appendDebugEntry(entries, "tokens.input", tokens?.input)
    appendDebugEntry(entries, "tokens.output", tokens?.output)
    appendDebugEntry(entries, "tokens.reasoning", tokens?.reasoning)
    appendDebugEntry(entries, "tokens.cache.read", cache?.read)
    appendDebugEntry(entries, "tokens.cache.write", cache?.write)
  }

  if (type === "retry") {
    const time = readRecord(part.time)
    if (typeof time?.created === "number") {
      appendDebugEntry(entries, "retry.created", formatDebugTimestamp(time.created))
    }
  }

  if (type === "agent") {
    appendDebugEntry(entries, "agent.name", readString(part.name))
  }

  if (type === "compaction") {
    appendDebugEntry(entries, "compaction.auto", Boolean(part.auto))
  }

  return entries.length > 0 ? entries : undefined
}

function buildStreamEventDebugEntries(
  eventName: string,
  payload: Record<string, unknown> | null,
  extra?: Record<string, unknown>,
) {
  const entries: AssistantTraceDebugEntry[] = []
  appendDebugEntry(entries, "stream.event", eventName)
  appendDebugEntry(entries, "stream.eventID", readString(payload?.eventID))
  appendDebugEntry(entries, "stream.cursor", readString(payload?.cursor))

  if (typeof payload?.seq === "number") {
    appendDebugEntry(entries, "stream.seq", payload.seq)
  }

  if (typeof payload?.timestamp === "number") {
    appendDebugEntry(entries, "stream.at", formatDebugTimestamp(payload.timestamp))
  }

  for (const [label, value] of Object.entries(extra ?? {})) {
    appendDebugEntry(entries, label, value, 320)
  }

  return entries.length > 0 ? entries : undefined
}

function isVisibleAssistantTraceItem(item: AssistantTraceItem) {
  return item.kind !== "system"
}

function createAssistantTurnRuntime(input: {
  phase: AssistantTurnPhase
  startedAt?: number
  updatedAt?: number
  items?: AssistantTraceItem[]
  toolName?: string
  approvalRequestID?: string
  errorMessage?: string
}): AssistantTurnRuntime {
  const startedAt = input.startedAt ?? Date.now()
  const updatedAt = input.updatedAt ?? startedAt
  const hasVisibleItems = (input.items ?? []).some(isVisibleAssistantTraceItem)

  return {
    phase: input.phase,
    startedAt,
    updatedAt,
    ...(hasVisibleItems ? { firstVisibleAt: startedAt } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.approvalRequestID ? { approvalRequestID: input.approvalRequestID } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  }
}

function updateAssistantTurnLifecycle(
  turn: AssistantTurn,
  input: {
    phase?: AssistantTurnPhase
    state?: string
    updatedAt?: number
    toolName?: string | null
    approvalRequestID?: string | null
    errorMessage?: string | null
  },
  items = turn.items,
): AssistantTurn {
  const updatedAt = input.updatedAt ?? Date.now()
  const nextRuntime: AssistantTurnRuntime = {
    ...turn.runtime,
    ...(input.phase ? { phase: input.phase } : {}),
    updatedAt,
    ...("toolName" in input ? { toolName: input.toolName ?? undefined } : {}),
    ...("approvalRequestID" in input ? { approvalRequestID: input.approvalRequestID ?? undefined } : {}),
    ...("errorMessage" in input ? { errorMessage: input.errorMessage ?? undefined } : {}),
  }

  if (!nextRuntime.firstVisibleAt && items.some(isVisibleAssistantTraceItem)) {
    nextRuntime.firstVisibleAt = updatedAt
  }

  return {
    ...turn,
    ...(input.state ? { state: input.state } : {}),
    runtime: nextRuntime,
    items,
  }
}

function clearStreamingItems(items: AssistantTraceItem[]) {
  return items.map((item) => (item.isStreaming ? { ...item, isStreaming: false } : item))
}

function settleQueuedPrompt(items: AssistantTraceItem[], turnID: string, status: AssistantTraceStatus = "completed") {
  const promptSourceID = `${turnID}:prompt`
  return items.map((item) =>
    item.sourceID === promptSourceID && item.status === "pending"
      ? {
          ...item,
          status,
        }
      : item,
  )
}

function appendTraceItem(items: AssistantTraceItem[], nextItem: AssistantTraceItem) {
  return [...items, nextItem]
}

function upsertTraceItem(items: AssistantTraceItem[], nextItem: AssistantTraceItem) {
  const matchingIndices = items.reduce<number[]>((result, item, index) => {
    if (nextItem.sourceID && item.sourceID ? item.sourceID === nextItem.sourceID : item.id === nextItem.id) {
      result.push(index)
    }

    return result
  }, [])

  if (matchingIndices.length === 0) {
    return appendTraceItem(items, nextItem)
  }

  const firstIndex = matchingIndices[0]
  const existing = items[firstIndex]
  const merged = {
    ...existing,
    ...nextItem,
    id: existing.id,
    timestamp: existing.timestamp,
    debugEntries: mergeDebugEntries(existing.debugEntries, nextItem.debugEntries),
  }

  const duplicateIndices = new Set(matchingIndices.slice(1))

  return items.flatMap((item, index) => {
    if (index === firstIndex) return [merged]
    if (duplicateIndices.has(index)) return []
    return [item]
  })
}

function appendTraceDelta(
  items: AssistantTraceItem[],
  input: {
    kind: "reasoning" | "text"
    delta: string
    fullText?: string
    sourceID?: string
    debugEntries?: AssistantTraceDebugEntry[]
  },
) {
  const nextItems = clearStreamingItems(items)
  const existingIndex = input.sourceID
    ? nextItems.findIndex((item) => item.kind === input.kind && item.sourceID === input.sourceID)
    : nextItems.length > 0 &&
        nextItems[nextItems.length - 1]?.kind === input.kind &&
        nextItems[nextItems.length - 1]?.sourceID === undefined
      ? nextItems.length - 1
      : -1

  if (existingIndex !== -1) {
    const existing = nextItems[existingIndex]
    const nextText = input.fullText || `${existing?.text ?? ""}${input.delta}`

    return nextItems.map((item, index) =>
      index === existingIndex
        ? {
            ...existing,
            text: nextText,
            isStreaming: true,
            debugEntries: mergeDebugEntries(existing?.debugEntries, input.debugEntries),
          }
        : item,
    )
  }

  return appendTraceItem(
    nextItems,
    createTraceItem({
      kind: input.kind,
      label: input.kind === "reasoning" ? "Reasoning" : "Response",
      text: input.fullText || input.delta,
      sourceID: input.sourceID,
      isStreaming: true,
      debugEntries: input.debugEntries,
    }),
  )
}

function buildTraceItemFromPart(
  input: unknown,
  options?: {
    debugEntries?: AssistantTraceDebugEntry[]
  },
): AssistantTraceItem | null {
  const part = readRecord(input)
  if (!part) return null

  const sourceID = readString(part.id) || createID("trace")
  const type = readString(part.type)
  const debugEntries = mergeDebugEntries(buildPartDebugEntries(part), options?.debugEntries)

  if (type === "reasoning" || type === "text") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: type,
      label: type === "reasoning" ? "Reasoning" : "Response",
      text: readString(part.text),
      isStreaming: false,
      debugEntries,
    })
  }

  if (type === "tool") {
    const state = readRecord(part.state)
    const rawStatus = readString(state?.status)
    const status: AssistantTraceStatus =
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "error"
          ? "error"
          : rawStatus === "pending"
            ? "pending"
            : rawStatus === "waiting-approval"
              ? "waiting-approval"
              : rawStatus === "denied"
                ? "denied"
                : "running"
    const toolName = readString(part.tool) || "Tool"
    const detail =
      status === "completed"
        ? describeStructuredValue(state?.output, "Tool completed.")
        : status === "error"
          ? readString(state?.error) || "Tool failed."
          : status === "denied"
            ? readString(state?.reason) || "Tool execution was denied."
            : status === "waiting-approval"
              ? "Waiting for permission approval before the tool can continue."
          : readString(state?.title) || describeStructuredValue(state?.input, "Tool update received.")

    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "tool",
      label: "Tool",
      title: toolName,
      detail,
      status,
      isStreaming: status === "running" || status === "pending",
      debugEntries,
    })
  }

  if (type === "file" || type === "image") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: type,
      label: type === "image" ? "Image" : "File",
      title: readString(part.filename) || "Attachment",
      detail: readString(part.mime) || describeStructuredValue(part.url, "Attachment returned from the agent."),
      status: "completed",
      debugEntries,
    })
  }

  if (type === "patch") {
    const files = Array.isArray(part.files) ? part.files.filter((item): item is string => typeof item === "string") : []
    const changes = Array.isArray(part.changes)
      ? part.changes
          .map((change) => readRecord(change))
          .filter((change): change is Record<string, unknown> => Boolean(change))
          .map((change) => ({
            file: readString(change.file),
            additions: readNumber(change.additions),
            deletions: readNumber(change.deletions),
          }))
          .filter((change) => Boolean(change.file))
      : []
    const summary = readRecord(part.summary)
    const additions = readNumber(summary?.additions) || changes.reduce((count, change) => count + change.additions, 0)
    const deletions = readNumber(summary?.deletions) || changes.reduce((count, change) => count + change.deletions, 0)
    const fileCount = readNumber(summary?.files) || changes.length || files.length
    const detail = changes.length > 0
      ? compactText(
          changes
            .map((change) => `${change.file} (+${change.additions} -${change.deletions})`)
            .join("\n"),
          240,
        )
      : files.length > 0
        ? compactText(files.join(", "), 220)
        : "Patch metadata received from the backend."

    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "patch",
      label: "Patch",
      title: fileCount > 0
        ? `${fileCount} file change${fileCount === 1 ? "" : "s"} (+${additions} -${deletions})`
        : "Patch update",
      detail,
      filePaths: changes.length > 0 ? changes.map((change) => change.file) : files,
      status: "completed",
      debugEntries,
    })
  }

  if (type === "permission") {
    const action = readString(part.action)
    const scope = readString(part.scope)
    const reason = readString(part.reason)
    const status: AssistantTraceStatus = action === "deny" ? "denied" : action === "ask" ? "pending" : "completed"
    const title =
      action === "deny"
        ? "Permission denied"
        : action === "allow"
          ? "Permission allowed"
          : "Permission requested"
    const detail = compactText(
      [
        readString(part.tool),
        scope ? `scope=${scope}` : null,
        reason || null,
      ]
        .filter(Boolean)
        .join(" · "),
      220,
    ) || "The backend recorded a permission lifecycle update."

    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "system",
      label: "Permission",
      title,
      detail,
      status,
      debugEntries,
    })
  }

  if (type === "subtask") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "subtask",
      label: "Subtask",
      title: readString(part.description) || readString(part.agent) || "Delegated task",
      detail: compactText(readString(part.prompt), 220) || "The assistant delegated part of the request.",
      status: "completed",
      debugEntries,
    })
  }

  if (type === "step-start") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "system",
      label: "Step",
      title: "Reasoning step started",
      detail: "The backend opened a new reasoning step.",
      status: "pending",
      debugEntries,
    })
  }

  if (type === "step-finish") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "step",
      label: "Step",
      title: "Reasoning step finished",
      detail: readString(part.reason) || "The backend completed one reasoning step.",
      status: "completed",
      debugEntries,
    })
  }

  if (type === "retry") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "retry",
      label: "Retry",
      title: "Retry scheduled",
      detail: `Attempt ${String(part.attempt ?? "?")}`,
      status: "pending",
      debugEntries,
    })
  }

  if (type === "snapshot") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "snapshot",
      label: "Snapshot",
      title: "Workspace snapshot",
      detail: "The backend captured a workspace snapshot during the run.",
      status: "completed",
      debugEntries,
    })
  }

  if (type === "agent") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "system",
      label: "Agent",
      title: readString(part.name) || "Agent update",
      detail: "The backend recorded the active agent for this turn.",
      status: "completed",
      debugEntries,
    })
  }

  if (type === "compaction") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: "system",
      label: "Compaction",
      title: part.auto ? "Automatic compaction" : "Compaction recorded",
      detail: part.auto
        ? "The backend compacted the conversation context automatically."
        : "The backend recorded a compaction event for this turn.",
      status: "completed",
      debugEntries,
    })
  }

  return null
}

function mergeTraceParts(items: AssistantTraceItem[], parts: unknown[]) {
  return parts.reduce<AssistantTraceItem[]>((result, part) => {
    const nextItem = buildTraceItemFromPart(part)
    return nextItem ? upsertTraceItem(result, nextItem) : result
  }, items)
}

function alignAnonymousTraceItemsWithParts(items: AssistantTraceItem[], parts: unknown[]) {
  const nextItems = [...items]
  const anonymousIndices = {
    reasoning: [] as number[],
    text: [] as number[],
  }

  nextItems.forEach((item, index) => {
    if ((item.kind === "reasoning" || item.kind === "text") && !item.sourceID) {
      anonymousIndices[item.kind].push(index)
    }
  })

  for (const part of parts) {
    const nextItem = buildTraceItemFromPart(part)
    if (!nextItem || (nextItem.kind !== "reasoning" && nextItem.kind !== "text") || !nextItem.sourceID) {
      continue
    }

    const hasMatchedSource = nextItems.some((item) => item.sourceID === nextItem.sourceID)
    if (hasMatchedSource) continue

    const anonymousIndex = anonymousIndices[nextItem.kind].shift()
    if (anonymousIndex === undefined) continue

    const existing = nextItems[anonymousIndex]
    if (!existing) continue

    nextItems[anonymousIndex] = {
      ...existing,
      ...nextItem,
      id: existing.id,
      timestamp: existing.timestamp,
    }
  }

  return nextItems
}

function appendSystemTrace(
  items: AssistantTraceItem[],
  turnID: string,
  title: string,
  detail: string,
  status: AssistantTraceStatus = "completed",
  debugEntries?: AssistantTraceDebugEntry[],
) {
  const nextItems = clearStreamingItems(settleQueuedPrompt(items, turnID))
  return appendTraceItem(
    nextItems,
    createTraceItem({
      kind: "system",
      label: "System",
      title,
      detail,
      status,
      debugEntries,
    }),
  )
}

function extractTextParts(parts: unknown[]) {
  return parts
    .map((part) => readRecord(part))
    .filter((part): part is Record<string, unknown> => Boolean(part))
    .filter((part) => readString(part.type) === "text")
    .map((part) => readString(part.text))
    .filter(Boolean)
}

function extractAttachmentNames(parts: unknown[]) {
  return parts
    .map((part) => readRecord(part))
    .filter((part): part is Record<string, unknown> => Boolean(part))
    .filter((part) => {
      const type = readString(part.type)
      return type === "file" || type === "image"
    })
    .map((part) => readString(part.filename) || "Attachment")
}

function summarizeAttachmentNames(attachmentNames: string[]) {
  if (attachmentNames.length === 0) return ""
  if (attachmentNames.length === 1) return attachmentNames[0] ?? "Attachment"
  return compactText(attachmentNames.join(", "), 140)
}

export function buildUserTurnText(input: {
  text?: string
  attachmentNames?: string[]
}) {
  const text = readString(input.text).trim()
  const attachmentNames = (input.attachmentNames ?? []).filter(Boolean)

  if (attachmentNames.length === 0) {
    return text || "Sent a non-text message."
  }

  const attachmentSummary = summarizeAttachmentNames(attachmentNames)
  if (!text) {
    return attachmentNames.length === 1
      ? `Sent attachment: ${attachmentSummary}`
      : `Sent ${attachmentNames.length} attachments: ${attachmentSummary}`
  }

  return `${text}\n\nAttachments: ${attachmentSummary}`
}

function resolveAssistantHistoryState(items: AssistantTraceItem[], info: LoadedSessionHistoryMessage["info"]) {
  const error = readRecord(info.error)
  if (error) return "Backend request failed"
  if (items.some((item) => item.status === "waiting-approval")) return "Waiting for permission approval"
  if (items.some((item) => item.status === "denied")) return "Tool execution denied"
  if (items.some((item) => item.status === "running" || item.status === "pending")) return "Backend response in progress"
  if (items.some((item) => item.kind === "text")) return "Backend response received"
  if (items.some((item) => item.kind === "tool")) return "Tool history restored"
  return "Session history restored"
}

function resolveAssistantHistoryPhase(items: AssistantTraceItem[], info: LoadedSessionHistoryMessage["info"]): AssistantTurnPhase {
  const error = readRecord(info.error)
  if (error) return "failed"
  if (items.some((item) => item.status === "waiting-approval")) return "waiting_approval"
  if (items.some((item) => item.status === "running" || item.status === "pending")) return "tool_running"
  if (items.some((item) => item.kind === "text")) return "completed"
  return "completed"
}

function resolveAssistantHistoryToolName(items: AssistantTraceItem[]) {
  return items.find((item) => item.kind === "tool" && (item.status === "running" || item.status === "pending" || item.status === "waiting-approval"))
    ?.title
}

function buildUserTurnFromHistory(message: LoadedSessionHistoryMessage) {
  const textParts = extractTextParts(message.parts)
  const attachmentNames = extractAttachmentNames(message.parts)
  return {
    id: message.info.id || createID("user"),
    kind: "user",
    text: buildUserTurnText({
      text: textParts.join("\n\n"),
      attachmentNames,
    }),
    timestamp: readNumber(message.info.created) || Date.now(),
  } satisfies Turn
}

function buildAssistantTurnFromHistory(message: LoadedSessionHistoryMessage) {
  let items = mergeTraceParts([], message.parts)
  const error = readRecord(message.info.error)
  const errorMessage = readString(error?.message)

  if (errorMessage) {
    items = appendTraceItem(
      items,
      createTraceItem({
        kind: "error",
        label: "Error",
        title: "Backend request failed",
        detail: errorMessage,
        status: "error",
      }),
    )
  }

  if (items.length === 0) {
    items = [
      createTraceItem({
        kind: "system",
        label: "System",
        title: "No visible output",
        detail: "The backend stored this assistant turn without replayable trace items.",
        status: "completed",
      }),
    ]
  }

  const runtimePhase = resolveAssistantHistoryPhase(items, message.info)
  const createdAt = readNumber(message.info.created) || Date.now()
  const completedAt = readNumber(message.info.completed) || createdAt

  return {
    id: message.info.id || createID("assistant"),
    kind: "assistant",
    timestamp: createdAt,
    runtime: createAssistantTurnRuntime({
      phase: runtimePhase,
      startedAt: createdAt,
      updatedAt: completedAt,
      items,
      toolName: resolveAssistantHistoryToolName(items),
      errorMessage: errorMessage || undefined,
    }),
    state: resolveAssistantHistoryState(items, message.info),
    items,
    isStreaming: false,
  } satisfies Turn
}

export function buildTurnsFromHistory(messages: LoadedSessionHistoryMessage[]) {
  return [...messages]
    .sort((left, right) => {
      const leftCreated = readNumber(left.info.created)
      const rightCreated = readNumber(right.info.created)
      if (leftCreated !== rightCreated) return leftCreated - rightCreated
      return left.info.id.localeCompare(right.info.id)
    })
    .map((message) => (message.info.role === "user" ? buildUserTurnFromHistory(message) : buildAssistantTurnFromHistory(message)))
}

export function buildStreamingAssistantTurn(prompt: string): AssistantTurn {
  const compactPrompt = compactText(prompt, 72)
  const turnID = createID("assistant")
  const items = [
    createTraceItem({
      kind: "system",
      label: "Prompt",
      title: STREAM_PENDING_PREFIX.replace(":", ""),
      text: `"${compactPrompt}"`,
      detail: "Waiting for backend response.",
      status: "pending",
      sourceID: `${turnID}:prompt`,
    }),
  ]

  return {
    id: turnID,
    kind: "assistant",
    timestamp: Date.now(),
    runtime: createAssistantTurnRuntime({
      phase: "waiting_first_event",
      items,
    }),
    state: "Waiting for agent stream",
    items,
    isStreaming: true,
  }
}

export function buildSessionStreamingAssistantTurn(detail = "Replaying backend session activity.") : AssistantTurn {
  const turnID = createID("assistant")
  const items = [
    createTraceItem({
      kind: "system",
      label: "System",
      title: "Reconnecting session stream",
      detail,
      status: "pending",
      sourceID: `${turnID}:prompt`,
    }),
  ]

  return {
    id: turnID,
    kind: "assistant",
    timestamp: Date.now(),
    runtime: createAssistantTurnRuntime({
      phase: "waiting_first_event",
      items,
    }),
    state: "Waiting for agent stream",
    items,
    isStreaming: true,
  }
}

export function buildFailureTurn(
  message: string,
  existingTurn?: AssistantTurn,
  debugEntries?: AssistantTraceDebugEntry[],
): AssistantTurn {
  const turnID = existingTurn?.id ?? createID("assistant")
  const baseItems = clearStreamingItems(settleQueuedPrompt(existingTurn?.items ?? [], turnID, "error"))
  const updatedAt = Date.now()
  const items = appendTraceItem(
    baseItems,
    createTraceItem({
      kind: "error",
      label: "Error",
      title: "Stream request failed",
      detail: message,
      status: "error",
      debugEntries,
    }),
  )

  return {
    id: turnID,
    kind: "assistant",
    timestamp: existingTurn?.timestamp ?? updatedAt,
    runtime: existingTurn?.runtime
      ? {
          ...existingTurn.runtime,
          phase: "failed",
          updatedAt,
          firstVisibleAt: existingTurn.runtime.firstVisibleAt ?? updatedAt,
          errorMessage: message,
        }
      : createAssistantTurnRuntime({
          phase: "failed",
          startedAt: updatedAt,
          updatedAt,
          items,
          errorMessage: message,
        }),
    state: "Backend request failed",
    items,
    isStreaming: false,
  }
}

export function finalizeStreamAssistantTurn(
  turn: AssistantTurn,
  input?: {
    status?: string
    debugEntries?: AssistantTraceDebugEntry[]
  },
): AssistantTurn {
  const items = clearStreamingItems(settleQueuedPrompt(turn.items, turn.id))

  if (turn.runtime.phase === "failed") {
    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: false,
      },
      {
        phase: "failed",
        state: turn.state,
      },
      items,
    )
  }

  if (input?.status === "blocked" || items.some((item) => item.status === "waiting-approval")) {
    const nextItems = upsertTraceItem(
      items,
      createTraceItem({
        id: `${turn.id}-blocked`,
        sourceID: `${turn.id}:blocked`,
        kind: "system",
        label: "System",
        title: "Approval required",
        detail: "The backend paused this turn until a permission decision is made.",
        status: "pending",
        debugEntries: input?.debugEntries,
      }),
    )
    const waitingTool = nextItems.find((item) => item.kind === "tool" && item.status === "waiting-approval")

    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: false,
      },
      {
        phase: "waiting_approval",
        state: "Waiting for permission approval",
        toolName: waitingTool?.title ?? null,
      },
      nextItems,
    )
  }

  return updateAssistantTurnLifecycle(
    {
      ...turn,
      isStreaming: false,
    },
    {
      phase: "completed",
      state: "Backend response received",
      toolName: null,
      approvalRequestID: null,
      errorMessage: null,
    },
    upsertTraceItem(
      items,
      createTraceItem({
        id: `${turn.id}-complete`,
        sourceID: `${turn.id}:complete`,
        kind: "system",
        label: "System",
        title: "Response complete",
        detail: "Backend finished streaming this turn.",
        status: "completed",
        debugEntries: input?.debugEntries,
      }),
    ),
  )
}

export function applyAgentStreamEventToTurn(turn: AssistantTurn, item: AgentStreamEvent): AssistantTurn {
  const payload = readRecord(item.data)
  const preparedItems = settleQueuedPrompt(turn.items, turn.id)

  if (item.event === "started") {
    const debugEntries = buildStreamEventDebugEntries("started", payload)

    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: true,
      },
      {
        phase: "reasoning",
        state: "Agent stream connected",
      },
      appendSystemTrace(
        preparedItems,
        turn.id,
        "Agent stream connected",
        "Renderer subscribed to live backend updates.",
        "completed",
        debugEntries,
      ),
    )
  }

  if (item.event === "delta") {
    const delta = readString(payload?.delta)
    const fullText = readString(payload?.text)
    const kind = readString(payload?.kind) || "text"
    const sourceID = readString(payload?.partID) || undefined
    const debugEntries = buildStreamEventDebugEntries("delta", payload, {
      "message.id": readString(payload?.messageID),
      "part.id": sourceID ?? "",
    })

    if (kind === "reasoning") {
      return updateAssistantTurnLifecycle(
        {
          ...turn,
          isStreaming: true,
        },
        {
          phase: "reasoning",
          state: "Agent is reasoning",
        },
        appendTraceDelta(preparedItems, {
          kind: "reasoning",
          delta,
          fullText: fullText || undefined,
          sourceID,
          debugEntries,
        }),
      )
    }

    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: true,
      },
      {
        phase: "responding",
        state: "Streaming response",
      },
      appendTraceDelta(preparedItems, {
        kind: "text",
        delta,
        fullText: fullText || undefined,
        sourceID,
        debugEntries,
      }),
    )
  }

  if (item.event === "part") {
    const nextItem = buildTraceItemFromPart(payload?.part, {
      debugEntries: buildStreamEventDebugEntries("part", payload),
    })
    if (!nextItem) return turn
    const nextItems = upsertTraceItem(clearStreamingItems(preparedItems), nextItem)
    const partRecord = readRecord(payload?.part)
    const partState = readRecord(partRecord?.state)
    const approvalRequestID = readString(partState?.approvalID) || null

    if (nextItem.kind === "tool") {
      const phase = nextItem.status === "waiting-approval"
        ? "waiting_approval"
        : nextItem.status === "running" || nextItem.status === "pending"
          ? "tool_running"
          : turn.runtime.phase
      const state = nextItem.status === "waiting-approval" ? "Waiting for permission approval" : "Running tools"

      return updateAssistantTurnLifecycle(
        {
          ...turn,
          isStreaming: true,
        },
        {
          phase,
          state,
          toolName: nextItem.title ?? null,
          approvalRequestID,
        },
        nextItems,
      )
    }

    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: true,
      },
      {},
      nextItems,
    )
  }

  if (item.event === "done") {
    const parts = Array.isArray(payload?.parts) ? payload.parts : []
    const finalizedItems = alignAnonymousTraceItemsWithParts(clearStreamingItems(preparedItems), parts)
    const nextItems = mergeTraceParts(finalizedItems, parts)
    const debugEntries = buildStreamEventDebugEntries("done", payload, {
      status: readString(payload?.status),
      finishReason: readString(payload?.finishReason),
    })

    return finalizeStreamAssistantTurn({
      ...turn,
      state: "Backend response received",
      items: nextItems,
    }, {
      status: readString(payload?.status) || undefined,
      debugEntries,
    })
  }

  if (item.event === "error") {
    const message = readString(payload?.message) || "Unknown backend error"
    const debugEntries = buildStreamEventDebugEntries("error", payload)
    const nextItems = appendTraceItem(
      clearStreamingItems(preparedItems),
      createTraceItem({
        kind: "error",
        label: "Error",
        title: "API stream error",
        detail: message,
        status: "error",
        debugEntries,
      }),
    )

    return updateAssistantTurnLifecycle(
      {
        ...turn,
        isStreaming: false,
      },
      {
        phase: "failed",
        state: "Backend stream failed",
        errorMessage: message,
      },
      nextItems,
    )
  }

  return turn
}

export function buildAgentTurn(prompt: string, session: SessionSummary, workspaceName: string, platform: string): AssistantTurn {
  const compactPrompt = prompt.replace(/\s+/g, " ").trim()
  const focusLine = compactPrompt.length > 56 ? `${compactPrompt.slice(0, 56)}...` : compactPrompt
  const items = [
    createTraceItem({
      kind: "system",
      label: "Prompt",
      title: "Prompt captured",
      text: `"${focusLine}"`,
      detail: `Working inside ${workspaceName} / ${session.title}.`,
      status: "completed",
    }),
    createTraceItem({
      kind: "reasoning",
      label: "Reasoning",
      text: "Keep the shell hierarchy obvious before wiring real-time state.",
    }),
    createTraceItem({
      kind: "reasoning",
      label: "Reasoning",
      text: "Preserve the Anybox-like restraint while making the assistant output read like an operational trace.",
    }),
    createTraceItem({
      kind: "text",
      label: "Response",
      text: `I captured "${focusLine}" and will align the ${workspaceName} context around ${session.title} before deciding which pieces belong in the shell versus the agent lane.`,
    }),
    createTraceItem({
      kind: "patch",
      label: "Patch",
      title: "UI shell boundary",
      detail: "Sidebar, thread lane, and composer keep a clear ownership boundary for later backend wiring.",
      status: "completed",
    }),
    createTraceItem({
      kind: "system",
      label: "System",
      title: "Next direction",
      detail: `Treat ${platform} as the primary runtime so window and density choices stay desktop-first.`,
      status: "completed",
    }),
  ]

  return {
    id: createID("assistant"),
    kind: "assistant",
    timestamp: Date.now(),
    runtime: createAssistantTurnRuntime({
      phase: "completed",
      items,
    }),
    state: "Implementation draft generated",
    items,
  }
}

export function buildAgentTurnFromEvents(events: AgentStreamEvent[], prompt: string): AssistantTurn {
  let turn = buildStreamingAssistantTurn(prompt)
  for (const event of events) {
    turn = applyAgentStreamEventToTurn(turn, event)
  }

  return turn.isStreaming ? finalizeStreamAssistantTurn(turn) : turn
}
