import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProviderModel } from "./types"
import { useProjectComposer } from "./use-project-composer"

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function createModel(providerID: string, id: string): ProviderModel {
  return {
    id,
    providerID,
    name: `${providerID}/${id}`,
    status: "active",
    available: true,
    capabilities: {
      temperature: true,
      reasoning: false,
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
    },
    limit: {
      context: 128_000,
      output: 16_000,
    },
  }
}

const models = [
  createModel("openai", "gpt-5.4"),
  createModel("anthropic", "claude-sonnet-4.5"),
]

function createModelsPayload(selection?: { model?: string; small_model?: string }) {
  return {
    effectiveModel: null,
    items: models,
    selection: selection ?? {},
  }
}

const originalDesktop = window.desktop

afterEach(() => {
  Object.defineProperty(window, "desktop", {
    configurable: true,
    value: originalDesktop,
  })
  vi.restoreAllMocks()
})

describe("useProjectComposer model selection", () => {
  it("shows the current session selection while stale model requests are still pending", async () => {
    const requests = new Map<string, Deferred<ReturnType<typeof createModelsPayload>>>()
    const getSessionModels = vi.fn((input: { sessionID: string }) => {
      const deferred = createDeferred<ReturnType<typeof createModelsPayload>>()
      requests.set(input.sessionID, deferred)
      return deferred.promise
    })

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        getSessionModels,
      } as unknown as typeof window.desktop,
    })

    const { result, rerender } = renderHook(
      (props: { model: string; sessionID: string }) =>
        useProjectComposer({
          attachmentPaths: [],
          projectID: "project-1",
          sessionID: props.sessionID,
          sessionModelSelection: { model: props.model },
        }),
      {
        initialProps: {
          model: "openai/gpt-5.4",
          sessionID: "session-a",
        },
      },
    )

    expect(result.current.selectedModel).toBe("openai/gpt-5.4")
    await waitFor(() => expect(getSessionModels).toHaveBeenCalledWith({ sessionID: "session-a" }))

    rerender({
      model: "anthropic/claude-sonnet-4.5",
      sessionID: "session-b",
    })

    expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4.5")
    await waitFor(() => expect(getSessionModels).toHaveBeenCalledWith({ sessionID: "session-b" }))

    await act(async () => {
      requests.get("session-a")?.resolve(createModelsPayload({ model: "openai/gpt-5.4" }))
      await requests.get("session-a")?.promise
    })

    expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4.5")
  })

  it("ignores a model save response after switching to another session", async () => {
    const pendingSave = createDeferred<{ model?: string; small_model?: string }>()
    const updateSessionModelSelection = vi.fn(() => pendingSave.promise)

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        getSessionModels: vi.fn(() => new Promise<ReturnType<typeof createModelsPayload>>(() => undefined)),
        updateSessionModelSelection,
      } as unknown as typeof window.desktop,
    })

    const { result, rerender } = renderHook(
      (props: { model: string; sessionID: string }) =>
        useProjectComposer({
          attachmentPaths: [],
          projectID: "project-1",
          sessionID: props.sessionID,
          sessionModelSelection: { model: props.model },
        }),
      {
        initialProps: {
          model: "openai/gpt-5.4",
          sessionID: "session-a",
        },
      },
    )

    let savePromise!: Promise<void>
    act(() => {
      savePromise = result.current.handleModelChange("openai/gpt-5.4-mini")
    })
    expect(result.current.selectedModel).toBe("openai/gpt-5.4-mini")

    rerender({
      model: "anthropic/claude-sonnet-4.5",
      sessionID: "session-b",
    })
    expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4.5")

    await act(async () => {
      pendingSave.resolve({ model: "openai/gpt-5.4-mini" })
      await savePromise
    })

    expect(result.current.selectedModel).toBe("anthropic/claude-sonnet-4.5")
  })

  it("keeps the session summary selection when the models endpoint fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        getSessionModels: vi.fn(async () => {
          throw new Error("models unavailable")
        }),
      } as unknown as typeof window.desktop,
    })

    const { result } = renderHook(() =>
      useProjectComposer({
        attachmentPaths: [],
        projectID: "project-1",
        sessionID: "session-a",
        sessionModelSelection: { model: "openai/gpt-5.4" },
      }),
    )

    await waitFor(() => expect(errorSpy).toHaveBeenCalled())

    expect(result.current.selectedModel).toBe("openai/gpt-5.4")
  })
})
