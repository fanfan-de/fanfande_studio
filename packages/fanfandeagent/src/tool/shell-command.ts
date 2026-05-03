import path from "node:path"
import { spawn } from "node:child_process"
import { stat } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { Flag } from "#flag/flag.ts"
import { Instance } from "#project/instance.ts"
import { getShellTaskRegistry } from "#shell/task-registry.ts"
import { terminateProcessTree } from "#shell/terminate.ts"
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

const POWERSHELL_DANGEROUS_COMMAND_PATTERNS = [
  /\bRemove-Item\b[\s\S]*-Recurse\b[\s\S]*-Force\b[\s\S]*(?:\b[A-Z]:\\|\/|\$env:SystemRoot)/i,
  /\bFormat-Volume\b/i,
  /\bClear-Disk\b/i,
  /\bStop-Computer\b/i,
  /\bRestart-Computer\b/i,
  /\bSet-ExecutionPolicy\b/i,
  /(?:\bInvoke-WebRequest\b|\biwr\b|\bcurl\b)[\s\S]*\|[\s\S]*(?:\bInvoke-Expression\b|\biex\b)/i,
]

const CMD_DANGEROUS_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i,
  /\bshutdown\b/i,
  /\brmdir\b[\s\S]*(?:\/s|-\S*s)[\s\S]*(?:\/q|-\S*q)[\s\S]*(?:[a-z]:\\|\\$)/i,
  /\brd\b[\s\S]*(?:\/s|-\S*s)[\s\S]*(?:\/q|-\S*q)[\s\S]*(?:[a-z]:\\|\\$)/i,
  /\bdel\b[\s\S]*(?:\/s|-\S*s)[\s\S]*(?:\/q|-\S*q)[\s\S]*(?:[a-z]:\\|\\$)/i,
]

export type ShellKind = "bash" | "powershell" | "cmd" | "wsl"

export type ShellCommandInput = {
  command: string
  workdir?: string
  timeoutMs?: number
  maxOutputChars?: number
  allowUnsafe?: boolean
  description?: string
  runInBackground?: boolean
  run_in_background?: boolean
  distro?: string
}

interface ShellCommandMetadata extends Record<string, unknown> {
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
  runInBackground?: boolean
  backgroundTaskId?: string | null
}

type WhichCommand = typeof which
type IsFile = (filePath: string) => Promise<boolean>

type ResolverOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  configuredGitBashPath?: string | null
  whichCommand?: WhichCommand
  isFile?: IsFile
}

type ShellInvocation = {
  executable: string
  args: string[]
  shell: string
}

type ShellToolConfig<Parameters extends z.ZodType> = {
  id: string
  title: string
  shellKind: ShellKind
  description: string
  parameters: Parameters
  supportsBackground?: boolean
  resolveInvocation(parameters: z.infer<Parameters>, cwd: string): Promise<ShellInvocation>
}

async function isExistingFile(filePath: string) {
  return await stat(filePath).then((fileStat) => fileStat.isFile()).catch(() => false)
}

async function firstExistingFile(candidates: Array<string | undefined | null>, isFile: IsFile) {
  for (const candidate of candidates) {
    if (candidate && await isFile(candidate)) {
      return candidate
    }
  }

  return null
}

function getResolverParts(options?: ResolverOptions) {
  return {
    env: options?.env ?? process.env,
    platform: options?.platform ?? process.platform,
    configuredGitBashPath: options?.configuredGitBashPath ?? Flag.FanFande_GIT_BASH_PATH,
    whichCommand: options?.whichCommand ?? which,
    isFile: options?.isFile ?? isExistingFile,
  }
}

function shellCommandParameters(input: {
  commandDescription: string
  supportsBackground?: boolean
  wslDistro?: boolean
}) {
  const shape = {
    command: z.string().min(1).describe(input.commandDescription),
    workdir: z.string().optional().describe("Working directory. Defaults to the current project directory."),
    timeoutMs: z.number().int().positive().max(10 * 60 * 1000).optional().describe("Timeout in milliseconds."),
    maxOutputChars: z.number().int().positive().max(200_000).optional().describe("Maximum chars kept for stdout and stderr."),
    allowUnsafe: z.boolean().optional().describe("Allow known dangerous command patterns."),
    description: z.string().optional().describe("Short description for the command intent."),
    ...(input.supportsBackground
      ? {
          runInBackground: z.boolean().optional().describe("Start the command as a background task instead of waiting for it."),
          run_in_background: z.boolean().optional().describe("Alias for runInBackground."),
        }
      : {}),
    ...(input.wslDistro
      ? {
          distro: z.string().trim().min(1).optional().describe("Optional WSL distribution name. Defaults to the user's default WSL distribution."),
        }
      : {}),
  }

  return z.object(shape)
}

const GitBashCommandParameters = shellCommandParameters({
  commandDescription: "Git Bash/MSYS Bash command to execute.",
  supportsBackground: true,
})

const PowerShellCommandParameters = shellCommandParameters({
  commandDescription: "PowerShell command to execute.",
})

const CmdCommandParameters = shellCommandParameters({
  commandDescription: "Windows Command Prompt command to execute.",
})

const WslBashCommandParameters = shellCommandParameters({
  commandDescription: "WSL Linux Bash command to execute.",
  wslDistro: true,
})

function shouldRunInBackground(parameters: ShellCommandInput) {
  return parameters.runInBackground ?? parameters.run_in_background ?? false
}

function shellInput<Parameters extends z.ZodType>(parameters: z.infer<Parameters>): ShellCommandInput {
  return parameters as ShellCommandInput
}

function formatValidationError(toolID: string, error: z.ZodError) {
  const issues = error.issues.map((issue) => {
    const issuePath = issue.path.length > 0 ? issue.path.join(".") : "input"
    return `${issuePath}: ${issue.message}`
  })

  return issues.length > 0
    ? `Invalid ${toolID} arguments. ${issues.join(" ")}`
    : `Invalid ${toolID} arguments.`
}

function resolveCommandCwd(parameters: ShellCommandInput, ctx: Tool.Context) {
  return parameters.workdir
    ? resolveToolPath(parameters.workdir)
    : resolveToolPath(ctx.cwd ?? Instance.directory)
}

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ")
}

function shellFirstCommand(command: string) {
  return normalizeCommand(command)
    .split(/[;&|]/)[0]
    ?.trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
}

function isCriticalShellCommand(kind: ShellKind, command: string) {
  if (kind === "powershell") {
    return POWERSHELL_DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
  }

  if (kind === "cmd") {
    return CMD_DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
  }

  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

function isShellReadOnlyCommand(kind: ShellKind, command: string) {
  const normalized = normalizeCommand(command).toLowerCase()
  const first = shellFirstCommand(command)

  if (!first) return false

  if (kind === "powershell") {
    return [
      "get-childitem",
      "gci",
      "dir",
      "ls",
      "get-content",
      "gc",
      "select-string",
      "get-command",
      "get-location",
      "pwd",
      "where-object",
      "measure-object",
    ].includes(first)
  }

  if (kind === "cmd") {
    return ["dir", "type", "where", "echo", "find", "findstr", "cd"].includes(first)
  }

  if (["ls", "pwd", "cat", "head", "tail", "grep", "rg", "find", "wc", "which", "type"].includes(first)) {
    return true
  }

  return /^git\s+(status|log|show|diff|branch|rev-parse|ls-files|grep)\b/i.test(normalized)
}

function isShellWriteLikeCommand(kind: ShellKind, command: string) {
  const normalized = normalizeCommand(command).toLowerCase()
  const first = shellFirstCommand(command)

  if (!first) return false

  if (kind === "powershell") {
    return [
      "set-content",
      "add-content",
      "new-item",
      "copy-item",
      "move-item",
      "remove-item",
      "rename-item",
      "out-file",
      "start-process",
      "npm",
      "pnpm",
      "yarn",
      "bun",
    ].includes(first) || /\|\s*(set-content|add-content|out-file)\b/i.test(command)
  }

  if (kind === "cmd") {
    return [
      "copy",
      "xcopy",
      "move",
      "ren",
      "rename",
      "del",
      "erase",
      "mkdir",
      "md",
      "rmdir",
      "rd",
      "npm",
      "pnpm",
      "yarn",
      "bun",
    ].includes(first) || /(^|[^>])>(?!>)/.test(command) || />>/.test(command)
  }

  return [
    "rm",
    "mv",
    "cp",
    "mkdir",
    "rmdir",
    "touch",
    "chmod",
    "chown",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "pip",
    "cargo",
    "go",
  ].includes(first) || />|>>|\bsed\s+-i\b|\bgit\s+(add|commit|checkout|switch|reset|clean|merge|rebase|pull|push|apply)\b/i.test(normalized)
}

function isShellNetworkExecution(command: string) {
  return /(?:\bcurl\b|\bwget\b|\bInvoke-WebRequest\b|\biwr\b)[\s\S]*\|[\s\S]*(?:\bsh\b|\bbash\b|\biex\b|\bInvoke-Expression\b)/i
    .test(command)
}

export function assessShellPermission(kind: ShellKind, input: ShellCommandInput, cwd: string): Tool.ToolPermissionIntent {
  const command = input.command.trim()
  const displayCwd = toDisplayPath(cwd)
  const resource = {
    command,
    workdir: displayCwd,
    paths: [displayCwd],
  }

  if (isCriticalShellCommand(kind, command) || isShellNetworkExecution(command)) {
    return {
      action: "deny",
      risk: "critical",
      reason: "Command matches a critical-risk shell pattern.",
      resource,
    }
  }

  if (isShellReadOnlyCommand(kind, command)) {
    return {
      action: "allow",
      risk: "low",
      reason: "Command appears to be read-only.",
      resource,
    }
  }

  if (isShellWriteLikeCommand(kind, command)) {
    return {
      action: "allow",
      risk: "low",
      reason: "Command is permitted by the shell write-like command policy.",
      resource,
    }
  }

  return {
    action: "ask",
    risk: "medium",
    reason: "Shell command could not be classified as safely read-only.",
    resource,
  }
}

function quoteBashSingle(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function gitBashCandidatesFromEnvironment(env: NodeJS.ProcessEnv) {
  return [
    env.ProgramFiles ? path.join(env.ProgramFiles, "Git", "bin", "bash.exe") : undefined,
    env["ProgramFiles(x86)"] ? path.join(env["ProgramFiles(x86)"], "Git", "bin", "bash.exe") : undefined,
    env.LocalAppData ? path.join(env.LocalAppData, "Programs", "Git", "bin", "bash.exe") : undefined,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ]
}

export function waitForProcessExit(proc: {
  once(event: "error", listener: (error: Error) => void): unknown
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown
}) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    proc.once("error", reject)
    proc.once("exit", (code, signal) => resolve({ code, signal }))
  })
}

export async function resolveGitBashExecutable(options?: ResolverOptions) {
  const { env, platform, configuredGitBashPath, whichCommand, isFile } = getResolverParts(options)

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

    const commonPath = await firstExistingFile(gitBashCandidatesFromEnvironment(env), isFile)
    if (commonPath) return commonPath
  }

  throw new Error(
    "No Git Bash executable was found. Set FanFande_GIT_BASH_PATH or install Git for Windows.",
  )
}

export async function resolvePowerShellExecutable(options?: ResolverOptions) {
  const { env, platform, whichCommand, isFile } = getResolverParts(options)
  const fromPath = whichCommand("powershell.exe", env) ?? whichCommand("powershell", env)
  if (fromPath) return fromPath

  if (platform === "win32") {
    const systemRoot = env.SystemRoot ?? (env.SystemDrive ? path.join(env.SystemDrive, "Windows") : "C:\\Windows")
    const defaultPath = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    if (await isFile(defaultPath)) return defaultPath
  }

  throw new Error("No PowerShell executable was found. Install Windows PowerShell or add powershell.exe to PATH.")
}

export async function resolveCmdExecutable(options?: ResolverOptions) {
  const { env, platform, whichCommand, isFile } = getResolverParts(options)
  const comspec = env.ComSpec ?? env.comspec
  if (comspec && await isFile(comspec)) return comspec

  const fromPath = whichCommand("cmd.exe", env) ?? whichCommand("cmd", env)
  if (fromPath) return fromPath

  if (platform === "win32") {
    const systemRoot = env.SystemRoot ?? (env.SystemDrive ? path.join(env.SystemDrive, "Windows") : "C:\\Windows")
    const defaultPath = path.join(systemRoot, "System32", "cmd.exe")
    if (await isFile(defaultPath)) return defaultPath
  }

  throw new Error("No Windows Command Prompt executable was found. Set ComSpec or add cmd.exe to PATH.")
}

export async function resolveWslExecutable(options?: ResolverOptions) {
  const { env, platform, whichCommand, isFile } = getResolverParts(options)
  const fromPath = whichCommand("wsl.exe", env) ?? whichCommand("wsl", env)
  if (fromPath) return fromPath

  if (platform === "win32") {
    const systemRoot = env.SystemRoot ?? (env.SystemDrive ? path.join(env.SystemDrive, "Windows") : "C:\\Windows")
    const defaultPath = path.join(systemRoot, "System32", "wsl.exe")
    if (await isFile(defaultPath)) return defaultPath
  }

  throw new Error("No WSL executable was found. Install WSL or add wsl.exe to PATH.")
}

function createShellCommandTool<Parameters extends z.ZodType>(
  config: ShellToolConfig<Parameters>,
): Tool.ToolInfo<Parameters, ShellCommandMetadata> {
  return Tool.define(
    config.id,
    async (): Promise<Tool.ToolRuntime<Parameters, ShellCommandMetadata>> => {
      return {
        title: config.title,
        description: config.description,
        parameters: config.parameters,
        formatValidationError: (error) => formatValidationError(config.id, error),
        validate: async (parameters, ctx) => {
          const input = shellInput(parameters)
          if (ctx.abort?.aborted) {
            return "Tool execution was cancelled before command start."
          }

          const command = input.command.trim()
          if (!command) {
            return "Command must contain non-whitespace characters."
          }

          let cwd: string
          try {
            cwd = resolveCommandCwd(input, ctx)
          } catch (error) {
            if (error instanceof Error) {
              const message = error.message.trim()
              if (message) return message
            }

            return "Failed to resolve workdir."
          }

          if (!await stat(cwd).then((cwdStat) => cwdStat.isDirectory()).catch(() => false)) {
            return `Workdir must be a directory: ${input.workdir ?? cwd}`
          }

          try {
            await config.resolveInvocation(parameters, cwd)
          } catch (error) {
            if (error instanceof Error) {
              const message = error.message.trim()
              if (message) return message
            }

            return `No executable was found for ${config.title}.`
          }
        },
        describeApproval: (parameters, ctx) => {
          const input = shellInput(parameters)
          const cwd = resolveCommandCwd(input, ctx)
          const displayCwd = toDisplayPath(cwd)

          return {
            title: input.description?.trim() || `Run ${config.title} command`,
            summary: `Run a ${config.title} command in ${displayCwd}.`,
            details: {
              command: input.command.trim(),
              workdir: displayCwd,
              paths: [displayCwd],
            },
          }
        },
        assessPermission: (parameters, ctx) => {
          const input = shellInput(parameters)
          const cwd = resolveCommandCwd(input, ctx)
          return assessShellPermission(config.shellKind, input, cwd)
        },
        authorize: (parameters) => {
          const input = shellInput(parameters)
          const command = input.command.trim()
          if (!input.allowUnsafe && isCriticalShellCommand(config.shellKind, command)) {
            return {
              message:
                "Command matched a dangerous pattern and was blocked. Set allowUnsafe=true only when this action is explicitly intended.",
            }
          }
        },
        execute: async (parameters, ctx) => {
          const input = shellInput(parameters)
          if (ctx.abort?.aborted) {
            throw new Error("Tool execution was cancelled before command start.")
          }

          const cwd = resolveCommandCwd(input, ctx)
          if (!await stat(cwd).then((cwdStat) => cwdStat.isDirectory()).catch(() => false)) {
            throw new Error(`Workdir must be a directory: ${input.workdir ?? cwd}`)
          }

          const command = input.command.trim()
          const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
          const maxOutputChars = input.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS
          const runInBackground = Boolean(config.supportsBackground && shouldRunInBackground(input))
          const displayCwd = toDisplayPath(cwd)
          const invocation = await config.resolveInvocation(parameters, cwd)

          if (runInBackground) {
            const task = getShellTaskRegistry().start({
              title: input.description?.trim(),
              command,
              cwd,
              shell: invocation.executable,
            })

            return {
              title: input.description?.trim() || `${config.id}: ${command}`,
              text: [
                `Command: ${command}`,
                `Workdir: ${displayCwd}`,
                `Shell: ${invocation.shell}`,
                `Background Task ID: ${task.id}`,
                "Status: started in background",
                "",
                "Use read_background_task to inspect output and stop_background_task to terminate it.",
              ].join("\n"),
              metadata: {
                command,
                shell: invocation.shell,
                cwd,
                displayCwd,
                timeoutMs,
                exitCode: null,
                signal: null,
                timedOut: false,
                aborted: false,
                stdoutTruncated: false,
                stderrTruncated: false,
                stdout: "",
                stderr: "",
                runInBackground: true,
                backgroundTaskId: task.id,
              },
            }
          }

          const proc = spawn(invocation.executable, invocation.args, {
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
            terminateProcessTree(proc)
          }, timeoutMs)

          const onAbort = () => {
            aborted = true
            terminateProcessTree(proc)
          }
          ctx.abort?.addEventListener("abort", onAbort, { once: true })

          const exit = await waitForProcessExit(proc).finally(() => {
            clearTimeout(timer)
            ctx.abort?.removeEventListener("abort", onAbort)
          })

          const suffix: string[] = []
          if (timedOut) suffix.push("timed out")
          if (aborted) suffix.push("aborted")

          const title = input.description?.trim() || `${config.id}: ${command}`
          const notes: string[] = []
          if (stdoutTruncated || stderrTruncated) {
            notes.push("Output was truncated. Increase maxOutputChars to inspect more.")
          }

          const normalizedStdout = stdout.trimEnd()
          const normalizedStderr = stderr.trimEnd()

          return {
            title,
            text: [
              `Command: ${command}`,
              `Workdir: ${displayCwd}`,
              `Shell: ${invocation.shell}`,
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
              shell: invocation.shell,
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
              runInBackground: false,
              backgroundTaskId: null,
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
              title: result.title ?? config.title,
              command: metadata.command,
              workdir: metadata.displayCwd,
              shell: metadata.shell,
              exitCode: metadata.exitCode,
              signal: metadata.signal,
              timedOut: metadata.timedOut,
              aborted: metadata.aborted,
              status:
                metadata.runInBackground
                  ? "background_started"
                  : metadata.timedOut
                    ? "timed_out"
                    : metadata.aborted
                      ? "aborted"
                      : metadata.exitCode === 0
                        ? "ok"
                        : "failed",
              backgroundTaskId: metadata.backgroundTaskId,
              runInBackground: metadata.runInBackground,
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
      title: config.title,
      capabilities: {
        kind: "exec",
        readOnly: false,
        destructive: true,
        concurrency: "exclusive",
        needsShell: true,
      },
    },
  )
}

export const GitBashCommandTool = createShellCommandTool({
  id: "git_bash_command",
  title: "Git Bash",
  shellKind: "bash",
  description: "Run a Git Bash/MSYS Bash command inside the current project boundary. Use Bash syntax, but do not assume a full Linux environment.",
  parameters: GitBashCommandParameters,
  supportsBackground: true,
  async resolveInvocation(parameters) {
    const executable = await resolveGitBashExecutable()
    const command = shellInput(parameters).command.trim()
    return {
      executable,
      args: ["-lc", command],
      shell: executable,
    }
  },
})

export const PowerShellCommandTool = createShellCommandTool({
  id: "powershell_command",
  title: "PowerShell",
  shellKind: "powershell",
  description: "Run a Windows PowerShell command inside the current project boundary. Use PowerShell cmdlet syntax, object pipelines, and $env:VAR environment variables.",
  parameters: PowerShellCommandParameters,
  async resolveInvocation(parameters) {
    const executable = await resolvePowerShellExecutable()
    const command = shellInput(parameters).command.trim()
    return {
      executable,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      shell: executable,
    }
  },
})

export const CmdCommandTool = createShellCommandTool({
  id: "cmd_command",
  title: "Command Prompt",
  shellKind: "cmd",
  description: "Run a Windows Command Prompt command inside the current project boundary. Use CMD syntax such as dir, copy, set VAR=value, and %VAR%.",
  parameters: CmdCommandParameters,
  async resolveInvocation(parameters) {
    const executable = await resolveCmdExecutable()
    const command = shellInput(parameters).command.trim()
    return {
      executable,
      args: ["/d", "/s", "/c", command],
      shell: executable,
    }
  },
})

export const WslBashCommandTool = createShellCommandTool({
  id: "wsl_bash_command",
  title: "WSL Bash",
  shellKind: "wsl",
  description: "Run a WSL Linux Bash command inside the current project boundary. Uses the default WSL distribution unless distro is provided.",
  parameters: WslBashCommandParameters,
  async resolveInvocation(parameters, cwd) {
    const input = shellInput(parameters)
    const executable = await resolveWslExecutable()
    const command = input.command.trim()
    const cdCommand = `cd "$(wslpath ${quoteBashSingle(cwd)})" && ${command}`
    const distro = input.distro?.trim()
    return {
      executable,
      args: [
        ...(distro ? ["-d", distro] : []),
        "--",
        "bash",
        "-lc",
        cdCommand,
      ],
      shell: distro ? `${executable} -d ${distro}` : executable,
    }
  },
})

