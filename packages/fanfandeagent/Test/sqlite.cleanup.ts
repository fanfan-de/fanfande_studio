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
  await removeWithRetry(databaseRoot)
  await removeWithRetry(promptRoot)
})
