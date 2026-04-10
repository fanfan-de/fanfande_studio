import path from "node:path"
import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { Flag } from "#flag/flag.ts"
import { Instance } from "#project/instance.ts"
import { resolveToolPath, toDisplayPath } from "#tool/shared.ts"
import { which } from "#util/which.ts"

const DEFAULT_TIMEOUT_MS = Flag.FanFande_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS ?? 60_000
const DEFAULT_MAX_OUTPUT_CHARS = Flag.FanFande_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH ?? 12_000

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\/(\s|$)/i,
  /\bmkfs(\.[a-z0-9_]+)?\b/i,
  /\bdd\s+.+\bof=\/dev\//i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
]

const ExecCommandParameters = z.object({
  command: z.string().min(1).describe("Bash command to execute."),
  workdir: z.string().optional().describe("Working directory. Defaults to the current project directory."),
  timeoutMs: z.number().int().positive().max(10 * 60 * 1000).optional().describe("Timeout in milliseconds."),
  maxOutputChars: z.number().int().positive().max(200_000).optional().describe("Maximum chars kept for stdout and stderr."),
  allowUnsafe: z.boolean().optional().describe("Allow known dangerous command patterns."),
  description: z.string().optional().describe("Short description for the command intent."),
})

interface ExecCommandMetadata extends Record<string, unknown> {
  command: string
  shell: string
  cwd: string
  displayCwd: string
  timeoutMs: number
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  aborted: boolean
  stdoutTruncated: boolean
  stderrTruncated: boolean
  stdout: string
  stderr: string
}

async function isExistingFile(filePath: string) {
  return await stat(filePath).then((fileStat) => fileStat.isFile()).catch(() => false)
}

export async function resolveExecCommandBashExecutable(options?: {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  shellEnv?: string | null
  configuredGitBashPath?: string | null
  whichCommand?: typeof which
  isFile?: (filePath: string) => Promise<boolean>
}) {
  const env = options?.env ?? process.env
  const platform = options?.platform ?? process.platform
  const shellEnv = options?.shellEnv ?? env.SHELL
  const configuredGitBashPath = options?.configuredGitBashPath ?? Flag.FanFande_GIT_BASH_PATH
  const whichCommand = options?.whichCommand ?? which
  const isFile = options?.isFile ?? isExistingFile

  if (shellEnv && /bash(\.exe)?$/i.test(path.basename(shellEnv))) {
    return shellEnv
  }

  if (configuredGitBashPath && await isFile(configuredGitBashPath)) {
    return configuredGitBashPath
  }

  if (platform === "win32") {
    const git = whichCommand("git.exe", env) ?? whichCommand("git", env)
    if (git) {
      const gitBash = path.resolve(git, "..", "..", "bin", "bash.exe")
      if (await isFile(gitBash)) {
        return gitBash
      }
    }
  }

  const fromPath = whichCommand("bash", env) ?? whichCommand("bash.exe", env)
  if (fromPath) return fromPath

  throw new Error(
    "No bash executable was found. Set SHELL to bash, set FanFande_GIT_BASH_PATH, or install bash into PATH.",
  )
}

export const ExecCommandTool = Tool.define(
  "exec_command",
  async (): Promise<Tool.ToolRuntime<typeof ExecCommandParameters, ExecCommandMetadata>> => {
    return {
      title: "Bash",
      description: "Run a bash command inside the current project boundary.",
      parameters: ExecCommandParameters,
      formatValidationError: (error) => {
        const issues = error.issues.map((issue) => {
          const issuePath = issue.path.length > 0 ? issue.path.join(".") : "input"
          return `${issuePath}: ${issue.message}`
        })
        
        return issues.length > 0
          ? `Invalid exec_command arguments. ${issues.join(" ")}`
          : "Invalid exec_command arguments."
      },
      validate: async (parameters, ctx) => {
        if (ctx.abort?.aborted) {
          return "Tool execution was cancelled before command start."
        }

        const command = parameters.command.trim()
        if (!command) {
          return "Command must contain non-whitespace characters."
        }

        let cwd: string
        try {
          cwd = parameters.workdir
            ? resolveToolPath(parameters.workdir)
            : resolveToolPath(ctx.cwd ?? Instance.directory)
        } catch (error) {
          if (error instanceof Error) {
            const message = error.message.trim()
            if (message) return message
          }

          return "Failed to resolve workdir."
        }

        if (!await stat(cwd).then((cwdStat) => cwdStat.isDirectory()).catch(() => false)) {
          return `Workdir must be a directory: ${parameters.workdir ?? cwd}`
        }

        try {
          await resolveExecCommandBashExecutable()
        } catch (error) {
          if (error instanceof Error) {
            const message = error.message.trim()
            if (message) return message
          }

          return "No bash executable was found."
        }
      },
      describeApproval: (parameters, ctx) => {
        const cwd = parameters.workdir
          ? resolveToolPath(parameters.workdir)
          : resolveToolPath(ctx.cwd ?? Instance.directory)
        const displayCwd = toDisplayPath(cwd)

        return {
          title: parameters.description?.trim() || "Run shell command",
          summary: `Run a shell command in ${displayCwd}.`,
          details: {
            command: parameters.command.trim(),
            workdir: displayCwd,
            paths: [displayCwd],
          },
        }
      },
      authorize: (parameters) => {
        const command = parameters.command.trim()
        if (!parameters.allowUnsafe && DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
          return {
            message:
              "Command matched a dangerous pattern and was blocked. Set allowUnsafe=true only when this action is explicitly intended.",
          }
        }
      },
      execute: async (parameters, ctx) => {
        if (ctx.abort?.aborted) {
          throw new Error("Tool execution was cancelled before command start.")
        }

        const cwd = parameters.workdir
          ? resolveToolPath(parameters.workdir)
          : resolveToolPath(ctx.cwd ?? Instance.directory)
        if (!await stat(cwd).then((cwdStat) => cwdStat.isDirectory()).catch(() => false)) {
          throw new Error(`Workdir must be a directory: ${parameters.workdir ?? cwd}`)
        }

        const command = parameters.command.trim()
        const timeoutMs = parameters.timeoutMs ?? DEFAULT_TIMEOUT_MS
        const maxOutputChars = parameters.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS
        const bash = await resolveExecCommandBashExecutable()

        const proc = spawn(bash, ["-lc", command], {
          cwd,
          windowsHide: true,
        })

        let stdout = ""
        let stderr = ""
        let stdoutTruncated = false
        let stderrTruncated = false
        let timedOut = false
        let aborted = false

        proc.stdout?.on("data", (chunk: Buffer) => {
          if (stdout.length >= maxOutputChars) {
            stdoutTruncated = true
            return
          }

          const piece = chunk.toString()
          const remain = maxOutputChars - stdout.length
          if (piece.length <= remain) {
            stdout += piece
            return
          }

          stdout += piece.slice(0, remain)
          stdoutTruncated = true
        })

        proc.stderr?.on("data", (chunk: Buffer) => {
          if (stderr.length >= maxOutputChars) {
            stderrTruncated = true
            return
          }

          const piece = chunk.toString()
          const remain = maxOutputChars - stderr.length
          if (piece.length <= remain) {
            stderr += piece
            return
          }

          stderr += piece.slice(0, remain)
          stderrTruncated = true
        })

        const timer = setTimeout(() => {
          timedOut = true
          proc.kill()
        }, timeoutMs)

        const onAbort = () => {
          aborted = true
          proc.kill()
        }
        ctx.abort?.addEventListener("abort", onAbort, { once: true })

        const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          proc.once("error", reject)
          proc.once("close", (code, signal) => resolve({ code, signal }))
        }).finally(() => {
          clearTimeout(timer)
          ctx.abort?.removeEventListener("abort", onAbort)
        })

        const suffix: string[] = []
        if (timedOut) suffix.push("timed out")
        if (aborted) suffix.push("aborted")

        const title = parameters.description?.trim() || `exec_command: ${command}`
        const notes: string[] = []
        if (stdoutTruncated || stderrTruncated) {
          notes.push("Output was truncated. Increase maxOutputChars to inspect more.")
        }

        const displayCwd = toDisplayPath(cwd)
        const normalizedStdout = stdout.trimEnd()
        const normalizedStderr = stderr.trimEnd()

        return {
          title,
          text: [
            `Command: ${command}`,
            `Workdir: ${displayCwd}`,
            `Shell: ${bash}`,
            `Exit: ${exit.code ?? "unknown"}${suffix.length ? ` (${suffix.join(", ")})` : ""}`,
            notes.length ? `Note: ${notes.join(" ")}` : undefined,
            "",
            "STDOUT:",
            normalizedStdout || "(no stdout)",
            "",
            "STDERR:",
            normalizedStderr || "(no stderr)",
          ].filter(Boolean).join("\n"),
          metadata: {
            command,
            shell: bash,
            cwd,
            displayCwd,
            timeoutMs,
            exitCode: exit.code,
            signal: exit.signal,
            timedOut,
            aborted,
            stdoutTruncated,
            stderrTruncated,
            stdout: normalizedStdout,
            stderr: normalizedStderr,
          },
        }
      },
      toModelOutput: async (result) => {
        const metadata = result.metadata
        if (!metadata) {
          return {
            type: "text",
            value: result.text,
          }
        }

        return {
          type: "json",
          value: {
            title: result.title ?? "Bash",
            command: metadata.command,
            workdir: metadata.displayCwd,
            shell: metadata.shell,
            exitCode: metadata.exitCode,
            signal: metadata.signal,
            timedOut: metadata.timedOut,
            aborted: metadata.aborted,
            status:
              metadata.timedOut
                ? "timed_out"
                : metadata.aborted
                  ? "aborted"
                  : metadata.exitCode === 0
                    ? "ok"
                    : "failed",
            stdoutTruncated: metadata.stdoutTruncated,
            stderrTruncated: metadata.stderrTruncated,
            stdout: metadata.stdout,
            stderr: metadata.stderr,
          },
        }
      },
    }
  },
  {
    title: "Bash",
    aliases: ["bash", "exec-command"],
    capabilities: {
      kind: "exec",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
      needsShell: true,
    },
  },
)
