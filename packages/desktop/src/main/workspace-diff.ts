import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import type {
  AgentSessionDiffRestoreMode,
  AgentSessionDiffScope,
  AgentSessionDiffScopeOption,
  AgentSessionDiffSummary,
} from "./types"

type WorkspaceGitDiffScope = Extract<AgentSessionDiffScope, `git:${string}`>

export interface WorkspaceGitDiffOptions {
  scope?: WorkspaceGitDiffScope
}

type WorkspaceGitFileState = NonNullable<AgentSessionDiffSummary["diffs"][number]["gitState"]>

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
    input?: string
  },
) => Promise<CommandResult>

const GIT_SCOPE_LABELS: Record<WorkspaceGitDiffScope, string> = {
  "git:unstaged": "未暂存",
  "git:staged": "已暂存",
  "git:commit": "提交",
  "git:branch": "分支",
}

function createSummary(
  diffs: AgentSessionDiffSummary["diffs"],
  metadata: Pick<AgentSessionDiffSummary, "availableScopes" | "restoreMode" | "scope"> = {},
): AgentSessionDiffSummary {
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
    ...metadata,
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
    input?: string
  },
): Promise<CommandResult> {
  const allowExitCodes = options.allowExitCodes ?? [0]

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    const stdoutStream = child.stdout
    const stderrStream = child.stderr
    if (!stdoutStream || !stderrStream) {
      reject(new Error("Failed to open git process streams."))
      return
    }

    let stdout = ""
    let stderr = ""

    stdoutStream.setEncoding("utf8")
    stderrStream.setEncoding("utf8")
    stdoutStream.on("data", (chunk) => {
      stdout += chunk
    })
    stderrStream.on("data", (chunk) => {
      stderr += chunk
    })
    if (options.input !== undefined) {
      child.stdin?.end(options.input)
    }
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

function readPatchPathTokens(value: string) {
  const tokens: string[] = []
  let index = 0

  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index] ?? "")) index += 1
    if (index >= value.length) break

    if (value[index] === "\"") {
      let token = "\""
      index += 1
      let escaped = false
      while (index < value.length) {
        const char = value[index] ?? ""
        token += char
        index += 1
        if (escaped) {
          escaped = false
          continue
        }
        if (char === "\\") {
          escaped = true
          continue
        }
        if (char === "\"") break
      }
      tokens.push(token)
      continue
    }

    const start = index
    while (index < value.length && !/\s/.test(value[index] ?? "")) index += 1
    tokens.push(value.slice(start, index))
  }

  return tokens
}

function decodeQuotedGitPath(token: string) {
  const trimmed = token.trim()
  if (!trimmed.startsWith("\"") || !trimmed.endsWith("\"")) return trimmed

  const quoted = trimmed.slice(1, -1)
  const buffer: number[] = []
  for (let index = 0; index < quoted.length; index += 1) {
    const char = quoted[index] ?? ""
    if (char !== "\\") {
      const code = char.charCodeAt(0)
      if (code < 128) {
        buffer.push(code)
      } else {
        for (const byte of Buffer.from(char)) {
          buffer.push(byte)
        }
      }
      continue
    }

    index += 1
    const escaped = quoted[index] ?? ""
    if (index + 2 < quoted.length && /^[0-7]{3}$/.test(quoted.slice(index, index + 3))) {
      buffer.push(parseInt(quoted.slice(index, index + 3), 8))
      index += 2
      continue
    }

    switch (escaped) {
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
      case "\"":
        buffer.push(34)
        break
      case "\\":
        buffer.push(92)
        break
      default:
        buffer.push(escaped.charCodeAt(0))
        break
    }
  }

  return Buffer.from(buffer).toString("utf8")
}

function normalizePatchHeaderPath(token: string) {
  const decoded = decodeQuotedGitPath(token)
  if (decoded === "/dev/null") return null

  const withoutPrefix = decoded.startsWith("a/") || decoded.startsWith("b/")
    ? decoded.slice(2)
    : decoded
  return normalizeWorkspaceDiffFile(withoutPrefix)
}

function addValidatedPatchHeaderPath(paths: Set<string>, token: string, expectedFile: string) {
  const normalized = normalizePatchHeaderPath(token)
  if (!normalized) return
  if (normalized !== expectedFile) {
    throw new Error(`Patch path '${normalized}' does not match '${expectedFile}'.`)
  }
  paths.add(normalized)
}

function createPatchForDeclaredFile(file: string, patch: string) {
  const normalized = patch.replace(/^\uFEFF/, "").replace(/^(?:\r?\n)+/, "").replace(/(?:\r?\n)+$/, "")
  if (!normalized.trim()) {
    throw new Error("Patch text is required for precise undo.")
  }

  const headerPaths = new Set<string>()
  let hasPatchHeader = false

  for (const line of normalized.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      hasPatchHeader = true
      const tokens = readPatchPathTokens(line.slice("diff --git ".length))
      if (tokens.length >= 2) {
        addValidatedPatchHeaderPath(headerPaths, tokens[0] ?? "", file)
        addValidatedPatchHeaderPath(headerPaths, tokens[1] ?? "", file)
      }
      continue
    }

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      hasPatchHeader = true
      const tokens = readPatchPathTokens(line.slice(4))
      if (tokens.length > 0) {
        addValidatedPatchHeaderPath(headerPaths, tokens[0] ?? "", file)
      }
    }
  }

  if (hasPatchHeader) {
    if (headerPaths.size === 0) {
      throw new Error("Patch headers do not reference a workspace file.")
    }
    return `${normalized}\n`
  }

  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    normalized,
    "",
  ].join("\n")
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

async function readUnstagedTrackedChangedFiles(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "diff", "--name-only", "--relative", "--", "."], {
    cwd: directory,
  })

  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function readStagedChangedFiles(directory: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "diff", "--cached", "--name-only", "--relative", "--", "."], {
    cwd: directory,
  })

  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function readLatestCommitChangedFiles(directory: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "-z", "--relative", "HEAD", "--", "."],
    {
      cwd: directory,
    },
  )

  return splitNullSeparated(result.stdout)
}

async function readUpstreamBranch(directory: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    {
      cwd: directory,
      allowExitCodes: [0, 128],
    },
  )

  if (result.exitCode !== 0) return null
  const upstream = result.stdout.trim()
  return upstream.length > 0 ? upstream : null
}

async function readBranchChangedFiles(directory: string, upstream: string, runner: CommandRunner) {
  const result = await runner(["-C", directory, "diff", "--name-only", "--relative", "-z", `${upstream}...HEAD`, "--", "."], {
    cwd: directory,
  })

  return splitNullSeparated(result.stdout)
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

async function buildUnstagedTrackedPatch(directory: string, file: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "diff", "--no-ext-diff", "--no-renames", "--relative", "--", file],
    {
      cwd: directory,
    },
  )

  return result.stdout.trim()
}

async function buildStagedPatch(directory: string, file: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "diff", "--cached", "--no-ext-diff", "--no-renames", "--relative", "--", file],
    {
      cwd: directory,
    },
  )

  return result.stdout.trim()
}

async function buildLatestCommitPatch(directory: string, file: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "show", "--format=", "--no-ext-diff", "--no-renames", "--relative", "--root", "HEAD", "--", file],
    {
      cwd: directory,
    },
  )

  return result.stdout.trim()
}

async function buildBranchPatch(directory: string, upstream: string, file: string, runner: CommandRunner) {
  const result = await runner(
    ["-C", directory, "diff", "--no-ext-diff", "--no-renames", "--relative", `${upstream}...HEAD`, "--", file],
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

function getRestoreModeForGitScope(scope: WorkspaceGitDiffScope): AgentSessionDiffRestoreMode {
  switch (scope) {
    case "git:unstaged":
    case "git:staged":
      return "git-file"
    case "git:commit":
    case "git:branch":
      return "none"
  }
}

function createGitScopeOption(
  scope: WorkspaceGitDiffScope,
  input: {
    count?: number
    enabled?: boolean
    reason?: string
  } = {},
): AgentSessionDiffScopeOption {
  return {
    scope,
    label: GIT_SCOPE_LABELS[scope],
    enabled: input.enabled ?? true,
    ...(typeof input.count === "number" ? { count: input.count } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(scope === "git:commit" ? { hasChildren: true } : {}),
  }
}

async function countFiles(
  fallback: AgentSessionDiffScopeOption,
  fn: () => Promise<string[]>,
): Promise<AgentSessionDiffScopeOption> {
  try {
    return {
      ...fallback,
      enabled: true,
      count: (await fn()).length,
    }
  } catch (error) {
    return {
      ...fallback,
      enabled: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildGitScopeOptions(
  directory: string,
  runner: CommandRunner,
  hasHead: boolean,
): Promise<AgentSessionDiffScopeOption[]> {
  const upstream = hasHead
    ? await readUpstreamBranch(directory, runner).catch(() => null)
    : null

  return [
    await countFiles(createGitScopeOption("git:unstaged"), async () => [...new Set([
      ...await readUnstagedTrackedChangedFiles(directory, runner),
      ...await readUntrackedFiles(directory, runner),
    ])]),
    await countFiles(createGitScopeOption("git:staged"), () => readStagedChangedFiles(directory, runner)),
    hasHead
      ? await countFiles(createGitScopeOption("git:commit"), () => readLatestCommitChangedFiles(directory, runner))
      : createGitScopeOption("git:commit", {
          enabled: false,
          reason: "No commits yet.",
        }),
    upstream
      ? await countFiles(createGitScopeOption("git:branch"), () => readBranchChangedFiles(directory, upstream, runner))
      : createGitScopeOption("git:branch", {
          enabled: false,
          reason: hasHead ? "No upstream branch configured." : "No commits yet.",
        }),
  ]
}

function createScopedGitSummary(
  scope: WorkspaceGitDiffScope,
  diffs: AgentSessionDiffSummary["diffs"],
  availableScopes: AgentSessionDiffScopeOption[],
) {
  return createSummary(diffs, {
    scope,
    restoreMode: getRestoreModeForGitScope(scope),
    availableScopes,
  })
}

function resolveGetWorkspaceGitDiffArgs(
  optionsOrRunner?: WorkspaceGitDiffOptions | CommandRunner,
  runner?: CommandRunner,
): {
  options: WorkspaceGitDiffOptions
  runner: CommandRunner
} {
  if (typeof optionsOrRunner === "function") {
    return {
      options: {},
      runner: optionsOrRunner,
    }
  }

  return {
    options: optionsOrRunner ?? {},
    runner: runner ?? runGit,
  }
}

async function buildDiffsFromPatches(
  files: string[],
  buildPatch: (file: string) => Promise<string>,
  gitState?: WorkspaceGitFileState,
): Promise<AgentSessionDiffSummary["diffs"]> {
  const diffs: AgentSessionDiffSummary["diffs"] = []

  for (const file of files) {
    const patch = await buildPatch(file)
    const stats = countPatchChanges(patch)
    diffs.push({
      file,
      additions: stats.additions,
      deletions: stats.deletions,
      ...(gitState ? { gitState } : {}),
      patch: patch || undefined,
    })
  }

  return diffs
}

export async function getWorkspaceGitDiff(
  directory: string,
  optionsOrRunner?: WorkspaceGitDiffOptions | CommandRunner,
  explicitRunner?: CommandRunner,
): Promise<AgentSessionDiffSummary | null> {
  const { options, runner } = resolveGetWorkspaceGitDiffArgs(optionsOrRunner, explicitRunner)
  const root = await resolveGitRoot(directory, runner)
  if (!root) return null

  const hasHead = await hasHeadCommit(directory, runner)
  const scope = options.scope
  const availableScopes = await buildGitScopeOptions(directory, runner, hasHead)
  const tempDirectory = await mkdtemp(join(tmpdir(), "desktop-workspace-diff-"))
  const emptyFilePath = join(tempDirectory, "empty")
  await writeFile(emptyFilePath, "")

  try {
    if (scope === "git:unstaged") {
      const candidateFiles = [...new Set([
        ...await readUnstagedTrackedChangedFiles(directory, runner),
        ...await readUntrackedFiles(directory, runner),
      ])]
      const diffs = await buildDiffsFromPatches(
        candidateFiles,
        async (file) =>
          (await buildUnstagedTrackedPatch(directory, file, runner)) || await buildAddedPatch(directory, file, emptyFilePath, runner),
        "unstaged",
      )
      return createScopedGitSummary(scope, diffs, availableScopes)
    }

    if (scope === "git:staged") {
      const diffs = await buildDiffsFromPatches(
        await readStagedChangedFiles(directory, runner),
        (file) => buildStagedPatch(directory, file, runner),
        "staged",
      )
      return createScopedGitSummary(scope, diffs, availableScopes)
    }

    if (scope === "git:commit") {
      const diffs = hasHead
        ? await buildDiffsFromPatches(
            await readLatestCommitChangedFiles(directory, runner),
            (file) => buildLatestCommitPatch(directory, file, runner),
          )
        : []
      return createScopedGitSummary(scope, diffs, availableScopes)
    }

    if (scope === "git:branch") {
      const upstream = hasHead ? await readUpstreamBranch(directory, runner) : null
      const diffs = upstream
        ? await buildDiffsFromPatches(
            await readBranchChangedFiles(directory, upstream, runner),
            (file) => buildBranchPatch(directory, upstream, file, runner),
          )
        : []
      return createScopedGitSummary(scope, diffs, availableScopes)
    }

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

    return createSummary(diffs, {
      scope: "git:unstaged",
      restoreMode: "git-file",
      availableScopes,
    })
  } finally {
    await rm(tempDirectory, { force: true, recursive: true }).catch(() => undefined)
  }
}

function parsePorcelainFileState(status: string): WorkspaceGitFileState {
  const indexStatus = status[0] ?? " "
  const worktreeStatus = status[1] ?? " "

  if (indexStatus === "?" && worktreeStatus === "?") return "untracked"
  if (indexStatus !== " " && worktreeStatus !== " ") return "mixed"
  if (indexStatus !== " ") return "staged"
  if (worktreeStatus !== " ") return "unstaged"
  return "clean"
}

export async function getWorkspaceGitFileStates(
  directory: string,
  files: string[],
  runner: CommandRunner = runGit,
): Promise<Record<string, WorkspaceGitFileState> | null> {
  const normalizedDirectory = directory.trim()
  if (!normalizedDirectory) return null

  const root = await resolveGitRoot(normalizedDirectory, runner)
  if (!root) return null

  const normalizedFiles = [...new Set(files.map((file) => {
    try {
      const normalized = normalizeWorkspaceDiffFile(file)
      assertWorkspaceDiffFileIsInsideDirectory(normalizedDirectory, normalized)
      return normalized
    } catch {
      return ""
    }
  }).filter(Boolean))]
  if (normalizedFiles.length === 0) return {}

  const result = await runner(
    ["-C", normalizedDirectory, "status", "--porcelain=v1", "-z", "--", ...normalizedFiles],
    {
      cwd: normalizedDirectory,
    },
  )

  const states = Object.fromEntries(normalizedFiles.map((file) => [file, "clean" as WorkspaceGitFileState]))
  const entries = result.stdout.split("\0").filter(Boolean)
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? ""
    if (entry.length < 4) continue

    const status = entry.slice(0, 2)
    const rawPath = entry.slice(3).replace(/\\/g, "/")
    const file = normalizeWorkspaceDiffFile(rawPath)
    if (file in states) {
      states[file] = parsePorcelainFileState(status)
    }
    if (status[0] === "R" || status[0] === "C") {
      index += 1
    }
  }

  return states
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

function normalizeWorkspaceDiffFileActionInput(input: { directory: string; file: string }) {
  const directory = input.directory.trim()
  if (!directory) {
    throw new Error("Workspace directory is required.")
  }

  const file = normalizeWorkspaceDiffFile(input.file)
  assertWorkspaceDiffFileIsInsideDirectory(directory, file)

  return {
    directory,
    file,
  }
}

export async function stageWorkspaceDiffFile(
  input: {
    directory: string
    file: string
  },
  runner: CommandRunner = runGit,
) {
  const { directory, file } = normalizeWorkspaceDiffFileActionInput(input)
  const root = await resolveGitRoot(directory, runner)
  if (!root) {
    throw new Error("Workspace directory must be inside a git repository.")
  }

  await runner(["-C", directory, "add", "--", file], {
    cwd: directory,
  })

  return {
    directory,
    file,
  }
}

export async function unstageWorkspaceDiffFile(
  input: {
    directory: string
    file: string
  },
  runner: CommandRunner = runGit,
) {
  const { directory, file } = normalizeWorkspaceDiffFileActionInput(input)
  const root = await resolveGitRoot(directory, runner)
  if (!root) {
    throw new Error("Workspace directory must be inside a git repository.")
  }

  const hasHead = await hasHeadCommit(directory, runner)
  await runner(
    hasHead
      ? ["-C", directory, "restore", "--staged", "--", file]
      : ["-C", directory, "rm", "--cached", "-f", "--", file],
    {
      cwd: directory,
    },
  )

  return {
    directory,
    file,
  }
}

export interface WorkspaceDiffPatchReverseApplyInput {
  directory: string
  diffs: Array<{
    file: string
    patch?: string
  }>
}

export interface WorkspaceDiffPatchReverseApplyResult {
  directory: string
  restored: Array<{ file: string }>
  failed: Array<{ file: string; message: string }>
}

function formatGitApplyFailure(result: CommandResult, fallback: string) {
  return (result.stderr.trim() || result.stdout.trim() || fallback)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n")
}

export async function reverseApplyWorkspaceDiffPatches(
  input: WorkspaceDiffPatchReverseApplyInput,
  runner: CommandRunner = runGit,
): Promise<WorkspaceDiffPatchReverseApplyResult> {
  const directory = input.directory.trim()
  if (!directory) {
    throw new Error("Workspace directory is required.")
  }

  const root = await resolveGitRoot(directory, runner)
  if (!root) {
    throw new Error("Workspace directory must be inside a git repository.")
  }

  const restored: WorkspaceDiffPatchReverseApplyResult["restored"] = []
  const failed: WorkspaceDiffPatchReverseApplyResult["failed"] = []

  for (const diff of input.diffs) {
    let file = diff.file.trim().replace(/\\/g, "/")
    try {
      file = normalizeWorkspaceDiffFile(diff.file)
      assertWorkspaceDiffFileIsInsideDirectory(directory, file)

      const patch = createPatchForDeclaredFile(file, diff.patch ?? "")
      const checkResult = await runner(["-C", directory, "apply", "-R", "--check"], {
        cwd: directory,
        input: patch,
        allowExitCodes: [0, 1],
      })
      if (checkResult.exitCode !== 0) {
        failed.push({
          file,
          message: formatGitApplyFailure(checkResult, "Patch does not apply."),
        })
        continue
      }

      const applyResult = await runner(["-C", directory, "apply", "-R"], {
        cwd: directory,
        input: patch,
        allowExitCodes: [0, 1],
      })
      if (applyResult.exitCode !== 0) {
        failed.push({
          file,
          message: formatGitApplyFailure(applyResult, "Patch could not be reverse-applied."),
        })
        continue
      }

      restored.push({ file })
    } catch (error) {
      failed.push({
        file: file || diff.file || "(unknown)",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    directory,
    restored,
    failed,
  }
}
