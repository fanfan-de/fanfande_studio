import { beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"

type StreamInput = {
  agent: {
    name: string
    mode: string
  }
  system?: string[]
  onFinish?: (event: Record<string, unknown>) => PromiseLike<void> | void
}

const baseModel = {
  providerID: "test-provider",
  modelID: "test-model",
}

const streamInputs: StreamInput[] = []

mock.module("#provider/provider.ts", () => ({
  getDefaultModelRef: async () => baseModel,
  getSelection: async () => ({}),
  getModel: async () => ({
    id: baseModel.modelID,
    providerID: baseModel.providerID,
    capabilities: {
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
    },
  }),
  getLanguage: async (model: Record<string, unknown>) => model,
}))

mock.module("#session/core/llm.ts", () => ({
  stream: async (input: StreamInput) => {
    streamInputs.push(input)
    return {
      fullStream: (async function* () {
        let text = ""
        yield { type: "start" }
        yield { type: "text-start" }
        text = "sidechat response"
        yield { type: "text-delta", text }
        yield { type: "text-end" }
        yield { type: "finish", finishReason: "stop" }
        await input.onFinish?.({
          finishReason: "stop",
          text,
        })
      })(),
    }
  },
}))

beforeEach(() => {
  streamInputs.length = 0
})

async function removeWithRetry(target: string, attempts = 10) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      Bun.gc(true)
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await Bun.sleep(50 * (attempt + 1))
    }
  }

  throw lastError
}

async function withTempDb<T>(name: string, fn: (root: string) => Promise<T>) {
  const Sqlite = await import("#database/Sqlite.ts")
  const root = await mkdtemp(join(tmpdir(), name))
  const databaseFile = join(root, "test.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)
    return await Instance.provide({
      directory: root,
      fn: () => fn(root),
    })
  } finally {
    Sqlite.closeDatabase()
    Sqlite.setDatabaseFile(undefined)
    await removeWithRetry(root)
  }
}

async function createAnchoredSideChat(root: string) {
  const Identifier = await import("#id/id.ts")
  const Message = await import("#session/core/message.ts")
  const Session = await import("#session/core/session.ts")

  const parentSession = await Session.createSession({
    directory: root,
    projectID: "project_sidechat_agent",
  })
  const userMessage = Message.User.parse({
    id: Identifier.ascending("message"),
    sessionID: parentSession.id,
    role: "user",
    created: Date.now(),
    agent: "default",
    model: baseModel,
  })
  const userPart = Message.TextPart.parse({
    id: Identifier.ascending("part"),
    sessionID: parentSession.id,
    messageID: userMessage.id,
    type: "text",
    text: "Explain this result.",
  })
  const assistantMessage = Message.Assistant.parse({
    id: Identifier.ascending("message"),
    sessionID: parentSession.id,
    role: "assistant",
    created: Date.now() + 1,
    parentID: userMessage.id,
    modelID: baseModel.modelID,
    providerID: baseModel.providerID,
    agent: "default",
    path: {
      cwd: root,
      root,
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
    finishReason: "stop",
  })
  const assistantPart = Message.TextPart.parse({
    id: Identifier.ascending("part"),
    sessionID: parentSession.id,
    messageID: assistantMessage.id,
    type: "text",
    text: "The anchored response is available for side chat.",
  })

  Session.updateMessage(userMessage)
  Session.updatePart(userPart)
  Session.updateMessage(assistantMessage)
  Session.updatePart(assistantPart)

  return Session.createSideChat({
    parentSessionID: parentSession.id,
    anchorMessageID: assistantMessage.id,
  })
}

describe("sidechat agent", () => {
  test("registers a hidden native sidechat profile", async () => {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const Agent = await import("#agent/agent.ts")
        const sidechat = await Agent.get(Agent.SIDECHAT_AGENT_NAME)

        expect(sidechat).toBeDefined()
        expect(sidechat?.name).toBe("sidechat")
        expect(sidechat?.mode).toBe("side-chat")
        expect(sidechat?.native).toBe(true)
        expect(sidechat?.hidden).toBe(true)
        expect(sidechat?.toolPolicy).toBe("read-only")
      },
    })
  })

  test("stores new side-chat user messages with the sidechat agent", async () => {
    await withTempDb("fanfande-sidechat-agent-store-", async (root) => {
      const Prompt = await import("#session/core/prompt.ts")
      const Session = await import("#session/core/session.ts")
      const sideChat = await createAnchoredSideChat(root)

      await Prompt.prompt({
        sessionID: sideChat.id,
        model: baseModel,
        parts: [{ type: "text", text: "Can you clarify this?" }],
      })

      const context = Session.getSideChatContext(sideChat.id)
      const userMessages = context?.messages
        .map((message) => message.info)
        .filter((message) => message.role === "user" && !message.internal)

      expect(userMessages?.at(-1)?.agent).toBe("sidechat")
      expect(streamInputs.at(-1)?.agent.name).toBe("sidechat")
      expect(streamInputs.at(-1)?.agent.mode).toBe("side-chat")
    })
  })

  test("uses the selected side-chat prompt preset in side-chat system prompts", async () => {
    await withTempDb("fanfande-sidechat-agent-preset-", async (root) => {
      const Prompt = await import("#session/core/prompt.ts")
      const PromptPresets = await import("#session/support/prompt-presets.ts")
      const sideChat = await createAnchoredSideChat(root)
      const customPrompt = "Custom side chat prompt: answer from the configured preset only."

      const customPreset = await PromptPresets.createPromptPreset({
        label: "Side chat custom",
        content: customPrompt,
      })
      const currentSelection = await PromptPresets.getPromptPresetSelection()
      await PromptPresets.updatePromptPresetSelection({
        ...currentSelection,
        sideChatPromptPresetID: customPreset.id,
      })

      await Prompt.prompt({
        sessionID: sideChat.id,
        model: baseModel,
        parts: [{ type: "text", text: "Which prompt is active?" }],
      })

      expect(streamInputs.at(-1)?.system?.some((item) => item.includes(customPrompt))).toBe(true)
    })
  })

  test("runs legacy side-chat messages through the sidechat runtime agent", async () => {
    await withTempDb("fanfande-sidechat-agent-legacy-", async (root) => {
      const Identifier = await import("#id/id.ts")
      const Message = await import("#session/core/message.ts")
      const Prompt = await import("#session/core/prompt.ts")
      const Session = await import("#session/core/session.ts")
      const sideChat = await createAnchoredSideChat(root)

      const legacyUser = Message.User.parse({
        id: Identifier.ascending("message"),
        sessionID: sideChat.id,
        role: "user",
        created: Date.now(),
        agent: "default",
        model: baseModel,
      })
      const legacyPart = Message.TextPart.parse({
        id: Identifier.ascending("part"),
        sessionID: sideChat.id,
        messageID: legacyUser.id,
        type: "text",
        text: "Legacy side chat message.",
      })

      Session.updateMessage(legacyUser)
      Session.updatePart(legacyPart)

      await Prompt.resume({ sessionID: sideChat.id })

      expect(streamInputs.at(-1)?.agent.name).toBe("sidechat")
      expect(streamInputs.at(-1)?.agent.mode).toBe("side-chat")
    })
  })

  test("rejects explicit sidechat agent usage in main sessions", async () => {
    await withTempDb("fanfande-sidechat-agent-main-reject-", async (root) => {
      const Prompt = await import("#session/core/prompt.ts")
      const Session = await import("#session/core/session.ts")
      const session = await Session.createSession({
        directory: root,
        projectID: "project_sidechat_agent_reject",
      })

      await expect(
        Prompt.prompt({
          sessionID: session.id,
          agent: "sidechat",
          model: baseModel,
          parts: [{ type: "text", text: "Use the sidechat profile." }],
        }),
      ).rejects.toThrow("Agent 'sidechat' can only be used by side chat sessions.")
    })
  })

  test("uses sidechat toolPolicy to expose only read-only tools", async () => {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const Agent = await import("#agent/agent.ts")
        const ResolveTools = await import("#session/core/resolve-tools.ts")
        const sidechat = await Agent.get("sidechat")

        if (!sidechat) {
          throw new Error("Expected sidechat agent to exist.")
        }

        const tools = await ResolveTools.resolveTools({
          agent: sidechat,
          sessionID: "ses_sidechat_agent_tools_filter",
          messageID: "msg_sidechat_agent_tools_filter",
          abort: new AbortController().signal,
        })

        expect(tools["read-file"]).toBeDefined()
        expect(tools["grep"]).toBeDefined()
        expect(tools["replace-text"]).toBeUndefined()
        expect(tools["spawn_subagent"]).toBeUndefined()
        expect(tools["powershell_command"]).toBeUndefined()
      },
    })
  })
})
