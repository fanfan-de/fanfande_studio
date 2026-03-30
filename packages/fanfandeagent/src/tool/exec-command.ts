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

function appendWithLimit(current: string, chunk: Buffer, maxChars: number) {
  if (current.length >= maxChars) {
    return { text: current, truncated: true }
  }

  const piece = chunk.toString()
  const remain = maxChars - current.length
  if (piece.length <= remain) {
    return { text: current + piece, truncated: false }
  }

  return { text: current + piece.slice(0, remain), truncated: true }
}

async function canAccessFile(filePath: string): Promise<boolean> {
  return await stat(filePath).then((s) => s.isFile()).catch(() => false)
}

async function resolveBashExecutable(): Promise<string> {
  const fromShellEnv = process.env.SHELL
  if (fromShellEnv && /bash(\.exe)?$/i.test(path.basename(fromShellEnv))) {
    return fromShellEnv
  }

  if (Flag.FanFande_GIT_BASH_PATH && await canAccessFile(Flag.FanFande_GIT_BASH_PATH)) {
    return Flag.FanFande_GIT_BASH_PATH
  }

  const fromPath = which("bash") ?? which("bash.exe")
  if (fromPath) return fromPath

  if (process.platform === "win32") {
    const git = which("git")
    if (git) {
      const gitBash = path.resolve(git, "..", "..", "bin", "bash.exe")
      if (await canAccessFile(gitBash)) {
        return gitBash
      }
    }
  }

  throw new Error(
    "No bash executable was found. Set SHELL to bash, set FanFande_GIT_BASH_PATH, or install bash into PATH.",
  )
}

function looksDangerous(command: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export const ExecCommandTool = Tool.define(
  "exec_command",
  async () => {
    return {
      description: "Run a bash command inside the current project boundary.",
      parameters: z.object({
        command: z.string().min(1).describe("Bash command to execute."),
        workdir: z.string().optional().describe(`Working directory. Defaults to ${Instance.directory}.`),
        timeoutMs: z.number().int().positive().max(10 * 60 * 1000).optional().describe("Timeout in milliseconds."),
        maxOutputChars: z.number().int().positive().max(200_000).optional().describe("Maximum chars kept for stdout and stderr."),
        allowUnsafe: z.boolean().optional().describe("Allow known dangerous command patterns."),
        description: z.string().optional().describe("Short description for the command intent."),
      }),
      execute: async (parameters, ctx) => {
        if (ctx.abort?.aborted) {
          throw new Error("Tool execution was cancelled before command start.")
        }

        const cwd = parameters.workdir
          ? resolveToolPath(parameters.workdir)
          : resolveToolPath(ctx.cwd ?? Instance.directory)
        const cwdStat = await stat(cwd).catch(() => undefined)
        if (!cwdStat?.isDirectory()) {
          throw new Error(`Workdir must be a directory: ${parameters.workdir ?? cwd}`)
        }

        const command = parameters.command.trim()
        if (!parameters.allowUnsafe && looksDangerous(command)) {
          throw new Error(
            "Command matched a dangerous pattern and was blocked. Set allowUnsafe=true only when this action is explicitly intended.",
          )
        }

        const timeoutMs = parameters.timeoutMs ?? DEFAULT_TIMEOUT_MS
        const maxOutputChars = parameters.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS
        const bash = await resolveBashExecutable()

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

        const onStdout = (chunk: Buffer) => {
          const result = appendWithLimit(stdout, chunk, maxOutputChars)
          stdout = result.text
          stdoutTruncated ||= result.truncated
        }

        const onStderr = (chunk: Buffer) => {
          const result = appendWithLimit(stderr, chunk, maxOutputChars)
          stderr = result.text
          stderrTruncated ||= result.truncated
        }

        proc.stdout?.on("data", onStdout)
        proc.stderr?.on("data", onStderr)

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

        return {
          title,
          output: [
            `Command: ${command}`,
            `Workdir: ${toDisplayPath(cwd)}`,
            `Shell: ${bash}`,
            `Exit: ${exit.code ?? "unknown"}${suffix.length ? ` (${suffix.join(", ")})` : ""}`,
            notes.length ? `Note: ${notes.join(" ")}` : undefined,
            "",
            "STDOUT:",
            stdout.trimEnd() || "(no stdout)",
            "",
            "STDERR:",
            stderr.trimEnd() || "(no stderr)",
          ].filter(Boolean).join("\n"),
          metadata: {
            shell: bash,
            cwd,
            timeoutMs,
            exitCode: exit.code,
            signal: exit.signal,
            timedOut,
            aborted,
            stdoutTruncated,
            stderrTruncated,
          },
        }
      },
    }
  },
)
