import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const GIT_MAX_BUFFER = 8 * 1024 * 1024

export interface GitActionResult {
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
}

function buildGitError(error: unknown) {
  if (error instanceof Error) {
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : ""
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : ""
    return new Error(stderr || stdout || error.message)
  }

  return new Error(String(error))
}

async function runGitCommand(directory: string, args: string[]) {
  const targetDirectory = directory.trim()
  if (!targetDirectory) {
    throw new Error("缺少 Git 工作目录。")
  }

  try {
    const result = await execFileAsync("git", ["-C", targetDirectory, ...args], {
      windowsHide: true,
      maxBuffer: GIT_MAX_BUFFER,
    })

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    }
  } catch (error) {
    throw buildGitError(error)
  }
}

async function resolveGitRoot(directory: string) {
  const result = await runGitCommand(directory, ["rev-parse", "--show-toplevel"])
  if (!result.stdout) {
    throw new Error("未找到 Git 仓库根目录。")
  }

  return result.stdout
}

async function resolveCurrentBranch(directory: string) {
  try {
    const result = await runGitCommand(directory, ["rev-parse", "--abbrev-ref", "HEAD"])
    if (!result.stdout || result.stdout === "HEAD") {
      return null
    }

    return result.stdout
  } catch {
    return null
  }
}

export async function commitGitChanges(directory: string, message: string): Promise<GitActionResult> {
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    throw new Error("请输入提交说明。")
  }

  const root = await resolveGitRoot(directory)
  await runGitCommand(root, ["add", "-A"])

  const stagedDiff = await runGitCommand(root, ["diff", "--cached", "--name-only"])
  if (!stagedDiff.stdout) {
    throw new Error("当前没有可提交的改动。")
  }

  const result = await runGitCommand(root, ["commit", "-m", trimmedMessage])
  const branch = await resolveCurrentBranch(root)

  return {
    directory,
    root,
    branch,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: branch ? `已提交到 ${branch}` : "已完成提交。",
  }
}

export async function pushGitChanges(directory: string): Promise<GitActionResult> {
  const root = await resolveGitRoot(directory)
  const result = await runGitCommand(root, ["push"])
  const branch = await resolveCurrentBranch(root)

  return {
    directory,
    root,
    branch,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: branch ? `已推送 ${branch}` : "已完成推送。",
  }
}
