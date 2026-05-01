import { describe, expect, it, mock } from "bun:test"
import "./sqlite.cleanup.ts"
import { Instance } from "#project/instance.ts"

type StreamInput = {
  sessionID: string
  abort: AbortSignal
}

type StreamResult = Promise<{
  fullStream: AsyncGenerator<Record<string, unknown>>
}>

let streamHandler: (input: StreamInput) => StreamResult = async () => ({
  fullStream: (async function* () {
    yield { type: "start" }
    yield { type: "text-start" }
    yield { type: "text-delta", text: "default response" }
    yield { type: "text-end" }
    yield { type: "finish", finishReason: "stop" }
  })(),
})

mock.module("#provider/provider.ts", () => ({
  getDefaultModelRef: async () => ({
    providerID: "test-provider",
    modelID: "test-model",
  }),
  getSelection: async () => ({}),
  getModel: async () => ({
    id: "test-model",
    providerID: "test-provider",
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
  stream: (input: StreamInput) => streamHandler(input),
}))

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options?: {
    timeoutMs?: number
    intervalMs?: number
  },
) {
  const timeoutMs = options?.timeoutMs ?? 2_000
  const intervalMs = options?.intervalMs ?? 20
  const start = Date.now()

  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

describe("subagent tools", () => {
  it("runs a child session synchronously and returns the final summary", async () => {
    streamHandler = async () => ({
      fullStream: (async function* () {
        yield { type: "start" }
        yield { type: "text-start" }
        yield { type: "text-delta", text: "subagent completed" }
        yield { type: "text-end" }
        yield { type: "finish", finishReason: "stop" }
      })(),
    })

    const Session = await import("#session/core/session.ts")
    const { SpawnSubagentTool } = await import("#tool/spawn-subagent.ts")
    const { ReadSubagentTool } = await import("#tool/read-subagent.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const parent = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
          title: "parent",
        })

        const spawn = await SpawnSubagentTool.init()
        const spawned = await spawn.execute(
          {
            prompt: "Inspect the delegated task and report back.",
            agent: "default",
          },
          {
            sessionID: parent.id,
            messageID: "msg_parent_sync_tool",
            toolCallID: "tool-call-sync",
          },
        )

        expect(spawned.text).toContain("subagent completed")
        expect(spawned.metadata).toMatchObject({
          kind: "subagent",
          action: "spawn",
          status: "completed",
          active: false,
        })

        const taskID = (spawned.metadata as { id: string }).id
        const read = await ReadSubagentTool.init()
        const result = await read.execute(
          { id: taskID },
          {
            sessionID: parent.id,
            messageID: "msg_parent_sync_read",
          },
        )

        expect(result.text).toContain("Status: completed")
        expect(result.text).toContain("subagent completed")
        expect(result.metadata).toMatchObject({
          kind: "subagent",
          action: "read",
          id: taskID,
          status: "completed",
        })
      },
    })
  })

  it("starts a background child session and exposes progress through read_subagent", async () => {
    const gates = new Map<string, () => void>()

    streamHandler = async (input) => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      gates.set(input.sessionID, release)

      const aborted = new Promise<never>((_, reject) => {
        input.abort.addEventListener("abort", () => reject(new Error("subagent cancelled")), { once: true })
      })

      return {
        fullStream: (async function* () {
          yield { type: "start" }
          await Promise.race([gate, aborted])
          yield { type: "text-start" }
          yield { type: "text-delta", text: "background done" }
          yield { type: "text-end" }
          yield { type: "finish", finishReason: "stop" }
        })(),
      }
    }

    const Session = await import("#session/core/session.ts")
    const { SpawnSubagentTool } = await import("#tool/spawn-subagent.ts")
    const { ReadSubagentTool } = await import("#tool/read-subagent.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const parent = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
          title: "parent-bg",
        })

        const spawn = await SpawnSubagentTool.init()
        const read = await ReadSubagentTool.init()
        const spawned = await spawn.execute(
          {
            prompt: "Run in the background and finish later.",
            runInBackground: true,
          },
          {
            sessionID: parent.id,
            messageID: "msg_parent_background_tool",
            toolCallID: "tool-call-background",
          },
        )

        const taskID = (spawned.metadata as { id: string }).id

        await waitFor(() => gates.size > 0)

        const running = await read.execute(
          { id: taskID },
          {
            sessionID: parent.id,
            messageID: "msg_parent_background_read",
          },
        )
        expect(running.metadata).toMatchObject({
          kind: "subagent",
          action: "read",
          status: "running",
        })

        gates.values().next().value?.()

        await waitFor(async () => {
          const snapshot = await read.execute(
            { id: taskID },
            {
              sessionID: parent.id,
              messageID: "msg_parent_background_poll",
            },
          )
          return (snapshot.metadata as { status?: string }).status === "completed"
        })

        const completed = await read.execute(
          { id: taskID },
          {
            sessionID: parent.id,
            messageID: "msg_parent_background_final",
          },
        )
        expect(completed.text).toContain("background done")
        expect(completed.metadata).toMatchObject({
          kind: "subagent",
          action: "read",
          status: "completed",
          active: false,
        })
      },
    })
  })

  it("cancels a running background child session", async () => {
    const gates = new Map<string, () => void>()

    streamHandler = async (input) => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      gates.set(input.sessionID, release)

      const aborted = new Promise<never>((_, reject) => {
        input.abort.addEventListener("abort", () => reject(new Error("subagent cancelled")), { once: true })
      })

      return {
        fullStream: (async function* () {
          yield { type: "start" }
          await Promise.race([gate, aborted])
          yield { type: "text-start" }
          yield { type: "text-delta", text: "should not finish normally" }
          yield { type: "text-end" }
          yield { type: "finish", finishReason: "stop" }
        })(),
      }
    }

    const Session = await import("#session/core/session.ts")
    const { SpawnSubagentTool } = await import("#tool/spawn-subagent.ts")
    const { ReadSubagentTool } = await import("#tool/read-subagent.ts")
    const { CancelSubagentTool } = await import("#tool/cancel-subagent.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const parent = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
          title: "parent-cancel",
        })

        const spawn = await SpawnSubagentTool.init()
        const read = await ReadSubagentTool.init()
        const cancel = await CancelSubagentTool.init()
        const spawned = await spawn.execute(
          {
            prompt: "Start and wait forever until cancelled.",
            runInBackground: true,
          },
          {
            sessionID: parent.id,
            messageID: "msg_parent_cancel_tool",
            toolCallID: "tool-call-cancel",
          },
        )

        const taskID = (spawned.metadata as { id: string }).id
        await waitFor(() => gates.size > 0)

        const cancelled = await cancel.execute(
          { id: taskID },
          {
            sessionID: parent.id,
            messageID: "msg_parent_cancel_request",
          },
        )
        expect(cancelled.metadata).toMatchObject({
          kind: "subagent",
          action: "cancel",
          status: "cancelled",
        })

        await waitFor(async () => {
          const snapshot = await read.execute(
            { id: taskID },
            {
              sessionID: parent.id,
              messageID: "msg_parent_cancel_poll",
            },
          )
          return (snapshot.metadata as { status?: string }).status === "cancelled"
        })

        const snapshot = await read.execute(
          { id: taskID },
          {
            sessionID: parent.id,
            messageID: "msg_parent_cancel_final",
          },
        )
        expect(snapshot.text).toContain("Status: cancelled")
        expect(snapshot.metadata).toMatchObject({
          kind: "subagent",
          action: "read",
          status: "cancelled",
          active: false,
        })
      },
    })
  })

  it("automatically notifies the parent session when a background subagent completes", async () => {
    const gates = new Map<string, () => void>()
    let parentSessionID = ""
    let parentCallCount = 0

    streamHandler = async (input) => {
      if (input.sessionID === parentSessionID) {
        parentCallCount += 1
        const text = parentCallCount === 1
          ? "parent ready"
          : "parent processed background notification"

        return {
          fullStream: (async function* () {
            yield { type: "start" }
            yield { type: "text-start" }
            yield { type: "text-delta", text }
            yield { type: "text-end" }
            yield { type: "finish", finishReason: "stop" }
          })(),
        }
      }

      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      gates.set(input.sessionID, release)

      return {
        fullStream: (async function* () {
          yield { type: "start" }
          await gate
          yield { type: "text-start" }
          yield { type: "text-delta", text: "worker finished delegated research" }
          yield { type: "text-end" }
          yield { type: "finish", finishReason: "stop" }
        })(),
      }
    }

    const Session = await import("#session/core/session.ts")
    const Prompt = await import("#session/core/prompt.ts")
    const Message = await import("#session/core/message.ts")
    const { SpawnSubagentTool } = await import("#tool/spawn-subagent.ts")
    const { ReadSubagentTool } = await import("#tool/read-subagent.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const parent = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
          title: "parent-notify",
        })
        parentSessionID = parent.id

        const initial = await Prompt.prompt({
          sessionID: parent.id,
          model: {
            providerID: "test-provider",
            modelID: "test-model",
          },
          parts: [
            {
              type: "text",
              text: "Begin the main task and wait for delegated work.",
            },
          ],
        })

        const spawn = await SpawnSubagentTool.init()
        const read = await ReadSubagentTool.init()
        const spawned = await spawn.execute(
          {
            prompt: "Do delegated work in the background.",
            runInBackground: true,
          },
          {
            sessionID: parent.id,
            messageID: initial.info.id,
            toolCallID: "tool-call-parent-notify",
          },
        )

        const taskID = (spawned.metadata as { id: string }).id
        await waitFor(() => gates.size > 0)
        gates.values().next().value?.()

        await waitFor(async () => {
          const snapshot = await read.execute(
            { id: taskID },
            {
              sessionID: parent.id,
              messageID: "msg_parent_notify_poll",
            },
          )
          const metadata = snapshot.metadata as {
            status?: string
            parentNotification?: { status?: string }
          }
          return metadata.status === "completed" && metadata.parentNotification?.status === "sent"
        })

        const messages = []
        for await (const item of Message.stream(parent.id)) {
          messages.push(item)
        }

        const userMessages = messages.filter((item) => item.info.role === "user")
        const assistantMessages = messages.filter((item) => item.info.role === "assistant")
        expect(userMessages).toHaveLength(2)
        expect(assistantMessages).toHaveLength(2)
        expect(
          userMessages.some((message) =>
            message.parts.some(
              (part: { type: string; text?: string; metadata?: Record<string, unknown> }) =>
                part.type === "text" &&
                part.metadata?.kind === "subtask-notification" &&
                part.text?.includes("worker finished delegated research"),
            ),
          ),
        ).toBe(true)
        expect(
          assistantMessages.some((message) =>
            message.parts.some(
              (part: { type: string; text?: string }) =>
                part.type === "text" && part.text === "parent processed background notification",
            ),
          ),
        ).toBe(true)
      },
    })
  })

  it("filters available tools based on the agent profile", async () => {
    streamHandler = async () => ({
      fullStream: (async function* () {
        yield { type: "start" }
        yield { type: "finish", finishReason: "stop" }
      })(),
    })

    const Agent = await import("#agent/agent.ts")
    const ResolveTools = await import("#session/core/resolve-tools.ts")

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const plan = await Agent.get("plan")
        const compaction = await Agent.get("compaction")

        if (!plan || !compaction) {
          throw new Error("Expected built-in agents to exist.")
        }

        const planTools = await ResolveTools.resolveTools({
          agent: plan,
          sessionID: "ses_plan_tools_filter",
          messageID: "msg_plan_tools_filter",
          abort: new AbortController().signal,
        })

        expect(planTools["read-file"]).toBeDefined()
        expect(planTools["ExitPlanMode"]).toBeDefined()
        expect(planTools["git_bash_command"]).toBeUndefined()
        expect(planTools["powershell_command"]).toBeUndefined()
        expect(planTools["cmd_command"]).toBeUndefined()
        expect(planTools["wsl_bash_command"]).toBeUndefined()
        expect(planTools["replace-text"]).toBeUndefined()
        expect(planTools["spawn_subagent"]).toBeUndefined()

        const compactionTools = await ResolveTools.resolveTools({
          agent: compaction,
          sessionID: "ses_compaction_tools_filter",
          messageID: "msg_compaction_tools_filter",
          abort: new AbortController().signal,
        })

        expect(Object.keys(compactionTools)).toHaveLength(0)
      },
    })
  })
})
