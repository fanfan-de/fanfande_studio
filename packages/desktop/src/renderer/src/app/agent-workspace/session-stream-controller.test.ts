import { describe, expect, it } from "vitest"
import type { AssistantTurn, Turn, UserTurn } from "../types"
import {
  isCompletedStreamEvent,
  isHighFrequencyDeltaStreamEvent,
  isLlmCompletedStreamEvent,
  isPermissionRequestStreamEvent,
  isTaskStateStreamEvent,
  isTerminalStreamEvent,
  mergeConversationTurnsFromHistory,
  readLatestSessionContextUsageFromHistory,
  readSessionContextUsageFromDoneEventData,
  readSessionContextUsageFromLlmCompletedEventData,
  reconcileConversationTurns,
  resolveStreamMessageID,
  resolveStreamCursor,
  resolveStreamTurnID,
  shouldRefreshRuntimeDebugForStreamEvent,
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
    timestamp: 456,
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

  it("resolves assistant message IDs from runtime part and terminal events", () => {
    expect(resolveStreamMessageID({
      data: createRuntimeEvent("tool.call.completed", {
        part: {
          id: "part-tool-1",
          messageID: "message-assistant-1",
          type: "tool",
        },
      }),
    })).toBe("message-assistant-1")
    expect(resolveStreamMessageID({
      data: createRuntimeEvent("turn.completed", {
        message: {
          id: "message-assistant-2",
        },
      }),
    })).toBe("message-assistant-2")
    expect(resolveStreamMessageID({
      data: {
        parts: [
          {
            id: "part-tool-2",
            messageID: "message-assistant-3",
            type: "tool",
          },
        ],
      },
    })).toBe("message-assistant-3")
  })

  it("classifies terminal, completed, and permission events across stream formats", () => {
    expect(isTerminalStreamEvent({ event: "runtime", data: createRuntimeEvent("turn.failed") })).toBe(true)
    expect(isCompletedStreamEvent({ event: "runtime", data: createRuntimeEvent("turn.completed") })).toBe(true)
    expect(isLlmCompletedStreamEvent({ event: "runtime", data: createRuntimeEvent("llm.call.completed") })).toBe(true)
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
    expect(isTaskStateStreamEvent({ event: "runtime", data: createRuntimeEvent("task.state.updated") })).toBe(true)
    expect(isTaskStateStreamEvent({
      event: "part",
      data: {
        part: {
          type: "tool",
          state: {
            status: "completed",
            metadata: {
              kind: "task-state",
            },
          },
        },
      },
    })).toBe(true)
  })

  it("skips runtime debug refreshes for high-frequency text deltas", () => {
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("text.part.delta"),
    })).toBe(false)
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("reasoning.part.delta"),
    })).toBe(false)
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("tool.input.delta"),
    })).toBe(false)
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "delta",
      data: { kind: "text", delta: "token" },
    })).toBe(false)
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("turn.state.changed"),
    })).toBe(true)
    expect(shouldRefreshRuntimeDebugForStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("turn.completed"),
    })).toBe(true)
  })

  it("classifies only text delta events as high-frequency batch candidates", () => {
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("text.part.delta"),
    })).toBe(true)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("reasoning.part.delta"),
    })).toBe(true)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("tool.input.delta"),
    })).toBe(true)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "delta",
      data: { kind: "text", delta: "token" },
    })).toBe(true)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("text.part.started"),
    })).toBe(false)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("tool.call.pending"),
    })).toBe(false)
    expect(isHighFrequencyDeltaStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("turn.completed"),
    })).toBe(false)
  })

  it("reads context usage from in-turn LLM completion events", () => {
    expect(readSessionContextUsageFromLlmCompletedEventData(createRuntimeEvent("llm.call.completed", {
      usage: {
        inputTokens: 64_000,
        outputTokens: 800,
        reasoningTokens: 120,
        cacheReadTokens: 32_000,
        cacheWriteTokens: 16,
      },
    }))).toEqual({
      inputTokens: 64_000,
      outputTokens: 800,
      totalTokens: 64_800,
      reasoningTokens: 120,
      cacheReadTokens: 32_000,
      cacheWriteTokens: 16,
      measuredAt: 456,
    })

    expect(readSessionContextUsageFromLlmCompletedEventData(createRuntimeEvent("turn.completed", {
      usage: {
        inputTokens: 64_000,
      },
    }))).toBeNull()
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

  it("reconciles approval-resolution tool updates back into the original assistant message", () => {
    const originalTurn: AssistantTurn = {
      id: "assistant-original",
      messageID: "msg-tool",
      kind: "assistant",
      timestamp: 2,
      runtime: {
        phase: "waiting_approval",
        startedAt: 2,
        updatedAt: 3,
        toolName: "replace-text",
        approvalRequestID: "approval-1",
      },
      state: "Waiting for permission approval",
      items: [
        {
          id: "trace-tool-local",
          kind: "tool",
          label: "Tool",
          title: "replace-text",
          status: "waiting-approval",
          sourceID: "part-tool-html",
          partID: "part-tool-html",
          messageID: "msg-tool",
          toolCallID: "call-html",
          timestamp: 3,
        },
        {
          id: "assistant-original-blocked",
          kind: "system",
          label: "Completion",
          title: "Approval required",
          status: "pending",
          sourceID: "assistant-original:blocked",
          section: "approvals",
          visibilityKey: "approvals",
          timestamp: 4,
        },
      ],
    }
    const approvalResolutionTurn: AssistantTurn = {
      id: "assistant-resolution",
      messageID: "msg-tool",
      kind: "assistant",
      timestamp: 5,
      runtime: {
        phase: "completed",
        startedAt: 5,
        updatedAt: 6,
      },
      state: "Backend response received",
      items: [
        {
          id: "trace-tool-resolution",
          kind: "tool",
          label: "Tool",
          title: "replace-text",
          status: "completed",
          sourceID: "part-tool-html",
          partID: "part-tool-html",
          messageID: "msg-tool",
          toolCallID: "call-html",
          toolOutputText: "index.html updated",
          timestamp: 6,
        },
      ],
    }

    const reconciled = reconcileConversationTurns([originalTurn, approvalResolutionTurn])

    expect(reconciled).toHaveLength(1)
    expect(reconciled[0]).toMatchObject({
      id: "assistant-original",
      kind: "assistant",
      messageID: "msg-tool",
      runtime: {
        phase: "completed",
        toolName: undefined,
        approvalRequestID: undefined,
      },
      items: [
        expect.objectContaining({
          id: "trace-tool-local",
          sourceID: "part-tool-html",
          status: "completed",
          toolOutputText: "index.html updated",
        }),
      ],
    })
    expect((reconciled[0] as AssistantTurn).items.some((item) => item.title === "Approval required")).toBe(false)
  })
})
