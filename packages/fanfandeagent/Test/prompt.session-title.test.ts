import { expect, mock, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"

test("prompt auto-generates and persists a session title for the first user message", async () => {
  let generatedTitleCalls = 0

  mock.module("ai", () => ({
    generateText: async () => {
      generatedTitleCalls += 1
      return {
        text: "Repo config investigation",
      }
    },
    tool: (definition: Record<string, unknown>) => definition,
  }))

  mock.module("#provider/provider.ts", () => ({
    getDefaultModelRef: async () => ({
      providerID: "test-provider",
      modelID: "test-model",
    }),
    getSelection: async () => ({
      small_model: "test-provider/test-small-model",
    }),
    getModel: async (_providerID: string, modelID: string) => ({
      id: modelID,
      providerID: "test-provider",
      capabilities: {
        reasoning: false,
        attachment: false,
        toolcall: true,
      },
    }),
    getLanguage: async (model: Record<string, unknown>) => model,
  }))

  mock.module("#session/core/llm.ts", () => ({
    stream: async () => ({
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
      })(),
    }),
  }))

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
    mock.restore()
  }
})
