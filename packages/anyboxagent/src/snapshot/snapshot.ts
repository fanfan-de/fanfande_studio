import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import * as  Log from "../util/log"
import * as  Global from "../global/global"
import z from "zod"
import * as  Config from "#config/config.ts"
import { Instance } from "../project/instance"
import { Scheduler } from "../scheduler"


const log = Log.create({ service: "snapshot" })
const hour = 60 * 60 * 1000
const prune = "7.days"

async function runGitArgs(args: string[], cwd = Instance.directory) {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return {
    exitCode,
    stdout,
    stderr,
  }
}

export function init() {
  Scheduler.register({
    id: "snapshot.cleanup",
    interval: hour,
    run: cleanup,
    scope: "instance",
  })
}

export async function cleanup() {
  const cfg = await Config.get()
  if (cfg.snapshot === false) return
  const git = gitdir()
  const exists = await fs
    .stat(git)
    .then(() => true)
    .catch(() => false)
  if (!exists) return
  const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} gc --prune=${prune}`
    .quiet()
    .cwd(Instance.directory)
    .nothrow()
  if (result.exitCode !== 0) {
    log.warn("cleanup failed", {
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
    })
    return
  }
  log.info("cleanup", { prune })
}

async function ensureSnapshotRepository(git: string) {
  try {
    await fs.mkdir(git, { recursive: true })
    const hasHead = await fs
      .stat(path.join(git, "HEAD"))
      .then(() => true)
      .catch(() => false)

    if (!hasHead) {
      const init = await $`git init`
        .env({
          ...process.env,
          GIT_DIR: git,
          GIT_WORK_TREE: Instance.worktree,
        })
        .quiet()
        .nothrow()
      if (init.exitCode !== 0) {
        log.warn("snapshot repository init failed", {
          exitCode: init.exitCode,
          stderr: init.stderr.toString(),
        })
        return false
      }
      log.info("initialized")
    }

    const config = await $`git --git-dir ${git} config core.autocrlf false`.quiet().nothrow()
    if (config.exitCode !== 0) {
      log.warn("snapshot repository config failed", {
        exitCode: config.exitCode,
        stderr: config.stderr.toString(),
      })
      return false
    }

    return true
  } catch (error) {
    log.warn("snapshot repository unavailable", {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

export async function track() {
  const cfg = await Config.get()
  if (cfg.snapshot === false) return
  const git = gitdir()

  if (!(await ensureSnapshotRepository(git))) {
    return
  }

  const add = await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
  if (add.exitCode !== 0) {
    log.warn("failed to stage snapshot", {
      exitCode: add.exitCode,
      stderr: add.stderr.toString(),
    })
    return
  }

  const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} write-tree`
    .quiet()
    .cwd(Instance.directory)
    .nothrow()
  if (result.exitCode !== 0) {
    log.warn("failed to write snapshot tree", {
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
    })
    return
  }

  const hash = result.text()
  log.info("tracking", { hash, cwd: Instance.directory, git })
  return hash.trim()
}

export const Patch = z.object({
  hash: z.string(),
  files: z.string().array(),
})
export type Patch = z.infer<typeof Patch>

export async function patch(hash: string): Promise<Patch> {
  const git = gitdir()
  await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
  const result =
    await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff --name-only ${hash} -- .`
      .quiet()
      .cwd(Instance.directory)
      .nothrow()

  // If git diff fails, return empty patch
  if (result.exitCode !== 0) {
    log.warn("failed to get diff", { hash, exitCode: result.exitCode })
    return { hash, files: [] }
  }

  const files = result.text()
  return {
    hash,
    files: files
      .trim()
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => unquote(x))
      .map((x) => path.join(Instance.worktree, x)),
  }
}

export async function restore(snapshot: string) {
  log.info("restore", { commit: snapshot })
  const git = gitdir()
  const result =
    await $`git --git-dir ${git} --work-tree ${Instance.worktree} read-tree ${snapshot} && git --git-dir ${git} --work-tree ${Instance.worktree} checkout-index -a -f`
      .quiet()
      .cwd(Instance.worktree)
      .nothrow()

  if (result.exitCode !== 0) {
    log.error("failed to restore snapshot", {
      snapshot,
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
    })
  }
}

export async function revert(patches: Patch[]) {
  const files = new Set<string>()
  const git = gitdir()
  for (const item of patches) {
    for (const file of item.files) {
      if (files.has(file)) continue
      log.info("reverting", { file, hash: item.hash })
      const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} checkout ${item.hash} -- ${file}`
        .quiet()
        .cwd(Instance.worktree)
        .nothrow()
      if (result.exitCode !== 0) {
        const relativePath = path.relative(Instance.worktree, file)
        const checkTree =
          await $`git --git-dir ${git} --work-tree ${Instance.worktree} ls-tree ${item.hash} -- ${relativePath}`
            .quiet()
            .cwd(Instance.worktree)
            .nothrow()
        if (checkTree.exitCode === 0 && checkTree.text().trim()) {
          log.info("file existed in snapshot but checkout failed, keeping", {
            file,
          })
        } else {
          log.info("file did not exist in snapshot, deleting", { file })
          await fs.unlink(file).catch(() => { })
        }
      }
      files.add(file)
    }
  }
}

export async function diff(hash: string) {
  const git = gitdir()
  await $`git --git-dir ${git} --work-tree ${Instance.worktree} add .`.quiet().cwd(Instance.directory).nothrow()
  const result =
    await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff ${hash} -- .`
      .quiet()
      .cwd(Instance.worktree)
      .nothrow()

  if (result.exitCode !== 0) {
    log.warn("failed to get diff", {
      hash,
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
    })
    return ""
  }

  return result.text().trim()
}

export const FileDiff = z
  .object({
    file: z.string(),
    before: z.string(),
    after: z.string(),
    additions: z.number(),
    deletions: z.number(),
    patch: z.string().optional(),
  })
  .meta({
    ref: "FileDiff",
  })
export type FileDiff = z.infer<typeof FileDiff>
export async function diffFull(
  from: string,
  to: string,
  options: {
    includeContent?: boolean
    maxPatchBytes?: number
  } = {},
): Promise<FileDiff[]> {
  const git = gitdir()
  const result: FileDiff[] = []
  const includeContent = options.includeContent ?? true

  const show = async (hash: string, file: string) => {
    const response = await runGitArgs([
      "-c",
      "core.autocrlf=false",
      "--git-dir",
      git,
      "--work-tree",
      Instance.worktree,
      "show",
      `${hash}:${file}`,
    ])
    if (response.exitCode === 0) return response.stdout
    const stderr = response.stderr
    if (stderr.toLowerCase().includes("does not exist in")) return ""
    return `[DEBUG ERROR] git show ${hash}:${file} failed: ${stderr}`
  }

  const showPatch = async (file: string, isBinaryFile: boolean) => {
    if (isBinaryFile) return undefined
    const response = await runGitArgs([
      "-c",
      "core.autocrlf=false",
      "--git-dir",
      git,
      "--work-tree",
      Instance.worktree,
      "diff",
      "--no-ext-diff",
      "--no-renames",
      from,
      to,
      "--",
      file,
    ])

    if (response.exitCode === 0) {
      const patch = response.stdout.trim()
      if (options.maxPatchBytes !== undefined && Buffer.byteLength(patch, "utf8") > options.maxPatchBytes) {
        return undefined
      }
      return patch
    }

    log.warn("failed to get file diff patch", {
      file,
      from,
      to,
      exitCode: response.exitCode,
      stderr: response.stderr,
    })
    return undefined
  }

  for await (const line of $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${Instance.worktree} diff --no-ext-diff --no-renames --numstat ${from} ${to} -- .`
    .quiet()
    .cwd(Instance.directory)
    .nothrow()
    .lines()) {
    if (!line) continue
    const [additions, deletions, rawFile] = line.split("\t")
    const file = unquote(rawFile!)
    const isBinaryFile = additions === "-" && deletions === "-"

    const before = includeContent && !isBinaryFile ? await show(from, file) : ""
    const after = includeContent && !isBinaryFile ? await show(to, file) : ""
    const patch = await showPatch(file, isBinaryFile)
    const added = isBinaryFile ? 0 : parseInt(additions!)
    const deleted = isBinaryFile ? 0 : parseInt(deletions!)
    result.push({
      file,
      before,
      after,
      additions: Number.isFinite(added) ? added : 0,
      deletions: Number.isFinite(deleted) ? deleted : 0,
      patch,
    })
  }
  return result
}

export function unquote(path: string): string {
  // If the path is wrapped in quotes, it might contain octal escapes
  if (path.startsWith('"') && path.endsWith('"')) {
    const quoted = path.slice(1, -1)
    // Decode escaped characters
    const buffer: number[] = []
    for (let i = 0; i < quoted.length; i++) {
      if (quoted[i] === "\\") {
        i++
        // Check for octal escape (e.g. \344)
        if (i + 2 < quoted.length && /^[0-7]{3}$/.test(quoted.slice(i, i + 3))) {
          const octal = quoted.slice(i, i + 3)
          buffer.push(parseInt(octal, 8))
          i += 2
        } else {
          // Handle standard escapes
          switch (quoted[i]) {
            case "b":
              buffer.push(8)
              break
            case "t":
              buffer.push(9)
              break
            case "n":
              buffer.push(10)
              break
            case "v":
              buffer.push(11)
              break
            case "f":
              buffer.push(12)
              break
            case "r":
              buffer.push(13)
              break
            case '"':
              buffer.push(34)
              break
            case "\\":
              buffer.push(92)
              break
            default:
              // If unknown escape, keep original (or char code of escaped char)
              buffer.push(quoted.charCodeAt(i))
          }
        }
      } else {
        const charCode = quoted.charCodeAt(i)
        if (charCode < 128) {
          buffer.push(charCode)
        } else {
          const charBuffer = Buffer.from(quoted[i]!)
          for (const byte of charBuffer) {
            buffer.push(byte)
          }
        }
      }
    }
    return Buffer.from(buffer).toString("utf8")
  }
  return path
}

function gitdir() {
  const project = Instance.project
  return path.join(Global.Path.data, "snapshot", project.id)
}
