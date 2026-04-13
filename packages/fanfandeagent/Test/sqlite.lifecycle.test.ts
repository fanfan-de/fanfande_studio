import { expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "./sqlite.cleanup.ts"
import * as Sqlite from "#database/Sqlite.ts"

test("closes sqlite handles so database files can be removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "fanfande-sqlite-lifecycle-"))
  const databaseFile = join(root, "agent-local-test.db")

  try {
    Sqlite.setDatabaseFile(databaseFile)
    Sqlite.db.run("CREATE TABLE IF NOT EXISTS smoke (id TEXT PRIMARY KEY)")
    Sqlite.db.run("INSERT OR REPLACE INTO smoke (id) VALUES ('ok')")

    const created = await stat(databaseFile).then(() => true).catch(() => false)
    expect(created).toBe(true)

    Sqlite.closeDatabase()

    await rm(databaseFile, { force: true })
    await rm(`${databaseFile}-wal`, { force: true })
    await rm(`${databaseFile}-shm`, { force: true })

    const existsAfterDelete = await stat(databaseFile).then(() => true).catch(() => false)
    expect(existsAfterDelete).toBe(false)
  } finally {
    Sqlite.setDatabaseFile()
    Sqlite.closeDatabase()
    await rm(root, { recursive: true, force: true })
  }
})
