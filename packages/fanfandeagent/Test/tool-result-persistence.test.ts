import { afterEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import * as Sqlite from "#database/Sqlite.ts"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"
import * as ToolResultPersistence from "#session/tool-result-persistence.ts"
import { ReadFileTool } from "#tool/read-file.ts"

const testModel = {
  id: "test-model",
  providerID: "test-provider",
  capabilities: {
    replayAssistantReasoning: false,
    attachment: false,
    input: {
      image: false,
      pdf: false,
    },
  },
} as any

const cleanupSessions = new Set<string>()

async function removeTreeWithRetry(target: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EBUSY" || attempt === 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

afterEach(async () => {
  for (const sessionID of cleanupSessions) {
    ToolResultPersistence.removeSessionOutputDirectory(sessionID)
  }
  cleanupSessions.clear()
  await Instance.disposeAll().catch(() => undefined)
  Sqlite.setDatabaseFile()
  Sqlite.closeDatabase()
})

test("makePreview prefers a nearby newline boundary", () => {
  const text = `${"a".repeat(900)}\n${"b".repeat(2_000)}`
  const preview = ToolResultPersistence.makePreview(text, 1_200)
  expect(preview.endsWith("\n")).toBe(false)
  expect(preview).toBe("a".repeat(900))
})

test("maybePersistToolResult writes large output and honors Infinity opt-out", async () => {
  const sessionID = "ses_persist_unit"
  cleanupSessions.add(sessionID)
  const large = `${"alpha ".repeat(9_000)}tail-marker`

  const persisted = await ToolResultPersistence.maybePersistToolResult({
    sessionID,
    toolCallID: "tool/call:1",
    toolName: "unit-tool",
    output: large,
    metadata: {
      stdout: large,
      keep: "small",
    },
    modelOutput: {
      type: "text",
      value: large,
    },
    maxResultSizeChars: 1_000,
  })

  expect(persisted.output).toContain("<persisted-output>")
  expect(persisted.output).not.toContain("tail-marker")
  expect(persisted.persisted?.path).toBeDefined()
  expect(existsSync(persisted.persisted?.path ?? "")).toBe(true)
  expect(persisted.modelOutput).toBeUndefined()
  expect(persisted.metadata.keep).toBe("small")
  expect(String(persisted.metadata.stdout)).toContain("omitted from context")

  const passthrough = await ToolResultPersistence.maybePersistToolResult({
    sessionID,
    toolCallID: "tool-call-2",
    toolName: "unit-tool",
    output: large,
    metadata: {},
    modelOutput: large,
    maxResultSizeChars: Infinity,
  })

  expect(passthrough.output).toBe(large)
  expect(passthrough.persisted).toBeUndefined()
})

test("toModelMessages replays persisted replacement instead of stored modelOutput", async () => {
  const sessionID = "ses_replay_unit"
  cleanupSessions.add(sessionID)
  const large = `${"visible ".repeat(9_000)}secret-tail`
  const persisted = await ToolResultPersistence.maybePersistToolResult({
    sessionID,
    toolCallID: "tool-replay",
    toolName: "remote-tool",
    output: large,
    metadata: {},
    modelOutput: {
      type: "json",
      value: {
        leaked: "secret-tail",
      },
    },
    maxResultSizeChars: 1_000,
  })

  const assistant = Message.Assistant.parse({
    id: "msg-replay",
    sessionID,
    role: "assistant",
    created: Date.now(),
    parentID: "msg-user",
    modelID: testModel.id,
    providerID: testModel.providerID,
    agent: "default",
    finishReason: "tool-calls",
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
  })
  const toolPart = Message.ToolPart.parse({
    id: "part-replay-tool",
    sessionID,
    messageID: assistant.id,
    type: "tool",
    callID: "tool-replay",
    tool: "remote-tool",
    providerExecuted: true,
    state: {
      status: "completed",
      input: {
        q: "large",
      },
      output: persisted.output,
      modelOutput: {
        type: "json",
        value: {
          leaked: "secret-tail",
        },
      },
      title: "Remote Tool",
      metadata: persisted.metadata,
      time: {
        start: Date.now(),
        end: Date.now() + 1,
      },
    },
  })

  const messages = await Message.toModelMessages([
    {
      info: assistant,
      parts: [toolPart],
    },
  ], testModel)

  const serialized = JSON.stringify(messages)
  expect(serialized).toContain("<persisted-output>")
  expect(serialized).not.toContain("secret-tail")
})

test("read-file can read an absolute text file outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-read-root-"))
  const outside = await mkdtemp(join(tmpdir(), "fanfande-read-outside-"))
  const outsideFile = join(outside, "outside.txt")
  await writeFile(outsideFile, "first\nsecond\nthird", "utf8")

  try {
    await Instance.provide({
      directory: root,
      async fn() {
        const runtime = await ReadFileTool.init()
        const result = await runtime.execute({
          path: outsideFile,
          startLine: 2,
          endLine: 2,
        }, {
          sessionID: "ses_read_outside",
          messageID: "msg-read-outside",
          cwd: Instance.directory,
          worktree: Instance.worktree,
        })

        expect(result.text).toContain(outsideFile)
        expect(result.text).toContain("2 | second")
      },
    })
  } finally {
    await removeTreeWithRetry(root)
    await removeTreeWithRetry(outside)
  }
})

test("archiving keeps persisted results and deleting the archive removes them", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-persist-lifecycle-"))
  const dbRoot = await mkdtemp(join(tmpdir(), "fanfande-persist-db-"))
  const databaseFile = join(dbRoot, "lifecycle.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)

    await Instance.provide({
      directory: root,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })
        cleanupSessions.add(session.id)

        const persisted = await ToolResultPersistence.maybePersistToolResult({
          sessionID: session.id,
          toolCallID: Identifier.ascending("part"),
          toolName: "unit-tool",
          output: "large ".repeat(9_000),
          metadata: {},
          modelOutput: undefined,
          maxResultSizeChars: 1_000,
        })

        expect(existsSync(persisted.persisted?.path ?? "")).toBe(true)
        expect(Session.archiveSession(session.id)).not.toBeNull()
        expect(existsSync(persisted.persisted?.path ?? "")).toBe(true)

        expect(Session.deleteArchivedSession(session.id)).not.toBeNull()
        expect(existsSync(ToolResultPersistence.getSessionDirectory(session.id))).toBe(false)
        cleanupSessions.delete(session.id)
      },
    })
  } finally {
    await Instance.disposeAll().catch(() => undefined)
    Sqlite.setDatabaseFile()
    Sqlite.closeDatabase()
    await removeTreeWithRetry(root)
    await removeTreeWithRetry(dbRoot).catch(() => undefined)
  }
})
