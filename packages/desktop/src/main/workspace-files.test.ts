import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { readWorkspaceFile, searchWorkspaceFiles } from "./workspace-files"

const tempDirectories: string[] = []

async function createWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "desktop-workspace-files-"))
  tempDirectories.push(workspaceRoot)

  await mkdir(join(workspaceRoot, "src"), { recursive: true })
  await mkdir(join(workspaceRoot, "docs"), { recursive: true })
  await mkdir(join(workspaceRoot, "node_modules", "library"), { recursive: true })
  await mkdir(join(workspaceRoot, ".git"), { recursive: true })
  await mkdir(join(workspaceRoot, "dist"), { recursive: true })

  await writeFile(join(workspaceRoot, "src", "App.tsx"), "export const App = () => null\n")
  await writeFile(join(workspaceRoot, "docs", "app-guide.md"), "# App Guide\n")
  await writeFile(join(workspaceRoot, "src", "image.png"), "binary", "utf8")
  await writeFile(join(workspaceRoot, "node_modules", "library", "app.ts"), "export const ignored = true\n")
  await writeFile(join(workspaceRoot, ".git", "app.txt"), "ignored\n")
  await writeFile(join(workspaceRoot, "dist", "app.js"), "console.log('ignored')\n")

  return workspaceRoot
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("workspace files", () => {
  it("searches by file name and skips excluded directories", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    const results = await searchWorkspaceFiles(workspaceRoot, "app")

    expect(results).toEqual([
      {
        path: "docs/app-guide.md",
        name: "app-guide.md",
        extension: "md",
      },
      {
        path: "src/App.tsx",
        name: "App.tsx",
        extension: "tsx",
      },
    ])
  })

  it("reads supported text files", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    const file = await readWorkspaceFile(workspaceRoot, "src/App.tsx")

    expect(file).toEqual({
      path: "src/App.tsx",
      name: "App.tsx",
      extension: "tsx",
      kind: "text",
      content: "export const App = () => null\n",
    })
  })

  it("marks unsupported file types without reading them as text", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    const file = await readWorkspaceFile(workspaceRoot, "src/image.png")

    expect(file).toEqual({
      path: "src/image.png",
      name: "image.png",
      extension: "png",
      kind: "unsupported",
      unsupportedReason: "This file type is not supported in the Files panel yet.",
    })
  })

  it("rejects file reads outside the workspace", async () => {
    const workspaceRoot = await createWorkspaceFixture()
    const outsideFile = join(tmpdir(), "desktop-workspace-files-secret.txt")
    await writeFile(outsideFile, "secret\n")

    await expect(readWorkspaceFile(workspaceRoot, "..\\desktop-workspace-files-secret.txt")).rejects.toThrow(
      "Workspace file path must stay within the current project.",
    )

    await rm(outsideFile, { force: true })
  })
})
