import path from "node:path"

const GIT_BINARY_NAMES = process.platform === "win32" ? ["git.exe", "git"] : ["git"]
const GH_BINARY_NAMES = process.platform === "win32" ? ["gh.exe", "gh"] : ["gh"]

export interface GitCapability {
  enabled: boolean
  reason?: string
}

export interface GitCapabilities {
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: GitCapability
  canPush: GitCapability
  canCreatePullRequest: GitCapability
  canCreateBranch: GitCapability
}

export interface GitActionResult {
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

function resolveCommandBinary(names: string[]) {
  for (const name of names) {
    const resolved = Bun.which(name)
    if (resolved) return resolved
  }

  return null
}

function trimCommandOutput(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

async function runCommand(binary: string, args: string[], cwd: string): Promise<CommandResult> {
  const proc = Bun.spawn([binary, ...args], {
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    stdout: trimCommandOutput(stdout),
    stderr: trimCommandOutput(stderr),
    exitCode,
  }
}

function buildCommandError(result: CommandResult, fallback: string) {
  return new Error(result.stderr || result.stdout || fallback)
}

async function runCommandOrThrow(binary: string, args: string[], cwd: string, fallback: string) {
  const result = await runCommand(binary, args, cwd)
  if (result.exitCode !== 0) {
    throw buildCommandError(result, fallback)
  }

  return result
}

function requireDirectory(directory: string) {
  const trimmed = directory.trim()
  if (!trimmed) {
    throw new Error("A Git working directory is required.")
  }

  return path.resolve(trimmed)
}

function requireGitBinary() {
  const git = resolveCommandBinary(GIT_BINARY_NAMES)
  if (!git) {
    throw new Error("Git is not installed.")
  }

  return git
}

function requireGhBinary() {
  const gh = resolveCommandBinary(GH_BINARY_NAMES)
  if (!gh) {
    throw new Error("GitHub CLI is not installed.")
  }

  return gh
}

function parseBranchName(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed === "HEAD") return null
  return trimmed
}

function parseDefaultBranch(ref: string) {
  const trimmed = ref.trim()
  if (!trimmed) return null
  const segments = trimmed.split("/")
  return segments[segments.length - 1] || null
}

function parseAheadBehind(value: string) {
  const [behindRaw = "0", aheadRaw = "0"] = value.trim().split(/\s+/)
  const behind = Number.parseInt(behindRaw, 10)
  const ahead = Number.parseInt(aheadRaw, 10)

  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  }
}

function emptyCapabilities(directory: string, reason: string): GitCapabilities {
  return {
    directory,
    root: null,
    branch: null,
    defaultBranch: null,
    isGitRepo: false,
    canCommit: { enabled: false, reason },
    canPush: { enabled: false, reason },
    canCreatePullRequest: { enabled: false, reason },
    canCreateBranch: { enabled: false, reason },
  }
}

async function resolveGitRoot(directory: string, gitBinary: string) {
  const result = await runCommand(gitBinary, ["rev-parse", "--show-toplevel"], directory)
  if (result.exitCode !== 0 || !result.stdout) return null
  return path.resolve(result.stdout)
}

async function resolveCurrentBranch(directory: string, gitBinary: string) {
  const result = await runCommand(gitBinary, ["rev-parse", "--abbrev-ref", "HEAD"], directory)
  if (result.exitCode !== 0) return null
  return parseBranchName(result.stdout)
}

async function resolveUpstream(directory: string, gitBinary: string) {
  const result = await runCommand(gitBinary, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], directory)
  if (result.exitCode !== 0 || !result.stdout) return null
  return result.stdout
}

async function resolveRemoteName(directory: string, gitBinary: string, upstream: string | null) {
  if (upstream) {
    const [remoteName] = upstream.split("/")
    if (remoteName) return remoteName
  }

  const remotes = await runCommand(gitBinary, ["remote"], directory)
  if (remotes.exitCode !== 0 || !remotes.stdout) return null
  return remotes.stdout.split("\n").map((item) => item.trim()).find(Boolean) ?? null
}

async function resolveRemoteUrl(directory: string, gitBinary: string, remoteName: string | null) {
  if (!remoteName) return null
  const result = await runCommand(gitBinary, ["remote", "get-url", remoteName], directory)
  if (result.exitCode !== 0 || !result.stdout) return null
  return result.stdout
}

async function resolveDefaultBranch(directory: string, gitBinary: string, remoteName: string | null) {
  if (!remoteName) return null
  const result = await runCommand(gitBinary, ["symbolic-ref", "--short", `refs/remotes/${remoteName}/HEAD`], directory)
  if (result.exitCode !== 0 || !result.stdout) return null
  return parseDefaultBranch(result.stdout)
}

async function resolveAheadBehind(directory: string, gitBinary: string, hasUpstream: boolean) {
  if (!hasUpstream) {
    return { ahead: 0, behind: 0 }
  }

  const result = await runCommand(gitBinary, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], directory)
  if (result.exitCode !== 0 || !result.stdout) {
    return { ahead: 0, behind: 0 }
  }

  return parseAheadBehind(result.stdout)
}

async function canAccessGhRepository(directory: string, ghBinary: string) {
  const result = await runCommand(ghBinary, ["repo", "view", "--json", "url"], directory)
  return result.exitCode === 0
}

async function findOpenPullRequestUrl(directory: string, ghBinary: string, branch: string | null) {
  if (!branch) return null

  const result = await runCommand(ghBinary, ["pr", "list", "--head", branch, "--state", "open", "--json", "url"], directory)
  if (result.exitCode !== 0 || !result.stdout) return null

  try {
    const parsed = JSON.parse(result.stdout) as Array<{ url?: string }>
    const url = parsed.find((item) => typeof item.url === "string" && item.url.trim())?.url?.trim()
    return url || null
  } catch {
    return null
  }
}

function extractUrl(value: string) {
  const match = value.match(/https?:\/\/\S+/)
  return match?.[0] ?? undefined
}

export async function getGitCapabilities(directory: string): Promise<GitCapabilities> {
  const targetDirectory = requireDirectory(directory)
  const gitBinary = resolveCommandBinary(GIT_BINARY_NAMES)

  if (!gitBinary) {
    return emptyCapabilities(targetDirectory, "Git is not installed.")
  }

  const root = await resolveGitRoot(targetDirectory, gitBinary)
  if (!root) {
    return emptyCapabilities(targetDirectory, "The current workspace is not a Git repository.")
  }

  const branch = await resolveCurrentBranch(targetDirectory, gitBinary)
  const status = await runCommand(gitBinary, ["status", "--porcelain"], targetDirectory)
  const hasChanges = status.exitCode === 0 && Boolean(status.stdout)
  const upstream = await resolveUpstream(targetDirectory, gitBinary)
  const hasUpstream = Boolean(upstream)
  const { ahead } = await resolveAheadBehind(targetDirectory, gitBinary, hasUpstream)
  const remoteName = await resolveRemoteName(targetDirectory, gitBinary, upstream)
  const defaultBranch = await resolveDefaultBranch(targetDirectory, gitBinary, remoteName)

  const canCommit = hasChanges
    ? { enabled: true }
    : { enabled: false, reason: "There are no local changes to commit." }

  const canPush = !branch
    ? { enabled: false, reason: "The current worktree is on a detached HEAD." }
    : !hasUpstream
      ? { enabled: false, reason: "The current branch does not track a remote branch." }
      : ahead <= 0
        ? { enabled: false, reason: "The current branch has no commits to push." }
        : { enabled: true }

  const canCreateBranch = {
    enabled: true,
  } satisfies GitCapability

  let canCreatePullRequest: GitCapability
  if (!branch) {
    canCreatePullRequest = { enabled: false, reason: "The current worktree is on a detached HEAD." }
  } else if (!hasUpstream) {
    canCreatePullRequest = { enabled: false, reason: "Push the current branch before creating a pull request." }
  } else if (defaultBranch && branch === defaultBranch) {
    canCreatePullRequest = { enabled: false, reason: "Switch to a feature branch before creating a pull request." }
  } else {
    const ghBinary = resolveCommandBinary(GH_BINARY_NAMES)
    if (!ghBinary) {
      canCreatePullRequest = { enabled: false, reason: "GitHub CLI is not installed." }
    } else if (!await canAccessGhRepository(targetDirectory, ghBinary)) {
      canCreatePullRequest = {
        enabled: false,
        reason: "GitHub CLI cannot access the current repository.",
      }
    } else {
      const existingPullRequestUrl = await findOpenPullRequestUrl(targetDirectory, ghBinary, branch)
      canCreatePullRequest = existingPullRequestUrl
        ? { enabled: false, reason: "An open pull request already exists for this branch." }
        : { enabled: true }
    }
  }

  return {
    directory: targetDirectory,
    root,
    branch,
    defaultBranch,
    isGitRepo: true,
    canCommit,
    canPush,
    canCreatePullRequest,
    canCreateBranch,
  }
}

export async function commitGitChanges(directory: string, message: string): Promise<GitActionResult> {
  const gitBinary = requireGitBinary()
  const targetDirectory = requireDirectory(directory)
  const trimmedMessage = message.trim()

  if (!trimmedMessage) {
    throw new Error("Enter a commit message.")
  }

  const root = await resolveGitRoot(targetDirectory, gitBinary)
  if (!root) {
    throw new Error("The current workspace is not a Git repository.")
  }

  await runCommandOrThrow(gitBinary, ["add", "-A"], targetDirectory, "Failed to stage changes.")
  const stagedDiff = await runCommand(gitBinary, ["diff", "--cached", "--name-only"], targetDirectory)
  if (stagedDiff.exitCode !== 0) {
    throw buildCommandError(stagedDiff, "Failed to inspect staged changes.")
  }
  if (!stagedDiff.stdout) {
    throw new Error("There are no changes to commit.")
  }

  const result = await runCommandOrThrow(gitBinary, ["commit", "-m", trimmedMessage], targetDirectory, "Git commit failed.")
  const branch = await resolveCurrentBranch(targetDirectory, gitBinary)

  return {
    directory: targetDirectory,
    root,
    branch,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: branch ? `Committed to ${branch}.` : "Committed changes.",
  }
}

export async function pushGitChanges(directory: string): Promise<GitActionResult> {
  const gitBinary = requireGitBinary()
  const targetDirectory = requireDirectory(directory)
  const capabilities = await getGitCapabilities(targetDirectory)

  if (!capabilities.isGitRepo || !capabilities.root) {
    throw new Error("The current workspace is not a Git repository.")
  }
  if (!capabilities.canPush.enabled) {
    throw new Error(capabilities.canPush.reason || "The current branch cannot be pushed.")
  }

  const result = await runCommandOrThrow(gitBinary, ["push"], targetDirectory, "Git push failed.")

  return {
    directory: targetDirectory,
    root: capabilities.root,
    branch: capabilities.branch,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: capabilities.branch ? `Pushed ${capabilities.branch}.` : "Pushed changes.",
  }
}

export async function createGitBranch(directory: string, name: string): Promise<GitActionResult> {
  const gitBinary = requireGitBinary()
  const targetDirectory = requireDirectory(directory)
  const trimmedName = name.trim()

  if (!trimmedName) {
    throw new Error("Enter a branch name.")
  }

  const root = await resolveGitRoot(targetDirectory, gitBinary)
  if (!root) {
    throw new Error("The current workspace is not a Git repository.")
  }

  const isValidBranch = await runCommand(gitBinary, ["check-ref-format", "--branch", trimmedName], targetDirectory)
  if (isValidBranch.exitCode !== 0) {
    throw new Error("Enter a valid branch name.")
  }

  const existingBranch = await runCommand(gitBinary, ["show-ref", "--verify", "--quiet", `refs/heads/${trimmedName}`], targetDirectory)
  if (existingBranch.exitCode === 0) {
    throw new Error(`Branch '${trimmedName}' already exists.`)
  }

  let result = await runCommand(gitBinary, ["switch", "-c", trimmedName], targetDirectory)
  if (result.exitCode !== 0) {
    result = await runCommand(gitBinary, ["checkout", "-b", trimmedName], targetDirectory)
  }
  if (result.exitCode !== 0) {
    throw buildCommandError(result, "Failed to create the branch.")
  }

  return {
    directory: targetDirectory,
    root,
    branch: trimmedName,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: `Created and switched to ${trimmedName}.`,
  }
}

export async function createGitPullRequest(directory: string): Promise<GitActionResult> {
  const targetDirectory = requireDirectory(directory)
  const capabilities = await getGitCapabilities(targetDirectory)

  if (!capabilities.isGitRepo || !capabilities.root) {
    throw new Error("The current workspace is not a Git repository.")
  }
  if (!capabilities.canCreatePullRequest.enabled) {
    throw new Error(capabilities.canCreatePullRequest.reason || "A pull request cannot be created right now.")
  }
  if (!capabilities.branch) {
    throw new Error("The current worktree is on a detached HEAD.")
  }

  const ghBinary = requireGhBinary()
  const existingPullRequestUrl = await findOpenPullRequestUrl(targetDirectory, ghBinary, capabilities.branch)
  if (existingPullRequestUrl) {
    throw new Error("An open pull request already exists for this branch.")
  }

  const args = ["pr", "create", "--fill"]
  if (capabilities.defaultBranch) {
    args.push("--base", capabilities.defaultBranch)
  }

  const result = await runCommandOrThrow(ghBinary, args, targetDirectory, "Failed to create the pull request.")
  const url = extractUrl([result.stdout, result.stderr].filter(Boolean).join("\n"))

  return {
    directory: targetDirectory,
    root: capabilities.root,
    branch: capabilities.branch,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: url ? `Created pull request ${url}.` : "Created pull request.",
    ...(url ? { url } : {}),
  }
}
