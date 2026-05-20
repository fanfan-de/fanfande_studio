import { afterEach, describe, expect, it } from "bun:test"
import * as LLM from "#session/core/llm.ts"
import * as Provider from "#provider/provider.ts"

let restoreLLM: (() => void) | undefined

function createTurnRecorder(sessionID: string) {
  const events: Array<{ type: string; payload: any }> = []

  return {
    events,
    turn: {
      sessionID,
      turnID: "turn-test",
      emit(type: string, payload: unknown) {
        events.push({
          type,
          payload: structuredClone(payload),
        })

        return {
          eventID: `${type}-${events.length}`,
          sessionID,
          turnID: "turn-test",
          seq: events.length,
          timestamp: Date.now(),
          type,
          payload,
        }
      },
      close() {},
    } as any,
  }
}

function createStreamInput() {
  return {
    messages: [],
    system: [],
    tools: {},
    abort: new AbortController().signal,
    model: {
      ...Provider.testDeepSeekModel,
      providerID: "openai",
      id: "gpt-5.3-codex",
      api: {
        ...Provider.testDeepSeekModel.api,
        id: "gpt-5.3-codex",
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
    },
    agent: {
      name: "plan",
      mode: "primary",
    },
  } as any
}

describe("processor stream error persistence", () => {
  afterEach(() => {
    restoreLLM?.()
    restoreLLM = undefined
  })

  it("records stream-only errors on the assistant message", async () => {
    restoreLLM = LLM.setRuntimeDependenciesForTesting({
      getLanguage: async (model) => model as never,
      streamText: (() => ({
        fullStream: (async function* () {
          yield { type: "start" }
          yield {
            type: "error",
            error: new Error("Instructions are required"),
          }
        })(),
      })) as never,
    })

    const Processor = await import("#session/core/processor.ts")
    const recorded = createTurnRecorder("session-1")
    const assistant = {
      id: "assistant-1",
      sessionID: "session-1",
      role: "assistant",
      created: Date.now(),
      parentID: "user-1",
      modelID: "gpt-5.3-codex",
      providerID: "openai",
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
      turn: recorded.turn,
    })

    expect(await processor.process(createStreamInput())).toBe("stop")
    expect(assistant.error).toEqual({
      name: "UnknownError",
      data: {
        message: "Instructions are required",
      },
    })

    const failed = recorded.events.find((event) => event.type === "llm.call.failed")
    expect(failed?.payload.error).toBe("Instructions are required")
  })
})
