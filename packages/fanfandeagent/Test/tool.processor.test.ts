import { describe, expect, it, mock } from "bun:test"

describe("processor tool persistence", () => {
  it("persists structured tool results and tool errors", async () => {
    const updatedParts: any[] = []
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

      mock.module("#session/session.ts", () => ({
        updatePart: async (part: unknown) => {
          updatedParts.push(structuredClone(part))
        },
      }))

      const Processor = await import("#session/processor.ts")

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
      })

      expect(await processor.process({} as never)).toBe("continue")

      const textUpdates = updatedParts.filter((part) => part.type === "text")
      expect(textUpdates).toHaveLength(2)
      expect(textUpdates[0]?.text).toBe("hel")
      expect(textUpdates[1]?.text).toBe("hello!")

      const completed = updatedParts.find(
        (part) => part.type === "tool" && part.callID === "tool-1" && part.state?.status === "completed",
      )
      expect(completed).toBeDefined()
      expect(completed.state.output).toBe("alpha")
      expect(completed.state.title).toBe("Read a.txt")
      expect(completed.state.metadata).toEqual({ source: "unit" })
      expect(completed.state.attachments).toHaveLength(1)

      const failed = updatedParts.find(
        (part) => part.type === "tool" && part.callID === "tool-2" && part.state?.status === "error",
      )
      expect(failed).toBeDefined()
      expect(failed.state.error).toBe("boom")
      expect(failed.state.metadata).toEqual({ source: "unit" })

      expect(processor.partFromToolCall("tool-1")?.state.status).toBe("completed")
      expect(processor.partFromToolCall("tool-2")?.state.status).toBe("error")
    } finally {
      Date.now = originalNow
    }
  })

  it("stops the loop and persists waiting approval state when approval is requested", async () => {
    const updatedParts: any[] = []
    const approvalRequests: any[] = []

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

    mock.module("#session/session.ts", () => ({
      updatePart: async (part: unknown) => {
        updatedParts.push(structuredClone(part))
      },
    }))

    mock.module("#permission/permission.ts", () => ({
      registerApprovalRequest: async (payload: unknown) => {
        approvalRequests.push(structuredClone(payload))
      },
    }))

    const Processor = await import("#session/processor.ts")

    const assistant = {
      id: "assistant-approval",
      sessionID: "session-approval",
      role: "assistant",
      created: Date.now(),
      parentID: "user-approval",
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
    })

    expect(await processor.process({} as never)).toBe("stop")

    const waiting = updatedParts.find(
      (part) => part.type === "tool" && part.callID === "tool-approval" && part.state?.status === "waiting-approval",
    )

    expect(waiting).toBeDefined()
    expect(waiting.state.approvalID).toBe("approval-1")
    expect(waiting.state.input).toEqual({ path: "a.txt", content: "alpha" })
    expect(approvalRequests).toHaveLength(1)
    expect(processor.partFromToolCall("tool-approval")?.state.status).toBe("waiting-approval")
  })
})
