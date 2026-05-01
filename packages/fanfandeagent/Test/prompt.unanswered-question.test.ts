import { describe, expect, it, mock } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Identifier from "#id/id.ts"
import { Instance } from "#project/instance.ts"

describe("prompt loop unanswered question guard", () => {
  it("returns the latest assistant without creating a new step when a user question is waiting for an answer", async () => {
    let streamCalls = 0

    mock.module("#provider/provider.ts", () => ({
      getDefaultModelRef: async () => ({
        providerID: "test-provider",
        modelID: "test-model",
      }),
      getSelection: async () => ({}),
      getModel: async () => {
        throw new Error("getModel should not be called while an unanswered question is blocking the loop")
      },
      getLanguage: async (model: Record<string, unknown>) => model,
    }))

    mock.module("#session/core/llm.ts", () => ({
      stream: async () => {
        streamCalls += 1
        return {
          fullStream: (async function* () {})(),
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
          callID: "call-question",
          tool: "AskUserQuestion",
          state: {
            status: "completed",
            input: {
              question: "Where should I deploy this app?",
            },
            output: "Question shown to the user.",
            title: "Question for user",
            metadata: {
              kind: "ask-user-question",
              version: 1,
              questionID: "que_deploy_target",
              question: "Where should I deploy this app?",
              options: [
                {
                  label: "Vercel",
                  value: "vercel",
                },
              ],
              allowFreeform: true,
              multiple: false,
              required: true,
            },
            time: {
              start: Date.now() + 2,
              end: Date.now() + 3,
            },
          },
        })

        Session.DataBaseCreate("messages", user)
        Session.DataBaseCreate("messages", assistant)
        Session.DataBaseCreate("parts", toolPart)

        const result = await Prompt.resume({
          sessionID: session.id,
        })

        expect(result.info.id).toBe(assistant.id)
        expect(streamCalls).toBe(0)

        const assistants: string[] = []
        for await (const item of Message.stream(session.id)) {
          if (item.info.role !== "assistant") continue
          assistants.push(item.info.id)
        }

        expect(assistants).toEqual([assistant.id])
      },
    })
  })
})
