import { afterEach, describe, expect, it, mock } from "bun:test"
import z from "zod"
import * as Agent from "#agent/agent.ts"
import type * as Message from "#session/core/message.ts"
import {
  setRuntimeDependenciesForTesting,
  stream,
  type StreamInput,
} from "#session/core/llm.ts"

const testModel = {
  id: "test-model",
  providerID: "test-provider",
  api: {
    id: "test-model",
    url: "https://example.test/v1",
    npm: "@ai-sdk/openai-compatible",
  },
  name: "Test Model",
  family: "test",
  capabilities: {
    temperature: true,
    reasoning: false,
    replayAssistantReasoning: true,
    attachment: false,
    toolcall: true,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: false,
  },
  cost: {
    input: 0,
    output: 0,
    cache: {
      read: 0,
      write: 0,
    },
  },
  limit: {
    context: 128_000,
    output: 8_000,
  },
  status: "active",
  options: {},
  headers: {},
  release_date: "2024-01-01",
} satisfies StreamInput["model"]

function createUser(): Message.User {
  return {
    id: "user-message",
    sessionID: "session-101",
    role: "user",
    created: Date.now(),
    agent: "plan",
    model: {
      providerID: testModel.providerID,
      modelID: testModel.id,
    },
    system: "You are a helpful assistant.",
  }
}

function createInput(overrides: Partial<StreamInput> = {}): StreamInput {
  return {
    user: createUser(),
    sessionID: "session-101",
    model: testModel,
    agent: Agent.planAgent,
    system: ["initial-system-msg"],
    abort: new AbortController().signal,
    messages: [
      {
        role: "user",
        content: "Hello",
      },
    ],
    tools: {
      get_weather: {
        description: "Get weather",
        inputSchema: z.object({}),
        execute: async () => ({
          temperature: 25,
        }),
      },
    },
    ...overrides,
  }
}

describe("LLM stream", () => {
  let restoreRuntimeDependencies: (() => void) | undefined

  afterEach(() => {
    restoreRuntimeDependencies?.()
    restoreRuntimeDependencies = undefined
    mock.restore()
  })

  it("passes prompt, tools, model, and lifecycle callbacks to streamText", async () => {
    const chunks: unknown[] = [
      {
        type: "text-delta",
        text: "Hello",
      },
      {
        type: "finish",
        finishReason: "stop",
      },
    ]
    const languageModel = {
      specificationVersion: "v2",
      provider: "test-provider",
      modelId: "test-model",
    }
    const streamTextMock = mock((options: Record<string, unknown>) => ({
      fullStream: (async function* () {
        yield* chunks
      })(),
      textStream: (async function* () {
        yield "Hello"
      })(),
      response: Promise.resolve({ messages: [] }),
      steps: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      usage: Promise.resolve(undefined),
      warnings: Promise.resolve([]),
      request: Promise.resolve({}),
    }))
    const getLanguageMock = mock(async () => languageModel)

    restoreRuntimeDependencies = setRuntimeDependenciesForTesting({
      streamText: streamTextMock,
      getLanguage: getLanguageMock,
      outputText: () => ({
        type: "text",
      }),
      stepCountIs: (count: number) => ({
        type: "step-count",
        count,
      }),
    } as never)

    const onFinish = mock(async () => {})
    const onAbort = mock(async () => {})
    const onError = mock(async () => {})
    const input = createInput({
      onFinish,
      onAbort,
      onError,
    })

    const result = await stream(input)
    const received: unknown[] = []
    for await (const chunk of result.fullStream) {
      received.push(chunk)
    }

    expect(received).toEqual(chunks)
    expect(getLanguageMock).toHaveBeenCalledWith(testModel)
    expect(streamTextMock).toHaveBeenCalledTimes(1)

    const options = streamTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(options.model).toBe(languageModel)
    expect(options.system).toBe("initial-system-msg")
    expect(options.prompt).toEqual(input.messages)
    expect(options.tools).toBe(input.tools)
    expect(options.abortSignal).toBe(input.abort)
    expect(options.maxRetries).toBe(0)
    expect(options.activeTools).toEqual(["get_weather"])
    expect(options.output).toEqual({
      type: "text",
    })
    expect(options.onFinish).toBeTypeOf("function")
    expect(options.onAbort).toBeTypeOf("function")
    expect(options.onError).toBeTypeOf("function")
  })
})
