import { afterEach, describe, expect, it, mock } from "bun:test"
import { Instance } from "#project/instance.ts"

function createTurnRecorder(sessionID: string) {
  const events: Array<{ type: string; payload: any }> = []

  return {
    events,
    turn: {
      sessionID,
      turnID: "turn-test",
      emit(type: string, payload: unknown) {
        events.push({
          type,
          payload: structuredClone(payload),
        })

        return {
          eventID: `${type}-${events.length}`,
          sessionID,
          turnID: "turn-test",
          seq: events.length,
          timestamp: Date.now(),
          type,
          payload,
        }
      },
      close() {},
    } as any,
  }
}

describe("processor tool persistence", () => {
  afterEach(() => {
    mock.restore()
  })

  it("emits structured tool results and tool errors as runtime events", async () => {
    const originalNow = Date.now
    Date.now = () => 1000

    try {
      mock.module("#session/llm.ts", () => ({
        stream: async () => ({
          fullStream: (async function* () {
            yield { type: "start" }
            yield {
              type: "text-start",
              providerMetadata: { phase: "text" },
            }
            yield {
              type: "text-delta",
              text: "hel",
            }
            yield {
              type: "text-delta",
              text: "lo",
            }
            yield {
              type: "text-delta",
              text: "!",
            }
            yield {
              type: "text-end",
            }
            yield {
              type: "tool-input-start",
              id: "tool-1",
              toolName: "custom",
              providerMetadata: { phase: "input" },
            }
            yield {
              type: "tool-call",
              toolCallId: "tool-1",
              toolName: "custom",
              input: { path: "a.txt" },
              providerMetadata: { phase: "call" },
              title: "Custom Tool",
            }
            yield {
              type: "tool-result",
              toolCallId: "tool-1",
              toolName: "custom",
              input: { path: "a.txt" },
              output: {
                text: "alpha",
                title: "Read a.txt",
                metadata: { source: "unit" },
                attachments: [
                  {
                    url: "https://example.com/a.txt",
                    mime: "text/plain",
                    filename: "a.txt",
                  },
                ],
              },
            }
            yield {
              type: "tool-input-start",
              id: "tool-2",
              toolName: "custom",
            }
            yield {
              type: "tool-call",
              toolCallId: "tool-2",
              toolName: "custom",
              input: { path: "b.txt" },
            }
            yield {
              type: "tool-error",
              toolCallId: "tool-2",
              toolName: "custom",
              input: { path: "b.txt" },
              error: new Error("boom"),
              providerMetadata: { source: "unit" },
            }
            yield {
              type: "finish",
              finishReason: "stop",
            }
          })(),
        }),
      }))

      const Processor = await import("#session/processor.ts")
      const recorded = createTurnRecorder("session-1")

      const assistant = {
        id: "assistant-1",
        sessionID: "session-1",
        role: "assistant",
        created: Date.now(),
        parentID: "user-1",
        modelID: "test-model",
        providerID: "test-provider",
        agent: "plan",
        path: {
          cwd: ".",
          root: ".",
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
      } as any

      const processor = Processor.create({
        Assistant: assistant,
        turn: recorded.turn,
      })

      expect(await processor.process({} as never)).toBe("continue")

      const textUpdates = recorded.events.filter((event) => event.type === "text.part.delta")
      expect(textUpdates).toHaveLength(3)
      expect(textUpdates[0]?.payload.text).toBe("hel")
      expect(textUpdates[2]?.payload.text).toBe("hello!")

      const completedText = recorded.events.find((event) => event.type === "text.part.completed")
      expect(completedText?.payload.part.text).toBe("hello!")

      const completed = recorded.events.find(
        (event) =>
          event.type === "tool.call.completed" &&
          event.payload.part.type === "tool" &&
          event.payload.part.callID === "tool-1" &&
          event.payload.part.state?.status === "completed",
      )
      expect(completed).toBeDefined()
      expect(completed?.payload.part.state.output).toBe("alpha")
      expect(completed?.payload.part.state.title).toBe("Read a.txt")
      expect(completed?.payload.part.state.metadata).toEqual({ source: "unit" })
      expect(completed?.payload.part.state.attachments).toHaveLength(1)

      const failed = recorded.events.find(
        (event) =>
          event.type === "tool.call.failed" &&
          event.payload.part.type === "tool" &&
          event.payload.part.callID === "tool-2" &&
          event.payload.part.state?.status === "error",
      )
      expect(failed).toBeDefined()
      expect(failed?.payload.part.state.error).toBe("boom")
      expect(failed?.payload.part.state.metadata).toEqual({ source: "unit" })

      expect(processor.partFromToolCall("tool-1")?.state.status).toBe("completed")
      expect(processor.partFromToolCall("tool-2")?.state.status).toBe("error")
    } finally {
      Date.now = originalNow
    }
  })

  it("emits provider-executed tool calls without a prior input-start event", async () => {
    mock.module("#session/llm.ts", () => ({
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: "start" }
          yield {
            type: "tool-call",
            toolCallId: "remote-tool-1",
            toolName: "mcp.remote-search",
            input: { query: "latest ai news" },
            title: "Remote Search",
            providerExecuted: true,
            providerMetadata: { call_id: "provider-call-1" },
          }
          yield {
            type: "tool-result",
            toolCallId: "remote-tool-1",
            toolName: "mcp.remote-search",
            input: { query: "latest ai news" },
            providerExecuted: true,
            providerMetadata: { approval: "none" },
            output: {
              type: "call",
              serverLabel: "remote-search",
              name: "search",
              arguments: "{\"query\":\"latest ai news\"}",
              output: "headline results",
            },
          }
          yield {
            type: "finish",
            finishReason: "stop",
          }
        })(),
      }),
    }))

    const Processor = await import("#session/processor.ts")
    const recorded = createTurnRecorder("session-remote")

    const assistant = {
      id: "assistant-remote",
      sessionID: "session-remote",
      role: "assistant",
      created: Date.now(),
      parentID: "user-remote",
      modelID: "test-model",
      providerID: "openai",
      agent: "plan",
      path: {
        cwd: ".",
        root: ".",
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    } as any

    const processor = Processor.create({
      Assistant: assistant,
      turn: recorded.turn,
    })

    expect(await processor.process({} as never)).toBe("continue")

    const running = recorded.events.find(
      (event) =>
        event.type === "tool.call.started" &&
        event.payload.part.type === "tool" &&
        event.payload.part.callID === "remote-tool-1" &&
        event.payload.part.state?.status === "running",
    )
    expect(running).toBeDefined()
    expect(running?.payload.part.providerExecuted).toBe(true)

    const completed = recorded.events.find(
      (event) =>
        event.type === "tool.call.completed" &&
        event.payload.part.type === "tool" &&
        event.payload.part.callID === "remote-tool-1" &&
        event.payload.part.state?.status === "completed",
    )
    expect(completed).toBeDefined()
    expect(completed?.payload.part.providerExecuted).toBe(true)
    expect(completed?.payload.part.state.modelOutput).toEqual({
      type: "call",
      serverLabel: "remote-search",
      name: "search",
      arguments: "{\"query\":\"latest ai news\"}",
      output: "headline results",
    })

    const persisted = processor.partFromToolCall("remote-tool-1")
    expect(persisted?.providerExecuted).toBe(true)
    expect(persisted?.state.status).toBe("completed")
    expect((persisted?.state as any).modelOutput).toEqual({
      type: "call",
      serverLabel: "remote-search",
      name: "search",
      arguments: "{\"query\":\"latest ai news\"}",
      output: "headline results",
    })
  })

  it("stops the loop and emits waiting approval state when approval is requested", async () => {
    mock.module("#session/llm.ts", () => ({
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: "start" }
          yield {
            type: "tool-input-start",
            id: "tool-approval",
            toolName: "write-file",
          }
          yield {
            type: "tool-call",
            toolCallId: "tool-approval",
            toolName: "write-file",
            input: { path: "a.txt", content: "alpha" },
            title: "Write File",
          }
          yield {
            type: "tool-approval-request",
            approvalId: "approval-1",
            toolCallId: "tool-approval",
          }
          yield {
            type: "finish",
            finishReason: "tool-calls",
          }
        })(),
      }),
    }))

    const Processor = await import("#session/processor.ts")
    const recorded = createTurnRecorder("session-approval")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const assistant = {
          id: "msg-assistant-approval",
          sessionID: "session-approval",
          role: "assistant",
          created: Date.now(),
          parentID: "user-approval",
          modelID: "test-model",
          providerID: "test-provider",
          agent: "plan",
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
        } as any

        const processor = Processor.create({
          Assistant: assistant,
          turn: recorded.turn,
        })

        expect(await processor.process({} as never)).toBe("stop")
        expect(processor.partFromToolCall("tool-approval")?.state.status).toBe("waiting-approval")
      },
    })

    const waiting = recorded.events.find(
      (event) =>
        event.type === "tool.call.waiting_approval" &&
        event.payload.part.type === "tool" &&
        event.payload.part.callID === "tool-approval" &&
        event.payload.part.state?.status === "waiting-approval",
    )
    expect(waiting).toBeDefined()
    expect(waiting?.payload.part.state.approvalID).toBe("approval-1")
    expect(waiting?.payload.part.state.input).toEqual({ path: "a.txt", content: "alpha" })

    const request = recorded.events.find((event) => event.type === "permission.requested")
    expect(request).toBeDefined()
    expect(request?.payload.request.approvalID).toBe("approval-1")
  })

  it("stops and fails dangling tool calls when the stream ends without a result", async () => {
    mock.module("#session/llm.ts", () => ({
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: "start" }
          yield {
            type: "tool-input-start",
            id: "tool-stuck",
            toolName: "bash",
          }
          yield {
            type: "tool-call",
            toolCallId: "tool-stuck",
            toolName: "bash",
            input: { command: "pwd" },
            title: "Bash",
          }
          yield {
            type: "finish",
            finishReason: "tool-calls",
          }
        })(),
      }),
    }))

    const Processor = await import("#session/processor.ts")
    const recorded = createTurnRecorder("session-stuck")

    const assistant = {
      id: "assistant-stuck",
      sessionID: "session-stuck",
      role: "assistant",
      created: Date.now(),
      parentID: "user-stuck",
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: ".",
        root: ".",
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    } as any

    const processor = Processor.create({
      Assistant: assistant,
      turn: recorded.turn,
    })

    expect(await processor.process({} as never)).toBe("stop")

    const failed = recorded.events.find(
      (event) =>
        event.type === "tool.call.failed" &&
        event.payload.part.type === "tool" &&
        event.payload.part.callID === "tool-stuck" &&
        event.payload.part.state?.status === "error",
    )

    expect(failed).toBeDefined()
    expect(failed?.payload.part.state.error).toContain("did not complete")
    expect(processor.partFromToolCall("tool-stuck")?.state.status).toBe("error")
  })
})
