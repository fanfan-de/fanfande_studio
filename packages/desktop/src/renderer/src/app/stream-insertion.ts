import type { AssistantTraceItem, AssistantTurn, Turn, UserTurn } from "./types"

function getStreamInsertionAssistantTurn(turns: Turn[], turn: UserTurn) {
  const assistantTurnID = turn.streamInsertion?.assistantTurnID
  if (!assistantTurnID) return null

  return turns.find(
    (candidate): candidate is AssistantTurn =>
      candidate.kind === "assistant" && candidate.id === assistantTurnID,
  ) ?? null
}

function isToolInsertionBoundaryReady(item: AssistantTraceItem) {
  return item.status === "completed" ||
    item.status === "error" ||
    item.status === "denied" ||
    item.status === "cancelled" ||
    item.status === "waiting-approval"
}

function getActiveToolBeforeInsertionIndex(items: AssistantTraceItem[], requestedIndex: number) {
  const previousItem = items[requestedIndex - 1]
  return previousItem?.kind === "tool" && !isToolInsertionBoundaryReady(previousItem)
    ? previousItem
    : null
}

function getStreamInsertionRequestedIndex(items: AssistantTraceItem[], turn: UserTurn, cursor: number) {
  return Math.min(
    items.length,
    Math.max(cursor, turn.streamInsertion?.afterItemCount ?? cursor),
  )
}

export function hasStreamInsertionTarget(turns: Turn[], turn: UserTurn) {
  return Boolean(getStreamInsertionAssistantTurn(turns, turn))
}

export function isStreamInsertionReady(turns: Turn[], turn: UserTurn) {
  const assistantTurn = getStreamInsertionAssistantTurn(turns, turn)
  if (!assistantTurn) return false

  const requestedIndex = getStreamInsertionRequestedIndex(assistantTurn.items, turn, 0)
  if (assistantTurn.items.length <= requestedIndex) return false

  if (getActiveToolBeforeInsertionIndex(assistantTurn.items, requestedIndex)) return false

  const followingTool = assistantTurn.items.find(
    (item, index) => index >= requestedIndex && item.kind === "tool",
  )
  if (followingTool) return isToolInsertionBoundaryReady(followingTool)

  return true
}

function isStreamInsertionConsumed(turn: UserTurn) {
  return turn.streamInsertion?.status !== "pending"
}

export function isPendingSteerUserTurn(turns: Turn[], turn: UserTurn) {
  if (turn.submissionMode !== "steer") return false

  if (turn.streamInsertion?.status === "pending") return true
  if (hasStreamInsertionTarget(turns, turn)) {
    return !isStreamInsertionConsumed(turn) || !isStreamInsertionReady(turns, turn)
  }
  if (turn.streamInsertion?.status === "consumed") return false

  return true
}

export function getPendingStreamInsertionUserTurns(turns: Turn[]) {
  return turns.filter(
    (turn): turn is UserTurn =>
      turn.kind === "user" &&
      isPendingSteerUserTurn(turns, turn),
  )
}

export function isPendingQueuedUserTurn(_turns: Turn[], turn: UserTurn) {
  return turn.submissionMode === "queued"
}

export function getPendingQueuedUserTurns(turns: Turn[]) {
  return turns.filter(
    (turn): turn is UserTurn =>
      turn.kind === "user" &&
      isPendingQueuedUserTurn(turns, turn),
  )
}

export function getAssistantStreamInsertionUserTurns(turns: Turn[], assistantTurn: AssistantTurn) {
  return turns
    .filter(
      (turn): turn is UserTurn =>
        turn.kind === "user" &&
        turn.streamInsertion?.assistantTurnID === assistantTurn.id &&
        isStreamInsertionConsumed(turn) &&
        isStreamInsertionReady(turns, turn),
    )
    .sort((left, right) => {
      const leftIndex = left.streamInsertion?.afterItemCount ?? 0
      const rightIndex = right.streamInsertion?.afterItemCount ?? 0
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
      return left.timestamp - right.timestamp
    })
}

export function resolveStreamInsertionItemIndex(items: AssistantTraceItem[], turn: UserTurn, cursor: number) {
  const requestedIndex = getStreamInsertionRequestedIndex(items, turn, cursor)
  const followingToolIndex = items.findIndex((item, index) => index >= requestedIndex && item.kind === "tool")

  return followingToolIndex === -1 ? requestedIndex : followingToolIndex + 1
}
