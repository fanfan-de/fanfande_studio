import { describe, expect, it } from "bun:test"
import "./sqlite.cleanup.ts"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Instance } from "#project/instance.ts"
import * as LLM from "#session/core/llm.ts"
import type * as MessageTypes from "#session/core/message.ts"
import * as Provider from "#provider/provider.ts"

const hasGit = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0
const itIfGit = hasGit ? it : it.skip

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
  itIfGit("records model-call patch parts per assistant iteration in a non-git directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fanfande-model-call-diff-"))
    let streamCalls = 0

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
      streamText: ((input: any) => {
        streamCalls += 1
        const call = streamCalls
        const file = call === 1 ? "first.txt" : "second.txt"
        const text = call === 1 ? "first change" : "second change"
        const finishReason = call === 1 ? "unknown" : "stop"

        return {
          fullStream: (async function* () {
            yield { type: "start" }
            await writeFile(join(tempDir, file), `${text}\n`, "utf8")
            yield { type: "text-start" }
            yield { type: "text-delta", text }
            yield { type: "text-end" }
            yield {
              type: "finish",
              finishReason,
            }
            await input.onFinish?.({
              finishReason,
              text,
              totalUsage: {},
            })
          })(),
        }
      }) as never,
    })

    try {
      const Session = await import("#session/core/session.ts")
      const Prompt = await import("#session/core/prompt.ts")
      const Message = await import("#session/core/message.ts")

      await Instance.provide({
        directory: tempDir,
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
                text: "make two changes",
              },
            ],
          })

          const assistants: MessageTypes.WithParts[] = []
          for await (const item of Message.stream(session.id)) {
            if (item.info.role === "assistant") assistants.push(item)
          }

          expect(streamCalls).toBe(2)
          expect(assistants).toHaveLength(2)

          const firstPatch = assistants[0]?.parts.find((part): part is MessageTypes.PatchPart => part.type === "patch")
          const secondPatch = assistants[1]?.parts.find((part): part is MessageTypes.PatchPart => part.type === "patch")

          expect(firstPatch?.scope).toBe("model-call")
          expect(firstPatch?.iteration).toBe(1)
          expect(typeof firstPatch?.fromSnapshot).toBe("string")
          expect(typeof firstPatch?.hash).toBe("string")
          expect(firstPatch?.files).toEqual(["first.txt"])
          expect(firstPatch?.summary).toEqual({
            files: 1,
            additions: 1,
            deletions: 0,
          })
          expect(firstPatch?.changes?.[0]?.patch).toContain("first change")

          expect(secondPatch?.scope).toBe("model-call")
          expect(secondPatch?.iteration).toBe(2)
          expect(typeof secondPatch?.fromSnapshot).toBe("string")
          expect(typeof secondPatch?.hash).toBe("string")
          expect(secondPatch?.files).toEqual(["second.txt"])
          expect(secondPatch?.summary).toEqual({
            files: 1,
            additions: 1,
            deletions: 0,
          })
          expect(secondPatch?.changes?.[0]?.patch).toContain("second change")

          expect(existsSync(join(tempDir, ".git"))).toBe(false)
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  itIfGit("does not record a model-call patch part when files do not change", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fanfande-model-call-no-diff-"))

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
          yield { type: "text-start" }
          yield { type: "text-delta", text: "no changes" }
          yield { type: "text-end" }
          yield {
            type: "finish",
            finishReason: "stop",
          }
          await input.onFinish?.({
            finishReason: "stop",
            text: "no changes",
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
        directory: tempDir,
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
                text: "do not edit files",
              },
            ],
          })

          const assistants: MessageTypes.WithParts[] = []
          for await (const item of Message.stream(session.id)) {
            if (item.info.role === "assistant") assistants.push(item)
          }

          expect(assistants).toHaveLength(1)
          expect(assistants[0]?.parts.some((part) => part.type === "patch")).toBe(false)
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  itIfGit("records a model-call patch part when the model call fails after changing files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fanfande-model-call-failed-diff-"))

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
      streamText: (() => ({
        fullStream: (async function* () {
          yield { type: "start" }
          await writeFile(join(tempDir, "failed.txt"), "changed before failure\n", "utf8")
          throw new Error("model failed")
        })(),
      })) as never,
    })

    try {
      const Session = await import("#session/core/session.ts")
      const Prompt = await import("#session/core/prompt.ts")
      const Message = await import("#session/core/message.ts")

      await Instance.provide({
        directory: tempDir,
        async fn() {
          const session = await Session.createSession({
            directory: Instance.directory,
            projectID: Instance.project.id,
          })

          await expect(Prompt.prompt({
            sessionID: session.id,
            model: {
              providerID: "test-provider",
              modelID: "test-model",
            },
            parts: [
              {
                type: "text",
                text: "fail after editing",
              },
            ],
          })).rejects.toThrow("model failed")

          const assistants: MessageTypes.WithParts[] = []
          for await (const item of Message.stream(session.id)) {
            if (item.info.role === "assistant") assistants.push(item)
          }

          expect(assistants).toHaveLength(1)
          const patch = assistants[0]?.parts.find((part): part is MessageTypes.PatchPart => part.type === "patch")
          expect(patch?.scope).toBe("model-call")
          expect(patch?.iteration).toBe(1)
          expect(patch?.files).toEqual(["failed.txt"])
          expect(patch?.summary).toEqual({
            files: 1,
            additions: 1,
            deletions: 0,
          })
          expect(patch?.changes?.[0]?.patch).toContain("changed before failure")
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it("records concurrent prompts as steer input on the active turn", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fanfande-prompt-loop-concurrency-"))
    let releaseFirstPrompt: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseFirstPrompt = resolve
    })
    let markStreamStarted: (() => void) | undefined
    const streamStarted = new Promise<void>((resolve) => {
      markStreamStarted = resolve
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
          markStreamStarted?.()
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
        directory: tempDir,
        async fn() {
          const session = await Session.createSession({
            directory: Instance.directory,
            projectID: Instance.project.id,
          })

          const firstPrompt = Prompt.promptExecution({
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

          await streamStarted

          const secondPrompt = Prompt.promptExecution({
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
          })

          expect(secondPrompt.mode).toBe("steer")

          releaseFirstPrompt?.()
          await firstPrompt.promise
          await secondPrompt.promise

          const messages: Array<{ role: string }> = []
          for await (const item of Message.stream(session.id)) {
            messages.push({ role: item.info.role })
          }

          expect(messages.filter((message) => message.role === "user")).toHaveLength(2)
        },
      })
    } finally {
      restoreLLM()
      restoreProvider()
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
