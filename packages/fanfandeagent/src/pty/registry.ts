import { stat } from "node:fs/promises"
import path from "node:path"
import * as Identifier from "#id/id.ts"
import * as Project from "#project/project.ts"
import { createManagedPtySession, type ManagedPtySession } from "#pty/session.ts"
import {
  buildPtyEnvironment,
  createNodePtyRuntimeAdapter,
  resolveDefaultPtyShell,
  type PtyRuntimeAdapter,
} from "#pty/runtime.ts"
import { PtyEvents, publishPtyEvent } from "#pty/events.ts"
import type { CreatePtySessionBody, PtySessionInfo, UpdatePtySessionBody } from "#pty/types.ts"

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const DEFAULT_BUFFER_CHARS = 200_000
const DEFAULT_EXIT_RETENTION_MS = 5 * 60 * 1000
const DEFAULT_DELETE_RETENTION_MS = 15_000

function normalizePath(input: string) {
  const resolved = path.resolve(input)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function isWithinRoot(root: string, candidate: string) {
  const normalizedRoot = normalizePath(root)
  const normalizedCandidate = normalizePath(candidate)
  if (normalizedRoot === normalizedCandidate) return true
  const relative = path.relative(normalizedRoot, normalizedCandidate)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

async function assertDirectory(candidate: string) {
  const isDirectory = await stat(candidate).then((entry) => entry.isDirectory()).catch(() => false)
  if (!isDirectory) {
    throw new Error(`Directory does not exist: ${candidate}`)
  }
}

export interface PtyRegistryOptions {
  runtime?: PtyRuntimeAdapter
  now?: () => number
  bufferChars?: number
  exitRetentionMs?: number
  deleteRetentionMs?: number
}

export class PtyRegistry {
  private readonly sessions = new Map<string, ManagedPtySession>()
  private readonly pruneTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly runtime: PtyRuntimeAdapter
  private readonly now: () => number
  private readonly bufferChars: number
  private readonly exitRetentionMs: number
  private readonly deleteRetentionMs: number

  constructor(options: PtyRegistryOptions = {}) {
    this.runtime = options.runtime ?? createNodePtyRuntimeAdapter()
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
      const session = this.sessions.get(id)
      if (!session) return
      this.sessions.delete(id)
      this.pruneTimers.delete(id)
      session.dispose()
    }, delayMs)
    timer.unref?.()
    this.pruneTimers.set(id, timer)
  }

  private async resolveAllowedCwd(input?: string) {
    const cwd = path.resolve(input?.trim() || process.cwd())
    await assertDirectory(cwd)

    const { project, sandbox } = await Project.fromDirectory(cwd)
    const allowedRoots = [project.worktree, ...(project.sandboxes ?? []), sandbox]

    if (!allowedRoots.some((root) => isWithinRoot(root, cwd))) {
      throw new Error(`Directory is outside the allowed project roots: ${cwd}`)
    }

    return cwd
  }

  async create(input: CreatePtySessionBody = {}) {
    const cwd = await this.resolveAllowedCwd(input.cwd)
    const shell = await resolveDefaultPtyShell(input.shell)
    const rows = input.rows ?? DEFAULT_ROWS
    const cols = input.cols ?? DEFAULT_COLS
    const id = Identifier.descending("pty")
    const env = buildPtyEnvironment(cwd, shell)
    const runtime: PtyRuntimeAdapter = {
      spawn: (spawnInput) =>
        this.runtime.spawn({
          ...spawnInput,
          env,
        }),
    }

    const session = createManagedPtySession({
      id,
      title: input.title,
      cwd,
      shell,
      rows,
      cols,
      bufferChars: this.bufferChars,
      runtime,
      now: this.now,
      onExited: (info) => {
        this.schedulePrune(info.id, this.exitRetentionMs)
      },
      onDeleted: (info) => {
        this.schedulePrune(info.id, this.deleteRetentionMs)
      },
    })

    this.sessions.set(id, session)
    const info = session.info()
    publishPtyEvent(PtyEvents.Created, { session: info })
    return info
  }

  get(id: string) {
    return this.sessions.get(id) ?? null
  }

  info(id: string) {
    return this.get(id)?.info() ?? null
  }

  update(id: string, input: UpdatePtySessionBody) {
    const session = this.get(id)
    if (!session) return null
    return session.update(input)
  }

  delete(id: string) {
    const session = this.get(id)
    if (!session) return null
    return session.markDeleted()
  }

  write(id: string, data: string) {
    const session = this.get(id)
    if (!session) return null
    session.write(data)
    return session.info()
  }
}

let activePtyRegistry: PtyRegistry | undefined

export function getPtyRegistry() {
  if (!activePtyRegistry) {
    activePtyRegistry = new PtyRegistry()
  }

  return activePtyRegistry
}

export function createPtyRegistry(options?: PtyRegistryOptions) {
  return new PtyRegistry(options)
}
