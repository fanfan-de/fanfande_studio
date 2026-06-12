import { type SetStateAction, useRef, useSyncExternalStore } from "react"
import type { AssistantTraceItem, AssistantTurn, Turn } from "../types"

export type ConversationMap = Record<string, Turn[]>
export type ConversationStoreUpdater = SetStateAction<ConversationMap>

export interface ConversationActivity {
  hasStreamingAssistantTurn: boolean
  turnCount: number
}

export type ConversationActivityMap = Record<string, ConversationActivity>

interface NormalizedSessionConversation {
  activity: ConversationActivity
  traceItemsByTurnID: Record<string, AssistantTraceItem[]>
  turnByID: Record<string, Turn>
  turnIDs: string[]
  turns: Turn[]
}

export interface ConversationStoreApi {
  appendAssistantDelta: (
    sessionID: string,
    turnID: string,
    updater: (turn: AssistantTurn) => AssistantTurn,
  ) => boolean
  getActivityBySession: () => ConversationActivityMap
  getConversations: () => ConversationMap
  getSessionActivity: (sessionID: string | null | undefined) => ConversationActivity
  getSessionTurns: (sessionID: string | null | undefined) => Turn[]
  hasSession: (sessionID: string | null | undefined) => boolean
  replaceConversations: (nextConversations: ConversationMap) => boolean
  replaceTraceItem: (
    sessionID: string,
    turnID: string,
    itemID: string,
    item: AssistantTraceItem,
  ) => boolean
  subscribe: (listener: () => void) => () => void
  subscribeSession: (sessionID: string | null | undefined, listener: () => void) => () => void
  updateConversations: (update: ConversationStoreUpdater) => boolean
}

interface ThreadDebugWatchOptions {
  intervalMs?: number
  sessionID?: string | null
}

interface ThreadDebugAssistantTurnSnapshot {
  sessionID: string
  turn: AssistantTurn
}

interface ThreadDebugApi {
  getConversations: () => ConversationMap
  getSessionTurns: (sessionID: string) => Turn[]
  getStreamingTurns: (sessionID?: string | null) => ThreadDebugAssistantTurnSnapshot[]
  latestStreaming: (sessionID?: string | null) => ThreadDebugAssistantTurnSnapshot | null
  sessionIDs: () => string[]
  unwatch: () => void
  watch: (options?: ThreadDebugWatchOptions | string | null) => () => void
}

declare global {
  interface Window {
    __ANYBOX_THREAD_DEBUG__?: ThreadDebugApi
  }
}

const EMPTY_TURNS: Turn[] = []
const EMPTY_CONVERSATION_ACTIVITY: ConversationActivity = {
  hasStreamingAssistantTurn: false,
  turnCount: 0,
}

function resolveConversationUpdate(current: ConversationMap, update: ConversationStoreUpdater) {
  return typeof update === "function" ? (update as (value: ConversationMap) => ConversationMap)(current) : update
}

function createSessionConversation(turns: Turn[]): NormalizedSessionConversation {
  const turnByID: Record<string, Turn> = {}
  const traceItemsByTurnID: Record<string, AssistantTraceItem[]> = {}
  const turnIDs: string[] = []
  let hasStreamingAssistantTurn = false

  for (const turn of turns) {
    turnIDs.push(turn.id)
    turnByID[turn.id] = turn
    if (turn.kind === "assistant") {
      traceItemsByTurnID[turn.id] = turn.items
      hasStreamingAssistantTurn ||= Boolean(turn.isStreaming)
    }
  }

  return {
    activity: {
      hasStreamingAssistantTurn,
      turnCount: turns.length,
    },
    traceItemsByTurnID,
    turnByID,
    turnIDs,
    turns,
  }
}

function conversationActivityIsEqual(left: ConversationActivity, right: ConversationActivity) {
  return left.hasStreamingAssistantTurn === right.hasStreamingAssistantTurn && left.turnCount === right.turnCount
}

function conversationActivityMapsAreEqual(left: ConversationActivityMap, right: ConversationActivityMap) {
  if (Object.is(left, right)) return true
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => {
    const leftValue = left[key]
    const rightValue = right[key]
    return Boolean(rightValue && conversationActivityIsEqual(leftValue, rightValue))
  })
}

function conversationsAreEquivalent(left: ConversationMap, right: ConversationMap) {
  if (Object.is(left, right)) return true
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Object.is(left[key], right[key]))
}

function cloneThreadDebugValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function readThreadDebugWatchOptions(input?: ThreadDebugWatchOptions | string | null): Required<ThreadDebugWatchOptions> {
  if (typeof input === "string") {
    return {
      intervalMs: 250,
      sessionID: input,
    }
  }

  return {
    intervalMs: Math.max(0, Number(input?.intervalMs ?? 250)),
    sessionID: input?.sessionID ?? null,
  }
}

function findStreamingAssistantTurns(conversations: ConversationMap, sessionID?: string | null) {
  const snapshots: ThreadDebugAssistantTurnSnapshot[] = []
  const entries = sessionID
    ? ([[sessionID, conversations[sessionID] ?? EMPTY_TURNS]] as Array<[string, Turn[]]>)
    : Object.entries(conversations)

  for (const [currentSessionID, turns] of entries) {
    for (const turn of turns) {
      if (turn.kind === "assistant" && turn.isStreaming) {
        snapshots.push({ sessionID: currentSessionID, turn })
      }
    }
  }

  return snapshots
}

function findLatestStreamingAssistantTurn(conversations: ConversationMap, sessionID?: string | null) {
  const snapshots = findStreamingAssistantTurns(conversations, sessionID)
  return snapshots.reduce<ThreadDebugAssistantTurnSnapshot | null>((latest, snapshot) => {
    if (!latest) return snapshot
    const latestUpdatedAt = latest.turn.runtime.updatedAt || latest.turn.timestamp
    const snapshotUpdatedAt = snapshot.turn.runtime.updatedAt || snapshot.turn.timestamp
    return snapshotUpdatedAt >= latestUpdatedAt ? snapshot : latest
  }, null)
}

function installThreadDebugApi(store: ConversationStoreApi) {
  if (typeof window === "undefined") return

  window.__ANYBOX_THREAD_DEBUG__?.unwatch()

  let watchUnsubscribe: (() => void) | null = null
  let watchTimer: number | null = null
  let lastWatchSignature = ""

  const readLatestStreamingSnapshot = (sessionID?: string | null) =>
    findLatestStreamingAssistantTurn(store.getConversations(), sessionID)

  const cloneSnapshot = <T,>(value: T): T => cloneThreadDebugValue(value)

  const api: ThreadDebugApi = {
    getConversations() {
      return cloneSnapshot(store.getConversations())
    },
    getSessionTurns(sessionID) {
      return cloneSnapshot(store.getSessionTurns(sessionID))
    },
    getStreamingTurns(sessionID) {
      return cloneSnapshot(findStreamingAssistantTurns(store.getConversations(), sessionID))
    },
    latestStreaming(sessionID) {
      return cloneSnapshot(readLatestStreamingSnapshot(sessionID))
    },
    sessionIDs() {
      return Object.keys(store.getConversations())
    },
    unwatch() {
      if (watchTimer !== null) {
        window.clearTimeout(watchTimer)
        watchTimer = null
      }
      watchUnsubscribe?.()
      watchUnsubscribe = null
      lastWatchSignature = ""
    },
    watch(input) {
      const options = readThreadDebugWatchOptions(input)

      api.unwatch()

      const emit = () => {
        watchTimer = null
        const snapshot = readLatestStreamingSnapshot(options.sessionID)
        const signature = JSON.stringify(snapshot)
        if (signature === lastWatchSignature) return

        lastWatchSignature = signature
        console.log("[anybox thread debug] latest streaming assistant turn", cloneSnapshot(snapshot))
      }

      const scheduleEmit = () => {
        if (options.intervalMs === 0) {
          emit()
          return
        }
        if (watchTimer !== null) return
        watchTimer = window.setTimeout(emit, options.intervalMs)
      }

      watchUnsubscribe = store.subscribe(scheduleEmit)
      emit()
      return api.unwatch
    },
  }

  window.__ANYBOX_THREAD_DEBUG__ = api
}

export function createConversationStore(initialConversations: ConversationMap = {}): ConversationStoreApi {
  let conversations: ConversationMap = {}
  let activityBySession: ConversationActivityMap = {}
  const sessions = new Map<string, NormalizedSessionConversation>()
  const listeners = new Set<() => void>()
  const sessionListeners = new Map<string, Set<() => void>>()

  function rebuildFromConversations(nextConversations: ConversationMap) {
    const previousConversations = conversations
    const previousActivityBySession = activityBySession
    const changedSessionIDs = new Set<string>()
    const nextActivityBySession: ConversationActivityMap = {}

    for (const sessionID of Object.keys(previousConversations)) {
      if (!Object.prototype.hasOwnProperty.call(nextConversations, sessionID)) {
        sessions.delete(sessionID)
        changedSessionIDs.add(sessionID)
      }
    }

    for (const [sessionID, turns] of Object.entries(nextConversations)) {
      const previousSession = sessions.get(sessionID)
      if (!previousSession || !Object.is(previousSession.turns, turns)) {
        const nextSession = createSessionConversation(turns)
        sessions.set(sessionID, nextSession)
        changedSessionIDs.add(sessionID)
        nextActivityBySession[sessionID] = nextSession.activity
        continue
      }

      nextActivityBySession[sessionID] = previousSession.activity
    }

    conversations = nextConversations
    activityBySession = nextActivityBySession

    return {
      activityChanged: !conversationActivityMapsAreEqual(previousActivityBySession, nextActivityBySession),
      changedSessionIDs,
    }
  }

  function emitChanges(changedSessionIDs: Set<string>) {
    if (changedSessionIDs.size === 0) return

    for (const listener of [...listeners]) {
      listener()
    }

    for (const sessionID of changedSessionIDs) {
      const listenersForSession = sessionListeners.get(sessionID)
      if (!listenersForSession) continue
      for (const listener of [...listenersForSession]) {
        listener()
      }
    }
  }

  function replaceConversations(nextConversations: ConversationMap) {
    if (conversationsAreEquivalent(conversations, nextConversations)) return false
    const { changedSessionIDs } = rebuildFromConversations(nextConversations)
    emitChanges(changedSessionIDs)
    return changedSessionIDs.size > 0
  }

  function updateConversations(update: ConversationStoreUpdater) {
    return replaceConversations(resolveConversationUpdate(conversations, update))
  }

  const api: ConversationStoreApi = {
    appendAssistantDelta(sessionID, turnID, updater) {
      return updateConversations((current) => {
        const currentTurns = current[sessionID] ?? EMPTY_TURNS
        let didUpdate = false
        const nextTurns = currentTurns.map((turn) => {
          if (turn.kind !== "assistant" || turn.id !== turnID) return turn
          didUpdate = true
          return updater(turn)
        })
        return didUpdate ? { ...current, [sessionID]: nextTurns } : current
      })
    },
    getActivityBySession() {
      return activityBySession
    },
    getConversations() {
      return conversations
    },
    getSessionActivity(sessionID) {
      return sessionID ? activityBySession[sessionID] ?? EMPTY_CONVERSATION_ACTIVITY : EMPTY_CONVERSATION_ACTIVITY
    },
    getSessionTurns(sessionID) {
      return sessionID ? sessions.get(sessionID)?.turns ?? EMPTY_TURNS : EMPTY_TURNS
    },
    hasSession(sessionID) {
      return Boolean(sessionID && Object.prototype.hasOwnProperty.call(conversations, sessionID))
    },
    replaceConversations,
    replaceTraceItem(sessionID, turnID, itemID, item) {
      return updateConversations((current) => {
        const currentTurns = current[sessionID] ?? EMPTY_TURNS
        let didUpdate = false
        const nextTurns = currentTurns.map((turn) => {
          if (turn.kind !== "assistant" || turn.id !== turnID) return turn
          const itemIndex = turn.items.findIndex((candidate) => candidate.id === itemID)
          if (itemIndex === -1) return turn
          const nextItems = [...turn.items]
          nextItems[itemIndex] = item
          didUpdate = true
          return {
            ...turn,
            items: nextItems,
          }
        })
        return didUpdate ? { ...current, [sessionID]: nextTurns } : current
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    subscribeSession(sessionID, listener) {
      if (!sessionID) return () => {}
      const listenersForSession = sessionListeners.get(sessionID) ?? new Set<() => void>()
      listenersForSession.add(listener)
      sessionListeners.set(sessionID, listenersForSession)

      return () => {
        listenersForSession.delete(listener)
        if (listenersForSession.size === 0) {
          sessionListeners.delete(sessionID)
        }
      }
    },
    updateConversations,
  }

  replaceConversations(initialConversations)
  installThreadDebugApi(api)

  return api
}

export function useConversationTurns(
  store: ConversationStoreApi,
  sessionID: string | null | undefined,
) {
  const storeRef = useRef(store)
  const sessionIDRef = useRef(sessionID)

  storeRef.current = store
  sessionIDRef.current = sessionID

  return useSyncExternalStore(
    (listener) => storeRef.current.subscribeSession(sessionIDRef.current, listener),
    () => storeRef.current.getSessionTurns(sessionIDRef.current),
    () => storeRef.current.getSessionTurns(sessionIDRef.current),
  )
}

export { conversationActivityMapsAreEqual }
