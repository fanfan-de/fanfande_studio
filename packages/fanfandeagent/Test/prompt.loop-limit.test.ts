import { describe, expect, it, mock } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"

describe("prompt loop limit", () => {
  it("allows long-running turns to exceed 16 iterations before a final response", async () => {
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

    mock.module("#session/core/llm.ts", () => ({
      stream: async (input: any) => {
        streamCalls += 1
        const isFinalCall = streamCalls === 17

        return {
          fullStream: (async function* () {
            yield { type: "start" }

            if (isFinalCall) {
              yield { type: "text-start" }
              yield { type: "text-delta", text: "done" }
              yield { type: "text-end" }
            }

            yield {
              type: "finish",
              finishReason: isFinalCall ? "stop" : "unknown",
            }
            await input.onFinish?.({
              finishReason: isFinalCall ? "stop" : "unknown",
              text: isFinalCall ? "done" : "",
              totalUsage: {},
            })
          })(),
        }
      },
    }))

    const Session = await import("#session/core/session.ts")
    const Prompt = await import("#session/core/prompt.ts")
    const Message = await import("#session/core/message.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const result = await Prompt.prompt({
          sessionID: session.id,
          model: {
            providerID: "test-provider",
            modelID: "test-model",
          },
          parts: [
            {
              type: "text",
              text: "keep going until you are done",
            },
          ],
        })

        expect(streamCalls).toBe(17)
        expect(result.info.role).toBe("assistant")
        expect(result.info.finishReason).toBe("stop")
        expect(
          result.parts.some(
            (part: { type: string; text?: string }) => part.type === "text" && part.text === "done",
          ),
        ).toBe(true)

        const assistants: string[] = []
        for await (const item of Message.stream(session.id)) {
          if (item.info.role !== "assistant") continue
          assistants.push(item.info.id)
        }

        expect(assistants).toHaveLength(17)
      },
    })
  })
})
