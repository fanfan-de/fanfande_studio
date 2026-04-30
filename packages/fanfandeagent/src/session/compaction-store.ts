import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"

export const CURRENT_SUMMARY_VERSION = 1

export const SessionCompactionRecord = z
  .object({
    id: Identifier.schema("compaction"),
    sessionID: Identifier.schema("session"),
    compactedFromMessageID: z.string(),
    compactedToMessageID: z.string(),
    summaryText: z.string(),
    summaryVersion: z.number().int().positive(),
    sourceMessageCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    modelProviderID: z.string().optional(),
    modelID: z.string().optional(),
    createdAt: z.number().int().nonnegative(),
  })
  .meta({
    ref: "SessionCompactionRecord",
  })
export type SessionCompactionRecord = z.infer<typeof SessionCompactionRecord>

let sessionCompactionGeneration = -1

function ensureSessionCompactionTable() {
  const generation = db.getDatabaseGeneration()
  if (sessionCompactionGeneration === generation && generation > 0) return

  db.db.run(`
    CREATE TABLE IF NOT EXISTS "session_compactions" (
      "id" TEXT PRIMARY KEY,
      "sessionID" TEXT NOT NULL,
      "compactedFromMessageID" TEXT NOT NULL,
      "compactedToMessageID" TEXT NOT NULL,
      "summaryText" TEXT NOT NULL,
      "summaryVersion" INTEGER NOT NULL,
      "sourceMessageCount" INTEGER NOT NULL,
      "estimatedTokens" INTEGER NOT NULL,
      "modelProviderID" TEXT,
      "modelID" TEXT,
      "createdAt" INTEGER NOT NULL
    );
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_compactions_session_created"
    ON "session_compactions" ("sessionID", "createdAt", "id");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_compactions_session_boundary"
    ON "session_compactions" ("sessionID", "compactedToMessageID");
  `)

  sessionCompactionGeneration = db.getDatabaseGeneration()
}

export function insertSessionCompaction(record: SessionCompactionRecord) {
  ensureSessionCompactionTable()
  db.insertOneWithSchema("session_compactions", record, SessionCompactionRecord)
  return record
}

export function readLatestSessionCompaction(sessionID: string) {
  ensureSessionCompactionTable()
  return db.findOneWithSchema("session_compactions", SessionCompactionRecord, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [
      { column: "createdAt", direction: "DESC" },
      { column: "id", direction: "DESC" },
    ],
  })
}

export function listSessionCompactions(sessionID: string) {
  ensureSessionCompactionTable()
  return db.findManyWithSchema("session_compactions", SessionCompactionRecord, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [
      { column: "createdAt", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ],
  })
}

export function deleteSessionCompactions(sessionID: string) {
  ensureSessionCompactionTable()
  return db.deleteMany("session_compactions", [{ column: "sessionID", value: sessionID }])
}
