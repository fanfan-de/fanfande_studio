import { test, expect } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Instance } from "#project/instance.ts"
import * as Session from "#session/session.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

test("instance -> project -> session -> sqlite flow works", async () => {
  const cwd = process.cwd()

  const result = await Instance.provide({
    directory: cwd,
    async fn() {
      expect(Instance.directory).toBe(cwd)
      expect(Instance.worktree.length).toBeGreaterThan(0)
      expect(Instance.project.id).toBeTruthy()
      expect(Instance.project.initialized).toBeTypeOf("number")

      const session = await Session.createSession({
        directory: Instance.directory,
        projectID: Instance.project.id,
      })

      const restored = Session.DataBaseRead("sessions", session.id)
      expect(restored).not.toBeNull()
      expect(restored?.id).toBe(session.id)
      expect(restored?.projectID).toBe(Instance.project.id)
      expect(restored?.directory).toBe(Instance.directory)

      return {
        directory: Instance.directory,
        worktree: Instance.worktree,
        projectID: Instance.project.id,
        sessionID: session.id,
      }
    },
  })

  expect(result.directory).toBe(cwd)
  expect(result.projectID).toBeTruthy()
  expect(result.sessionID).toBeTruthy()
}, 120000)

test("instance worktree resolves to the git worktree root instead of a nested directory", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-instance-worktree-"))
  const nestedDirectory = path.join(repositoryRoot, "client")

  try {
    await createGitRepo(repositoryRoot, "instance-worktree")
    await mkdir(nestedDirectory, { recursive: true })

    const result = await Instance.provide({
      directory: nestedDirectory,
      async fn() {
        return {
          directory: Instance.directory,
          worktree: Instance.worktree,
          projectWorktree: Instance.project.worktree,
        }
      },
    })

    expect(result.directory).toBe(nestedDirectory)
    expect(result.worktree).toBe(repositoryRoot)
    expect(result.projectWorktree).toBe(repositoryRoot)
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
