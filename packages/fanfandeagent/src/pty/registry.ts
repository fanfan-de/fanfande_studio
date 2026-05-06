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
import type { CreatePtySessionBody, PtyReplayPayload, PtySessionInfo, UpdatePtySessionBody } from "#pty/types.ts"

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

export type CreateOwnedPtySessionInput = CreatePtySessionBody & {
  cwd: string
}

export class PtyRegistry {
  private readonly sessions = new Map<string, ManagedPtySession>()
  private readonly sessionIndex = new Map<string, string>()
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
      this.unindexSession(session)
      this.pruneTimers.delete(id)
      session.dispose()
    }, delayMs)
    timer.unref?.()
    this.pruneTimers.set(id, timer)
  }

  private clearPrune(id: string) {
    const existing = this.pruneTimers.get(id)
    if (!existing) return
    clearTimeout(existing)
    this.pruneTimers.delete(id)
  }

  private unindexSession(session: ManagedPtySession) {
    const info = session.info()
    if (this.sessionIndex.get(info.sessionID) === info.id) {
      this.sessionIndex.delete(info.sessionID)
    }
  }

  private pruneNonRunningSession(session: ManagedPtySession) {
    const info = session.info()
    if (info.status === "running") return false

    this.clearPrune(info.id)
    this.sessions.delete(info.id)
    this.unindexSession(session)
    session.dispose()
    return true
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

  async create(input: CreateOwnedPtySessionInput) {
    const existing = this.getBySession(input.sessionID)
    if (existing) return existing.info()

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
      sessionID: input.sessionID,
      title: input.title,
      cwd,
      shell,
      rows,
      cols,
      bufferChars: this.bufferChars,
      runtime,
      now: this.now,
      onExited: (info) => {
        this.sessionIndex.delete(info.sessionID)
        this.schedulePrune(info.id, this.exitRetentionMs)
      },
      onDeleted: (info) => {
        this.sessionIndex.delete(info.sessionID)
        this.schedulePrune(info.id, this.deleteRetentionMs)
      },
    })

    this.sessions.set(id, session)
    this.sessionIndex.set(input.sessionID, id)
    const info = session.info()
    publishPtyEvent(PtyEvents.Created, { session: info })
    return info
  }

  get(id: string) {
    return this.sessions.get(id) ?? null
  }

  getBySession(sessionID: string) {
    const ptyID = this.sessionIndex.get(sessionID)
    if (!ptyID) return null

    const session = this.sessions.get(ptyID)
    if (!session) {
      this.sessionIndex.delete(sessionID)
      return null
    }

    if (this.pruneNonRunningSession(session)) return null
    return session
  }

  info(id: string) {
    return this.get(id)?.info() ?? null
  }

  infoBySession(sessionID: string) {
    return this.getBySession(sessionID)?.info() ?? null
  }

  update(id: string, input: UpdatePtySessionBody) {
    const session = this.get(id)
    if (!session) return null
    return session.update(input)
  }

  delete(id: string) {
    const session = this.get(id)
    if (!session) return null
    const info = session.markDeleted()
    this.unindexSession(session)
    return info
  }

  deleteBySession(sessionID: string) {
    const ptyID = this.sessionIndex.get(sessionID)
    if (!ptyID) return null
    const session = this.sessions.get(ptyID)
    this.sessionIndex.delete(sessionID)
    if (!session) return null
    return session.markDeleted()
  }

  write(id: string, data: string) {
    const session = this.get(id)
    if (!session) return null
    session.write(data)
    return session.info()
  }

  writeBySession(sessionID: string, data: string) {
    const session = this.getBySession(sessionID)
    if (!session) return null
    session.write(data)
    return session.info()
  }

  replayBySession(sessionID: string, cursor?: number | null): PtyReplayPayload | null {
    return this.getBySession(sessionID)?.replay(cursor) ?? null
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
