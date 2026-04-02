import type { AssistantTurn, Turn } from "./types"

export type ConversationMap = Record<string, Turn[]>
export type SessionIDMap = Record<string, string>

export function appendConversationTurns(conversations: ConversationMap, sessionID: string, nextTurns: Turn[]) {
  return {
    ...conversations,
    [sessionID]: [...(conversations[sessionID] ?? []), ...nextTurns],
  }
}

export function updateAssistantTurn(
  conversations: ConversationMap,
  sessionID: string,
  turnID: string,
  updater: (turn: AssistantTurn) => AssistantTurn,
) {
  const turns = conversations[sessionID] ?? []
  let updated = false
  const nextTurns = turns.map((turn) => {
    if (turn.kind !== "assistant" || turn.id !== turnID) return turn
    updated = true
    return updater(turn)
  })

  if (!updated) return conversations
  return {
    ...conversations,
    [sessionID]: nextTurns,
  }
}

export function ensureConversationSessions(conversations: ConversationMap, sessionIDs: string[]) {
  const next = { ...conversations }
  for (const sessionID of sessionIDs) {
    next[sessionID] ??= []
  }
  return next
}

export function ensureAgentSessions(agentSessions: SessionIDMap, sessionIDs: string[]) {
  const next = { ...agentSessions }
  for (const sessionID of sessionIDs) {
    next[sessionID] ??= sessionID
  }
  return next
}

export function removeConversationSession(conversations: ConversationMap, sessionID: string) {
  const next = { ...conversations }
  delete next[sessionID]
  return next
}

export function removeAgentSession(agentSessions: SessionIDMap, sessionID: string) {
  const next = { ...agentSessions }
  delete next[sessionID]
  return next
}
