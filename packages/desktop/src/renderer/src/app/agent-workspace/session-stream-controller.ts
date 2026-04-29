import { startTransition, useEffect, useEffectEvent, type MutableRefObject } from "react"
import { getAgentSessionBridge, type AgentSessionBridgeEvent } from "../agent-session/client"
import { AgentSessionEventRouter } from "../agent-session/event-router"
import {
  appendConversationTurns as appendConversationTurnsToMap,
  updateAssistantTurn as updateAssistantTurnInMap,
} from "../conversation-state"
import {
  applyAgentStreamEventToTurn,
  buildSessionStreamingAssistantTurn,
  buildTurnsFromHistory,
} from "../stream"
import type {
  AgentSessionStreamIPCEvent,
  AgentStreamIPCEvent,
  AssistantTraceItem,
  AssistantTurn,
  LoadedSessionHistoryMessage,
  PendingAgentStream,
  PermissionRequest,
  SessionContextUsage,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  Turn,
  WorkspaceGroup,
} from "../types"
import { mergeUserTurnPresentationState, persistUserTurns, readPersistedUserTurns } from "../user-turn-presentation"
import { findSession } from "../workspace"
import {
  loadPendingPermissionRequestsForSession as loadPendingPermissionRequestsForSessionService,
} from "./permission-requests-service"
import {
  clearRuntimeDebugRefreshTimer as clearRuntimeDebugRefreshTimerService,
  clearSessionDiffRefreshTimer as clearSessionDiffRefreshTimerService,
  loadSessionDiffForSession as loadSessionDiffForSessionService,
  loadSessionRuntimeDebugForSession as loadSessionRuntimeDebugForSessionService,
  scheduleRuntimeDebugRefresh as scheduleRuntimeDebugRefreshService,
  scheduleSessionDiffRefreshForSession as scheduleSessionDiffRefreshForSessionService,
  useActiveSessionReviewEffects,
  useReviewRefreshCleanupEffect,
} from "./review-diff-runtime-hooks"
import { useAgentSessionStreamEffects } from "./session-stream-hooks"
import { refreshWorkspaceFromDirectory as refreshWorkspaceFromDirectoryService } from "./workspace-loading-hooks"
import type { WorkspaceStateUpdater } from "./workspace-store"

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readRuntimeStreamEvent(value: unknown) {
  const event = readRecord(value)
  if (!event || !readString(event.type) || !readString(event.eventID)) return null
  if (!readString(event.sessionID) || !readString(event.turnID)) return null
  if (!readRecord(event.payload)) return null
  return event
}

function readRuntimeStreamPayload(value: unknown) {
  return readRecord(readRuntimeStreamEvent(value)?.payload)
}

function readRuntimeStreamType(streamEvent: { event: string; data: unknown }) {
  if (streamEvent.event !== "runtime") return undefined
  return readString(readRuntimeStreamEvent(streamEvent.data)?.type)
}

export function isTerminalStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) {
    return runtimeType === "turn.completed" || runtimeType === "turn.failed" || runtimeType === "turn.cancelled"
  }

  return streamEvent.event === "done" || streamEvent.event === "error"
}

export function isCompletedStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) return runtimeType === "turn.completed"
  return streamEvent.event === "done"
}

export function isPermissionRequestStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) {
    if (runtimeType === "permission.requested" || runtimeType === "tool.call.waiting_approval") return true
  }

  if (streamEvent.event !== "part") return false
  const data = readRecord(streamEvent.data)
  const part = readRecord(data?.part)
  return readString(part?.type) === "permission" && readString(part?.action) === "ask"
}

export function isTaskStateStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) return runtimeType === "task.state.updated"

  if (streamEvent.event !== "part") return false
  const data = readRecord(streamEvent.data)
  const part = readRecord(data?.part)
  if (readString(part?.type) !== "tool") return false

  const state = readRecord(part?.state)
  const metadata = readRecord(state?.metadata)
  return readString(metadata?.kind) === "task-state"
}

function readStreamString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readStreamNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readStreamRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeTraceText(value: string | undefined) {
  return (value ?? "").trim()
}

function findMatchingTraceItemIndex(
  previousItems: AssistantTraceItem[],
  nextItem: AssistantTraceItem,
  usedIndices: Set<number>,
) {
  if (nextItem.sourceID) {
    const sourceMatchIndex = previousItems.findIndex(
      (item, index) => !usedIndices.has(index) && item.sourceID === nextItem.sourceID,
    )
    if (sourceMatchIndex !== -1) return sourceMatchIndex
  }

  const idMatchIndex = previousItems.findIndex(
    (item, index) => !usedIndices.has(index) && item.id === nextItem.id,
  )
  if (idMatchIndex !== -1) return idMatchIndex

  const nextText = normalizeTraceText(nextItem.text)
  if (nextText) {
    const textMatchIndex = previousItems.findIndex(
      (item, index) =>
        !usedIndices.has(index) &&
        item.kind === nextItem.kind &&
        normalizeTraceText(item.text) === nextText,
    )
    if (textMatchIndex !== -1) return textMatchIndex
  }

  const nextTitle = normalizeTraceText(nextItem.title)
  const nextDetail = normalizeTraceText(nextItem.detail)
  if (nextTitle || nextDetail || nextItem.status) {
    return previousItems.findIndex(
      (item, index) =>
        !usedIndices.has(index) &&
        item.kind === nextItem.kind &&
        normalizeTraceText(item.title) === nextTitle &&
        normalizeTraceText(item.detail) === nextDetail &&
        (item.status ?? "") === (nextItem.status ?? ""),
    )
  }

  return -1
}

function preserveTraceItemIdentity(
  previousItems: AssistantTraceItem[],
  nextItems: AssistantTraceItem[],
) {
  if (previousItems.length === 0 || nextItems.length === 0) return nextItems

  const usedIndices = new Set<number>()

  return nextItems.map((nextItem) => {
    const matchIndex = findMatchingTraceItemIndex(previousItems, nextItem, usedIndices)
    if (matchIndex === -1) return nextItem

    const previousItem = previousItems[matchIndex]
    if (!previousItem) return nextItem

    usedIndices.add(matchIndex)

    return {
      ...nextItem,
      id: previousItem.id,
      timestamp: previousItem.timestamp,
    }
  })
}

function isTerminalTraceStatus(status: AssistantTraceItem["status"]) {
  return status === "completed" || status === "error" || status === "denied"
}

function getToolTraceIdentity(item: AssistantTraceItem) {
  if (item.kind !== "tool") return null
  if (item.partID) return `part:${item.partID}`
  if (item.sourceID) return `source:${item.sourceID}`
  if (item.messageID && item.toolCallID) return `tool:${item.messageID}:${item.toolCallID}`
  if (item.toolCallID) return `tool:${item.toolCallID}`
  return null
}

function mergeTraceDebugEntries(
  first: AssistantTraceItem["debugEntries"],
  second: AssistantTraceItem["debugEntries"],
) {
  if (!first?.length) return second
  if (!second?.length) return first

  const seen = new Set<string>()
  const merged: NonNullable<AssistantTraceItem["debugEntries"]> = []
  for (const entry of [...first, ...second]) {
    const key = `${entry.label}\u0000${entry.value}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }
  return merged
}

function mergeAssistantTraceItem(existing: AssistantTraceItem, nextItem: AssistantTraceItem): AssistantTraceItem {
  const keepsTerminalToolState =
    existing.kind === "tool" &&
    nextItem.kind === "tool" &&
    isTerminalTraceStatus(existing.status) &&
    !isTerminalTraceStatus(nextItem.status)

  if (keepsTerminalToolState) {
    return {
      ...existing,
      messageID: existing.messageID ?? nextItem.messageID,
      partID: existing.partID ?? nextItem.partID,
      toolCallID: existing.toolCallID ?? nextItem.toolCallID,
      debugEntries: mergeTraceDebugEntries(existing.debugEntries, nextItem.debugEntries),
    }
  }

  return {
    ...existing,
    ...nextItem,
    id: existing.id,
    timestamp: existing.timestamp,
    debugEntries: mergeTraceDebugEntries(existing.debugEntries, nextItem.debugEntries),
  }
}

function upsertAssistantTraceItem(items: AssistantTraceItem[], nextItem: AssistantTraceItem) {
  const nextToolIdentity = getToolTraceIdentity(nextItem)
  const matchingIndices = items.reduce<number[]>((result, item, index) => {
    const matchesToolIdentity = nextToolIdentity && getToolTraceIdentity(item) === nextToolIdentity
    const matchesSource = nextItem.sourceID && item.sourceID && item.sourceID === nextItem.sourceID
    const matchesID = item.id === nextItem.id
    if (matchesToolIdentity || matchesSource || matchesID) {
      result.push(index)
    }
    return result
  }, [])

  if (matchingIndices.length === 0) {
    return [...items, nextItem]
  }

  const firstIndex = matchingIndices[0]
  const existing = items[firstIndex]
  if (!existing) return items

  const merged = mergeAssistantTraceItem(existing, nextItem)
  const duplicateIndices = new Set(matchingIndices.slice(1))
  return items.flatMap((item, index) => {
    if (index === firstIndex) return [merged]
    if (duplicateIndices.has(index)) return []
    return [item]
  })
}

function removeStaleApprovalBlockers(items: AssistantTraceItem[]) {
  const hasWaitingTool = items.some((item) => item.kind === "tool" && item.status === "waiting-approval")
  if (hasWaitingTool) return items

  return items.filter(
    (item) =>
      !(
        item.title === "Approval required" &&
        item.status === "pending" &&
        item.visibilityKey === "approvals"
      ),
  )
}

function mergeAssistantTraceItems(currentItems: AssistantTraceItem[], nextItems: AssistantTraceItem[]) {
  return removeStaleApprovalBlockers(
    nextItems.reduce((result, nextItem) => upsertAssistantTraceItem(result, nextItem), currentItems),
  )
}

function assistantRuntimeAfterTraceMerge(current: AssistantTurn, incoming: AssistantTurn, items: AssistantTraceItem[]) {
  const hasWaitingTool = items.some((item) => item.kind === "tool" && item.status === "waiting-approval")
  const hasActiveTool = items.some(
    (item) => item.kind === "tool" && (item.status === "pending" || item.status === "running"),
  )
  const existingRuntime = current.runtime
  const nextRuntime = incoming.runtime
  const updatedAt = Math.max(existingRuntime.updatedAt, nextRuntime.updatedAt)

  if (hasWaitingTool) {
    const waitingTool = items.find((item) => item.kind === "tool" && item.status === "waiting-approval")
    return {
      ...existingRuntime,
      ...nextRuntime,
      phase: "waiting_approval" as const,
      updatedAt,
      firstVisibleAt: existingRuntime.firstVisibleAt ?? nextRuntime.firstVisibleAt,
      toolName: waitingTool?.title ?? nextRuntime.toolName ?? existingRuntime.toolName,
    }
  }

  if (hasActiveTool) {
    const activeTool = items.find(
      (item) => item.kind === "tool" && (item.status === "pending" || item.status === "running"),
    )
    return {
      ...existingRuntime,
      ...nextRuntime,
      phase: "tool_running" as const,
      updatedAt,
      firstVisibleAt: existingRuntime.firstVisibleAt ?? nextRuntime.firstVisibleAt,
      toolName: activeTool?.title ?? nextRuntime.toolName ?? existingRuntime.toolName,
      approvalRequestID: undefined,
    }
  }

  if (existingRuntime.phase === "waiting_approval" || nextRuntime.phase === "waiting_approval") {
    return {
      ...existingRuntime,
      ...nextRuntime,
      phase: "completed" as const,
      updatedAt,
      firstVisibleAt: existingRuntime.firstVisibleAt ?? nextRuntime.firstVisibleAt,
      toolName: undefined,
      approvalRequestID: undefined,
      errorMessage: undefined,
    }
  }

  return {
    ...existingRuntime,
    ...nextRuntime,
    updatedAt,
    firstVisibleAt: existingRuntime.firstVisibleAt ?? nextRuntime.firstVisibleAt,
  }
}

function mergeAssistantTurnsByMessageID(current: AssistantTurn, incoming: AssistantTurn): AssistantTurn {
  const items = mergeAssistantTraceItems(current.items, incoming.items)
  const runtime = assistantRuntimeAfterTraceMerge(current, incoming, items)
  return {
    ...current,
    ...incoming,
    id: current.id,
    timestamp: current.timestamp,
    messageID: current.messageID ?? incoming.messageID,
    runtime,
    state:
      runtime.phase === "completed" && (current.runtime.phase === "waiting_approval" || incoming.runtime.phase === "waiting_approval")
        ? "Backend response received"
        : incoming.state || current.state,
    isStreaming: runtime.phase === "tool_running" || runtime.phase === "waiting_approval"
      ? incoming.isStreaming
      : false,
    items,
  }
}

export function reconcileConversationTurns(turns: Turn[]) {
  const result: Turn[] = []
  const assistantIndexByMessageID = new Map<string, number>()

  for (const turn of turns) {
    if (turn.kind !== "assistant" || !turn.messageID) {
      result.push(turn)
      continue
    }

    const existingIndex = assistantIndexByMessageID.get(turn.messageID)
    if (existingIndex === undefined) {
      assistantIndexByMessageID.set(turn.messageID, result.length)
      result.push({
        ...turn,
        items: removeStaleApprovalBlockers(turn.items),
      })
      continue
    }

    const existingTurn = result[existingIndex]
    if (!existingTurn || existingTurn.kind !== "assistant") {
      result.push(turn)
      continue
    }

    result[existingIndex] = mergeAssistantTurnsByMessageID(existingTurn, turn)
  }

  return result
}

function getAssistantTurnResponseText(turn: AssistantTurn) {
  return turn.items
    .filter((item) => item.kind === "text" || item.kind === "question")
    .map((item) => normalizeTraceText(item.text))
    .filter(Boolean)
    .join("\n\n")
}

function getAssistantTurnSourceIDs(turn: AssistantTurn) {
  return new Set(
    turn.items
      .map((item) => item.sourceID)
      .filter((sourceID): sourceID is string => Boolean(sourceID)),
  )
}

function assistantTurnsAreCompatible(previousTurn: AssistantTurn, nextTurn: AssistantTurn) {
  if (previousTurn.id === nextTurn.id) return true

  const previousSourceIDs = getAssistantTurnSourceIDs(previousTurn)
  if (previousSourceIDs.size > 0) {
    for (const sourceID of getAssistantTurnSourceIDs(nextTurn)) {
      if (previousSourceIDs.has(sourceID)) return true
    }
  }

  const previousResponseText = getAssistantTurnResponseText(previousTurn)
  const nextResponseText = getAssistantTurnResponseText(nextTurn)
  return Boolean(previousResponseText && previousResponseText === nextResponseText)
}

function findMatchingAssistantTurnIndex(
  previousAssistantTurns: AssistantTurn[],
  nextTurn: AssistantTurn,
  preferredIndex: number,
  usedIndices: Set<number>,
) {
  const idMatchIndex = previousAssistantTurns.findIndex(
    (turn, index) => !usedIndices.has(index) && turn.id === nextTurn.id,
  )
  if (idMatchIndex !== -1) return idMatchIndex

  const preferredTurn = previousAssistantTurns[preferredIndex]
  if (
    preferredTurn &&
    !usedIndices.has(preferredIndex) &&
    assistantTurnsAreCompatible(preferredTurn, nextTurn)
  ) {
    return preferredIndex
  }

  return previousAssistantTurns.findIndex(
    (turn, index) => !usedIndices.has(index) && assistantTurnsAreCompatible(turn, nextTurn),
  )
}

function preserveAssistantTurnIdentity(previousTurns: Turn[], nextTurns: Turn[]) {
  const previousAssistantTurns = previousTurns.filter((turn): turn is AssistantTurn => turn.kind === "assistant")
  if (previousAssistantTurns.length === 0) return nextTurns

  const usedIndices = new Set<number>()
  let nextAssistantIndex = 0

  return nextTurns.map((turn) => {
    if (turn.kind !== "assistant") return turn

    const matchIndex = findMatchingAssistantTurnIndex(
      previousAssistantTurns,
      turn,
      nextAssistantIndex,
      usedIndices,
    )
    nextAssistantIndex += 1

    if (matchIndex === -1) return turn

    const previousTurn = previousAssistantTurns[matchIndex]
    if (!previousTurn) return turn

    usedIndices.add(matchIndex)

    return {
      ...turn,
      id: previousTurn.id,
      items: preserveTraceItemIdentity(previousTurn.items, turn.items),
    }
  })
}

export function mergeConversationTurnsFromHistory(previousTurns: Turn[], nextTurns: Turn[]) {
  return preserveAssistantTurnIdentity(previousTurns, mergeUserTurnPresentationState(previousTurns, nextTurns))
}

function readSessionContextUsageFromMessageInfo(value: unknown): SessionContextUsage | null {
  const message = readStreamRecord(value)
  if (!message || readStreamString(message.role) !== "assistant") return null

  const tokens = readStreamRecord(message.tokens)
  if (!tokens) return null

  const inputTokens = readStreamNumber(tokens.input) ?? 0
  const outputTokens = readStreamNumber(tokens.output) ?? 0
  const reasoningTokens = readStreamNumber(tokens.reasoning) ?? 0
  const cache = readStreamRecord(tokens.cache)
  const cacheReadTokens = readStreamNumber(cache?.read) ?? 0
  const cacheWriteTokens = readStreamNumber(cache?.write) ?? 0
  const totalTokens = inputTokens + outputTokens

  if (inputTokens <= 0 && outputTokens <= 0 && reasoningTokens <= 0 && cacheReadTokens <= 0 && cacheWriteTokens <= 0) {
    return null
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    measuredAt: readStreamNumber(message.completed) ?? readStreamNumber(message.created) ?? Date.now(),
  }
}

export function readSessionContextUsageFromDoneEventData(value: unknown) {
  const runtimePayload = readRuntimeStreamPayload(value)
  if (runtimePayload) {
    return readSessionContextUsageFromMessageInfo(runtimePayload.message)
  }

  const payload = readStreamRecord(value)
  return readSessionContextUsageFromMessageInfo(payload?.message)
}

export function readLatestSessionContextUsageFromHistory(messages: LoadedSessionHistoryMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = readSessionContextUsageFromMessageInfo(messages[index]?.info)
    if (usage) return usage
  }

  return null
}

export function resolveStreamCursor(event: { id?: string; data: unknown }) {
  const runtimeEvent = readRuntimeStreamEvent(event.data)
  if (runtimeEvent) {
    return event.id || readStreamString(runtimeEvent.eventID)
  }

  const payload = readStreamRecord(event.data)
  return readStreamString(payload?.cursor) || event.id || ""
}

export function resolveStreamTurnID(event: { data: unknown }) {
  const runtimeEvent = readRuntimeStreamEvent(event.data)
  if (runtimeEvent) {
    return readStreamString(runtimeEvent.turnID) || undefined
  }

  const payload = readStreamRecord(event.data)
  return readStreamString(payload?.turnID) || undefined
}

function readMessageIDFromStreamPart(value: unknown) {
  const part = readStreamRecord(value)
  return readStreamString(part?.messageID) || undefined
}

export function resolveStreamMessageID(event: { data: unknown }) {
  const runtimePayload = readRuntimeStreamPayload(event.data)
  const payload = runtimePayload ?? readStreamRecord(event.data)
  if (!payload) return undefined

  const partMessageID = readMessageIDFromStreamPart(payload.part)
  if (partMessageID) return partMessageID

  const message = readStreamRecord(payload.message)
  const messageID = readStreamString(message?.id)
  if (messageID) return messageID

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const partListMessageID = readMessageIDFromStreamPart(part)
      if (partListMessageID) return partListMessageID
    }
  }

  return undefined
}

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

interface UseSessionStreamControllerOptions {
  activeSessionID: string | null
  agentConnected: boolean
  agentDefaultDirectory: string
  agentSessionStoreRef: MutableRefObject<{
    dispatch(action: { type: "subscription.state"; event: Extract<AgentSessionBridgeEvent, { kind: "subscription-state" }> } | { type: "session.cleanup"; sessionID: string } | { type: "subscription.remove"; backendSessionID: string }): void
  }>
  agentSessions: Record<string, string>
  canLoadSessionHistory: boolean
  contextUsageBySession: Record<string, SessionContextUsage>
  conversationVersionRef: MutableRefObject<Record<string, number>>
  conversations: Record<string, Turn[]>
  historyRequestRef: MutableRefObject<number>
  openCanvasSessionIDs: string[]
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  permissionRequestsRequestRef: MutableRefObject<Record<string, number>>
  platform: string
  runtimeDebugRefreshTimerRef: MutableRefObject<Record<string, number>>
  runtimeDebugRequestRef: MutableRefObject<Record<string, number>>
  sessionDiffBySession: Record<string, SessionDiffSummary>
  sessionDiffRefreshTimerRef: MutableRefObject<Record<string, number>>
  sessionDiffRequestRef: MutableRefObject<Record<string, number>>
  sessionDirectoryBySession: Record<string, string>
  sessionEventRouterRef: MutableRefObject<AgentSessionEventRouter>
  sessionRuntimeDebugBySession: Record<string, SessionRuntimeDebugSnapshot>
  setAgentSessions: StateSetter<Record<string, string>>
  setCanLoadSessionHistory: StateSetter<boolean>
  setContextUsageBySession: StateSetter<Record<string, SessionContextUsage>>
  setConversations: StateSetter<Record<string, Turn[]>>
  setPendingPermissionRequestsBySession: StateSetter<Record<string, PermissionRequest[]>>
  setSessionDiffBySession: StateSetter<Record<string, SessionDiffSummary>>
  setSessionDiffStateBySession: StateSetter<Record<string, SessionDiffState>>
  setSessionDirectoryBySession: StateSetter<Record<string, string>>
  setSessionRuntimeDebugBySession: StateSetter<Record<string, SessionRuntimeDebugSnapshot>>
  setSessionRuntimeDebugStateBySession: StateSetter<Record<string, SessionRuntimeDebugState>>
  setWorkspaces: StateSetter<WorkspaceGroup[]>
  skipNextHistoryLoadRef: MutableRefObject<Record<string, boolean>>
  subscribedSessionStreamsRef: MutableRefObject<Record<string, string>>
  workspaceRefreshRequestRef: MutableRefObject<Record<string, number>>
  workspaces: WorkspaceGroup[]
}

export function useSessionStreamController({
  activeSessionID,
  agentConnected,
  agentDefaultDirectory,
  agentSessionStoreRef,
  agentSessions,
  canLoadSessionHistory,
  conversationVersionRef,
  conversations,
  historyRequestRef,
  openCanvasSessionIDs,
  pendingStreamsRef,
  permissionRequestsRequestRef,
  platform,
  runtimeDebugRefreshTimerRef,
  runtimeDebugRequestRef,
  sessionDiffBySession,
  sessionDiffRefreshTimerRef,
  sessionDiffRequestRef,
  sessionDirectoryBySession,
  sessionEventRouterRef,
  sessionRuntimeDebugBySession,
  setAgentSessions,
  setCanLoadSessionHistory,
  setContextUsageBySession,
  setConversations,
  setPendingPermissionRequestsBySession,
  setSessionDiffBySession,
  setSessionDiffStateBySession,
  setSessionDirectoryBySession,
  setSessionRuntimeDebugBySession,
  setSessionRuntimeDebugStateBySession,
  setWorkspaces,
  skipNextHistoryLoadRef,
  subscribedSessionStreamsRef,
  workspaceRefreshRequestRef,
  workspaces,
}: UseSessionStreamControllerOptions) {
  function updateSessionContextUsage(sessionID: string, usage: SessionContextUsage | null) {
    setContextUsageBySession((prev) => {
      if (!usage) {
        if (!(sessionID in prev)) return prev
        const next = { ...prev }
        delete next[sessionID]
        return next
      }

      const current = prev[sessionID]
      if (
        current &&
        current.inputTokens === usage.inputTokens &&
        current.outputTokens === usage.outputTokens &&
        current.totalTokens === usage.totalTokens &&
        current.reasoningTokens === usage.reasoningTokens &&
        current.cacheReadTokens === usage.cacheReadTokens &&
        current.cacheWriteTokens === usage.cacheWriteTokens &&
        current.measuredAt === usage.measuredAt
      ) {
        return prev
      }

      return {
        ...prev,
        [sessionID]: usage,
      }
    })
  }

  function syncSessionContextUsageFromHistory(sessionID: string, usage: SessionContextUsage | null) {
    setContextUsageBySession((prev) => {
      if (!usage) {
        return prev
      }

      const current = prev[sessionID]
      if (
        current &&
        current.inputTokens === usage.inputTokens &&
        current.outputTokens === usage.outputTokens &&
        current.totalTokens === usage.totalTokens &&
        current.reasoningTokens === usage.reasoningTokens &&
        current.cacheReadTokens === usage.cacheReadTokens &&
        current.cacheWriteTokens === usage.cacheWriteTokens &&
        current.measuredAt === usage.measuredAt
      ) {
        return prev
      }

      return {
        ...prev,
        [sessionID]: usage,
      }
    })
  }

  function bumpConversationVersion(sessionID: string) {
    conversationVersionRef.current[sessionID] = (conversationVersionRef.current[sessionID] ?? 0) + 1
  }

  function clearSessionDiffRefreshTimer(sessionID: string) {
    clearSessionDiffRefreshTimerService(sessionID, sessionDiffRefreshTimerRef)
  }

  function scheduleSessionDiffRefreshForSession(sessionID: string) {
    scheduleSessionDiffRefreshForSessionService({
      loadSessionDiffForSession,
      sessionDiffRefreshTimerRef,
      sessionID,
    })
  }

  function clearRuntimeDebugRefreshTimer(sessionID: string) {
    clearRuntimeDebugRefreshTimerService(sessionID, runtimeDebugRefreshTimerRef)
  }

  async function refreshWorkspaceFromDirectory(directory: string) {
    return refreshWorkspaceFromDirectoryService({
      directory,
      setAgentSessions,
      setCanLoadSessionHistory,
      setConversations,
      setSessionDirectoryBySession,
      setWorkspaces,
      workspaceRefreshRequestRef,
    })
  }

  function refreshWorkspaceForSession(sessionID: string) {
    const { workspace } = findSession(workspaces, sessionID)
    if (!workspace) return
    void refreshWorkspaceFromDirectory(workspace.directory)
  }

  function resolveUISessionID(backendSessionID: string) {
    const directMatch = agentSessions[backendSessionID]
    if (directMatch === backendSessionID || conversations[backendSessionID]) {
      return backendSessionID
    }

    for (const [uiSessionID, mappedBackendSessionID] of Object.entries(agentSessions)) {
      if (mappedBackendSessionID === backendSessionID) {
        return uiSessionID
      }
    }

    return conversations[backendSessionID] ? backendSessionID : null
  }

  function resolveBackendSessionID(sessionID: string) {
    return agentSessions[sessionID] ?? sessionID
  }

  function findAssistantTurnIDByMessageID(sessionID: string, messageID: string | undefined) {
    if (!messageID) return undefined
    const turn = conversations[sessionID]?.find(
      (candidate): candidate is AssistantTurn => candidate.kind === "assistant" && candidate.messageID === messageID,
    )
    return turn?.id
  }

  function cleanupTurnTarget(backendSessionID: string | undefined, turnID: string | undefined) {
    sessionEventRouterRef.current.cleanupTurnTarget(backendSessionID, turnID)
  }

  function cleanupPendingStreamsForBackendTurn(backendSessionID: string | undefined, turnID: string | undefined) {
    if (!backendSessionID || !turnID) return

    for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
      if (target.backendSessionID === backendSessionID && target.backendTurnID === turnID) {
        delete pendingStreamsRef.current[streamID]
      }
    }
  }

  function replaceConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => ({
      ...prev,
      [sessionID]: reconcileConversationTurns(nextTurns),
    }))
  }

  function appendConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => {
      const next = appendConversationTurnsToMap(prev, sessionID, nextTurns)
      next[sessionID] = reconcileConversationTurns(next[sessionID] ?? [])
      persistUserTurns(sessionID, next[sessionID] ?? [])
      return next
    })
  }

  function updateAssistantConversationTurn(
    sessionID: string,
    turnID: string,
    updater: Parameters<typeof updateAssistantTurnInMap>[3],
  ) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => {
      const next = updateAssistantTurnInMap(prev, sessionID, turnID, updater)
      if (next === prev) return prev
      return {
        ...next,
        [sessionID]: reconcileConversationTurns(next[sessionID] ?? []),
      }
    })
  }

  function replaceConversationTurnsFromHistory(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => {
      const previousTurns = prev[sessionID]?.length ? prev[sessionID] : readPersistedUserTurns(sessionID)
      const mergedTurns = reconcileConversationTurns(mergeConversationTurnsFromHistory(previousTurns, nextTurns))
      persistUserTurns(sessionID, mergedTurns)
      return {
        ...prev,
        [sessionID]: mergedTurns,
      }
    })
  }

  function ensureAssistantTurnForBackendTurn(input: {
    uiSessionID: string
    backendSessionID: string
    turnID: string
  }) {
    const existing = sessionEventRouterRef.current.getTurnTarget(input.backendSessionID, input.turnID)
    if (existing) {
      return existing.assistantTurnID
    }

    const pending = Object.values(pendingStreamsRef.current).find(
      (target) =>
        target.sessionID === input.uiSessionID &&
        target.backendSessionID === input.backendSessionID &&
        (!target.backendTurnID || target.backendTurnID === input.turnID),
    )

    if (pending) {
      pending.backendTurnID = input.turnID
      sessionEventRouterRef.current.setTurnTarget(input.backendSessionID, input.turnID, {
        sessionID: input.uiSessionID,
        assistantTurnID: pending.assistantTurnID,
      })
      return pending.assistantTurnID
    }

    const streamingTurn = buildSessionStreamingAssistantTurn()
    sessionEventRouterRef.current.setTurnTarget(input.backendSessionID, input.turnID, {
      sessionID: input.uiSessionID,
      assistantTurnID: streamingTurn.id,
    })

    appendConversationTurns(input.uiSessionID, [streamingTurn])

    return streamingTurn.id
  }

  function handleRequestStreamEvent(streamEvent: AgentStreamIPCEvent) {
    const target = pendingStreamsRef.current[streamEvent.streamID]
    if (!target) return

    const cursor = resolveStreamCursor(streamEvent)
    if (cursor && sessionEventRouterRef.current.rememberSeenCursor(target.sessionID, cursor)) {
      const backendTurnID = resolveStreamTurnID(streamEvent)
      const backendSessionID = target.backendSessionID ?? resolveBackendSessionID(target.sessionID)
      if (backendTurnID && isTerminalStreamEvent(streamEvent)) {
        delete pendingStreamsRef.current[streamEvent.streamID]
        cleanupTurnTarget(backendSessionID, backendTurnID)
      }
      return
    }

    const backendTurnID = resolveStreamTurnID(streamEvent)
    const streamMessageID = resolveStreamMessageID(streamEvent)
    const messageAssistantTurnID = findAssistantTurnIDByMessageID(target.sessionID, streamMessageID)
    if (backendTurnID) {
      const backendSessionID = target.backendSessionID ?? resolveBackendSessionID(target.sessionID)
      if (sessionEventRouterRef.current.hasBackendTurnSettled(backendSessionID, backendTurnID)) {
        delete pendingStreamsRef.current[streamEvent.streamID]
        cleanupTurnTarget(backendSessionID, backendTurnID)
        return
      }

      target.backendSessionID = backendSessionID
      target.backendTurnID = backendTurnID
      sessionEventRouterRef.current.setTurnTarget(backendSessionID, backendTurnID, {
        sessionID: target.sessionID,
        assistantTurnID: messageAssistantTurnID ?? target.assistantTurnID,
      })
    }

    const assistantTurnID = messageAssistantTurnID ?? target.assistantTurnID
    startTransition(() => {
      updateAssistantConversationTurn(target.sessionID, assistantTurnID, (turn) =>
        applyAgentStreamEventToTurn(turn, streamEvent),
      )
    })

    if (isPermissionRequestStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(target.sessionID)
      void loadPendingPermissionRequestsForSession(target.sessionID).catch((error) => {
        console.error("[desktop] stream permission request refresh failed:", error)
      })
    }

    if (isTaskStateStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(target.sessionID)
    }

    scheduleRuntimeDebugRefresh(
      target.sessionID,
      target.backendSessionID ?? resolveBackendSessionID(target.sessionID),
    )

    if (isTerminalStreamEvent(streamEvent)) {
      if (isCompletedStreamEvent(streamEvent)) {
        updateSessionContextUsage(target.sessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
      sessionEventRouterRef.current.markBackendTurnSettled(target.backendSessionID, target.backendTurnID)
      delete pendingStreamsRef.current[streamEvent.streamID]
      cleanupTurnTarget(target.backendSessionID, target.backendTurnID)
      refreshWorkspaceForSession(target.sessionID)

      if (canLoadSessionHistory) {
        void reloadSessionHistoryForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream history refresh failed:", error)
        })
        void loadSessionDiffForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream diff refresh failed:", error)
        })
        void loadPendingPermissionRequestsForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream permission refresh failed:", error)
        })
      }
    }
  }

  function handleSessionStreamEvent(streamEvent: AgentSessionStreamIPCEvent) {
    const uiSessionID = resolveUISessionID(streamEvent.sessionID)
    if (!uiSessionID) return

    const cursor = resolveStreamCursor(streamEvent)
    if (cursor && sessionEventRouterRef.current.rememberSeenCursor(uiSessionID, cursor)) {
      return
    }

    const backendTurnID = resolveStreamTurnID(streamEvent)
    if (!backendTurnID) {
      if (isTerminalStreamEvent(streamEvent)) {
        if (isCompletedStreamEvent(streamEvent)) {
          updateSessionContextUsage(uiSessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
        }
        refreshWorkspaceForSession(uiSessionID)
        scheduleRuntimeDebugRefresh(uiSessionID, streamEvent.sessionID)
        void reloadSessionHistoryForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream history refresh failed:", error)
        })
      }
      return
    }

    if (sessionEventRouterRef.current.hasBackendTurnSettled(streamEvent.sessionID, backendTurnID)) return

    const streamMessageID = resolveStreamMessageID(streamEvent)
    const messageAssistantTurnID = findAssistantTurnIDByMessageID(uiSessionID, streamMessageID)
    const assistantTurnID = messageAssistantTurnID ?? ensureAssistantTurnForBackendTurn({
      uiSessionID,
      backendSessionID: streamEvent.sessionID,
      turnID: backendTurnID,
    })
    if (messageAssistantTurnID) {
      sessionEventRouterRef.current.setTurnTarget(streamEvent.sessionID, backendTurnID, {
        sessionID: uiSessionID,
        assistantTurnID: messageAssistantTurnID,
      })
    }

    startTransition(() => {
      updateAssistantConversationTurn(uiSessionID, assistantTurnID, (turn) => applyAgentStreamEventToTurn(turn, streamEvent))
    })

    if (isPermissionRequestStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(uiSessionID)
      void loadPendingPermissionRequestsForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
        console.error("[desktop] session stream permission request refresh failed:", error)
      })
    }

    if (isTaskStateStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(uiSessionID)
    }

    scheduleRuntimeDebugRefresh(uiSessionID, streamEvent.sessionID)

    if (isTerminalStreamEvent(streamEvent)) {
      if (isCompletedStreamEvent(streamEvent)) {
        updateSessionContextUsage(uiSessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
      sessionEventRouterRef.current.markBackendTurnSettled(streamEvent.sessionID, backendTurnID)
      cleanupPendingStreamsForBackendTurn(streamEvent.sessionID, backendTurnID)
      cleanupTurnTarget(streamEvent.sessionID, backendTurnID)
      refreshWorkspaceForSession(uiSessionID)
      if (canLoadSessionHistory) {
        void reloadSessionHistoryForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream history refresh failed:", error)
        })
        void loadSessionDiffForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream diff refresh failed:", error)
        })
        void loadPendingPermissionRequestsForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream permission refresh failed:", error)
        })
      }
    }
  }

  function handleAgentSessionBridgeEvent(sessionEvent: AgentSessionBridgeEvent) {
    if (sessionEvent.kind === "subscription-state") {
      agentSessionStoreRef.current.dispatch({
        type: "subscription.state",
        event: sessionEvent,
      })
      return
    }

    if (sessionEvent.source === "request") {
      if (!sessionEvent.clientTurnID) return
      handleRequestStreamEvent({
        streamID: sessionEvent.clientTurnID,
        id: sessionEvent.id,
        event: sessionEvent.event,
        data: sessionEvent.data,
      })
      return
    }

    handleSessionStreamEvent({
      sessionID: sessionEvent.backendSessionID,
      id: sessionEvent.id,
      event: sessionEvent.event,
      data: sessionEvent.data,
    })
  }

  async function reloadSessionHistoryForSession(sessionID: string, backendSessionID = resolveBackendSessionID(sessionID)) {
    const agentSession = getAgentSessionBridge()
    if (!agentSession) return

    const messages = await agentSession.loadHistory({ backendSessionID })
    const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)
    startTransition(() => {
      replaceConversationTurnsFromHistory(sessionID, buildTurnsFromHistory(messages))
      syncSessionContextUsageFromHistory(sessionID, nextContextUsage)
    })
  }

  async function loadSessionDiffForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    await loadSessionDiffForSessionService({
      backendSessionID,
      sessionDiffBySession,
      sessionDiffRefreshTimerRef,
      sessionDiffRequestRef,
      sessionID,
      setSessionDiffBySession,
      setSessionDiffStateBySession,
    })
  }

  async function loadSessionRuntimeDebugForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
    options?: {
      limit?: number
      turns?: number
    },
  ) {
    await loadSessionRuntimeDebugForSessionService({
      backendSessionID,
      runtimeDebugRefreshTimerRef,
      runtimeDebugRequestRef,
      sessionID,
      sessionRuntimeDebugBySession,
      setSessionRuntimeDebugBySession,
      setSessionRuntimeDebugStateBySession,
      options,
    })
  }

  function scheduleRuntimeDebugRefresh(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
    delayMs = 160,
  ) {
    scheduleRuntimeDebugRefreshService({
      backendSessionID,
      delayMs,
      loadSessionRuntimeDebugForSession,
      runtimeDebugRefreshTimerRef,
      sessionID,
    })
  }

  async function loadPendingPermissionRequestsForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    await loadPendingPermissionRequestsForSessionService({
      backendSessionID,
      permissionRequestsRequestRef,
      sessionID,
      setPendingPermissionRequestsBySession,
    })
  }

  const handleAgentSessionBridgeEventEffect = useEffectEvent((sessionEvent: AgentSessionBridgeEvent) => {
    handleAgentSessionBridgeEvent(sessionEvent)
  })

  useAgentSessionStreamEffects({
    agentConnected,
    agentSessions,
    canLoadSessionHistory,
    openCanvasSessionIDs,
    pendingStreamsRef,
    resolveBackendSessionID,
    subscribedSessionStreamsRef,
    onSessionEvent: handleAgentSessionBridgeEventEffect,
  })

  useEffect(() => {
    const agentSession = getAgentSessionBridge()
    if (!canLoadSessionHistory || !activeSessionID || !agentSession) return

    if (skipNextHistoryLoadRef.current[activeSessionID]) {
      delete skipNextHistoryLoadRef.current[activeSessionID]
      return
    }

    let cancelled = false
    const sessionID = activeSessionID
    const backendSessionID = resolveBackendSessionID(sessionID)
    const requestID = ++historyRequestRef.current
    const baselineVersion = conversationVersionRef.current[sessionID] ?? 0

    agentSession.loadHistory({ backendSessionID })
      .then((messages) => {
        if (cancelled || historyRequestRef.current !== requestID) return
        if ((conversationVersionRef.current[sessionID] ?? 0) !== baselineVersion) return
        const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)

        startTransition(() => {
          replaceConversationTurnsFromHistory(sessionID, buildTurnsFromHistory(messages))
          updateSessionContextUsage(sessionID, nextContextUsage)
        })
      })
      .catch((error) => {
        console.error("[desktop] agentSession.loadHistory failed:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeSessionID, canLoadSessionHistory])

  useActiveSessionReviewEffects({
    activeSessionID,
    agentSessions,
    canLoadSessionHistory,
    loadPendingPermissionRequestsForSession,
    loadSessionDiffForSession,
    loadSessionRuntimeDebugForSession,
  })

  useReviewRefreshCleanupEffect({
    clearRuntimeDebugRefreshTimer,
    clearSessionDiffRefreshTimer,
    runtimeDebugRefreshTimerRef,
    sessionDiffRefreshTimerRef,
  })

  return {
    appendConversationTurns,
    clearRuntimeDebugRefreshTimer,
    clearSessionDiffRefreshTimer,
    loadPendingPermissionRequestsForSession,
    loadSessionDiffForSession,
    loadSessionRuntimeDebugForSession,
    refreshWorkspaceForSession,
    refreshWorkspaceFromDirectory,
    reloadSessionHistoryForSession,
    replaceConversationTurns,
    resolveBackendSessionID,
    scheduleRuntimeDebugRefresh,
    scheduleSessionDiffRefreshForSession,
    updateAssistantConversationTurn,
    updateSessionContextUsage,
  }
}
