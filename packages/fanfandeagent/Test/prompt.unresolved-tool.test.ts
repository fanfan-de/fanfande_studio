import { describe, expect, it, mock } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Identifier from "#id/id.ts"
import { Instance } from "#project/instance.ts"

describe("prompt loop unresolved tool guard", () => {
  it("repairs dangling tool calls and continues the loop", async () => {
    let streamCalls = 0

    mock.module("#provider/provider.ts", () => ({
      getDefaultModelRef: async () => ({
        providerID: "test-provider",
        modelID: "test-model",
      }),
      getSelection: async () => ({}),
      getModel: async () => ({
        id: "test-model",
        providerID: "test-provider",
        capabilities: {
          reasoning: false,
          attachment: false,
          toolcall: false,
        },
      }),
      getLanguage: async (model: Record<string, unknown>) => model,
    }))

    mock.module("#session/llm.ts", () => ({
      stream: async () => {
        streamCalls += 1
        return {
          fullStream: (async function* () {
            yield { type: "start" }
            yield { type: "text-start" }
            yield { type: "text-delta", text: "resumed" }
            yield { type: "text-end" }
            yield {
              type: "finish",
              finishReason: "stop",
            }
          })(),
        }
      },
    }))

    const Session = await import("#session/session.ts")
    const Prompt = await import("#session/prompt.ts")
    const Message = await import("#session/message.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const user = Message.User.parse({
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "user",
          created: Date.now(),
          agent: "plan",
          model: {
            providerID: "test-provider",
            modelID: "test-model",
          },
        })

        const assistant = Message.Assistant.parse({
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "assistant",
          created: Date.now() + 1,
          parentID: user.id,
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
          finishReason: "tool-calls",
        })

        const toolPart = Message.ToolPart.parse({
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistant.id,
          type: "tool",
          callID: "call-stuck",
          tool: "bash",
          state: {
            status: "running",
            input: {
              command: "pwd",
            },
            title: "Bash",
            time: {
              start: Date.now() + 2,
            },
          },
        })

        Session.DataBaseCreate("messages", user)
        Session.DataBaseCreate("messages", assistant)
        Session.DataBaseCreate("parts", toolPart)

        const result = await Prompt.resume({
          sessionID: session.id,
        })

        expect(result.info.id).not.toBe(assistant.id)
        expect(result.info.finishReason).toBe("stop")
        expect(streamCalls).toBe(1)

        const assistants: Array<{ info: { id: string; role: string }; parts: any[] }> = []
        for await (const item of Message.stream(session.id)) {
          if (item.info.role !== "assistant") continue
          assistants.push(item)
        }

        expect(assistants.map((item) => item.info.id)).toHaveLength(2)
        expect(assistants.at(-1)?.info.id).toBe(result.info.id)

        const recoveredAssistant = assistants.find((item) => item.info.id === assistant.id)
        const recoveredTool = recoveredAssistant?.parts.find(
          (part) => part.type === "tool" && part.callID === "call-stuck",
        )

        expect(recoveredTool?.state.status).toBe("error")
        if (!recoveredTool || recoveredTool.state.status !== "error") {
          throw new Error("expected dangling tool call to be repaired as an error")
        }
        expect(recoveredTool.state.error).toContain("interrupted run")
      },
    })
  })
})
