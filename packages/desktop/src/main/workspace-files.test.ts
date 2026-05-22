import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { listWorkspaceDirectory, readWorkspaceFile, searchWorkspaceFiles } from "./workspace-files"

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
  await writeFile(join(workspaceRoot, "package.json"), "{}\n")

  return workspaceRoot
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("workspace files", () => {
  it("lists root directories and files while hiding git metadata", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    const entries = await listWorkspaceDirectory(workspaceRoot)

    expect(entries).toEqual([
      {
        path: "dist",
        name: "dist",
        kind: "directory",
        extension: null,
        hasChildren: true,
      },
      {
        path: "docs",
        name: "docs",
        kind: "directory",
        extension: null,
        hasChildren: true,
      },
      {
        path: "node_modules",
        name: "node_modules",
        kind: "directory",
        extension: null,
        hasChildren: true,
      },
      {
        path: "src",
        name: "src",
        kind: "directory",
        extension: null,
        hasChildren: true,
      },
      {
        path: "package.json",
        name: "package.json",
        kind: "file",
        extension: "json",
        hasChildren: false,
      },
    ])
  })

  it("lists nested directories lazily", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    const entries = await listWorkspaceDirectory(workspaceRoot, "node_modules")

    expect(entries).toEqual([
      {
        path: "node_modules/library",
        name: "library",
        kind: "directory",
        extension: null,
        hasChildren: true,
      },
    ])
  })

  it("rejects directory listings outside the workspace", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    await expect(listWorkspaceDirectory(workspaceRoot, "../")).rejects.toThrow(
      "Workspace directory path must stay within the current project.",
    )
  })

  it("rejects file paths when listing workspace directories", async () => {
    const workspaceRoot = await createWorkspaceFixture()

    await expect(listWorkspaceDirectory(workspaceRoot, "src/App.tsx")).rejects.toThrow(
      "Requested workspace path is not a directory.",
    )
  })

  it("searches by file name and skips excluded directories", async () => {
    const workspaceRoot = await createWorkspaceFixture()
    const resolvedWorkspaceRoot = await realpath(workspaceRoot)

    const results = await searchWorkspaceFiles(workspaceRoot, "app")

    expect(results).toEqual([
      {
        path: "docs/app-guide.md",
        absolutePath: join(resolvedWorkspaceRoot, "docs", "app-guide.md"),
        name: "app-guide.md",
        extension: "md",
      },
      {
        path: "src/App.tsx",
        absolutePath: join(resolvedWorkspaceRoot, "src", "App.tsx"),
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
