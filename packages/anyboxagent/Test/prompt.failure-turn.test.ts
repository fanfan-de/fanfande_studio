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

describe("prompt failure turns", () => {
  it("records model stream errors as failed turns with structured error info", async () => {
    const apiError = Object.assign(new Error("Internal server error"), {
      name: "AI_APICallError",
      statusCode: 500,
      isRetryable: false,
      responseBody: "upstream failed",
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
          await input.onError?.({ error: apiError })
          yield { type: "error", error: apiError }
        })(),
      })) as never,
    })

    try {
      const Session = await import("#session/core/session.ts")
      const Prompt = await import("#session/core/prompt.ts")
      const SessionUseCase = await import("#server/usecases/session.ts")

      await Instance.provide({
        directory: process.cwd(),
        async fn() {
          const session = await Session.createSession({
            directory: Instance.directory,
            projectID: Instance.project.id,
            title: "Failure test",
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
                text: "trigger model failure",
              },
            ],
          })

          expect(result.info.role).toBe("assistant")
          expect(result.info.error?.name).toBe("APIError")

          const turns = Session.listTurns(session.id)
          expect(turns).toHaveLength(1)
          expect(turns[0]).toMatchObject({
            status: "failed",
            phase: "failed",
            lastMessageID: result.info.id,
            error: "Internal server error",
            errorInfo: {
              name: "AI_APICallError",
              message: "Internal server error",
              statusCode: 500,
              retryable: false,
              providerID: "test-provider",
              modelID: "test-model",
            },
          })

          const history = await SessionUseCase.listSessionMessages(session.id)
          const assistantHistory = history.find((item) => item.info.id === result.info.id)
          expect(assistantHistory?.turn).toMatchObject({
            id: turns[0]?.id,
            status: "failed",
            errorInfo: {
              name: "AI_APICallError",
              message: "Internal server error",
            },
          })
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
    }
  })
})
