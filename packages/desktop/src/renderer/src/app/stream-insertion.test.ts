import { describe, expect, it } from "vitest"
import type { AssistantTurn, Turn, UserTurn } from "./types"
import {
  getAssistantStreamInsertionUserTurns,
  getPendingStreamInsertionUserTurns,
  isStreamInsertionReady,
  resolveStreamInsertionItemIndex,
} from "./stream-insertion"

function assistantTurn(status: "running" | "completed"): AssistantTurn {
  return {
    id: "assistant-live",
    kind: "assistant",
    timestamp: 1,
    runtime: {
      phase: status === "running" ? "tool_running" : "responding",
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

describe("stream insertion presentation", () => {
  it("keeps steer turns pending while the following tool is still running", () => {
    const turn = steerTurn()
    const turns: Turn[] = [assistantTurn("running"), turn]

    expect(isStreamInsertionReady(turns, turn)).toBe(false)
    expect(getPendingStreamInsertionUserTurns(turns)).toEqual([turn])
    expect(getAssistantStreamInsertionUserTurns(turns, assistantTurn("running"))).toEqual([])
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
})
