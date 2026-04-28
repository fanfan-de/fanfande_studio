import { describe, expect, it } from "vitest"
import type { AssistantTurn, Turn, UserTurn } from "../types"
import {
  isCompletedStreamEvent,
  isPermissionRequestStreamEvent,
  isPlanProgressStreamEvent,
  isTerminalStreamEvent,
  mergeConversationTurnsFromHistory,
  readLatestSessionContextUsageFromHistory,
  readSessionContextUsageFromDoneEventData,
  resolveStreamCursor,
  resolveStreamTurnID,
} from "./session-stream-controller"

function createUserTurn(id: string, text: string): UserTurn {
  return {
    id,
    kind: "user",
    text,
    timestamp: 1,
  }
}

function createAssistantTurn(id: string, itemID: string, text: string, sourceID = "source-1", messageID?: string): AssistantTurn {
  return {
    id,
    messageID,
    kind: "assistant",
    timestamp: 2,
    runtime: {
      phase: "completed",
      startedAt: 2,
      updatedAt: 3,
    },
    state: "completed",
    items: [
      {
        id: itemID,
        kind: "text",
        label: "Response",
        sourceID,
        text,
        timestamp: 3,
      },
    ],
  }
}

function createRuntimeEvent(type: string, payload: Record<string, unknown> = {}) {
  return {
    type,
    eventID: "runtime-cursor-1",
    sessionID: "backend-session-1",
    turnID: "backend-turn-1",
    payload,
  }
}

describe("session stream controller helpers", () => {
  it("resolves request/session cursors and backend turn IDs from runtime and legacy events", () => {
    const runtimeData = createRuntimeEvent("turn.completed")

    expect(resolveStreamCursor({ id: "ipc-cursor-1", data: runtimeData })).toBe("ipc-cursor-1")
    expect(resolveStreamCursor({ data: runtimeData })).toBe("runtime-cursor-1")
    expect(resolveStreamTurnID({ data: runtimeData })).toBe("backend-turn-1")

    expect(resolveStreamCursor({ data: { cursor: "legacy-cursor-1", turnID: "legacy-turn-1" } })).toBe("legacy-cursor-1")
    expect(resolveStreamTurnID({ data: { cursor: "legacy-cursor-1", turnID: "legacy-turn-1" } })).toBe("legacy-turn-1")
  })

  it("classifies terminal, completed, and permission events across stream formats", () => {
    expect(isTerminalStreamEvent({ event: "runtime", data: createRuntimeEvent("turn.failed") })).toBe(true)
    expect(isCompletedStreamEvent({ event: "runtime", data: createRuntimeEvent("turn.completed") })).toBe(true)
    expect(isPermissionRequestStreamEvent({ event: "runtime", data: createRuntimeEvent("permission.requested") })).toBe(true)
    expect(isPermissionRequestStreamEvent({
      event: "part",
      data: {
        part: {
          type: "permission",
          action: "ask",
        },
      },
    })).toBe(true)
    expect(isPlanProgressStreamEvent({ event: "runtime", data: createRuntimeEvent("plan.progress.updated") })).toBe(true)
    expect(isPlanProgressStreamEvent({
      event: "part",
      data: {
        part: {
          type: "tool",
          state: {
            status: "completed",
            metadata: {
              kind: "plan-progress",
            },
          },
        },
      },
    })).toBe(true)
  })

  it("reads context usage from stream completion payloads and history messages", () => {
    const message = {
      id: "message-1",
      sessionID: "session-1",
      role: "assistant",
      created: 100,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 3,
        cache: {
          read: 2,
          write: 1,
        },
      },
      completed: 123,
    } as const

    expect(readSessionContextUsageFromDoneEventData(createRuntimeEvent("turn.completed", { message }))).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      reasoningTokens: 3,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      measuredAt: 123,
    })
    expect(readLatestSessionContextUsageFromHistory([
      {
        info: {
          id: "message-user-with-tokens",
          sessionID: "session-1",
          role: "user",
          created: 80,
          tokens: {
            input: 1000,
            output: 1000,
          },
        },
        parts: [],
      },
    ])).toBeNull()
    expect(readLatestSessionContextUsageFromHistory([
      {
        info: {
          id: "message-user-with-tokens",
          sessionID: "session-1",
          role: "user",
          created: 80,
          tokens: {
            input: 1000,
            output: 1000,
          },
        },
        parts: [],
      },
      {
        info: {
          id: "message-0",
          sessionID: "session-1",
          role: "user",
          created: 90,
        },
        parts: [],
      },
      { info: message, parts: [] },
    ])).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })
  })

  it("preserves user presentation and assistant identity when history reloads", () => {
    const previousUser: UserTurn = {
      ...createUserTurn("user-local", "local display"),
      displayText: "local display",
      attachments: [{ name: "design.png", path: "C:/tmp/design.png" }],
      references: [{ id: "ref-1", label: "src/App.tsx", kind: "file" }],
    }
    const previousAssistant = createAssistantTurn("assistant-local", "item-local", "Done", "source-1")
    const nextTurns: Turn[] = [
      createUserTurn("user-history", "history text"),
      createAssistantTurn("assistant-history", "item-history", "Done", "source-1", "msg-assistant-history"),
    ]

    const merged = mergeConversationTurnsFromHistory([previousUser, previousAssistant], nextTurns)

    expect(merged[0]).toMatchObject({
      id: "user-history",
      kind: "user",
      displayText: "local display",
      attachments: previousUser.attachments,
      references: previousUser.references,
    })
    expect(merged[1]).toMatchObject({
      id: "assistant-local",
      messageID: "msg-assistant-history",
      items: [
        expect.objectContaining({
          id: "item-local",
          sourceID: "source-1",
        }),
      ],
    })
  })
})
