import { describe, expect, it } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"
import * as LLM from "#session/core/llm.ts"
import * as Provider from "#provider/provider.ts"

function createTestModel(): Provider.Model {
  return {
    ...Provider.testDeepSeekModel,
    id: "test-model",
    providerID: "test-provider",
    api: {
      ...Provider.testDeepSeekModel.api,
      id: "test-model",
      url: "https://example.test/v1",
    },
    capabilities: {
      ...Provider.testDeepSeekModel.capabilities,
      toolcall: false,
      input: {
        ...Provider.testDeepSeekModel.capabilities.input,
      },
      output: {
        ...Provider.testDeepSeekModel.capabilities.output,
      },
    },
  }
}

describe("prompt loop limit", () => {
  it("allows long-running turns to exceed the old 64-iteration default before a final response", async () => {
    let streamCalls = 0

    const restoreProvider = Provider.setProviderFunctionOverridesForTesting({
      getDefaultModelRef: async () => ({
        providerID: "test-provider",
        modelID: "test-model",
      }),
      getSelection: async () => ({}),
      getModel: async () => createTestModel(),
      getLanguage: async (model) => model as never,
    })

    const restoreLLM = LLM.setRuntimeDependenciesForTesting({
      getLanguage: async (model) => model as never,
      streamText: ((input: any) => {
        streamCalls += 1
        const isFinalCall = streamCalls === 65

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
      }) as never,
    })

    try {
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

          expect(streamCalls).toBe(65)
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

          expect(assistants).toHaveLength(65)
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
    }
  }, 15_000)
})
