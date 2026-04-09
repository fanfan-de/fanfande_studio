import os from "node:os"
import path from "node:path"
import { stat } from "node:fs/promises"
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

export function createNodePtyRuntimeAdapter(): PtyRuntimeAdapter {
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

