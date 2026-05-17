import { afterAll } from "bun:test"
import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const previousDatabaseFile = process.env.FanFande_DATABASE_FILE
const previousPromptRoot = process.env.FanFande_PROMPTS_ROOT
const databaseRoot = mkdtempSync(join(tmpdir(), "fanfande-db-test-"))
const databaseFile = join(databaseRoot, "agent-local-test.db")
const promptRoot = mkdtempSync(join(tmpdir(), "fanfande-prompts-test-"))
process.env.FanFande_DATABASE_FILE = databaseFile
process.env.FanFande_PROMPTS_ROOT = promptRoot

const Sqlite = await import("#database/Sqlite.ts")
Sqlite.setDatabaseFile(databaseFile)

afterAll(async () => {
  Sqlite.closeDatabase()
  if (previousDatabaseFile === undefined) {
    delete process.env.FanFande_DATABASE_FILE
  } else {
    process.env.FanFande_DATABASE_FILE = previousDatabaseFile
  }
  if (previousPromptRoot === undefined) {
    delete process.env.FanFande_PROMPTS_ROOT
  } else {
    process.env.FanFande_PROMPTS_ROOT = previousPromptRoot
  }
  await rm(databaseRoot, { recursive: true, force: true })
  await rm(promptRoot, { recursive: true, force: true })
})
