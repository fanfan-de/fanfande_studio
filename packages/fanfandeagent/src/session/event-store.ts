import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"

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

export function append(event: RuntimeEvent.RuntimeEvent) {
  ensureEventStoreTables()
  db.insertOneWithSchema("session_events", toStoredRecord(event), SessionEventRecord)
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

export function deleteSessionEvents(sessionID: string) {
  ensureEventStoreTables()
  return db.deleteMany("session_events", [{ column: "sessionID", value: sessionID }])
}
