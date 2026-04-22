import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"

const baseModel = {
  providerID: "test-provider",
  modelID: "test-model",
}

async function removeWithRetry(target: string, attempts = 5) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await Bun.sleep(50 * (attempt + 1))
    }
  }

  throw lastError
}

test("archiveSessionCascade archives derived side chats with the parent session", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-session-archive-"))
  const databaseFile = join(root, "archive.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)

    const parentSession = await Session.createSession({
      directory: root,
      projectID: "project_archive",
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
      text: "Explain the renderer pipeline.",
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
      text: "The renderer starts by tracing rays from the camera and collecting hit data.",
    })

    Session.updateMessage(userMessage)
    Session.updatePart(userPart)
    Session.updateMessage(assistantMessage)
    Session.updatePart(assistantPart)

    const sideChat = await Session.createSideChat({
      parentSessionID: parentSession.id,
      anchorMessageID: assistantMessage.id,
    })

    const archivedRecords = Session.archiveSessionCascade(parentSession.id)
    const archivedSessionIDs = new Set(archivedRecords.map((record) => record.sessionID))

    expect(archivedSessionIDs).toEqual(new Set([parentSession.id, sideChat.id]))
    expect(Session.DataBaseRead("sessions", parentSession.id)).toBeNull()
    expect(Session.DataBaseRead("sessions", sideChat.id)).toBeNull()
    expect(Session.readArchivedSession(parentSession.id)?.snapshot.session.id).toBe(parentSession.id)
    expect(Session.readArchivedSession(sideChat.id)?.snapshot.session.id).toBe(sideChat.id)
    expect(Session.listSideChats(parentSession.id).map((link) => link.sessionID)).toEqual([sideChat.id])
  } finally {
    Sqlite.closeDatabase()
    Sqlite.setDatabaseFile(undefined)
    await removeWithRetry(root)
  }
})
