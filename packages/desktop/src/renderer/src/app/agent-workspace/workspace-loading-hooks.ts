import { useEffect, type MutableRefObject } from "react"
import {
  ensureAgentSessions,
  ensureConversationSessions,
} from "../conversation-state"
import { notifyGitStateChanged } from "../git-events"
import type {
  CreateSessionTab,
  LoadedFolderWorkspace,
  SessionDiffState,
  Turn,
  WorkbenchTabReference,
  WorkspaceFileChangeIPCEvent,
  WorkspaceGroup,
} from "../types"
import {
  createWorkbenchLayoutWithTab,
  normalizeLayoutState,
  type WorkbenchLayoutState,
} from "../workbench/core"
import {
  findFirstSession,
  isWorkspaceAvailable,
  mapLoadedWorkspace,
  mapLoadedWorkspaces,
  sortWorkspaceGroups,
  upsertWorkspaceGroup,
} from "../workspace"
import { DEFAULT_SESSION_DIFF_STATE } from "./review-preview-state"
import { seedWorkspaceIDs, type WorkspaceStateUpdater } from "./workspace-store"

const GIT_REFRESH_SUPPRESSION_MS = 1000
const WORKSPACE_RELOAD_SUPPRESSION_MS = 1500

export function collectSessionDirectoryMap(
  workspaces: Array<{
    sessions: Array<{
      id: string
      directory: string
    }>
  }>,
) {
  return Object.fromEntries(
    workspaces.flatMap((workspace) =>
      workspace.sessions.map((session) => [session.id, session.directory] as const),
    ),
  )
}

export function normalizeWorkspacePath(value: string, platform: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
  return platform === "win32" ? normalized.toLowerCase() : normalized
}

export function resolveWorkspaceRelativePath(directory: string, target: string, platform: string) {
  const normalizedDirectory = normalizeWorkspacePath(directory, platform)
  const normalizedTarget = normalizeWorkspacePath(target, platform)
  if (!normalizedDirectory || !normalizedTarget) return null
  if (normalizedTarget === normalizedDirectory) return ""
  const prefix = `${normalizedDirectory}/`
  if (!normalizedTarget.startsWith(prefix)) return null
  return normalizedTarget.slice(prefix.length)
}

function shouldReloadWorkspaceFromRelativePath(relativePath: string) {
  return relativePath === ".git" || relativePath === ".git/config"
}

function isGitInternalRelativePath(relativePath: string) {
  return relativePath === ".git" || relativePath.startsWith(".git/")
}

export function shouldRefreshWorkspaceDiffFromRelativePaths(relativePaths: string[]) {
  if (relativePaths.length === 0) return true
  return relativePaths.some((relativePath) => !isGitInternalRelativePath(relativePath))
}

interface RefreshWorkspaceFromDirectoryInput {
  directory: string
  setAgentSessions: (update: (current: Record<string, string>) => Record<string, string>) => void
  setCanLoadSessionHistory: (update: boolean) => void
  setConversations: (update: (current: Record<string, Turn[]>) => Record<string, Turn[]>) => void
  setSessionDirectoryBySession: (update: (current: Record<string, string>) => Record<string, string>) => void
  setWorkspaces: (update: (current: WorkspaceGroup[]) => WorkspaceGroup[]) => void
  workspaceRefreshRequestRef: MutableRefObject<Record<string, number>>
}

export async function refreshWorkspaceFromDirectory({
  directory,
  setAgentSessions,
  setCanLoadSessionHistory,
  setConversations,
  setSessionDirectoryBySession,
  setWorkspaces,
  workspaceRefreshRequestRef,
}: RefreshWorkspaceFromDirectoryInput) {
  const openFolderWorkspace = window.desktop?.openFolderWorkspace
  const trimmedDirectory = directory.trim()
  if (!trimmedDirectory || !openFolderWorkspace) return null

  const requestID = (workspaceRefreshRequestRef.current[trimmedDirectory] ?? 0) + 1
  workspaceRefreshRequestRef.current[trimmedDirectory] = requestID

  try {
    const loadedWorkspace = await openFolderWorkspace({ directory: trimmedDirectory })
    if (!loadedWorkspace) return null
    if (workspaceRefreshRequestRef.current[trimmedDirectory] !== requestID) return null

    const nextWorkspace = mapLoadedWorkspace(loadedWorkspace)
    const loadedSessionIDs = loadedWorkspace.sessions.map((session) => session.id)
    setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
    setConversations((prev) => ensureConversationSessions(prev, loadedSessionIDs))
    setAgentSessions((prev) => ensureAgentSessions(prev, loadedSessionIDs))
    setSessionDirectoryBySession((prev) => ({
      ...prev,
      ...collectSessionDirectoryMap([loadedWorkspace]),
    }))
    setCanLoadSessionHistory(true)

    return nextWorkspace
  } catch (error) {
    if (workspaceRefreshRequestRef.current[trimmedDirectory] === requestID) {
      console.error("[desktop] workspace refresh failed:", error)
    }
    return null
  }
}

interface UseWorkspaceFileChangeEffectsOptions {
  activeSessionDirectory: string | null
  activeSessionID: string | null
  gitRefreshSuppressedUntilRef: MutableRefObject<Record<string, number>>
  platform: string
  refreshWorkspaceFromDirectory: (directory: string) => void | Promise<WorkspaceGroup | null>
  scheduleSessionDiffRefreshForSession: (sessionID: string) => void
  setSessionDiffStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionDiffState>>,
  ) => void
  workspaces: WorkspaceGroup[]
  workspaceReloadSuppressedUntilRef: MutableRefObject<Record<string, number>>
  workspaceEvent: WorkspaceFileChangeIPCEvent
}

export function handleWorkspaceFileChange({
  activeSessionDirectory,
  activeSessionID,
  gitRefreshSuppressedUntilRef,
  platform,
  refreshWorkspaceFromDirectory,
  scheduleSessionDiffRefreshForSession,
  setSessionDiffStateBySession,
  workspaces,
  workspaceEvent,
  workspaceReloadSuppressedUntilRef,
}: UseWorkspaceFileChangeEffectsOptions) {
  const normalizedEventDirectory = normalizeWorkspacePath(workspaceEvent.directory, platform)
  const normalizedActiveSessionDirectory = activeSessionDirectory
    ? normalizeWorkspacePath(activeSessionDirectory, platform)
    : null
  const now = Date.now()

  if (activeSessionID && normalizedActiveSessionDirectory === normalizedEventDirectory) {
    const activeRelativePaths = workspaceEvent.paths
      .map((changedPath) =>
        resolveWorkspaceRelativePath(activeSessionDirectory ?? workspaceEvent.directory, changedPath, platform),
      )
      .filter((value): value is string => value !== null)

    if (shouldRefreshWorkspaceDiffFromRelativePaths(activeRelativePaths)) {
      setSessionDiffStateBySession((prev) => {
        const current = prev[activeSessionID] ?? DEFAULT_SESSION_DIFF_STATE
        return {
          ...prev,
          [activeSessionID]: {
            ...current,
            isStale: true,
          },
        }
      })
      scheduleSessionDiffRefreshForSession(activeSessionID)
    }
  }

  const matchingWorkspace = workspaces.find(
    (workspace) => normalizeWorkspacePath(workspace.directory, platform) === normalizedEventDirectory,
  )
  if (!matchingWorkspace) return

  const relativePaths = workspaceEvent.paths
    .map((changedPath) => resolveWorkspaceRelativePath(matchingWorkspace.directory, changedPath, platform))
    .filter((value): value is string => value !== null)
  const requiresWorkspaceReload = relativePaths.some(shouldReloadWorkspaceFromRelativePath)

  if (now >= (gitRefreshSuppressedUntilRef.current[normalizedEventDirectory] ?? 0)) {
    gitRefreshSuppressedUntilRef.current[normalizedEventDirectory] = now + GIT_REFRESH_SUPPRESSION_MS
    notifyGitStateChanged({
      directory: matchingWorkspace.directory,
    })
  }

  if (!requiresWorkspaceReload) return
  if (now < (workspaceReloadSuppressedUntilRef.current[normalizedEventDirectory] ?? 0)) return

  workspaceReloadSuppressedUntilRef.current[normalizedEventDirectory] = now + WORKSPACE_RELOAD_SUPPRESSION_MS
  void refreshWorkspaceFromDirectory(matchingWorkspace.directory)
}

export function useWorkspaceFileChangeSubscription(
  handler: (workspaceEvent: WorkspaceFileChangeIPCEvent) => void,
) {
  useEffect(() => {
    const unsubscribe = window.desktop?.onWorkspaceFileChange?.((workspaceEvent: WorkspaceFileChangeIPCEvent) => {
      handler(workspaceEvent)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])
}

interface UseWorkspaceWatchDirectoriesEffectOptions {
  activeSessionDirectory: string | null
  activeWorkspace: WorkspaceGroup | null
  isInitialWorkspaceLoadPending: boolean
  platform: string
  watchedWorkspaceDirectoriesKeyRef: MutableRefObject<string>
  workspaces: WorkspaceGroup[]
}

export function useWorkspaceWatchDirectoriesEffect({
  activeSessionDirectory,
  activeWorkspace,
  isInitialWorkspaceLoadPending,
  platform,
  watchedWorkspaceDirectoriesKeyRef,
  workspaces,
}: UseWorkspaceWatchDirectoriesEffectOptions) {
  useEffect(() => {
    const updateWorkspaceWatchDirectories = window.desktop?.updateWorkspaceWatchDirectories
    if (!updateWorkspaceWatchDirectories) return

    const activeWorkspaceID = activeWorkspace?.id ?? null
    const shouldWatchActiveSessionDirectory =
      Boolean(activeSessionDirectory?.trim()) &&
      activeWorkspaceID !== null &&
      isWorkspaceAvailable(activeWorkspace) &&
      !(isInitialWorkspaceLoadPending && seedWorkspaceIDs.has(activeWorkspaceID))
    const uniqueDirectories = [
      ...new Set(
        [
          ...workspaces
            .filter((workspace) => !seedWorkspaceIDs.has(workspace.id) && isWorkspaceAvailable(workspace))
            .map((workspace) => workspace.directory.trim()),
          shouldWatchActiveSessionDirectory ? activeSessionDirectory?.trim() ?? "" : "",
        ].filter(Boolean),
      ),
    ]
    const normalizedKey = uniqueDirectories
      .map((directory) =>
        platform === "win32" ? directory.replace(/\//g, "\\").toLowerCase() : directory.replace(/\\/g, "/"),
      )
      .sort()
      .join("\n")

    if (normalizedKey === watchedWorkspaceDirectoriesKeyRef.current) return
    watchedWorkspaceDirectoriesKeyRef.current = normalizedKey

    void updateWorkspaceWatchDirectories({
      directories: uniqueDirectories,
    }).catch((error) => {
      console.error("[desktop] updateWorkspaceWatchDirectories failed:", error)
    })
  }, [activeSessionDirectory, activeWorkspace, isInitialWorkspaceLoadPending, platform, workspaces])
}

interface UseInitialFolderWorkspacesEffectOptions {
  createCreateSessionTab: (workspaceID: string | null) => CreateSessionTab
  createCreateSessionWorkbenchTab: (createSessionTabID: string) => WorkbenchTabReference
  createSessionWorkbenchTab: (sessionID: string) => WorkbenchTabReference
  initialFolderWorkspacesLoadedRef: MutableRefObject<boolean>
  lastFocusedSessionIDRef: MutableRefObject<string | null>
  preserveLocalWorkspaceStateOnInitialLoadRef: MutableRefObject<boolean>
  setAgentSessions: (update: (current: Record<string, string>) => Record<string, string>) => void
  setCanLoadSessionHistory: (update: boolean) => void
  setConversations: (update: (current: Record<string, Turn[]>) => Record<string, Turn[]>) => void
  setCreateSessionTabs: (update: CreateSessionTab[]) => void
  setExpandedFolderID: (update: string | null) => void
  setIsInitialWorkspaceLoadPending: (update: boolean) => void
  setSelectedFolderID: (update: string | null) => void
  setSessionDirectoryBySession: (update: (current: Record<string, string>) => Record<string, string>) => void
  setWorkbenchLayout: (update: WorkbenchLayoutState) => void
  setWorkspaces: (update: (current: WorkspaceGroup[]) => WorkspaceGroup[]) => void
}

export function useInitialFolderWorkspacesEffect({
  createCreateSessionTab,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  initialFolderWorkspacesLoadedRef,
  lastFocusedSessionIDRef,
  preserveLocalWorkspaceStateOnInitialLoadRef,
  setAgentSessions,
  setCanLoadSessionHistory,
  setConversations,
  setCreateSessionTabs,
  setExpandedFolderID,
  setIsInitialWorkspaceLoadPending,
  setSelectedFolderID,
  setSessionDirectoryBySession,
  setWorkbenchLayout,
  setWorkspaces,
}: UseInitialFolderWorkspacesEffectOptions) {
  useEffect(() => {
    let mounted = true

    const listFolderWorkspaces = window.desktop?.listFolderWorkspaces
    if (!listFolderWorkspaces) {
      return () => {
        mounted = false
      }
    }

    listFolderWorkspaces()
      .then((loadedWorkspaces: LoadedFolderWorkspace[]) => {
        if (!mounted) return

        const nextWorkspaces = mapLoadedWorkspaces(loadedWorkspaces)
        const loadedSessionIDs = loadedWorkspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id))
        const preserveLocalWorkspaceState = preserveLocalWorkspaceStateOnInitialLoadRef.current
        setWorkspaces((current) => {
          if (!preserveLocalWorkspaceState) {
            return nextWorkspaces
          }

          const loadedWorkspaceIDs = new Set(nextWorkspaces.map((workspace) => workspace.id))
          const preservedWorkspaces = current.filter(
            (workspace) => !loadedWorkspaceIDs.has(workspace.id) && !seedWorkspaceIDs.has(workspace.id),
          )

          return sortWorkspaceGroups([...nextWorkspaces, ...preservedWorkspaces])
        })
        setConversations((prev) => ensureConversationSessions(prev, loadedSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, loadedSessionIDs))
        setSessionDirectoryBySession((prev) => ({
          ...prev,
          ...collectSessionDirectoryMap(loadedWorkspaces),
        }))

        if (!preserveLocalWorkspaceState) {
          const nextSelection = findFirstSession(nextWorkspaces)
          const nextFolderID = nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
          const nextCreateSessionTab = nextSelection.session === null ? createCreateSessionTab(nextFolderID) : null
          const nextInitialTab =
            nextSelection.session !== null
              ? createSessionWorkbenchTab(nextSelection.session.id)
              : nextCreateSessionTab
                ? createCreateSessionWorkbenchTab(nextCreateSessionTab.id)
                : null
          setSelectedFolderID(nextFolderID)
          setExpandedFolderID(nextFolderID)
          setCreateSessionTabs(nextCreateSessionTab ? [nextCreateSessionTab] : [])
          setWorkbenchLayout(nextInitialTab ? createWorkbenchLayoutWithTab(nextInitialTab) : normalizeLayoutState({
            rootId: null,
            nodes: {},
            tabs: {},
            docs: {},
            focusedGroupId: null,
          }))
          lastFocusedSessionIDRef.current = nextSelection.session?.id ?? null
        }

        setCanLoadSessionHistory(true)
        initialFolderWorkspacesLoadedRef.current = true
        setIsInitialWorkspaceLoadPending(false)
      })
      .catch(() => {
        setIsInitialWorkspaceLoadPending(false)
      })

    return () => {
      mounted = false
    }
  }, [])
}
