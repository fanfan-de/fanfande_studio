import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readWorkspaceFile } from "#server/usecases/workspace-files.ts"

const tempDirectories: string[] = []

async function createWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "anybox-workspace-files-"))
  tempDirectories.push(workspaceRoot)
  return workspaceRoot
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("workspace files", () => {
  test("reads unknown file extensions when the content is text", async () => {
    const workspaceRoot = await createWorkspaceFixture()
    await writeFile(join(workspaceRoot, ".env.example"), "TENCENT_SECRET_ID=example\nTENCENT_REGION=ap-guangzhou\n")

    const file = await readWorkspaceFile({ directory: workspaceRoot, path: ".env.example" })

    expect(file).toEqual({
      path: ".env.example",
      name: ".env.example",
      extension: "example",
      kind: "text",
      content: "TENCENT_SECRET_ID=example\nTENCENT_REGION=ap-guangzhou\n",
    })
  })

  test("keeps binary-like unknown files unsupported", async () => {
    const workspaceRoot = await createWorkspaceFixture()
    await writeFile(join(workspaceRoot, "payload.unknown"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))

    const file = await readWorkspaceFile({ directory: workspaceRoot, path: "payload.unknown" })

    expect(file).toEqual({
      path: "payload.unknown",
      name: "payload.unknown",
      extension: "unknown",
      kind: "unsupported",
      unsupportedReason: "This file type is not supported in the Files panel yet.",
    })
  })
})
