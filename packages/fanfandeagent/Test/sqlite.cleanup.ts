import { afterAll } from "bun:test"
import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Sqlite from "#database/Sqlite.ts"

const previousPromptRoot = process.env.FanFande_PROMPTS_ROOT
const promptRoot = mkdtempSync(join(tmpdir(), "fanfande-prompts-test-"))
process.env.FanFande_PROMPTS_ROOT = promptRoot

afterAll(async () => {
  Sqlite.closeDatabase()
  if (previousPromptRoot === undefined) {
    delete process.env.FanFande_PROMPTS_ROOT
  } else {
    process.env.FanFande_PROMPTS_ROOT = previousPromptRoot
  }
  await rm(promptRoot, { recursive: true, force: true })
})
