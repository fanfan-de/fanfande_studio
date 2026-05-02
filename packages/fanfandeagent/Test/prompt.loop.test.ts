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
      toolcall: true,
      input: {
        ...Provider.testDeepSeekModel.capabilities.input,
      },
      output: {
        ...Provider.testDeepSeekModel.capabilities.output,
      },
    },
  }
}

describe("prompt loop concurrency", () => {
  it("rejects concurrent prompts before persisting a second user message", async () => {
    let releaseFirstPrompt: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseFirstPrompt = resolve
    })

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
      streamText: ((input: any) => ({
        fullStream: (async function* () {
          yield { type: "start" }
          await gate
          yield {
            type: "text-start",
          }
          yield {
            type: "text-delta",
            text: "ok",
          }
          yield {
            type: "text-end",
          }
          yield {
            type: "finish",
            finishReason: "stop",
          }
          await input.onFinish?.({
            finishReason: "stop",
            text: "ok",
            totalUsage: {},
          })
        })(),
      })) as never,
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

          const firstPrompt = Prompt.prompt({
            sessionID: session.id,
            model: {
              providerID: "test-provider",
              modelID: "test-model",
            },
            parts: [
              {
                type: "text",
                text: "first",
              },
            ],
          })

          await new Promise((resolve) => setTimeout(resolve, 10))

          await expect(
            Prompt.prompt({
              sessionID: session.id,
              model: {
                providerID: "test-provider",
                modelID: "test-model",
              },
              parts: [
                {
                  type: "text",
                  text: "second",
                },
              ],
            }),
          ).rejects.toThrow(`Session '${session.id}' is already running.`)

          releaseFirstPrompt?.()
          await firstPrompt

          const messages: Array<{ role: string }> = []
          for await (const item of Message.stream(session.id)) {
            messages.push({ role: item.info.role })
          }

          expect(messages.filter((message) => message.role === "user")).toHaveLength(1)
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
    }
  })
})
