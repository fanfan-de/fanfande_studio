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
import * as SessionMemory from "#session/memory-store.ts"

interface TableRecordMap {
  projects: never
  sessions: SessionInfo
  archived_sessions: ArchivedSessionRecord
  side_chat_links: SideChatLink
  messages: Message.MessageInfo
  parts: Message.Part
}

type TableName = keyof TableRecordMap

export const SessionKind = z.enum(["main", "side-chat"]).meta({
  ref: "SessionKind",
})
export type SessionKind = z.output<typeof SessionKind>

export const SessionToolPolicy = z.enum(["default", "read-only"]).meta({
  ref: "SessionToolPolicy",
})
export type SessionToolPolicy = z.output<typeof SessionToolPolicy>

export const SessionPolicy = z
  .object({
    toolPolicy: SessionToolPolicy,
    ignoreFullAccess: z.boolean().optional(),
  })
  .meta({
    ref: "SessionPolicy",
  })
export type SessionPolicy = z.output<typeof SessionPolicy>

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
    workflow: z
      .object({
        mode: z.enum(["execution", "planning"]),
        plan: z.object({
          status: z.enum(["idle", "draft", "pending-approval", "approved"]),
          draftMarkdown: z.string().optional(),
          pendingRequestID: Identifier.schema("permission").optional(),
          approvedMarkdown: z.string().optional(),
          updatedAt: z.number(),
          approvedAt: z.number().optional(),
        }),
      })
      .optional(),
    kind: SessionKind.optional(),
    policy: SessionPolicy.optional(),
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

export type SessionWorkflowState = NonNullable<SessionInfo["workflow"]>

export function defaultWorkflowState(now = Date.now()): SessionWorkflowState {
  return {
    mode: "execution",
    plan: {
      status: "idle",
      updatedAt: now,
    },
  }
}

export function normalizeWorkflowState(
  workflow: SessionInfo["workflow"] | undefined,
  now = Date.now(),
): SessionWorkflowState {
  return {
    mode: workflow?.mode === "planning" ? "planning" : "execution",
    plan: {
      status: workflow?.plan.status ?? "idle",
      draftMarkdown: workflow?.plan.draftMarkdown,
      pendingRequestID: workflow?.plan.pendingRequestID,
      approvedMarkdown: workflow?.plan.approvedMarkdown,
      updatedAt: workflow?.plan.updatedAt ?? now,
      approvedAt: workflow?.plan.approvedAt,
    },
  }
}

export const ArchivedSessionSnapshot = z
  .object({
    session: SessionInfo,
    messages: z.array(Message.MessageInfo),
    parts: z.array(Message.Part),
    events: z.array(RuntimeEvent.RuntimeEvent),
    memory: SessionMemory.SessionMemoryRecord.optional(),
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

export const SideChatSource = z
  .object({
    kind: z.enum(["url", "document"]),
    title: z.string(),
    url: z.string().optional(),
  })
  .meta({
    ref: "SideChatSource",
  })
export type SideChatSource = z.output<typeof SideChatSource>

export const SideChatToolSummary = z
  .object({
    tool: z.string(),
    status: z.enum(["completed", "error", "denied"]),
    summary: z.string(),
  })
  .meta({
    ref: "SideChatToolSummary",
  })
export type SideChatToolSummary = z.output<typeof SideChatToolSummary>

export const SideChatSnapshot = z
  .object({
    userText: z.string().optional(),
    assistantText: z.string(),
    sources: z.array(SideChatSource).optional(),
    toolSummaries: z.array(SideChatToolSummary).optional(),
    filePaths: z.array(z.string()).optional(),
  })
  .meta({
    ref: "SideChatSnapshot",
  })
export type SideChatSnapshot = z.output<typeof SideChatSnapshot>

export const SideChatLink = z
  .object({
    sessionID: Identifier.schema("session"),
    parentSessionID: Identifier.schema("session"),
    anchorMessageID: Identifier.schema("message"),
    anchorUserMessageID: Identifier.schema("message").optional(),
    createdAt: z.number(),
    anchorPreview: z.string(),
    snapshotVersion: z.literal(1),
    snapshot: SideChatSnapshot,
  })
  .meta({
    ref: "SideChatLink",
  })
export type SideChatLink = z.output<typeof SideChatLink>

export type SessionOrigin = Pick<SideChatLink, "parentSessionID" | "anchorMessageID" | "anchorPreview">

export type SideChatContext = {
  session: SessionInfo
  link: SideChatLink
  messages: Message.WithParts[]
}

const TableSchemaMap = {
  sessions: SessionInfo,
  archived_sessions: ArchivedSessionRecord,
  side_chat_links: SideChatLink,
  messages: Message.MessageInfo,
  parts: Message.Part,
} as const

const log = Log.create({ service: "session" })
let sessionTablesGeneration = -1
const DEFAULT_SESSION_TITLE = "New chat"
const DEFAULT_SIDE_CHAT_TITLE = "Side chat"
const DEFAULT_SESSION_KIND: SessionKind = "main"
const DEFAULT_SESSION_POLICY: SessionPolicy = {
  toolPolicy: "default",
}
const SIDE_CHAT_POLICY: SessionPolicy = {
  toolPolicy: "read-only",
  ignoreFullAccess: true,
}
const SIDE_CHAT_PREVIEW_LENGTH = 160

function normalizeSessionPolicy(policy: SessionInfo["policy"] | undefined): SessionPolicy {
  return {
    toolPolicy: policy?.toolPolicy ?? DEFAULT_SESSION_POLICY.toolPolicy,
    ignoreFullAccess: policy?.ignoreFullAccess,
  }
}

export function normalizeSessionInfo(session: SessionInfo): SessionInfo {
  return {
    ...session,
    kind: session.kind ?? DEFAULT_SESSION_KIND,
    policy: normalizeSessionPolicy(session.policy),
    workflow: session.workflow ? normalizeWorkflowState(session.workflow, session.time.updated) : session.workflow,
  }
}

export function isSideChatSession(session: SessionInfo | null | undefined) {
  return (session?.kind ?? DEFAULT_SESSION_KIND) === "side-chat"
}

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

  if (!db.tableExists("side_chat_links")) {
    db.createTableByZodObject("side_chat_links", SideChatLink)
  } else {
    db.syncTableColumnsWithZodObject("side_chat_links", SideChatLink)
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
  db.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_side_chat_links_session"
    ON "side_chat_links" ("sessionID");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_side_chat_links_parent_anchor"
    ON "side_chat_links" ("parentSessionID", "anchorMessageID", "createdAt");
  `)

  sessionTablesGeneration = db.getDatabaseGeneration()
}

function DataBaseCreate<T extends Exclude<TableName, "projects">>(tableName: T, tableRecord: TableRecordMap[T]): void {
  ensureSessionTables()
  if (tableName === "sessions") {
    db.insertOneWithSchema(tableName, normalizeSessionInfo(tableRecord as SessionInfo), TableSchemaMap[tableName])
    return
  }

  db.insertOneWithSchema(tableName, tableRecord, TableSchemaMap[tableName])
}

function updateSessionRecord(session: SessionInfo) {
  ensureSessionTables()
  db.updateByIdWithSchema("sessions", session.id, normalizeSessionInfo(session), SessionInfo)
}

function DataBaseRead<T extends Exclude<TableName, "projects">>(
  tableName: T,
  id: string,
  idColumn: string = "id",
): TableRecordMap[T] | null {
  ensureSessionTables()
  const result = db.findById(tableName, TableSchemaMap[tableName], id, idColumn)
  if (!result) return null
  const parsed = TableSchemaMap[tableName].parse(result)
  if (tableName === "sessions") {
    return normalizeSessionInfo(parsed as SessionInfo) as TableRecordMap[T]
  }

  return parsed as TableRecordMap[T]
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

function loadMessagesWithParts(sessionID: string): Message.WithParts[] {
  const messages = loadSessionMessages(sessionID)
  const parts = loadSessionParts(sessionID)
  const partsByMessageID = new Map<string, Message.Part[]>()

  for (const part of parts) {
    const list = partsByMessageID.get(part.messageID) ?? []
    list.push(part)
    partsByMessageID.set(part.messageID, list)
  }

  return messages.map((message) => ({
    info: message,
    parts: partsByMessageID.get(message.id) ?? [],
  }))
}

function loadSideChatLinks(input: {
  parentSessionID?: string
  anchorMessageID?: string
  sessionID?: string
}) {
  ensureSessionTables()
  const where: Array<{ column: string; value: string }> = []
  if (input.parentSessionID) {
    where.push({ column: "parentSessionID", value: input.parentSessionID })
  }
  if (input.anchorMessageID) {
    where.push({ column: "anchorMessageID", value: input.anchorMessageID })
  }
  if (input.sessionID) {
    where.push({ column: "sessionID", value: input.sessionID })
  }

  return db.findManyWithSchema("side_chat_links", SideChatLink, {
    where,
    orderBy: [{ column: "createdAt", direction: "DESC" }],
  })
}

function buildArchivedSessionRecord(session: SessionInfo): ArchivedSessionRecord {
  const normalizedSession = normalizeSessionInfo(session)
  const messages = loadSessionMessages(normalizedSession.id)
  const parts = loadSessionParts(session.id)
  const events = EventStore.listSessionEvents({ sessionID: normalizedSession.id })
  const memory = SessionMemory.readSessionMemory(normalizedSession.id) ?? undefined
  const archivedAt = Date.now()

  return {
    sessionID: normalizedSession.id,
    projectID: normalizedSession.projectID,
    directory: normalizedSession.directory,
    title: normalizedSession.title,
    createdAt: normalizedSession.time.created,
    updatedAt: normalizedSession.time.updated,
    archivedAt,
    schemaVersion: normalizedSession.version,
    messageCount: messages.length,
    eventCount: events.length,
    snapshot: {
      session: normalizedSession,
      messages,
      parts,
      events,
      memory,
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
  const result = normalizeSessionInfo({
    id: Identifier.descending("session"),
    projectID: input.projectID,
    directory: input.directory,
    title: normalizeSessionTitle(input.title),
    version: Installation.VERSION,
    kind: "main",
    policy: DEFAULT_SESSION_POLICY,
    workflow: defaultWorkflowState(now),
    time: {
      created: now,
      updated: now,
    },
  })

  log.info("create", result)
  DataBaseCreate("sessions", result)
  return result
}

function buildSideChatTitle(anchorPreview: string) {
  const preview = anchorPreview.trim()
  if (!preview) return DEFAULT_SIDE_CHAT_TITLE
  return `${DEFAULT_SIDE_CHAT_TITLE}: ${preview}`.slice(0, 120)
}

function compactWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

/*
function makeAnchorPreview(text: string) {
  const compact = compactWhitespace(text)
  if (!compact) return ""
  return compact.length > SIDE_CHAT_PREVIEW_LENGTH
    ? `${compact.slice(0, SIDE_CHAT_PREVIEW_LENGTH - 1).trimEnd()}…`
    : compact
}

*/

function makeAnchorPreview(text: string) {
  const compact = compactWhitespace(text)
  if (!compact) return ""
  if (compact.length <= SIDE_CHAT_PREVIEW_LENGTH) {
    return compact
  }

  return `${compact.slice(0, SIDE_CHAT_PREVIEW_LENGTH - 3).trimEnd()}...`
}

function renderToolSummary(part: Message.ToolPart): SideChatToolSummary | null {
  switch (part.state.status) {
    case "completed":
      return {
        tool: part.tool,
        status: "completed",
        summary: compactWhitespace(part.state.output).slice(0, 500),
      }
    case "error":
      return {
        tool: part.tool,
        status: "error",
        summary: compactWhitespace(part.state.error).slice(0, 500),
      }
    case "denied":
      return {
        tool: part.tool,
        status: "denied",
        summary: compactWhitespace(part.state.reason).slice(0, 500),
      }
    default:
      return null
  }
}

function snapshotFromAnchorMessage(input: {
  parentSessionID: string
  anchorMessageID: string
}): Omit<SideChatLink, "sessionID" | "createdAt"> {
  const messages = loadMessagesWithParts(input.parentSessionID)
  const anchorIndex = messages.findIndex(
    (message) => message.info.id === input.anchorMessageID && message.info.role === "assistant",
  )

  if (anchorIndex === -1) {
    throw new Error(
      `Assistant message '${input.anchorMessageID}' was not found in session '${input.parentSessionID}'.`,
    )
  }

  const anchorMessage = messages[anchorIndex]!
  const anchorUserMessage = [...messages.slice(0, anchorIndex)]
    .reverse()
    .find((message) => message.info.role === "user")

  const assistantText = anchorMessage.parts
    .filter((part): part is Message.TextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")

  const userText = anchorUserMessage
    ? anchorUserMessage.parts
        .filter((part): part is Message.TextPart => part.type === "text")
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim() || undefined
    : undefined

  const sources = anchorMessage.parts
    .flatMap((part): SideChatSource[] => {
      if (part.type === "source-url") {
        return [
          {
            kind: "url",
            title: part.title ?? part.url,
            url: part.url,
          },
        ]
      }

      if (part.type === "source-document") {
        return [
          {
            kind: "document",
            title: part.title,
          },
        ]
      }

      return []
    })

  const toolSummaries = anchorMessage.parts
    .flatMap((part) => (part.type === "tool" ? [renderToolSummary(part)] : []))
    .filter((item): item is SideChatToolSummary => Boolean(item))

  const filePaths = [...new Set(
    anchorMessage.parts.flatMap((part) => (part.type === "patch" ? part.files : [])),
  )]
  const normalizedAssistantText =
    assistantText.trim() ||
    [
      sources.map((source) => source.title).join(", "),
      toolSummaries.map((summary) => `${summary.tool}: ${summary.summary}`).join("\n"),
      filePaths.length > 0 ? `Files: ${filePaths.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim()

  if (!normalizedAssistantText) {
    throw new Error(`Assistant message '${input.anchorMessageID}' does not contain any anchorable content.`)
  }

  return {
    parentSessionID: input.parentSessionID,
    anchorMessageID: input.anchorMessageID,
    anchorUserMessageID: anchorUserMessage?.info.id,
    anchorPreview: makeAnchorPreview(normalizedAssistantText),
    snapshotVersion: 1,
    snapshot: {
      userText,
      assistantText: normalizedAssistantText,
      sources: sources.length > 0 ? sources : undefined,
      toolSummaries: toolSummaries.length > 0 ? toolSummaries : undefined,
      filePaths: filePaths.length > 0 ? filePaths : undefined,
    },
  }
}

async function createSideChat(input: {
  parentSessionID: string
  anchorMessageID: string
}): Promise<SessionInfo> {
  ensureSessionTables()
  const parentSession = DataBaseRead("sessions", input.parentSessionID) as SessionInfo | null
  if (!parentSession) {
    throw new Error(`Parent session '${input.parentSessionID}' was not found.`)
  }
  if (isSideChatSession(parentSession)) {
    throw new Error("Side chats can only be created from main sessions.")
  }

  const now = Date.now()
  const linkSeed = snapshotFromAnchorMessage(input)
  const session = normalizeSessionInfo({
    id: Identifier.descending("session"),
    projectID: parentSession.projectID,
    directory: parentSession.directory,
    title: buildSideChatTitle(linkSeed.anchorPreview),
    version: Installation.VERSION,
    kind: "side-chat",
    policy: SIDE_CHAT_POLICY,
    workflow: defaultWorkflowState(now),
    time: {
      created: now,
      updated: now,
    },
  })
  const link = SideChatLink.parse({
    ...linkSeed,
    sessionID: session.id,
    createdAt: now,
  })

  const commitCreate = db.db.transaction((nextSession: SessionInfo, nextLink: SideChatLink) => {
    db.insertOneWithSchema("sessions", nextSession, SessionInfo)
    db.insertOneWithSchema("side_chat_links", nextLink, SideChatLink)
  })

  commitCreate(session, link)
  return session
}

function normalizeSessionTitle(title: string | undefined) {
  const trimmed = title?.trim()
  return trimmed ? trimmed : DEFAULT_SESSION_TITLE
}

function isDefaultSessionTitle(title: string | undefined) {
  return normalizeSessionTitle(title) === DEFAULT_SESSION_TITLE
}

function updateSessionTitle(
  sessionID: string,
  title: string,
  options?: {
    ifCurrentTitle?: string
  },
): SessionInfo | null {
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return null

  if (options?.ifCurrentTitle && existing.title !== options.ifCurrentTitle) {
    return existing
  }

  const nextTitle = title.trim()
  if (!nextTitle) return existing
  if (existing.title === nextTitle) return existing

  const now = Date.now()
  const next: SessionInfo = {
    ...existing,
    title: nextTitle,
    time: {
      ...existing.time,
      updated: now,
    },
  }

  updateSessionRecord(next)
  return next
}

function listByProject(projectID: string): SessionInfo[] {
  ensureSessionTables()
  return db
    .findManyWithSchema("sessions", SessionInfo, {
      where: [{ column: "projectID", value: projectID }],
    })
    .map((session) => normalizeSessionInfo(session))
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

function listArchivableSessions(sessionID: string): SessionInfo[] {
  ensureSessionTables()
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return []

  if (isSideChatSession(existing)) {
    return [existing]
  }

  const sessions = [existing]
  const seenSessionIDs = new Set([existing.id])

  for (const link of loadSideChatLinks({ parentSessionID: sessionID })) {
    if (seenSessionIDs.has(link.sessionID)) continue
    const sideChatSession = DataBaseRead("sessions", link.sessionID) as SessionInfo | null
    if (!sideChatSession) continue

    sessions.push(sideChatSession)
    seenSessionIDs.add(sideChatSession.id)
  }

  return sessions
}

function removeSession(sessionID: string): SessionInfo | null {
  ensureSessionTables()
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return null

  db.deleteMany("parts", [{ column: "sessionID", value: sessionID }])
  db.deleteMany("messages", [{ column: "sessionID", value: sessionID }])
  EventStore.deleteSessionEvents(sessionID)
  SessionMemory.deleteSessionMemory(sessionID)
  db.deleteById("sessions", sessionID)
  db.deleteById("side_chat_links", sessionID, "sessionID")

  return existing
}

function archiveSession(sessionID: string): ArchivedSessionRecord | null {
  return archiveSessionCascade(sessionID)[0] ?? null
}

function archiveSessionCascade(sessionID: string): ArchivedSessionRecord[] {
  ensureSessionTables()
  const sessions = listArchivableSessions(sessionID)
  if (sessions.length === 0) return []

  const archivedRecords = sessions.map((session) => buildArchivedSessionRecord(session))
  const commitArchive = db.db.transaction((records: ArchivedSessionRecord[]) => {
    for (const record of records) {
      db.insertOneWithSchema("archived_sessions", record, ArchivedSessionRecord)
    }

    for (const record of records) {
      db.deleteMany("parts", [{ column: "sessionID", value: record.sessionID }])
      db.deleteMany("messages", [{ column: "sessionID", value: record.sessionID }])
      EventStore.deleteSessionEvents(record.sessionID)
      SessionMemory.deleteSessionMemory(record.sessionID)
      db.deleteById("sessions", record.sessionID)
    }
  })

  commitArchive(archivedRecords)
  return archivedRecords
}

function restoreArchivedSession(sessionID: string): SessionInfo | null {
  ensureSessionTables()
  const archived = readArchivedSession(sessionID)
  if (!archived) return null

  const restoredSession: SessionInfo = {
    ...normalizeSessionInfo(archived.snapshot.session),
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

    if (record.snapshot.memory) {
      SessionMemory.upsertSessionMemory(record.snapshot.memory)
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
  db.deleteById("side_chat_links", sessionID, "sessionID")
  return archived
}

function listSideChats(parentSessionID: string, anchorMessageID?: string): SideChatLink[] {
  return loadSideChatLinks({
    parentSessionID,
    anchorMessageID,
  })
}

function getSideChatLink(sessionID: string): SideChatLink | null {
  return (DataBaseRead("side_chat_links", sessionID, "sessionID") as SideChatLink | null) ?? null
}

function getSessionOrigin(sessionID: string): SessionOrigin | undefined {
  const link = getSideChatLink(sessionID)
  if (!link) return undefined
  return {
    parentSessionID: link.parentSessionID,
    anchorMessageID: link.anchorMessageID,
    anchorPreview: link.anchorPreview,
  }
}

function getSideChatContext(sessionID: string): SideChatContext | null {
  const link = getSideChatLink(sessionID)
  if (!link) return null

  const activeSession = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (activeSession) {
    return {
      session: activeSession,
      link,
      messages: loadMessagesWithParts(sessionID),
    }
  }

  const archived = readArchivedSession(sessionID)
  if (!archived) return null

  const partsByMessageID = new Map<string, Message.Part[]>()
  for (const part of archived.snapshot.parts) {
    const list = partsByMessageID.get(part.messageID) ?? []
    list.push(part)
    partsByMessageID.set(part.messageID, list)
  }

  return {
    session: normalizeSessionInfo(archived.snapshot.session),
    link,
    messages: archived.snapshot.messages.map((message) => ({
      info: message,
      parts: partsByMessageID.get(message.id) ?? [],
    })),
  }
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

function updateSessionWorkflow(
  sessionID: string,
  updater: (workflow: SessionWorkflowState) => SessionWorkflowState,
): SessionInfo | null {
  const existing = DataBaseRead("sessions", sessionID) as SessionInfo | null
  if (!existing) return null

  const now = Date.now()
  const nextWorkflow = normalizeWorkflowState(updater(normalizeWorkflowState(existing.workflow, now)), now)
  const next: SessionInfo = {
    ...existing,
    workflow: nextWorkflow,
    time: {
      ...existing.time,
      updated: now,
    },
  }

  updateSessionRecord(next)
  return next
}

export {
  archiveSession,
  archiveSessionCascade,
  createSession,
  createSideChat,
  deleteArchivedSession,
  DataBaseCreate,
  DataBaseRead,
  deletePart,
  listArchivedSessions,
  listByProject,
  listSideChats,
  DEFAULT_SESSION_TITLE,
  isDefaultSessionTitle,
  getSessionOrigin,
  getSideChatContext,
  getSideChatLink,
  listArchivableSessions,
  readArchivedSession,
  removeProjectSessions,
  removeSession,
  restoreArchivedSession,
  updateSessionTitle,
  updateSessionWorkflow,
  updateMessage,
  updatePart,
  upsertMessage,
  upsertPart,
}
