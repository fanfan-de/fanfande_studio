import { STREAM_PENDING_PREFIX } from "./constants"
import type {
  AgentStreamEvent,
  AssistantTraceItem,
  AssistantTraceStatus,
  AssistantTurn,
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
    }),
  )
}

function buildTraceItemFromPart(input: unknown): AssistantTraceItem | null {
  const part = readRecord(input)
  if (!part) return null

  const sourceID = readString(part.id) || createID("trace")
  const type = readString(part.type)

  if (type === "reasoning" || type === "text") {
    return createTraceItem({
      id: sourceID,
      sourceID,
      kind: type,
      label: type === "reasoning" ? "Reasoning" : "Response",
      text: readString(part.text),
      isStreaming: false,
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
      status: "completed",
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

function appendSystemTrace(items: AssistantTraceItem[], turnID: string, title: string, detail: string, status: AssistantTraceStatus = "completed") {
  const nextItems = clearStreamingItems(settleQueuedPrompt(items, turnID))
  return appendTraceItem(
    nextItems,
    createTraceItem({
      kind: "system",
      label: "System",
      title,
      detail,
      status,
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

function buildUserTurnFromHistory(message: LoadedSessionHistoryMessage) {
  const textParts = extractTextParts(message.parts)
  return {
    id: message.info.id || createID("user"),
    kind: "user",
    text: textParts.join("\n\n") || "Sent a non-text message.",
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

  return {
    id: message.info.id || createID("assistant"),
    kind: "assistant",
    timestamp: readNumber(message.info.created) || Date.now(),
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

  return {
    id: turnID,
    kind: "assistant",
    timestamp: Date.now(),
    state: "Waiting for agent stream",
    items: [
      createTraceItem({
        kind: "system",
        label: "Prompt",
        title: STREAM_PENDING_PREFIX.replace(":", ""),
        text: `"${compactPrompt}"`,
        detail: "Waiting for backend response.",
        status: "pending",
        sourceID: `${turnID}:prompt`,
      }),
    ],
    isStreaming: true,
  }
}

export function buildFailureTurn(message: string, existingTurn?: AssistantTurn): AssistantTurn {
  const turnID = existingTurn?.id ?? createID("assistant")
  const baseItems = clearStreamingItems(settleQueuedPrompt(existingTurn?.items ?? [], turnID, "error"))

  return {
    id: turnID,
    kind: "assistant",
    timestamp: existingTurn?.timestamp ?? Date.now(),
    state: "Backend request failed",
    items: appendTraceItem(
      baseItems,
      createTraceItem({
        kind: "error",
        label: "Error",
        title: "Stream request failed",
        detail: message,
        status: "error",
      }),
    ),
    isStreaming: false,
  }
}

export function finalizeStreamAssistantTurn(turn: AssistantTurn): AssistantTurn {
  const items = clearStreamingItems(settleQueuedPrompt(turn.items, turn.id))

  if (turn.state === "Backend stream failed" || turn.state === "Backend request failed") {
    return {
      ...turn,
      items,
      isStreaming: false,
    }
  }

  return {
    ...turn,
    isStreaming: false,
    state: "Backend response received",
    items: upsertTraceItem(
      items,
      createTraceItem({
        id: `${turn.id}-complete`,
        sourceID: `${turn.id}:complete`,
        kind: "system",
        label: "System",
        title: "Response complete",
        detail: "Backend finished streaming this turn.",
        status: "completed",
      }),
    ),
  }
}

export function applyAgentStreamEventToTurn(turn: AssistantTurn, item: AgentStreamEvent): AssistantTurn {
  const payload = readRecord(item.data)
  const preparedItems = settleQueuedPrompt(turn.items, turn.id)

  if (item.event === "started") {
    return {
      ...turn,
      state: "Agent stream connected",
      items: appendSystemTrace(preparedItems, turn.id, "Agent stream connected", "Renderer subscribed to live backend updates."),
      isStreaming: true,
    }
  }

  if (item.event === "delta") {
    const delta = readString(payload?.delta)
    const fullText = readString(payload?.text)
    const kind = readString(payload?.kind) || "text"
    const sourceID = readString(payload?.partID) || undefined

    if (kind === "reasoning") {
      return {
        ...turn,
        state: "Agent is reasoning",
        items: appendTraceDelta(preparedItems, {
          kind: "reasoning",
          delta,
          fullText: fullText || undefined,
          sourceID,
        }),
        isStreaming: true,
      }
    }

    return {
      ...turn,
      state: "Streaming response",
      items: appendTraceDelta(preparedItems, {
        kind: "text",
        delta,
        fullText: fullText || undefined,
        sourceID,
      }),
      isStreaming: true,
    }
  }

  if (item.event === "part") {
    const nextItem = buildTraceItemFromPart(payload?.part)
    if (!nextItem) return turn

    return {
      ...turn,
      state: nextItem.kind === "tool" ? "Running tools" : turn.state,
      items: upsertTraceItem(clearStreamingItems(preparedItems), nextItem),
      isStreaming: true,
    }
  }

  if (item.event === "done") {
    const parts = Array.isArray(payload?.parts) ? payload.parts : []
    const finalizedItems = alignAnonymousTraceItemsWithParts(clearStreamingItems(preparedItems), parts)
    const nextItems = mergeTraceParts(finalizedItems, parts)

    return finalizeStreamAssistantTurn({
      ...turn,
      state: "Backend response received",
      items: nextItems,
    })
  }

  if (item.event === "error") {
    const message = readString(payload?.message) || "Unknown backend error"

    return {
      ...turn,
      isStreaming: false,
      state: "Backend stream failed",
      items: appendTraceItem(
        clearStreamingItems(preparedItems),
        createTraceItem({
          kind: "error",
          label: "Error",
          title: "API stream error",
          detail: message,
          status: "error",
        }),
      ),
    }
  }

  return turn
}

export function buildAgentTurn(prompt: string, session: SessionSummary, workspaceName: string, platform: string): AssistantTurn {
  const compactPrompt = prompt.replace(/\s+/g, " ").trim()
  const focusLine = compactPrompt.length > 56 ? `${compactPrompt.slice(0, 56)}...` : compactPrompt

  return {
    id: createID("assistant"),
    kind: "assistant",
    timestamp: Date.now(),
    state: "Implementation draft generated",
    items: [
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
    ],
  }
}

export function buildAgentTurnFromEvents(events: AgentStreamEvent[], prompt: string): AssistantTurn {
  let turn = buildStreamingAssistantTurn(prompt)
  for (const event of events) {
    turn = applyAgentStreamEventToTurn(turn, event)
  }

  return turn.isStreaming ? finalizeStreamAssistantTurn(turn) : turn
}
