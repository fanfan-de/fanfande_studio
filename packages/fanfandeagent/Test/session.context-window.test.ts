import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import * as Sqlite from "#database/Sqlite.ts"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"
import * as SessionMemory from "#session/memory-store.ts"
import * as ContextWindow from "#session/context-window.ts"

const baseModel = {
  id: "test-model",
  providerID: "test-provider",
  api: {
    id: "test-model",
    url: "",
    npm: "@ai-sdk/openai",
  },
  name: "Test Model",
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
    context: 480,
    input: 360,
    output: 120,
  },
  status: "active" as const,
  options: {},
  headers: {},
  release_date: "2026-01-01",
}

test("preparePromptContext compacts early turns into session memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-context-window-"))
  const databaseFile = join(root, "context-window.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)

    await Instance.provide({
      directory: root,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const allMessages: Message.WithParts[] = []
        const compactedBoundaryIDs: string[] = []

        for (let index = 0; index < 8; index += 1) {
          const user = Message.User.parse({
            id: Identifier.ascending("message"),
            sessionID: session.id,
            role: "user",
            created: Date.now() + index,
            agent: "default",
            model: {
              providerID: baseModel.providerID,
              modelID: baseModel.id,
            },
          })
          const userText = Message.TextPart.parse({
            id: Identifier.ascending("part"),
            sessionID: session.id,
            messageID: user.id,
            type: "text",
            text: `user-${index} ` + "context ".repeat(10),
          })

          const assistant = Message.Assistant.parse({
            id: Identifier.ascending("message"),
            sessionID: session.id,
            role: "assistant",
            created: Date.now() + 100 + index,
            parentID: user.id,
            modelID: baseModel.id,
            providerID: baseModel.providerID,
            agent: "default",
            finishReason: "stop",
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
          })
          const assistantText = Message.TextPart.parse({
            id: Identifier.ascending("part"),
            sessionID: session.id,
            messageID: assistant.id,
            type: "text",
            text: `assistant-${index} ` + "result ".repeat(12),
          })

          Session.upsertMessage(user)
          Session.upsertPart(userText)
          Session.upsertMessage(assistant)
          Session.upsertPart(assistantText)

          allMessages.push(
            {
              info: user,
              parts: [userText],
            },
            {
              info: assistant,
              parts: [assistantText],
            },
          )

          if (index < 2) {
            compactedBoundaryIDs.push(assistant.id)
          }
        }

        const prepared = await ContextWindow.preparePromptContext({
          sessionID: session.id,
          model: baseModel,
          system: ["base-system"],
          messages: allMessages,
          generateSummary: async () => [
            "## Goal",
            "Continue the coding task.",
            "",
            "## Current State",
            "Earlier turns were compacted.",
            "",
            "## Important Files",
            "- src/session/prompt.ts",
            "",
            "## Decisions",
            "- Use rolling memory.",
            "",
            "## Open Issues",
            "- None.",
            "",
            "## Next Useful Context",
            "Keep the latest raw turns verbatim.",
          ].join("\n"),
        })

        const memory = SessionMemory.readSessionMemory(session.id)
        expect(memory).not.toBeNull()
        expect(memory?.watermarkMessageID).toBe(compactedBoundaryIDs[1])
        expect(prepared.system.join("\n")).toContain("<session_memory>")
        expect(prepared.messages.some((message) => message.info.id === allMessages[0]?.info.id)).toBe(false)
      },
    })
  } finally {
    await Instance.disposeAll()
    Sqlite.setDatabaseFile()
    Sqlite.closeDatabase()
    await rm(databaseFile, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-wal`, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-shm`, { force: true }).catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("preparePromptContext prunes oversized tool outputs when compaction cannot help", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-context-prune-"))
  const databaseFile = join(root, "context-prune.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)

    await Instance.provide({
      directory: root,
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
          agent: "default",
          model: {
            providerID: baseModel.providerID,
            modelID: baseModel.id,
          },
        })
        const userText = Message.TextPart.parse({
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: user.id,
          type: "text",
          text: "Please inspect the previous command output.",
        })

        const assistant = Message.Assistant.parse({
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "assistant",
          created: Date.now() + 1,
          parentID: user.id,
          modelID: baseModel.id,
          providerID: baseModel.providerID,
          agent: "default",
          finishReason: "tool-calls",
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
        })
        const toolPart = Message.ToolPart.parse({
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistant.id,
          type: "tool",
          callID: "tool-1",
          tool: "read-file",
          state: {
            status: "completed",
            input: {
              path: "README.md",
            },
            output: "line ".repeat(1_600),
            title: "read-file",
            metadata: {},
            time: {
              start: Date.now(),
              end: Date.now() + 1,
            },
          },
        })

        const prepared = await ContextWindow.preparePromptContext({
          sessionID: session.id,
          model: {
            ...baseModel,
            limit: {
              context: 260,
              input: 180,
              output: 80,
            },
          },
          system: ["base-system"],
          messages: [
            {
              info: user,
              parts: [userText],
            },
            {
              info: assistant,
              parts: [toolPart],
            },
          ],
        })

        const prunedTool = prepared.messages[1]?.parts.find(
          (part): part is Message.ToolPart => part.type === "tool",
        )

        expect(prunedTool).toBeDefined()
        if (prunedTool?.state.status === "completed") {
          expect(prunedTool.state.output.length).toBeLessThan(toolPart.state.output.length)
        }
      },
    })
  } finally {
    await Instance.disposeAll()
    Sqlite.setDatabaseFile()
    Sqlite.closeDatabase()
    await rm(databaseFile, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-wal`, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-shm`, { force: true }).catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("archiving and restoring a session preserves session memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-context-archive-"))
  const databaseFile = join(root, "context-archive.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)

    await Instance.provide({
      directory: root,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        SessionMemory.upsertSessionMemory(
          SessionMemory.SessionMemoryRecord.parse({
            sessionID: session.id,
            watermarkMessageID: "message-watermark",
            summaryText: "archived memory",
            estimatedTokens: 12,
            turnCount: 3,
            updatedAt: Date.now(),
            modelProviderID: baseModel.providerID,
            modelID: baseModel.id,
          }),
        )

        const archived = Session.archiveSession(session.id)
        expect(archived?.snapshot.memory?.summaryText).toBe("archived memory")
        expect(SessionMemory.readSessionMemory(session.id)).toBeNull()

        Session.restoreArchivedSession(session.id)
        expect(SessionMemory.readSessionMemory(session.id)?.summaryText).toBe("archived memory")
      },
    })
  } finally {
    await Instance.disposeAll()
    Sqlite.setDatabaseFile()
    Sqlite.closeDatabase()
    await rm(databaseFile, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-wal`, { force: true }).catch(() => undefined)
    await rm(`${databaseFile}-shm`, { force: true }).catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})
