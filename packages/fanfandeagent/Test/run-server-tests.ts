import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const databaseRoot = await mkdtemp(join(tmpdir(), "fanfande-server-test-db-"))
const promptRoot = await mkdtemp(join(tmpdir(), "fanfande-server-test-prompts-"))
const databaseFile = join(databaseRoot, "agent-local-test.db")

try {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--max-concurrency=1",
      "Test/server.api.test.ts",
      "Test/plugin.test.ts",
    ],
    {
      cwd: join(import.meta.dir, ".."),
      env: {
        ...process.env,
        FanFande_DATABASE_FILE: databaseFile,
        FanFande_PROMPTS_ROOT: promptRoot,
      },
      stderr: "inherit",
      stdout: "inherit",
    },
  )

  const exitCode = await child.exited
  process.exitCode = exitCode
} finally {
  await rm(databaseRoot, { recursive: true, force: true })
  await rm(promptRoot, { recursive: true, force: true })
}
