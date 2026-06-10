import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const previousDatabaseFile = process.env.ANYBOX_DATABASE_FILE
const previousPromptRoot = process.env.ANYBOX_PROMPTS_ROOT
const databaseRoot = mkdtempSync(join(tmpdir(), "anybox-db-test-"))
export const databaseFile = join(databaseRoot, "agent-local-test.db")
const promptRoot = mkdtempSync(join(tmpdir(), "anybox-prompts-test-"))
process.env.ANYBOX_DATABASE_FILE = databaseFile
process.env.ANYBOX_PROMPTS_ROOT = promptRoot

const Sqlite = await import("#database/Sqlite.ts")
Sqlite.setDatabaseFile(databaseFile)

let didCleanup = false

function cleanup() {
  if (didCleanup) return
  didCleanup = true
  Sqlite.closeDatabase()
  if (previousDatabaseFile === undefined) {
    delete process.env.ANYBOX_DATABASE_FILE
  } else {
    process.env.ANYBOX_DATABASE_FILE = previousDatabaseFile
  }
  if (previousPromptRoot === undefined) {
    delete process.env.ANYBOX_PROMPTS_ROOT
  } else {
    process.env.ANYBOX_PROMPTS_ROOT = previousPromptRoot
  }
  rmSync(databaseRoot, { recursive: true, force: true })
  rmSync(promptRoot, { recursive: true, force: true })
}

process.once("exit", cleanup)
