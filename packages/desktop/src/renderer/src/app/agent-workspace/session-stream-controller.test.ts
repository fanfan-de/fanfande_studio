import { describe, expect, it } from "vitest"
import type { AssistantTurn, SessionTaskListView, Turn, UserTurn } from "../types"
import {
  compactHighFrequencyDeltaStreamEvent,
  conversationTurnsAreEquivalent,
  isCompletedStreamEvent,
  isHighFrequencyDeltaStreamEvent,
  isLlmCompletedStreamEvent,
  isPermissionRequestStreamEvent,
  isTaskStateStreamEvent,
  isTerminalStreamEvent,
  mergeConversationTurnsFromHistory,
  mergeExternalUserTurnsFromHistory,
  readLatestSessionContextUsageFromHistory,
  readSessionContextUsageFromDoneEventData,
  readSessionContextUsageFromLlmCompletedEventData,
  readSessionTaskListViewFromStreamEvent,
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

function createCancelledAssistantTurn(id: string, messageID?: string): AssistantTurn {
  return {
    id,
    messageID,
    kind: "assistant",
    timestamp: 2,
    runtime: {
      phase: "cancelled",
      startedAt: 2,
      updatedAt: 3,
    },
    state: "Backend stream cancelled",
    isStreaming: false,
    items: [
      {
        id: `${id}-cancelled`,
        kind: "system",
        label: "System",
        title: "Turn cancelled",
        detail: "Prompt cancellation requested.",
        status: "completed",
        sourceID: `${id}:cancelled`,
        timestamp: 3,
      },
    ],
  }
}

function createPendingToolAssistantTurn(id: string, messageID?: string): AssistantTurn {
  return {
    id,
    messageID,
    kind: "assistant",
    timestamp: 4,
    runtime: {
      phase: "tool_running",
      startedAt: 4,
      updatedAt: 5,
      toolName: "replace-text",
    },
    state: "Backend response in progress",
    isStreaming: true,
    items: [
      {
        id: `${id}-tool`,
        kind: "tool",
        label: "Tool",
        title: "replace-text",
        status: "pending",
        sourceID: "late-tool-input-part",
        partID: "late-tool-input-part",
        messageID,
        toolCallID: "late-tool-call",
        toolInputText: "{\"path\":\"game.ts\"",
        timestamp: 5,
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

function createTaskListView(): SessionTaskListView {
  const task = {
    id: "task-1",
    sessionID: "backend-session-1",
    subject: "Run checks",
    description: "",
    activeForm: "Running checks",
    owner: "codex",
    status: "in_progress" as const,
    sortIndex: 1,
    blocks: [],
    blockedBy: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 2,
    startedAt: 2,
    isBlocked: false,
    blockingTasks: [],
    blockedTasks: [],
  }

  return {
    sessionID: "backend-session-1",
    generatedAt: 3,
    tasks: [task],
    current: [task],
    next: [],
    blocked: [],
    owners: [
      {
        owner: "codex",
        current: task,
      },
    ],
    teammateActivity: [],
    summary: {
      total: 1,
      completed: 0,
      pending: 0,
      inProgress: 1,
      blocked: 0,
    },
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
      data: createRuntimeEvent("text.part.delta", {
        messageID: "message-assistant-direct",
        partID: "part-text-1",
        delta: "token",
      }),
    })).toBe("message-assistant-direct")
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
      data: createRuntimeEvent("turn.completed", {
        message: {
          id: "message-assistant-final",
        },
        parts: [
          {
            id: "part-old-tool",
            messageID: "message-assistant-old-tool",
            type: "tool",
          },
        ],
      }),
    })).toBe("message-assistant-final")
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

  it("reads task snapshots directly from runtime and tool part events", () => {
    const taskList = createTaskListView()

    expect(readSessionTaskListViewFromStreamEvent({
      event: "runtime",
      data: createRuntimeEvent("task.state.updated", {
        state: taskList,
      }),
    })).toBe(taskList)

    expect(readSessionTaskListViewFromStreamEvent({
      event: "part",
      data: {
        part: {
          type: "tool",
          state: {
            status: "completed",
            metadata: {
              kind: "task-state",
              state: taskList,
            },
          },
        },
      },
    })).toBe(taskList)
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

  it("drops cumulative text from queued high-frequency delta events", () => {
    const compacted = compactHighFrequencyDeltaStreamEvent({
      id: "cursor-1",
      event: "runtime",
      data: createRuntimeEvent("text.part.delta", {
        delta: "token",
        text: "large cumulative response",
        messageID: "message-1",
        partID: "part-1",
      }),
    })

    expect((compacted.data as { payload: Record<string, unknown> }).payload).toEqual({
      delta: "token",
      messageID: "message-1",
      partID: "part-1",
    })

    const legacyCompacted = compactHighFrequencyDeltaStreamEvent({
      event: "delta",
      data: {
        delta: "token",
        kind: "text",
        text: "large cumulative response",
      },
    })

    expect(legacyCompacted.data).toEqual({
      delta: "token",
      kind: "text",
    })
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

  it("inserts externally persisted user turns before the streaming assistant placeholder", () => {
    const streamingAssistant: AssistantTurn = {
      ...createAssistantTurn("assistant-streaming", "item-streaming", "Streaming reply"),
      timestamp: 20,
      isStreaming: true,
      runtime: {
        phase: "waiting_first_event",
        startedAt: 20,
        updatedAt: 20,
      },
      state: "Waiting for agent stream",
    }
    const currentTurns: Turn[] = [
      createUserTurn("user-existing", "Earlier prompt"),
      createAssistantTurn("assistant-existing", "item-existing", "Earlier reply"),
      streamingAssistant,
    ]
    const historyTurns: Turn[] = [
      createUserTurn("user-existing", "Earlier prompt"),
      {
        ...createUserTurn("user-mobile", "Message from mobile"),
        timestamp: 19,
      },
    ]

    const merged = mergeExternalUserTurnsFromHistory(currentTurns, historyTurns, {
      beforeTurnID: "assistant-streaming",
    })

    expect(merged.map((turn) => turn.id)).toEqual([
      "user-existing",
      "assistant-existing",
      "user-mobile",
      "assistant-streaming",
    ])
  })

  it("replaces the optimistic local user turn when subscription history contains the same prompt", () => {
    const streamingAssistant: AssistantTurn = {
      ...createAssistantTurn("assistant-streaming", "item-streaming", "Streaming reply"),
      timestamp: 20,
      isStreaming: true,
      runtime: {
        phase: "waiting_first_event",
        startedAt: 20,
        updatedAt: 20,
      },
      state: "Waiting for agent stream",
    }
    const currentTurns: Turn[] = [
      {
        ...createUserTurn("user-local", "Create a Markdown document"),
        displayText: "Create a Markdown document",
        timestamp: 18,
      },
      streamingAssistant,
    ]
    const historyTurns: Turn[] = [
      {
        ...createUserTurn("message-user-backend", "Create a Markdown document"),
        timestamp: 19,
      },
    ]

    const merged = mergeExternalUserTurnsFromHistory(currentTurns, historyTurns, {
      beforeTurnID: "assistant-streaming",
    })

    expect(merged).toHaveLength(2)
    expect(merged.map((turn) => turn.id)).toEqual([
      "message-user-backend",
      "assistant-streaming",
    ])
    expect(merged[0]).toMatchObject({
      kind: "user",
      displayText: "Create a Markdown document",
      text: "Create a Markdown document",
    })
  })

  it("can replace user presentation when switching active branch history", () => {
    const previousTurns: Turn[] = [
      {
        ...createUserTurn("user-root", "root"),
        displayText: "root",
      },
      createAssistantTurn("assistant-root", "item-root", "Root answer", "source-root", "assistant-root-message"),
      {
        ...createUserTurn("user-old-branch", "old branch text"),
        displayText: "old branch text",
      },
    ]
    const nextTurns: Turn[] = [
      createUserTurn("user-root", "root"),
      createAssistantTurn("assistant-root-history", "item-root-history", "Root answer", "source-root", "assistant-root-message"),
      createUserTurn("user-new-branch", "new branch text"),
    ]

    const merged = mergeConversationTurnsFromHistory(previousTurns, nextTurns, {
      preserveUserPresentation: false,
    })

    expect(merged[2]).toMatchObject({
      id: "user-new-branch",
      kind: "user",
      text: "new branch text",
    })
    expect(merged[2]).not.toHaveProperty("displayText", "old branch text")
  })

  it("treats equal conversation turns as equivalent for no-op history refreshes", () => {
    const turns: Turn[] = [
      createUserTurn("user-1", "hello"),
      createAssistantTurn("assistant-1", "item-1", "Done", "source-1", "message-1"),
    ]

    expect(conversationTurnsAreEquivalent(turns, turns.map((turn) => ({ ...turn })))).toBe(true)
    expect(conversationTurnsAreEquivalent(turns, [...turns, createUserTurn("user-2", "again")])).toBe(false)
  })

  it("keeps a cancelled assistant turn cancelled when late pending tool history is merged by message id", () => {
    const originalTurn = createCancelledAssistantTurn("assistant-local", "message-tool")
    const latePendingToolTurn = createPendingToolAssistantTurn("assistant-history", "message-tool")

    const reconciled = reconcileConversationTurns([originalTurn, latePendingToolTurn])

    expect(reconciled).toHaveLength(1)
    expect(reconciled[0]).toMatchObject({
      id: "assistant-local",
      kind: "assistant",
      runtime: {
        phase: "cancelled",
        toolName: undefined,
      },
      isStreaming: false,
      items: expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          title: "replace-text",
          status: "cancelled",
          isStreaming: false,
        }),
        expect.objectContaining({
          kind: "system",
          title: "Turn cancelled",
        }),
      ]),
    })
  })

  it("keeps a local cancellation when history reloads a late unmatched pending tool turn", () => {
    const previousTurn = createCancelledAssistantTurn("assistant-local")
    const historyTurn = createPendingToolAssistantTurn("assistant-history", "message-tool")

    const merged = mergeConversationTurnsFromHistory([previousTurn], [historyTurn])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: "assistant-local",
      kind: "assistant",
      messageID: "message-tool",
      runtime: {
        phase: "cancelled",
        toolName: undefined,
      },
      isStreaming: false,
      items: expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          title: "replace-text",
          status: "cancelled",
          isStreaming: false,
        }),
      ]),
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
