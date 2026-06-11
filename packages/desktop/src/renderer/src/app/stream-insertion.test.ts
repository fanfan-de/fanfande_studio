import { describe, expect, it } from "vitest"
import type { AssistantTurn, Turn, UserTurn } from "./types"
import {
  getAssistantStreamInsertionUserTurns,
  getPendingQueuedUserTurns,
  getPendingStreamInsertionUserTurns,
  isPendingQueuedUserTurn,
  isPendingSteerUserTurn,
  isStreamInsertionReady,
  resolveStreamInsertionItemIndex,
} from "./stream-insertion"

function assistantTurn(status: "running" | "completed" | "cancelled"): AssistantTurn {
  return {
    id: "assistant-live",
    kind: "assistant",
    timestamp: 1,
    runtime: {
      phase: status === "running" ? "tool_running" : status === "cancelled" ? "cancelled" : "responding",
      startedAt: 1,
      updatedAt: 1,
    },
    state: "running",
    items: [
      {
        id: "assistant-before",
        kind: "text",
        timestamp: 1,
        label: "Assistant",
        text: "Before steer",
        status: "completed",
      },
      {
        id: "assistant-tool",
        kind: "tool",
        timestamp: 2,
        label: "Tool",
        title: "load-skill",
        status,
      },
      {
        id: "assistant-after",
        kind: "text",
        timestamp: 3,
        label: "Assistant",
        text: "After steer",
        status: "running",
      },
    ],
    isStreaming: true,
  }
}

function steerTurn(): UserTurn {
  return {
    id: "user-steer",
    kind: "user",
    text: "Hello",
    submissionMode: "steer",
    streamInsertion: {
      assistantTurnID: "assistant-live",
      afterItemCount: 1,
    },
    timestamp: 2,
  }
}

function pendingSteerTurn(): UserTurn {
  return {
    ...steerTurn(),
    streamInsertion: {
      assistantTurnID: "assistant-live",
      afterItemCount: 1,
      status: "pending",
    },
  }
}

function consumedSteerTurn(): UserTurn {
  return {
    ...steerTurn(),
    streamInsertion: {
      assistantTurnID: "assistant-live",
      afterItemCount: 1,
      status: "consumed",
    },
  }
}

function steerTurnWithoutInsertion(): UserTurn {
  const { streamInsertion: _streamInsertion, ...turn } = steerTurn()
  return turn
}

function steerTurnAfterCurrentTool(): UserTurn {
  return {
    ...steerTurn(),
    streamInsertion: {
      assistantTurnID: "assistant-live",
      afterItemCount: 2,
    },
  }
}

function queuedTurn(): UserTurn {
  return {
    id: "user-queued",
    kind: "user",
    text: "Next prompt",
    submissionMode: "queued",
    timestamp: 2,
  }
}

describe("stream insertion presentation", () => {
  it("keeps steer turns pending while the following tool is still running", () => {
    const turn = steerTurn()
    const turns: Turn[] = [assistantTurn("running"), turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(false)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
    expect(getAssistantStreamInsertionUserTurns(turns, assistantTurn("running"))).toEqual([])
  })

  it("keeps steer turns pending when the insertion point is after an active tool", () => {
    const turn = steerTurnAfterCurrentTool()
    const turns: Turn[] = [assistantTurn("running"), turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(false)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
    expect(getAssistantStreamInsertionUserTurns(turns, assistantTurn("running"))).toEqual([])
  })

  it("keeps steer turns without insertion metadata pending while the previous assistant is streaming", () => {
    const turn = steerTurnWithoutInsertion()
    const turns: Turn[] = [assistantTurn("running"), turn]

    expect(isPendingSteerUserTurn(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
  })

  it("keeps steer turns without insertion metadata pending until execution mode resolves", () => {
    const assistant: AssistantTurn = {
      ...assistantTurn("completed"),
      isStreaming: false,
    }
    const turn = steerTurnWithoutInsertion()
    const turns: Turn[] = [assistant, turn]

    expect(isPendingSteerUserTurn(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
  })

  it("keeps pending steer turns in the drawer after the insertion point is otherwise ready", () => {
    const assistant = assistantTurn("completed")
    const turn = pendingSteerTurn()
    const turns: Turn[] = [assistant, turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
    expect(getAssistantStreamInsertionUserTurns(turns, assistant)).toEqual([])
  })

  it("moves consumed steer turns into the thread after the insertion point is ready", () => {
    const assistant = assistantTurn("completed")
    const turn = consumedSteerTurn()
    const turns: Turn[] = [assistant, turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([])
    expect(getAssistantStreamInsertionUserTurns(turns, assistant)).toEqual([turn])
  })

  it("moves steer turns into the thread after the following tool boundary", () => {
    const assistant = assistantTurn("completed")
    const turn = steerTurn()
    const turns: Turn[] = [assistant, turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([])
    expect(getAssistantStreamInsertionUserTurns(turns, assistant)).toEqual([turn])
    expect(resolveStreamInsertionItemIndex(assistant.items, turn, 0)).toBe(2)
  })

  it("moves steer turns into the thread after the active tool at the insertion point completes", () => {
    const assistant = assistantTurn("completed")
    const turn = steerTurnAfterCurrentTool()
    const turns: Turn[] = [assistant, turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([])
    expect(getAssistantStreamInsertionUserTurns(turns, assistant)).toEqual([turn])
    expect(resolveStreamInsertionItemIndex(assistant.items, turn, 0)).toBe(2)
  })

  it("moves steer turns into the thread after a tool boundary is cancelled", () => {
    const assistant = assistantTurn("cancelled")
    const turn = steerTurn()
    const turns: Turn[] = [assistant, turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(true)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([])
    expect(getAssistantStreamInsertionUserTurns(turns, assistant)).toEqual([turn])
    expect(resolveStreamInsertionItemIndex(assistant.items, turn, 0)).toBe(2)
  })

  it("keeps queued user turns pending until execution mode resolves", () => {
    const turn = queuedTurn()
    const streamingAssistant = assistantTurn("running")
    const streamingTurns: Turn[] = [streamingAssistant, turn]

    expect(isPendingQueuedUserTurn(streamingTurns, turn)).toBe(true)
    expect(getPendingQueuedUserTurns(streamingTurns)).toEqual([turn])

    const completedAssistant: AssistantTurn = {
      ...streamingAssistant,
      isStreaming: false,
    }
    const completedTurns: Turn[] = [completedAssistant, turn]

    expect(isPendingQueuedUserTurn(completedTurns, turn)).toBe(true)
    expect(getPendingQueuedUserTurns(completedTurns)).toEqual([turn])
  })
})
