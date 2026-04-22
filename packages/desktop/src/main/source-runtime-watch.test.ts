import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createSourceRuntimeSnapshot, shouldRestartForSourceRuntimeChange } from "./source-runtime-watch"

async function createTempSourceRoot() {
  return mkdtemp(path.join(os.tmpdir(), "fanfande-source-watch-"))
}

describe("source runtime watch", () => {
  let sourceRoot: string | undefined

  afterEach(async () => {
    if (!sourceRoot) return
    await rm(sourceRoot, { recursive: true, force: true })
    sourceRoot = undefined
  })

  it("ignores unchanged watch events for existing files", async () => {
    sourceRoot = await createTempSourceRoot()
    await mkdir(path.join(sourceRoot, "prompts"), { recursive: true })
    await writeFile(path.join(sourceRoot, "prompts", "title.txt"), "original title prompt", "utf8")

    const snapshot = await createSourceRuntimeSnapshot(sourceRoot)
    const shouldRestart = await shouldRestartForSourceRuntimeChange({
      watchRoot: sourceRoot,
      snapshot,
      changedPath: path.join("prompts", "title.txt"),
    })

    expect(shouldRestart).toBe(false)
  })

  it("restarts when a watched file signature changes", async () => {
    sourceRoot = await createTempSourceRoot()
    await mkdir(path.join(sourceRoot, "session"), { recursive: true })
    const targetPath = path.join(sourceRoot, "session", "title.ts")
    await writeFile(targetPath, "export const title = 'before'\n", "utf8")

    const snapshot = await createSourceRuntimeSnapshot(sourceRoot)
    await new Promise((resolve) => setTimeout(resolve, 25))
    await writeFile(targetPath, "export const title = 'after'\n", "utf8")

    const shouldRestart = await shouldRestartForSourceRuntimeChange({
      watchRoot: sourceRoot,
      snapshot,
      changedPath: path.join("session", "title.ts"),
    })

    expect(shouldRestart).toBe(true)
  })

  it("restarts when a watched file disappears", async () => {
    sourceRoot = await createTempSourceRoot()
    await mkdir(path.join(sourceRoot, "prompts"), { recursive: true })
    const targetPath = path.join(sourceRoot, "prompts", "title.txt")
    await writeFile(targetPath, "prompt body", "utf8")

    const snapshot = await createSourceRuntimeSnapshot(sourceRoot)
    await unlink(targetPath)

    const shouldRestart = await shouldRestartForSourceRuntimeChange({
      watchRoot: sourceRoot,
      snapshot,
      changedPath: path.join("prompts", "title.txt"),
    })

    expect(shouldRestart).toBe(true)
  })
})
