import * as Log from "#util/log.ts"
import z from "zod"
import * as Identifier from "#id/id.ts"
import * as Snapshot  from "#snapshot/snapshot.ts"
import * as BusEvent from "#bus/bus-event.ts"
import * as Message from "#session/message.ts"
import * as Installation from "#installation/installation.ts"
import { fn } from "#util/fn.ts"
import * as db from "#database/Sqlite.ts"
import * as EventStore from "#session/event-store.ts"

interface TableRecordMap {
  projects: never
  sessions: SessionInfo
  messages: Message.MessageInfo
  parts: Message.Part
}

type TableName = keyof TableRecordMap

export const SessionInfo = z
  .object({
    id: Identifier.schema("session"),
    slug: z.string().optional(),
    projectID: z.string(),
    directory: z.string(),
    summary: z
      .object({
        additions: z.number(),
        deletions: z.number(),
        files: z.number(),
      })
      .optional(),
    share: z
      .object({
        url: z.string(),
      })
      .optional(),
    title: z.string(),
    version: z.string(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
      compacting: z.number().optional(),
      archived: z.number().optional(),
    }),
    revert: z
      .object({
        messageID: z.string(),
        partID: z.string().optional(),
        snapshot: z.string().optional(),
        diff: z.string().optional(),
      })
      .optional(),
  })
  .meta({
    ref: "Session",
  })
export type SessionInfo = z.output<typeof SessionInfo>

const TableSchemaMap = {
  sessions: SessionInfo,
  messages: Message.MessageInfo,
  parts: Message.Part,
} as const

const log = Log.create({ service: "session" })
let sessionTablesGeneration = -1

function ensureSessionTables() {
  const generation = db.getDatabaseGeneration()
  if (sessionTablesGeneration === generation && generation > 0) return
  if (!db.tableExists("sessions")) {
    db.createTableByZodObject("sessions", SessionInfo)
  }
  if (!db.tableExists("messages")) {
    db.createTableByZodDiscriminatedUnion("messages", Message.MessageInfo)
  }
  if (!db.tableExists("parts")) {
    db.createTableByZodDiscriminatedUnion("parts", Message.Part)
  }
  sessionTablesGeneration = db.getDatabaseGeneration()
}

function DataBaseCreate<T extends Exclude<TableName, "projects">>(tableName: T, tableRecord: TableRecordMap[T]): void {
  ensureSessionTables()
  db.insertOneWithSchema(tableName, tableRecord, TableSchemaMap[tableName])
}

function DataBaseRead<T extends Exclude<TableName, "projects">>(tableName: T, id: string) {
  ensureSessionTables()
  const result = db.findById(tableName, TableSchemaMap[tableName], id)
  if (!result) return null
  return TableSchemaMap[tableName].parse(result)
}

function upsertMessage(message: Message.MessageInfo) {
  ensureSessionTables()
  const existing = db.findById("messages", Message.MessageInfo, message.id)
  if (existing) {
    db.updateByIdWithSchema("messages", message.id, message, Message.MessageInfo)
    return
  }

  db.insertOneWithSchema("messages", message, Message.MessageInfo)
}

function upsertPart(part: Message.Part) {
  ensureSessionTables()
  const existing = db.findById("parts", Message.Part, part.id)
  if (existing) {
    db.updateByIdWithSchema("parts", part.id, part, Message.Part)
    return
  }

  db.insertOneWithSchema("parts", part, Message.Part)
}

function deletePart(partID: string) {
  ensureSessionTables()
  return db.deleteById("parts", partID)
}

export const Event = {
  Created: BusEvent.define(
    "session.created",
    z.object({
      info: SessionInfo,
    }),
  ),
  Updated: BusEvent.define(
    "session.updated",
    z.object({
      info: SessionInfo,
    }),
  ),
  Deleted: BusEvent.define(
    "session.deleted",
    z.object({
      info: SessionInfo,
    }),
  ),
  Diff: BusEvent.define(
    "session.diff",
    z.object({
      sessionID: z.string(),
      diff: Snapshot.FileDiff.array(),
    }),
  ),
  Error: BusEvent.define(
    "session.error",
    z.object({
      sessionID: z.string().optional(),
      error: Message.Assistant.shape.error,
    }),
  ),
}

async function createSession(input: {
  directory: string
  projectID: string
  title?: string
}): Promise<SessionInfo> {
  const now = Date.now()
  const result: SessionInfo = {
    id: Identifier.descending("session"),
    projectID: input.projectID,
    directory: input.directory,
    title: input.title?.trim() || "New chat",
    version: Installation.VERSION,
    time: {
      created: now,
      updated: now,
    },
  }

  log.info("create", result)
  DataBaseCreate("sessions", result)
  return result
}

function listByProject(projectID: string): SessionInfo[] {
  ensureSessionTables()
  return db
    .findManyWithSchema("sessions", SessionInfo, {
      where: [{ column: "projectID", value: projectID }],
    })
    .sort((left, right) => right.time.updated - left.time.updated)
}

function removeSession(sessionID: string): SessionInfo | null {
  ensureSessionTables()
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return null

  db.deleteMany("parts", [{ column: "sessionID", value: sessionID }])
  db.deleteMany("messages", [{ column: "sessionID", value: sessionID }])
  EventStore.deleteSessionEvents(sessionID)
  db.deleteById("sessions", sessionID)

  return existing
}

function removeProjectSessions(projectID: string): SessionInfo[] {
  const sessions = listByProject(projectID)
  for (const session of sessions) {
    removeSession(session.id)
  }

  return sessions
}

const updateMessage = fn(Message.MessageInfo, (msg) => {
  upsertMessage(msg)
})

const updatePart = fn(Message.Part, (part) => {
  upsertPart(part)
})

export {
  createSession,
  listByProject,
  removeSession,
  removeProjectSessions,
  DataBaseCreate,
  DataBaseRead,
  upsertMessage,
  upsertPart,
  deletePart,
  updateMessage,
  updatePart,
}
