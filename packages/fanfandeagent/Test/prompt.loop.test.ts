import { describe, expect, it, mock } from "bun:test"
import { Instance } from "#project/instance.ts"

describe("prompt loop concurrency", () => {
  it("rejects concurrent prompts before persisting a second user message", async () => {
    let releaseFirstPrompt: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseFirstPrompt = resolve
    })

    mock.module("#provider/provider.ts", () => ({
      getDefaultModelRef: async () => ({
        providerID: "test-provider",
        modelID: "test-model",
      }),
      getModel: async () => ({
        id: "test-model",
        providerID: "test-provider",
        capabilities: {
          reasoning: false,
          attachment: false,
          toolcall: true,
        },
      }),
    }))

    mock.module("#session/llm.ts", () => ({
      stream: async () => ({
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
        })(),
      }),
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
  })
})
