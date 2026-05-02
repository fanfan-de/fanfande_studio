import { expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"
import * as LLM from "#session/core/llm.ts"
import * as Provider from "#provider/provider.ts"
import * as SessionTitle from "#session/support/title.ts"

function createTestModel(modelID: string): Provider.Model {
  return {
    ...Provider.testDeepSeekModel,
    id: modelID,
    providerID: "test-provider",
    api: {
      ...Provider.testDeepSeekModel.api,
      id: modelID,
      url: "https://example.test/v1",
    },
    capabilities: {
      ...Provider.testDeepSeekModel.capabilities,
      input: {
        ...Provider.testDeepSeekModel.capabilities.input,
      },
      output: {
        ...Provider.testDeepSeekModel.capabilities.output,
      },
    },
  }
}

test("prompt auto-generates and persists a session title for the first user message", async () => {
  let generatedTitleCalls = 0

  const restoreTitle = SessionTitle.setRuntimeDependenciesForTesting({
    getGenerateText: async () => async () => {
      generatedTitleCalls += 1
      return {
        text: "Repo config investigation",
      } as never
    },
  })
  const restoreProvider = Provider.setProviderFunctionOverridesForTesting({
    getDefaultModelRef: async () => ({
      providerID: "test-provider",
      modelID: "test-model",
    }),
    getSelection: async () => ({
      small_model: "test-provider/test-small-model",
    }),
    getModel: async (_providerID: string, modelID: string) => createTestModel(modelID),
    getLanguage: async (model) => model as never,
  })

  const restoreLLM = LLM.setRuntimeDependenciesForTesting({
    getLanguage: async (model) => model as never,
    streamText: ((input: any) => ({
      fullStream: (async function* () {
        yield { type: "start" }
        yield {
          type: "text-start",
        }
        yield {
          type: "text-delta",
          text: "done",
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
          text: "done",
          totalUsage: {},
        })
      })(),
    })) as never,
  })

  const Session = await import("#session/core/session.ts")
  const Prompt = await import("#session/core/prompt.ts")

  try {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        await Prompt.prompt({
          sessionID: session.id,
          model: {
            providerID: "test-provider",
            modelID: "test-model",
          },
          parts: [
            {
              type: "text",
              text: "investigate why repo config loading fails",
            },
          ],
        })

        const stored = Session.DataBaseRead("sessions", session.id) as typeof session | null
        expect(stored?.title).toBe("Repo config investigation")
        expect(generatedTitleCalls).toBe(1)
      },
    })
  } finally {
    restoreLLM()
    restoreProvider()
    restoreTitle()
  }
})
