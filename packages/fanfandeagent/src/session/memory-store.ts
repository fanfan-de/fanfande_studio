import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"

export const SessionMemoryRecord = z
  .object({
    sessionID: Identifier.schema("session"),
    watermarkMessageID: z.string(),
    summaryText: z.string(),
    estimatedTokens: z.number().int().nonnegative(),
    turnCount: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    modelProviderID: z.string().optional(),
    modelID: z.string().optional(),
  })
  .meta({
    ref: "SessionMemoryRecord",
  })
export type SessionMemoryRecord = z.infer<typeof SessionMemoryRecord>

let sessionMemoryGeneration = -1

function ensureSessionMemoryTable() {
  const generation = db.getDatabaseGeneration()
  if (sessionMemoryGeneration === generation && generation > 0) return

  db.db.run(`
    CREATE TABLE IF NOT EXISTS "session_memory" (
      "sessionID" TEXT PRIMARY KEY,
      "watermarkMessageID" TEXT NOT NULL,
      "summaryText" TEXT NOT NULL,
      "estimatedTokens" INTEGER NOT NULL,
      "turnCount" INTEGER NOT NULL,
      "updatedAt" INTEGER NOT NULL,
      "modelProviderID" TEXT,
      "modelID" TEXT
    );
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_memory_updated_at"
    ON "session_memory" ("updatedAt");
  `)

  sessionMemoryGeneration = db.getDatabaseGeneration()
}

export function readSessionMemory(sessionID: string) {
  ensureSessionMemoryTable()
  return db.findById("session_memory", SessionMemoryRecord, sessionID, "sessionID")
}

export function upsertSessionMemory(record: SessionMemoryRecord) {
  ensureSessionMemoryTable()
  const existing = readSessionMemory(record.sessionID)
  if (existing) {
    db.updateByIdWithSchema("session_memory", record.sessionID, record, SessionMemoryRecord, "sessionID")
    return record
  }

  db.insertOneWithSchema("session_memory", record, SessionMemoryRecord)
  return record
}

export function deleteSessionMemory(sessionID: string) {
  ensureSessionMemoryTable()
  return db.deleteById("session_memory", sessionID, "sessionID")
}
