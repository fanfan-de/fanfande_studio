import { describe, expect, it } from "vitest"
import { applyAgentStreamEventToTurn, buildStreamingAssistantTurn, buildTurnsFromHistory } from "./stream"

describe("stream trace reducer", () => {
  it("preserves reasoning before text in the trace order", () => {
    let turn = buildStreamingAssistantTurn("Show live trace")

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "reasoning",
        partID: "part-reasoning",
        delta: "Planning live update.",
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "text",
        partID: "part-text",
        delta: "Streaming answer",
      },
    })

    expect(turn.items.map((item) => item.kind)).toEqual(["system", "reasoning", "text"])
    expect(turn.items[1]?.text).toBe("Planning live update.")
    expect(turn.items[2]?.text).toBe("Streaming answer")
  })

  it("keeps repeated tool updates on the same trace item", () => {
    let turn = buildStreamingAssistantTurn("Run lint")

    turn = applyAgentStreamEventToTurn(turn, {
      event: "part",
      data: {
        part: {
          id: "tool-1",
          type: "tool",
          tool: "eslint",
          state: {
            status: "running",
            title: "Linting workspace",
          },
        },
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "part",
      data: {
        part: {
          id: "tool-1",
          type: "tool",
          tool: "eslint",
          state: {
            status: "completed",
            output: {
              fixed: 3,
            },
          },
        },
      },
    })

    const toolItems = turn.items.filter((item) => item.kind === "tool")
    expect(toolItems).toHaveLength(1)
    expect(toolItems[0]?.status).toBe("completed")
    expect(toolItems[0]?.detail).toContain("\"fixed\":3")
  })

  it("keeps non-contiguous reasoning segments separate around tool events", () => {
    let turn = buildStreamingAssistantTurn("Trace tool execution")

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "reasoning",
        partID: "reasoning-1",
        delta: "Inspecting workspace.",
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "part",
      data: {
        part: {
          id: "tool-2",
          type: "tool",
          tool: "npm test",
          state: {
            status: "running",
            title: "Executing tests",
          },
        },
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "reasoning",
        partID: "reasoning-2",
        delta: "Evaluating test output.",
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "done",
      data: {
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Inspecting workspace." },
          { id: "tool-2", type: "tool", tool: "npm test", state: { status: "completed", output: "ok" } },
          { id: "reasoning-2", type: "reasoning", text: "Evaluating test output." },
        ],
      },
    })

    expect(turn.items.map((item) => item.kind)).toEqual(["system", "reasoning", "tool", "reasoning", "system"])
    expect(turn.items[1]?.text).toBe("Inspecting workspace.")
    expect(turn.items[3]?.text).toBe("Evaluating test output.")
    expect(turn.items[4]?.title).toBe("Response complete")
  })

  it("updates the original text trace item when the same text part resumes after a tool event", () => {
    let turn = buildStreamingAssistantTurn("Resume text after tool")

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "text",
        partID: "text-1",
        delta: "First sentence.",
        text: "First sentence.",
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "part",
      data: {
        part: {
          id: "tool-3",
          type: "tool",
          tool: "npm test",
          state: {
            status: "running",
            title: "Executing tests",
          },
        },
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "text",
        partID: "text-1",
        delta: " Second sentence.",
        text: "First sentence. Second sentence.",
      },
    })

    const textItems = turn.items.filter((item) => item.kind === "text")
    expect(textItems).toHaveLength(1)
    expect(textItems[0]?.text).toBe("First sentence. Second sentence.")
    expect(turn.items.map((item) => item.kind)).toEqual(["system", "text", "tool"])
  })

  it("replaces anonymous streamed text with the finalized text part on completion", () => {
    let turn = buildStreamingAssistantTurn("Follow up")

    turn = applyAgentStreamEventToTurn(turn, {
      event: "delta",
      data: {
        kind: "text",
        delta: "Second reply.",
        text: "First reply. Second reply.",
      },
    })

    turn = applyAgentStreamEventToTurn(turn, {
      event: "done",
      data: {
        parts: [{ id: "text-2", type: "text", text: "Second reply." }],
      },
    })

    const textItems = turn.items.filter((item) => item.kind === "text")
    expect(textItems).toHaveLength(1)
    expect(textItems[0]?.text).toBe("Second reply.")
  })

  it("rebuilds user and assistant turns from persisted session history", () => {
    const turns = buildTurnsFromHistory([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-1",
          role: "user",
          created: 10,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Reload this session" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-1",
          role: "assistant",
          created: 11,
          completed: 12,
        },
        parts: [
          { id: "part-reasoning-1", type: "reasoning", text: "Rebuilding from stored parts." },
          { id: "part-text-1", type: "text", text: "History is back." },
        ],
      },
    ])

    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      id: "msg-user-1",
      kind: "user",
      text: "Reload this session",
      timestamp: 10,
    })
    expect(turns[1]).toMatchObject({
      id: "msg-assistant-1",
      kind: "assistant",
      timestamp: 11,
      state: "Backend response received",
    })
    expect(turns[1]?.kind === "assistant" ? turns[1].items.map((item) => item.kind) : []).toEqual(["reasoning", "text"])
  })

  it("adds an error trace when the persisted assistant turn failed", () => {
    const turns = buildTurnsFromHistory([
      {
        info: {
          id: "msg-assistant-error",
          sessionID: "session-1",
          role: "assistant",
          created: 20,
          error: {
            message: "Backend stream failed",
          },
        },
        parts: [],
      },
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      id: "msg-assistant-error",
      kind: "assistant",
      state: "Backend request failed",
    })
    expect(turns[0]?.kind === "assistant" ? turns[0].items.map((item) => item.kind) : []).toEqual(["error"])
  })
})
