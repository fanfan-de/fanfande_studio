import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as LiveStreamHub from "#session/runtime/live-stream-hub.ts"
import * as Projector from "#session/runtime/projector.ts"
import * as RuntimeEvent from "#session/runtime/runtime-event.ts"

const SessionEventRecord = z.object({
  eventID: z.string(),
  sessionID: z.string(),
  turnID: z.string(),
  seq: z.number(),
  type: z.string(),
  payload: z.string(),
  timestamp: z.number(),
})

let sessionEventsGeneration = -1
const subscribers = new Set<(event: RuntimeEvent.RuntimeEvent) => void>()
const FAST_PATH_EVENT_ID_CACHE_LIMIT = 5_000
const fastPathEventIDs = new Set<string>()
const fastPathEventIDOrder: string[] = []

function ensureEventStoreTables() {
  const generation = db.getDatabaseGeneration()
  if (sessionEventsGeneration === generation && generation > 0) return

  db.db.run(`
    CREATE TABLE IF NOT EXISTS "session_events" (
      "eventID" TEXT PRIMARY KEY,
      "sessionID" TEXT NOT NULL,
      "turnID" TEXT NOT NULL,
      "seq" INTEGER NOT NULL,
      "type" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "timestamp" INTEGER NOT NULL
    );
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_events_session_turn_seq"
    ON "session_events" ("sessionID", "turnID", "seq");
  `)
  db.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_session_events_session_turn_seq_unique"
    ON "session_events" ("sessionID", "turnID", "seq");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_events_session_timestamp"
    ON "session_events" ("sessionID", "timestamp");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_events_session_timestamp_turn_seq"
    ON "session_events" ("sessionID", "timestamp", "turnID", "seq");
  `)

  sessionEventsGeneration = db.getDatabaseGeneration()
}

function toStoredRecord(event: RuntimeEvent.RuntimeEvent) {
  return SessionEventRecord.parse({
    eventID: event.eventID,
    sessionID: event.sessionID,
    turnID: event.turnID,
    seq: event.seq,
    type: event.type,
    payload: JSON.stringify(event.payload),
    timestamp: event.timestamp,
  })
}

function fromStoredRecord(record: z.infer<typeof SessionEventRecord>) {
  return RuntimeEvent.RuntimeEvent.parse({
    eventID: record.eventID,
    sessionID: record.sessionID,
    turnID: record.turnID,
    seq: record.seq,
    type: record.type,
    payload: JSON.parse(record.payload),
    timestamp: record.timestamp,
  })
}

function notify(event: RuntimeEvent.RuntimeEvent) {
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(event)
    } catch {
      subscribers.delete(subscriber)
    }
  }
}

function isTransientStreamEvent(event: RuntimeEvent.RuntimeEvent) {
  return (
    event.type.startsWith("text.part.") ||
    event.type.startsWith("reasoning.part.") ||
    event.type === "tool.input.delta"
  )
}

function rememberFastPathEventID(eventID: string) {
  if (fastPathEventIDs.has(eventID)) {
    return false
  }

  fastPathEventIDs.add(eventID)
  fastPathEventIDOrder.push(eventID)

  while (fastPathEventIDOrder.length > FAST_PATH_EVENT_ID_CACHE_LIMIT) {
    const expired = fastPathEventIDOrder.shift()
    if (expired) {
      fastPathEventIDs.delete(expired)
    }
  }

  return true
}

export function subscribe(subscriber: (event: RuntimeEvent.RuntimeEvent) => void) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

export function append(event: RuntimeEvent.RuntimeEvent) {
  ensureEventStoreTables()
  if (hasEvent(event.eventID)) return event
  db.insertOneWithSchema("session_events", toStoredRecord(event), SessionEventRecord)
  notify(event)
  return event
}

export function hasEvent(eventID: string) {
  ensureEventStoreTables()
  return Boolean(db.findById("session_events", SessionEventRecord, eventID, "eventID"))
}

export function appendAndProject(event: RuntimeEvent.RuntimeEvent) {
  if (isTransientStreamEvent(event)) {
    if (rememberFastPathEventID(event.eventID)) {
      LiveStreamHub.publish(event)
      notify(event)
    }

    return event
  }

  ensureEventStoreTables()

  const commit = db.db.transaction((nextEvent: RuntimeEvent.RuntimeEvent) => {
    if (hasEvent(nextEvent.eventID)) return false

    db.insertOneWithSchema("session_events", toStoredRecord(nextEvent), SessionEventRecord)
    Projector.project(nextEvent)
    return true
  })

  const inserted = commit(event)
  if (inserted) {
    LiveStreamHub.publish(event)
    notify(event)
  }

  return event
}

export function listTurnEvents(input: {
  sessionID: string
  turnID: string
  sinceSeq?: number
}) {
  ensureEventStoreTables()
  const where: Array<{ column: string; operator?: "=" | ">"; value: string | number }> = [
    { column: "sessionID", value: input.sessionID },
    { column: "turnID", value: input.turnID },
  ]

  if (typeof input.sinceSeq === "number" && Number.isFinite(input.sinceSeq)) {
    where.push({ column: "seq", operator: ">", value: input.sinceSeq })
  }

  const rows = db.findManyWithSchema("session_events", SessionEventRecord, {
    where,
    orderBy: [{ column: "seq", direction: "ASC" }],
  })

  return rows.map(fromStoredRecord)
}

export function listSessionEvents(input: {
  sessionID: string
  after?: RuntimeEvent.RuntimeEventCursor
}) {
  ensureEventStoreTables()

  const params: Array<string | number> = [input.sessionID]
  let sql = `
    SELECT "eventID", "sessionID", "turnID", "seq", "type", "payload", "timestamp"
    FROM "session_events"
    WHERE "sessionID" = ?
  `

  if (input.after) {
    sql += `
      AND (
        "timestamp" > ?
        OR ("timestamp" = ? AND "turnID" > ?)
        OR ("timestamp" = ? AND "turnID" = ? AND "seq" > ?)
      )
    `
    params.push(
      input.after.timestamp,
      input.after.timestamp,
      input.after.turnID,
      input.after.timestamp,
      input.after.turnID,
      input.after.seq,
    )
  }

  sql += `
    ORDER BY "timestamp" ASC, "turnID" ASC, "seq" ASC
  `

  const rows = db.db.prepare(sql).all(...params)
  return rows.map((row) => fromStoredRecord(SessionEventRecord.parse(row)))
}

export function listRecentSessionEvents(input: {
  sessionID: string
  limit?: number
}) {
  ensureEventStoreTables()

  const limit = Math.max(1, Math.min(input.limit ?? 20, 100))
  const rows = db.db.prepare(`
    SELECT "eventID", "sessionID", "turnID", "seq", "type", "payload", "timestamp"
    FROM "session_events"
    WHERE "sessionID" = ?
    ORDER BY "timestamp" DESC, "turnID" DESC, "seq" DESC
    LIMIT ?
  `).all(input.sessionID, limit)

  return rows
    .map((row) => fromStoredRecord(SessionEventRecord.parse(row)))
    .reverse()
}

export function deleteSessionEvents(sessionID: string) {
  ensureEventStoreTables()
  return db.deleteMany("session_events", [{ column: "sessionID", value: sessionID }])
}
