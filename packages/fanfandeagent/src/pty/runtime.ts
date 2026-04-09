import os from "node:os"
import { spawn as spawnChild } from "node:child_process"
import path from "node:path"
import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { spawn, type IPty } from "node-pty"
import { Flag } from "#flag/flag.ts"
import { which } from "#util/which.ts"

export interface PtyRuntimeHandle {
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): () => void
  onExit(listener: (event: { exitCode: number | null; signal?: number }) => void): () => void
}

export interface PtyRuntimeAdapter {
  spawn(input: {
    shell: string
    cwd: string
    rows: number
    cols: number
    env: Record<string, string>
  }): PtyRuntimeHandle
}

type NodePtyWorkerEvent =
  | {
      type: "ready"
      pid: number
    }
  | {
      type: "data"
      data: string
    }
  | {
      type: "exit"
      exitCode: number | null
      signal?: number
    }
  | {
      type: "error"
      message: string
    }

async function isExistingFile(candidate: string) {
  return stat(candidate).then((entry) => entry.isFile()).catch(() => false)
}

async function resolveExistingCommand(candidate?: string | null) {
  const value = candidate?.trim()
  if (!value) return null

  if (value.includes("/") || value.includes("\\") || path.isAbsolute(value)) {
    return (await isExistingFile(value)) ? value : null
  }

  return which(value) ?? null
}

export async function resolveDefaultPtyShell(input?: string) {
  const explicit = await resolveExistingCommand(input ?? process.env["FanFande_PTY_SHELL"])
  if (explicit) return explicit

  const fromShellEnv = await resolveExistingCommand(process.env.SHELL)
  if (fromShellEnv) return fromShellEnv

  const fromConfiguredGitBash = await resolveExistingCommand(Flag.FanFande_GIT_BASH_PATH)
  if (fromConfiguredGitBash) return fromConfiguredGitBash

  if (process.platform === "win32") {
    const bash = (await resolveExistingCommand("bash.exe")) ?? (await resolveExistingCommand("bash"))
    if (bash) return bash

    const git = (await resolveExistingCommand("git.exe")) ?? (await resolveExistingCommand("git"))
    if (git) {
      const gitBash = path.resolve(git, "..", "..", "bin", "bash.exe")
      if (await isExistingFile(gitBash)) return gitBash
    }

    const pwsh = (await resolveExistingCommand("pwsh.exe")) ?? (await resolveExistingCommand("pwsh"))
    if (pwsh) return pwsh

    const powershell =
      (await resolveExistingCommand("powershell.exe")) ?? (await resolveExistingCommand("powershell"))
    if (powershell) return powershell

    const comSpec = await resolveExistingCommand(process.env.ComSpec)
    if (comSpec) return comSpec

    return "cmd.exe"
  }

  if (process.platform === "darwin") {
    return "/bin/zsh"
  }

  return (await resolveExistingCommand("bash")) ?? "/bin/sh"
}

const ALLOWED_ENV_KEYS = [
  "APPDATA",
  "COLORTERM",
  "ComSpec",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOCALAPPDATA",
  "MSYSTEM",
  "MSYS2_PATH_TYPE",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "Path",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "PWD",
  "SHELL",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "USER",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
  "WT_SESSION",
]

export function buildPtyEnvironment(cwd: string, shell: string) {
  const env: Record<string, string> = {}
  const source = process.env

  for (const key of ALLOWED_ENV_KEYS) {
    const value = source[key]
    if (typeof value === "string" && value.length > 0) {
      env[key] = value
    }
  }

  if (process.platform === "win32") {
    const pathValue = source.Path ?? source.PATH ?? ""
    if (pathValue) {
      env.Path = pathValue
      env.PATH = pathValue
    }
    env.SystemRoot = source.SystemRoot ?? env.SystemRoot ?? "C:\\Windows"
    env.ComSpec = source.ComSpec ?? env.ComSpec ?? shell
    env.PATHEXT = source.PATHEXT ?? env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD"
    env.TEMP = source.TEMP ?? env.TEMP ?? os.tmpdir()
    env.TMP = source.TMP ?? env.TMP ?? os.tmpdir()
    env.USERPROFILE = source.USERPROFILE ?? env.USERPROFILE ?? os.homedir()
    env.HOMEDRIVE = source.HOMEDRIVE ?? env.HOMEDRIVE ?? path.parse(env.USERPROFILE).root.slice(0, 2)
    env.HOMEPATH = source.HOMEPATH ?? env.HOMEPATH ?? env.USERPROFILE.slice(2)
  } else {
    env.PATH = source.PATH ?? env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin"
    env.HOME = source.HOME ?? env.HOME ?? os.homedir()
    env.SHELL = shell
  }

  env.TERM = source.TERM ?? "xterm-256color"
  env.COLORTERM = source.COLORTERM ?? "truecolor"
  env.PWD = cwd
  env.FanFande_CLIENT = Flag.FanFande_CLIENT

  return env
}

function wrapRuntimeHandle(term: IPty): PtyRuntimeHandle {
  return {
    pid: term.pid,
    write(data) {
      term.write(data)
    },
    resize(cols, rows) {
      term.resize(cols, rows)
    },
    kill() {
      term.kill()
    },
    onData(listener) {
      const disposable = term.onData(listener)
      return () => disposable.dispose()
    },
    onExit(listener) {
      const disposable = term.onExit((event) => {
        listener({
          exitCode: event.exitCode ?? null,
          signal: event.signal,
        })
      })
      return () => disposable.dispose()
    },
  }
}

function shouldUseNodePtySidecar() {
  return Boolean(process.versions.bun) && process.platform === "win32"
}

function resolveNodeBinary() {
  return which("node.exe") ?? which("node")
}

function createNodePtySidecarRuntimeAdapter(): PtyRuntimeAdapter {
  const nodeBinary = resolveNodeBinary()
  if (!nodeBinary) {
    throw new Error("Node.js is required to host PTY input on Windows when running the server with Bun")
  }

  const workerPath = fileURLToPath(new URL("./node-pty-worker.mjs", import.meta.url))

  return {
    spawn(input) {
      const child = spawnChild(nodeBinary, [workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })
      const dataListeners = new Set<(data: string) => void>()
      const exitListeners = new Set<(event: { exitCode: number | null; signal?: number }) => void>()
      let stdoutBuffer = ""
      let hasExited = false

      function emitData(data: string) {
        for (const listener of [...dataListeners]) {
          listener(data)
        }
      }

      function emitExit(event: { exitCode: number | null; signal?: number }) {
        if (hasExited) return
        hasExited = true
        for (const listener of [...exitListeners]) {
          listener(event)
        }
      }

      function sendCommand(payload: Record<string, unknown>) {
        if (child.stdin.destroyed || !child.stdin.writable) {
          throw new Error("PTY worker stdin is unavailable")
        }

        child.stdin.write(`${JSON.stringify(payload)}\n`)
      }

      child.stdout.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let event: NodePtyWorkerEvent
          try {
            event = JSON.parse(trimmed) as NodePtyWorkerEvent
          } catch {
            continue
          }

          if (event.type === "data") {
            emitData(event.data)
            continue
          }

          if (event.type === "exit") {
            emitExit({
              exitCode: event.exitCode,
              signal: event.signal,
            })
            continue
          }

          if (event.type === "error") {
            emitData(`\r\n[pty worker error] ${event.message}\r\n`)
          }
        }
      })

      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        emitData(`\r\n[pty worker stderr] ${chunk}\r\n`)
      })

      child.once("exit", (code, signal) => {
        emitExit({
          exitCode: typeof code === "number" ? code : null,
          signal: typeof signal === "string" ? undefined : signal ?? undefined,
        })
      })

      sendCommand({
        type: "start",
        shell: input.shell,
        cwd: input.cwd,
        rows: input.rows,
        cols: input.cols,
        env: input.env,
      })

      return {
        pid: child.pid ?? 0,
        write(data) {
          sendCommand({
            type: "write",
            data,
          })
        },
        resize(cols, rows) {
          sendCommand({
            type: "resize",
            cols,
            rows,
          })
        },
        kill() {
          try {
            sendCommand({
              type: "kill",
            })
          } catch {
            // The worker may already be gone.
          }

          if (!child.killed) {
            child.kill()
          }
        },
        onData(listener) {
          dataListeners.add(listener)
          return () => {
            dataListeners.delete(listener)
          }
        },
        onExit(listener) {
          exitListeners.add(listener)
          return () => {
            exitListeners.delete(listener)
          }
        },
      }
    },
  }
}

export function createNodePtyRuntimeAdapter(): PtyRuntimeAdapter {
  if (shouldUseNodePtySidecar()) {
    return createNodePtySidecarRuntimeAdapter()
  }

  return {
    spawn(input) {
      const term = spawn(input.shell, [], {
        name: "xterm-256color",
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
        env: input.env,
        useConpty: process.platform === "win32" ? true : undefined,
      })

      return wrapRuntimeHandle(term)
    },
  }
}
