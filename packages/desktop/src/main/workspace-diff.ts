import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import type { AgentSessionDiffSummary } from "./types"

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

type CommandRunner = (
  args: string[],
  options: {
    allowExitCodes?: number[]
    cwd: string
  },
) => Promise<CommandResult>

function createSummary(diffs: AgentSessionDiffSummary["diffs"]): AgentSessionDiffSummary {
  const stats = diffs.reduce(
    (summary, diff) => ({
      additions: summary.additions + diff.additions,
      deletions: summary.deletions + diff.deletions,
      files: summary.files + 1,
    }),
    {
      additions: 0,
      deletions: 0,
      files: 0,
    },
  )

  const title =
    stats.files === 0 ? "No file changes" : `${stats.files} file change${stats.files === 1 ? "" : "s"} (+${stats.additions} -${stats.deletions})`
  const preview = diffs.slice(0, 3).map((diff) => diff.file)
  const remaining = stats.files - preview.length
  const body =
    preview.length === 0
      ? "No workspace changes were detected for this directory."
      : `${preview.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`

  return {
    title,
    body,
    stats,
    diffs,
  }
}

function countPatchChanges(patch: string) {
  let additions = 0
  let deletions = 0

  for (const line of patch.split(/\r?\n/)) {
    if (!line || line.startsWith("+++ ") || line.startsWith("--- ")) continue
    if (line.startsWith("+")) additions += 1
    if (line.startsWith("-")) deletions += 1
  }

  return {
    additions,
    deletions,
  }
}

function splitNullSeparated(output: string) {
  return output
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function runGit(
  args: string[],
  options: {
    allowExitCodes?: number[]
    cwd: string
  },
): Promise<CommandResult> {
  const allowExitCodes = options.allowExitCodes ?? [0]

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1
      if (!allowExitCodes.includes(exitCode)) {
        reject(new Error(stderr.trim() || `git ${args.join(" ")} failed with exit code ${exitCode}`))
        return
      }

      resolve({
        exitCode,
        stdout,
        stderr,
      })
    })
  })
}

async function resolveGitRoot(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "rev-parse", "--show-toplevel"], {
    cwd: directory,
    allowExitCodes: [0, 128],
  })

  if (result.exitCode !== 0) return null
  const root = result.stdout.trim()
  return root.length > 0 ? root : null
}

async function hasHeadCommit(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "rev-parse", "--verify", "HEAD"], {
    cwd: directory,
    allowExitCodes: [0, 128],
  })

  return result.exitCode === 0
}

function normalizeWorkspaceDiffFile(file: string) {
  const normalized = file.trim().replace(/\\/g, "/")
  if (!normalized) {
    throw new Error("Workspace diff file is required.")
  }

  if (isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error("Workspace diff file must be relative to the current project.")
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".")
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    throw new Error("Workspace diff file must stay within the current project.")
  }

  return segments.join("/")
}

function assertWorkspaceDiffFileIsInsideDirectory(directory: string, file: string) {
  const targetPath = resolve(directory, file)
  const relativePath = relative(directory, targetPath)
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Workspace diff file must stay within the current project.")
  }
}

async function isWorkspaceFileTracked(directory: string, file: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "ls-files", "--error-unmatch", "--", file], {
    cwd: directory,
    allowExitCodes: [0, 1],
  })

  return result.exitCode === 0
}

async function readTrackedChangedFiles(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "diff", "--name-only", "--relative", "HEAD", "--", "."], {
    cwd: directory,
  })

  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function readUntrackedFiles(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "ls-files", "--others", "--exclude-standard", "-z", "--", "."], {
    cwd: directory,
  })

  return splitNullSeparated(result.stdout)
}

async function readAllWorkspaceFiles(directory: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."],
    {
      cwd: directory,
    },
  )

  return splitNullSeparated(result.stdout)
}

async function buildTrackedPatch(directory: string, file: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "diff", "--no-ext-diff", "--no-renames", "--relative", "HEAD", "--", file],
    {
      cwd: directory,
    },
  )

  return result.stdout.trim()
}

async function buildAddedPatch(directory: string, file: string, emptyFilePath: string, runner: CommandRunner) {
  const result = await runner(
    [
      "-C",
      directory,
      "diff",
      "--no-index",
      "--no-ext-diff",
      emptyFilePath,
      file,
    ],
    {
      cwd: directory,
      allowExitCodes: [0, 1],
    },
  )

  return normalizeAddedPatch(result.stdout, file)
}

function normalizeAddedPatch(patch: string, file: string) {
  const trimmed = patch.trim()
  if (!trimmed) return ""

  return trimmed
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("diff --git ")) {
        return `diff --git a/${file} b/${file}`
      }
      if (line.startsWith("--- ")) {
        return `--- a/${file}`
      }
      if (line.startsWith("+++ ")) {
        return `+++ b/${file}`
      }
      return line
    })
    .join("\n")
}

export async function getWorkspaceGitDiff(directory: string, runner: CommandRunner = runGit): Promise<AgentSessionDiffSummary | null> {
  const root = await resolveGitRoot(directory, runner)
  if (!root) return null

  const hasHead = await hasHeadCommit(directory, runner)
  const tempDirectory = await mkdtemp(join(tmpdir(), "desktop-workspace-diff-"))
  const emptyFilePath = join(tempDirectory, "empty")
  await writeFile(emptyFilePath, "")

  try {
    const candidateFiles = hasHead
      ? [...new Set([...await readTrackedChangedFiles(directory, runner), ...await readUntrackedFiles(directory, runner)])]
      : await readAllWorkspaceFiles(directory, runner)

    const diffs: AgentSessionDiffSummary["diffs"] = []
    for (const file of candidateFiles) {
      const patch = hasHead
        ? (await buildTrackedPatch(directory, file, runner)) || await buildAddedPatch(directory, file, emptyFilePath, runner)
        : await buildAddedPatch(directory, file, emptyFilePath, runner)

      const stats = countPatchChanges(patch)
      diffs.push({
        file,
        additions: stats.additions,
        deletions: stats.deletions,
        patch: patch || undefined,
      })
    }

    return createSummary(diffs)
  } finally {
    await rm(tempDirectory, { force: true, recursive: true }).catch(() => undefined)
  }
}

export async function restoreWorkspaceDiffFile(
  input: {
    directory: string
    file: string
  },
  runner: CommandRunner = runGit,
) {
  const directory = input.directory.trim()
  if (!directory) {
    throw new Error("Workspace directory is required.")
  }

  const root = await resolveGitRoot(directory, runner)
  if (!root) {
    throw new Error("Workspace directory must be inside a git repository.")
  }

  const file = normalizeWorkspaceDiffFile(input.file)
  assertWorkspaceDiffFileIsInsideDirectory(directory, file)

  const hasHead = await hasHeadCommit(directory, runner)
  const isTracked = await isWorkspaceFileTracked(directory, file, runner)

  if (isTracked) {
    await runner(
      hasHead
        ? ["-C", directory, "restore", "--source=HEAD", "--staged", "--worktree", "--", file]
        : ["-C", directory, "rm", "-f", "--", file],
      {
        cwd: directory,
      },
    )
  } else {
    await runner(["-C", directory, "clean", "-f", "--", file], {
      cwd: directory,
    })
  }

  return {
    directory,
    file,
  }
}
