import * as Log from "#util/log.ts"
import z from "zod"
import * as Identifier from "#id/id.ts"
import * as Snapshot from "#snapshot/snapshot.ts"
import * as BusEvent from "#bus/bus-event.ts"
import * as Message from "#session/message.ts"
import * as Installation from "#installation/installation.ts"
import { fn } from "#util/fn.ts"
import * as db from "#database/Sqlite.ts"
import * as EventStore from "#session/event-store.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"

interface TableRecordMap {
  projects: never
  sessions: SessionInfo
  archived_sessions: ArchivedSessionRecord
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

export const ArchivedSessionSnapshot = z
  .object({
    session: SessionInfo,
    messages: z.array(Message.MessageInfo),
    parts: z.array(Message.Part),
    events: z.array(RuntimeEvent.RuntimeEvent),
  })
  .meta({
    ref: "ArchivedSessionSnapshot",
  })
export type ArchivedSessionSnapshot = z.output<typeof ArchivedSessionSnapshot>

export const ArchivedSessionRecord = z
  .object({
    sessionID: Identifier.schema("session"),
    projectID: z.string(),
    directory: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    archivedAt: z.number(),
    schemaVersion: z.string(),
    messageCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    snapshot: ArchivedSessionSnapshot,
  })
  .meta({
    ref: "ArchivedSessionRecord",
  })
export type ArchivedSessionRecord = z.output<typeof ArchivedSessionRecord>

const TableSchemaMap = {
  sessions: SessionInfo,
  archived_sessions: ArchivedSessionRecord,
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
  } else {
    db.syncTableColumnsWithZodObject("sessions", SessionInfo)
  }

  if (!db.tableExists("archived_sessions")) {
    db.createTableByZodObject("archived_sessions", ArchivedSessionRecord)
  } else {
    db.syncTableColumnsWithZodObject("archived_sessions", ArchivedSessionRecord)
  }

  if (!db.tableExists("messages")) {
    db.createTableByZodDiscriminatedUnion("messages", Message.MessageInfo)
  }

  if (!db.tableExists("parts")) {
    db.createTableByZodDiscriminatedUnion("parts", Message.Part)
  }

  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_archived_sessions_project_archived"
    ON "archived_sessions" ("projectID", "archivedAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_archived_sessions_archived"
    ON "archived_sessions" ("archivedAt");
  `)

  sessionTablesGeneration = db.getDatabaseGeneration()
}

function DataBaseCreate<T extends Exclude<TableName, "projects">>(tableName: T, tableRecord: TableRecordMap[T]): void {
  ensureSessionTables()
  db.insertOneWithSchema(tableName, tableRecord, TableSchemaMap[tableName])
}

function DataBaseRead<T extends Exclude<TableName, "projects">>(
  tableName: T,
  id: string,
  idColumn: string = "id",
) {
  ensureSessionTables()
  const result = db.findById(tableName, TableSchemaMap[tableName], id, idColumn)
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

function loadSessionMessages(sessionID: string) {
  ensureSessionTables()
  return db.findManyWithSchema("messages", Message.MessageInfo, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [
      { column: "created", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ],
  })
}

function loadSessionParts(sessionID: string) {
  ensureSessionTables()
  return db.findManyWithSchema("parts", Message.Part, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [{ column: "id", direction: "ASC" }],
  })
}

function buildArchivedSessionRecord(session: SessionInfo): ArchivedSessionRecord {
  const messages = loadSessionMessages(session.id)
  const parts = loadSessionParts(session.id)
  const events = EventStore.listSessionEvents({ sessionID: session.id })
  const archivedAt = Date.now()

  return {
    sessionID: session.id,
    projectID: session.projectID,
    directory: session.directory,
    title: session.title,
    createdAt: session.time.created,
    updatedAt: session.time.updated,
    archivedAt,
    schemaVersion: session.version,
    messageCount: messages.length,
    eventCount: events.length,
    snapshot: {
      session,
      messages,
      parts,
      events,
    },
  }
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

function readArchivedSession(sessionID: string): ArchivedSessionRecord | null {
  return DataBaseRead("archived_sessions", sessionID, "sessionID") as ArchivedSessionRecord | null
}

function listArchivedSessions(): ArchivedSessionRecord[] {
  ensureSessionTables()
  return db.findManyWithSchema("archived_sessions", ArchivedSessionRecord, {
    orderBy: [
      { column: "archivedAt", direction: "DESC" },
      { column: "updatedAt", direction: "DESC" },
    ],
  })
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

function archiveSession(sessionID: string): ArchivedSessionRecord | null {
  ensureSessionTables()
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return null

  const archivedRecord = buildArchivedSessionRecord(existing)
  const commitArchive = db.db.transaction((record: ArchivedSessionRecord) => {
    db.insertOneWithSchema("archived_sessions", record, ArchivedSessionRecord)
    db.deleteMany("parts", [{ column: "sessionID", value: record.sessionID }])
    db.deleteMany("messages", [{ column: "sessionID", value: record.sessionID }])
    EventStore.deleteSessionEvents(record.sessionID)
    db.deleteById("sessions", record.sessionID)
  })

  commitArchive(archivedRecord)
  return archivedRecord
}

function restoreArchivedSession(sessionID: string): SessionInfo | null {
  ensureSessionTables()
  const archived = readArchivedSession(sessionID)
  if (!archived) return null

  const restoredSession: SessionInfo = {
    ...archived.snapshot.session,
    time: {
      ...archived.snapshot.session.time,
      archived: undefined,
    },
  }

  const commitRestore = db.db.transaction((record: ArchivedSessionRecord, session: SessionInfo) => {
    db.insertOneWithSchema("sessions", session, SessionInfo)

    for (const message of record.snapshot.messages) {
      db.insertOneWithSchema("messages", message, Message.MessageInfo)
    }

    for (const part of record.snapshot.parts) {
      db.insertOneWithSchema("parts", part, Message.Part)
    }

    for (const event of record.snapshot.events) {
      EventStore.append(event)
    }

    db.deleteById("archived_sessions", record.sessionID, "sessionID")
  })

  commitRestore(archived, restoredSession)
  return restoredSession
}

function deleteArchivedSession(sessionID: string): ArchivedSessionRecord | null {
  ensureSessionTables()
  const archived = readArchivedSession(sessionID)
  if (!archived) return null

  db.deleteById("archived_sessions", sessionID, "sessionID")
  return archived
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
  archiveSession,
  createSession,
  deleteArchivedSession,
  DataBaseCreate,
  DataBaseRead,
  deletePart,
  listArchivedSessions,
  listByProject,
  readArchivedSession,
  removeProjectSessions,
  removeSession,
  restoreArchivedSession,
  updateMessage,
  updatePart,
  upsertMessage,
  upsertPart,
}
