import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import * as Identifier from "#id/id.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as Message from "#session/core/message.ts"
import { z } from "zod"

const LegacyUserMessage = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  created: z.number(),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
})

const LegacyAssistantMessage = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  created: z.number(),
  agent: z.string(),
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  cost: z.number(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
})

const LegacyMessageInfo = z.discriminatedUnion("role", [LegacyUserMessage, LegacyAssistantMessage])

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

function tableColumns(tableName: string) {
  return Sqlite.db
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all()
    .map((row) => (row as { name: string }).name)
}

test("MessageInfo accepts legacy messages without turnID", () => {
  const message = Message.MessageInfo.parse({
    id: Identifier.ascending("message"),
    sessionID: Identifier.ascending("session"),
    role: "user",
    created: Date.now(),
    agent: "default",
    model: {
      providerID: "test-provider",
      modelID: "test-model",
    },
  })

  expect(message.turnID).toBeUndefined()
})

test("existing messages union table can add nullable turnID and read old rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-turn-schema-"))
  const databaseFile = join(root, "turn-schema.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)
    Sqlite.createTableByZodDiscriminatedUnion("messages", LegacyMessageInfo)
    expect(tableColumns("messages")).not.toContain("turnID")

    Sqlite.syncTableColumnsWithZodDiscriminatedUnion("messages", Message.MessageInfo)
    expect(tableColumns("messages")).toContain("turnID")

    const userMessage = Message.User.parse({
      id: Identifier.ascending("message"),
      sessionID: Identifier.ascending("session"),
      role: "user",
      created: Date.now(),
      agent: "default",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
    })

    Sqlite.insertOneWithSchema("messages", userMessage, Message.MessageInfo)
    const found = Sqlite.findById("messages", Message.MessageInfo, userMessage.id)

    expect(found?.id).toBe(userMessage.id)
    expect(found?.turnID).toBeUndefined()
  } finally {
    Sqlite.closeDatabase()
    Sqlite.setDatabaseFile(undefined)
    await removeWithRetry(root)
  }
})
