import { afterEach, beforeAll, describe, expect, it, mock } from "bun:test"

const capturedRequests: Array<Record<string, unknown>> = []

mock.module("ai", () => ({
  streamText(options: Record<string, unknown>) {
    capturedRequests.push(options)
    return {
      fullStream: (async function* () {
        yield { type: "start" }
        yield { type: "finish", finishReason: "stop" }
      })(),
    }
  },
  Output: {
    text() {
      return { type: "text" }
    },
  },
  stepCountIs() {
    return undefined
  },
}))

mock.module("#provider/provider.ts", () => ({
  getLanguage: async () => ({ id: "language-model" }),
}))

const llmModulePromise = import("#session/llm.ts")

function createModel(input: { providerID: string; url: string; id?: string; reasoning?: boolean }) {
  return {
    id: input.id ?? "test-model",
    providerID: input.providerID,
    api: {
      id: input.id ?? "test-model",
      url: input.url,
      npm: "@ai-sdk/openai",
    },
    capabilities: {
      reasoning: input.reasoning ?? false,
      attachment: false,
      toolcall: true,
      input: {
        image: false,
        pdf: false,
      },
    },
  } as any
}

function createInput(model: ReturnType<typeof createModel>) {
  return {
    user: {
      id: "user-1",
    },
    sessionID: "session-1",
    messageID: "message-1",
    model,
    agent: {
      name: "plan",
      mode: "primary",
    },
    system: ["alpha", "beta"],
    abort: new AbortController().signal,
    messages: [],
    tools: {},
  } as any
}

describe("llm codex request shaping", () => {
  beforeAll(async () => {
    await llmModulePromise
  })

  afterEach(() => {
    capturedRequests.length = 0
  })

  it("sends OpenAI Codex system prompts as provider instructions", async () => {
    const { stream } = await llmModulePromise

    await stream(
      createInput(
        createModel({
          providerID: "openai",
          url: "https://chatgpt.com/backend-api/codex",
        }),
      ),
    )

    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.providerOptions).toEqual({
      openai: {
        store: false,
        instructions: "alpha\nbeta",
      },
    })
    expect(capturedRequests[0]?.system).toBeUndefined()
  })

  it("keeps non-Codex providers on the normal system field", async () => {
    const { stream } = await llmModulePromise

    await stream(
      createInput(
        createModel({
          providerID: "deepseek",
          url: "https://api.deepseek.com/v1",
        }),
      ),
    )

    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.providerOptions).toBeUndefined()
    expect(capturedRequests[0]?.system).toBe("alpha\nbeta")
  })

  it("requests OpenAI reasoning summaries for reasoning models", async () => {
    const { stream } = await llmModulePromise

    await stream({
      ...createInput(
        createModel({
          providerID: "openai",
          url: "https://api.openai.com/v1",
          reasoning: true,
        }),
      ),
      reasoningEffort: "high",
    })

    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.providerOptions).toEqual({
      openai: {
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
    })
    expect(capturedRequests[0]?.system).toBe("alpha\nbeta")
  })

  it("does not request OpenAI reasoning summaries unless reasoning effort is explicit", async () => {
    const { stream } = await llmModulePromise

    await stream(
      createInput(
        createModel({
          providerID: "openai",
          url: "https://api.openai.com/v1",
          reasoning: true,
        }),
      ),
    )

    expect(capturedRequests).toHaveLength(1)
    expect(capturedRequests[0]?.providerOptions).toBeUndefined()
    expect(capturedRequests[0]?.system).toBe("alpha\nbeta")
  })
})
