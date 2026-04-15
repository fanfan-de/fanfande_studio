import fs from "node:fs"
import path from "node:path"

export const WORKSPACE_FILE_CHANGE_EVENT_CHANNEL = "desktop:workspace-file-change"

const WORKSPACE_WATCH_DEBOUNCE_MS = 300

export interface WorkspaceFileChangeIPCEvent {
  directory: string
  paths: string[]
}

type SenderLike = {
  id: number
  isDestroyed: () => boolean
  once: (event: "destroyed", listener: () => void) => unknown
  send: (channel: string, payload: WorkspaceFileChangeIPCEvent) => void
}
type WatchFactory = (filename: string, options: fs.WatchOptions, listener: fs.WatchListener<string>) => fs.FSWatcher
type ExistsSync = typeof fs.existsSync

interface DirectoryWatchState {
  directory: string
  gitDirectory: string
  sender: SenderLike
  rootWatcher: fs.FSWatcher | null
  gitWatcher: fs.FSWatcher | null
  pendingPaths: Set<string>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

function normalizeDirectory(input: string) {
  const resolved = path.resolve(input.trim())
  const normalized = path.normalize(resolved)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function resolveDirectory(input: string) {
  return path.normalize(path.resolve(input.trim()))
}

function isGitPath(directory: string, changedPath: string) {
  const relativePath = path.relative(directory, changedPath)
  if (!relativePath) return false
  return relativePath === ".git" || relativePath.startsWith(`.git${path.sep}`)
}

function resolveChangedPath(baseDirectory: string, filename: string | Buffer | null | undefined) {
  if (typeof filename !== "string") return baseDirectory
  const trimmed = filename.trim()
  if (!trimmed) return baseDirectory
  return path.normalize(path.resolve(baseDirectory, trimmed))
}

function safeSend(sender: SenderLike, payload: WorkspaceFileChangeIPCEvent) {
  if (sender.isDestroyed()) return
  sender.send(WORKSPACE_FILE_CHANGE_EVENT_CHANNEL, payload)
}

export class WorkspaceWatchManager {
  private readonly trackedSenders = new Set<number>()
  private readonly senderStates = new Map<number, Map<string, DirectoryWatchState>>()

  constructor(
    private readonly watchFactory: WatchFactory = fs.watch as WatchFactory,
    private readonly existsSync: ExistsSync = fs.existsSync,
  ) {}

  updateDirectories(sender: SenderLike, directories: string[]) {
    this.ensureSenderCleanup(sender)

    const nextDirectories = new Map<string, string>()
    for (const directory of directories) {
      const trimmed = directory.trim()
      if (!trimmed) continue
      const resolvedDirectory = resolveDirectory(trimmed)
      nextDirectories.set(normalizeDirectory(resolvedDirectory), resolvedDirectory)
    }

    const currentStates = this.senderStates.get(sender.id) ?? new Map<string, DirectoryWatchState>()

    for (const [directoryKey, state] of currentStates.entries()) {
      if (nextDirectories.has(directoryKey)) continue
      this.disposeDirectoryState(state)
      currentStates.delete(directoryKey)
    }

    for (const [directoryKey, resolvedDirectory] of nextDirectories.entries()) {
      if (currentStates.has(directoryKey)) continue
      currentStates.set(directoryKey, this.createDirectoryState(sender, resolvedDirectory))
    }

    if (currentStates.size === 0) {
      this.senderStates.delete(sender.id)
    } else {
      this.senderStates.set(sender.id, currentStates)
    }

    return [...currentStates.values()].map((state) => state.directory)
  }

  dispose() {
    for (const senderID of [...this.senderStates.keys()]) {
      this.disposeSender(senderID)
    }
  }

  private ensureSenderCleanup(sender: SenderLike) {
    if (this.trackedSenders.has(sender.id)) return
    this.trackedSenders.add(sender.id)

    sender.once("destroyed", () => {
      this.trackedSenders.delete(sender.id)
      this.disposeSender(sender.id)
    })
  }

  private disposeSender(senderID: number) {
    const states = this.senderStates.get(senderID)
    if (!states) return

    for (const state of states.values()) {
      this.disposeDirectoryState(state)
    }

    this.senderStates.delete(senderID)
  }

  private createDirectoryState(sender: SenderLike, directory: string): DirectoryWatchState {
    const state: DirectoryWatchState = {
      directory,
      gitDirectory: path.join(directory, ".git"),
      sender,
      rootWatcher: null,
      gitWatcher: null,
      pendingPaths: new Set<string>(),
      debounceTimer: null,
    }

    state.rootWatcher = this.createWatcher(directory, (_eventType, filename) => {
      this.recordChange(state, directory, filename)
    })

    this.syncGitWatcher(state)
    return state
  }

  private createWatcher(targetDirectory: string, listener: fs.WatchListener<string>) {
    try {
      return this.watchFactory(targetDirectory, { recursive: true }, listener)
    } catch {
      return this.watchFactory(targetDirectory, {}, listener)
    }
  }

  private syncGitWatcher(state: DirectoryWatchState) {
    const gitDirectoryExists = this.existsSync(state.gitDirectory)
    if (!gitDirectoryExists) {
      if (state.gitWatcher) {
        state.gitWatcher.close()
        state.gitWatcher = null
      }
      return
    }

    if (state.gitWatcher) return

    state.gitWatcher = this.createWatcher(state.gitDirectory, (_eventType, filename) => {
      this.recordChange(state, state.gitDirectory, filename)
    })
  }

  private recordChange(state: DirectoryWatchState, baseDirectory: string, filename: string | Buffer | null | undefined) {
    const changedPath = resolveChangedPath(baseDirectory, filename)
    state.pendingPaths.add(changedPath)

    if (baseDirectory === state.directory ? isGitPath(state.directory, changedPath) : true) {
      this.syncGitWatcher(state)
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      const paths = [...state.pendingPaths]
      state.pendingPaths.clear()
      safeSend(state.sender, {
        directory: state.directory,
        paths: paths.length > 0 ? paths : [state.directory],
      })
    }, WORKSPACE_WATCH_DEBOUNCE_MS)
  }

  private disposeDirectoryState(state: DirectoryWatchState) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }

    state.rootWatcher?.close()
    state.rootWatcher = null
    state.gitWatcher?.close()
    state.gitWatcher = null
    state.pendingPaths.clear()
  }
}
