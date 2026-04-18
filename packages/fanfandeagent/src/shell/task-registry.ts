import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import * as Identifier from "#id/id.ts"
import { PtyBuffer } from "#pty/buffer.ts"
import { terminateProcessTree } from "#shell/terminate.ts"

export type ShellTaskStatus = "running" | "exited" | "deleted"

export interface ShellTaskInfo {
  id: string
  title: string
  command: string
  cwd: string
  shell: string
  status: ShellTaskStatus
  exitCode: number | null
  signal: NodeJS.Signals | null
  createdAt: number
  updatedAt: number
  cursor: number
}

export interface ShellTaskReplay {
  mode: "delta" | "reset"
  output: string
  cursor: number
  startCursor: number
}

export interface ShellTaskReadResult {
  task: ShellTaskInfo
  replay: ShellTaskReplay
}

export interface ShellTaskRuntimeHandle {
  readonly pid: number | null
  kill(): void
  onOutput(listener: (data: string) => void): () => void
  onExit(listener: (event: { exitCode: number | null; signal: NodeJS.Signals | null }) => void): () => void
}

export interface ShellTaskRuntimeAdapter {
  spawn(input: {
    shell: string
    cwd: string
    command: string
  }): ShellTaskRuntimeHandle
}

function createShellTaskRuntimeHandle(child: ChildProcessWithoutNullStreams): ShellTaskRuntimeHandle {
  const outputListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number | null; signal: NodeJS.Signals | null }) => void>()

  const emitOutput = (data: string) => {
    if (!data) return
    for (const listener of [...outputListeners]) {
      listener(data)
    }
  }

  const emitExit = (event: { exitCode: number | null; signal: NodeJS.Signals | null }) => {
    for (const listener of [...exitListeners]) {
      listener(event)
    }
  }

  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    emitOutput(chunk)
  })

  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    emitOutput(chunk)
  })

  child.once("exit", (code, signal) => {
    emitExit({
      exitCode: typeof code === "number" ? code : null,
      signal,
    })
  })

  return {
    get pid() {
      return child.pid ?? null
    },
    kill() {
      terminateProcessTree(child)
    },
    onOutput(listener) {
      outputListeners.add(listener)
      return () => {
        outputListeners.delete(listener)
      }
    },
    onExit(listener) {
      exitListeners.add(listener)
      return () => {
        exitListeners.delete(listener)
      }
    },
  }
}

export function createShellTaskRuntimeAdapter(): ShellTaskRuntimeAdapter {
  return {
    spawn(input) {
      const child = spawn(input.shell, ["-lc", input.command], {
        cwd: input.cwd,
        windowsHide: true,
      })

      return createShellTaskRuntimeHandle(child)
    },
  }
}

interface ManagedShellTask {
  info(): ShellTaskInfo
  read(cursor?: number | null): ShellTaskReadResult
  stop(): Promise<ShellTaskInfo>
  dispose(): void
}

export interface ShellTaskRegistryOptions {
  runtime?: ShellTaskRuntimeAdapter
  now?: () => number
  bufferChars?: number
  exitRetentionMs?: number
  deleteRetentionMs?: number
}

const DEFAULT_BUFFER_CHARS = 200_000
const DEFAULT_EXIT_RETENTION_MS = 5 * 60 * 1000
const DEFAULT_DELETE_RETENTION_MS = 15_000

function defaultTitle(command: string) {
  const collapsed = command.replace(/\s+/g, " ").trim()
  if (collapsed.length <= 80) return collapsed
  return `${collapsed.slice(0, 77)}...`
}

function createManagedShellTask(
  input: {
    id: string
    title?: string
    command: string
    cwd: string
    shell: string
    bufferChars: number
    runtime: ShellTaskRuntimeAdapter
    now: () => number
    onExited?: (task: ShellTaskInfo) => void
    onDeleted?: (task: ShellTaskInfo) => void
  },
): ManagedShellTask {
  const buffer = new PtyBuffer(input.bufferChars)
  const createdAt = input.now()
  let info: ShellTaskInfo = {
    id: input.id,
    title: input.title?.trim() || defaultTitle(input.command),
    command: input.command,
    cwd: input.cwd,
    shell: input.shell,
    status: "running",
    exitCode: null,
    signal: null,
    createdAt,
    updatedAt: createdAt,
    cursor: 0,
  }
  let cleaned = false
  const runtime = input.runtime.spawn({
    shell: input.shell,
    cwd: input.cwd,
    command: input.command,
  })
  let onOutputDispose: (() => void) | null = null
  let onExitDispose: (() => void) | null = null
  let resolveExit: (() => void) | null = null
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve
  })

  function serialize() {
    return { ...info }
  }

  function updateInfo(next: Partial<ShellTaskInfo>) {
    info = {
      ...info,
      ...next,
      updatedAt: next.updatedAt ?? input.now(),
    }
    return serialize()
  }

  onOutputDispose = runtime.onOutput((data) => {
    if (cleaned || !data) return
    const cursor = buffer.append(data)
    updateInfo({ cursor })
  })

  onExitDispose = runtime.onExit((event) => {
    resolveExit?.()
    if (cleaned) return
    if (info.status === "deleted") {
      updateInfo({
        exitCode: event.exitCode,
        signal: event.signal,
        cursor: buffer.cursor,
      })
      return
    }
    if (info.status === "exited") return
    const task = updateInfo({
      status: "exited",
      exitCode: event.exitCode,
      signal: event.signal,
      cursor: buffer.cursor,
    })
    input.onExited?.(task)
  })

  return {
    info() {
      return serialize()
    },
    read(cursor) {
      const replay = buffer.replayFrom(cursor)
      return {
        task: serialize(),
        replay: {
          mode: replay.mode,
          output: replay.buffer,
          cursor: replay.cursor,
          startCursor: replay.startCursor,
        },
      }
    },
    async stop() {
      if (info.status === "deleted") return serialize()
      const wasExited = info.status === "exited"

      const task = updateInfo({
        status: "deleted",
        cursor: buffer.cursor,
      })
      input.onDeleted?.(task)
      if (!cleaned && !wasExited) {
        runtime.kill()
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1_000)
            timer.unref?.()
          }),
        ])
      }
      this.dispose()
      return task
    },
    dispose() {
      if (cleaned) return
      cleaned = true
      onOutputDispose?.()
      onExitDispose?.()
      onOutputDispose = null
      onExitDispose = null
      if (info.status === "running") {
        runtime.kill()
      }
    },
  }
}

export class ShellTaskRegistry {
  private readonly tasks = new Map<string, ManagedShellTask>()
  private readonly pruneTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly runtime: ShellTaskRuntimeAdapter
  private readonly now: () => number
  private readonly bufferChars: number
  private readonly exitRetentionMs: number
  private readonly deleteRetentionMs: number

  constructor(options: ShellTaskRegistryOptions = {}) {
    this.runtime = options.runtime ?? createShellTaskRuntimeAdapter()
    this.now = options.now ?? Date.now
    this.bufferChars = options.bufferChars ?? DEFAULT_BUFFER_CHARS
    this.exitRetentionMs = options.exitRetentionMs ?? DEFAULT_EXIT_RETENTION_MS
    this.deleteRetentionMs = options.deleteRetentionMs ?? DEFAULT_DELETE_RETENTION_MS
  }

  private schedulePrune(id: string, delayMs: number) {
    const existing = this.pruneTimers.get(id)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      const task = this.tasks.get(id)
      if (!task) return
      this.tasks.delete(id)
      this.pruneTimers.delete(id)
      task.dispose()
    }, delayMs)
    timer.unref?.()
    this.pruneTimers.set(id, timer)
  }

  start(input: {
    title?: string
    command: string
    cwd: string
    shell: string
  }) {
    const id = Identifier.descending("task")
    const task = createManagedShellTask({
      id,
      title: input.title,
      command: input.command,
      cwd: input.cwd,
      shell: input.shell,
      bufferChars: this.bufferChars,
      runtime: this.runtime,
      now: this.now,
      onExited: (info) => {
        this.schedulePrune(info.id, this.exitRetentionMs)
      },
      onDeleted: (info) => {
        this.schedulePrune(info.id, this.deleteRetentionMs)
      },
    })

    this.tasks.set(id, task)
    return task.info()
  }

  info(id: string) {
    return this.tasks.get(id)?.info() ?? null
  }

  read(id: string, cursor?: number | null) {
    return this.tasks.get(id)?.read(cursor) ?? null
  }

  async stop(id: string) {
    const task = this.tasks.get(id)
    if (!task) return null
    return await task.stop()
  }
}

let activeShellTaskRegistry: ShellTaskRegistry | undefined

export function getShellTaskRegistry() {
  if (!activeShellTaskRegistry) {
    activeShellTaskRegistry = new ShellTaskRegistry()
  }

  return activeShellTaskRegistry
}

export function createShellTaskRegistry(options?: ShellTaskRegistryOptions) {
  return new ShellTaskRegistry(options)
}
