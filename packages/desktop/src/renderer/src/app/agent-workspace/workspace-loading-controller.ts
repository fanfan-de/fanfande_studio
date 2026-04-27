import { useEffectEvent, type MutableRefObject } from "react"
import type {
  CreateSessionTab,
  SessionDiffState,
  Turn,
  WorkbenchTabReference,
  WorkspaceFileChangeIPCEvent,
  WorkspaceGroup,
} from "../types"
import type { WorkbenchLayoutState } from "../workbench/core"
import {
  handleWorkspaceFileChange,
  useInitialFolderWorkspacesEffect,
  useWorkspaceFileChangeSubscription,
  useWorkspaceWatchDirectoriesEffect,
} from "./workspace-loading-hooks"
import type { WorkspaceStateUpdater } from "./workspace-store"

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

interface UseWorkspaceLoadingControllerOptions {
  activeSessionDirectory: string | null
  activeSessionID: string | null
  activeWorkspace: WorkspaceGroup | null
  createCreateSessionTab: (workspaceID: string | null) => CreateSessionTab
  createCreateSessionWorkbenchTab: (createSessionTabID: string) => WorkbenchTabReference
  createSessionWorkbenchTab: (sessionID: string) => WorkbenchTabReference
  gitRefreshSuppressedUntilRef: MutableRefObject<Record<string, number>>
  initialFolderWorkspacesLoadedRef: MutableRefObject<boolean>
  isInitialWorkspaceLoadPending: boolean
  lastFocusedSessionIDRef: MutableRefObject<string | null>
  platform: string
  preserveLocalWorkspaceStateOnInitialLoadRef: MutableRefObject<boolean>
  refreshWorkspaceFromDirectory: (directory: string) => Promise<WorkspaceGroup | null>
  scheduleSessionDiffRefreshForSession: (sessionID: string) => void
  setAgentSessions: StateSetter<Record<string, string>>
  setCanLoadSessionHistory: StateSetter<boolean>
  setConversations: StateSetter<Record<string, Turn[]>>
  setCreateSessionTabs: StateSetter<CreateSessionTab[]>
  setExpandedFolderID: StateSetter<string | null>
  setIsInitialWorkspaceLoadPending: StateSetter<boolean>
  setSelectedFolderID: StateSetter<string | null>
  setSessionDiffStateBySession: StateSetter<Record<string, SessionDiffState>>
  setSessionDirectoryBySession: StateSetter<Record<string, string>>
  setWorkbenchLayout: StateSetter<WorkbenchLayoutState>
  setWorkspaces: StateSetter<WorkspaceGroup[]>
  watchedWorkspaceDirectoriesKeyRef: MutableRefObject<string>
  workspaceReloadSuppressedUntilRef: MutableRefObject<Record<string, number>>
  workspaces: WorkspaceGroup[]
}

export function useWorkspaceLoadingController({
  activeSessionDirectory,
  activeSessionID,
  activeWorkspace,
  createCreateSessionTab,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  gitRefreshSuppressedUntilRef,
  initialFolderWorkspacesLoadedRef,
  isInitialWorkspaceLoadPending,
  lastFocusedSessionIDRef,
  platform,
  preserveLocalWorkspaceStateOnInitialLoadRef,
  refreshWorkspaceFromDirectory,
  scheduleSessionDiffRefreshForSession,
  setAgentSessions,
  setCanLoadSessionHistory,
  setConversations,
  setCreateSessionTabs,
  setExpandedFolderID,
  setIsInitialWorkspaceLoadPending,
  setSelectedFolderID,
  setSessionDiffStateBySession,
  setSessionDirectoryBySession,
  setWorkbenchLayout,
  setWorkspaces,
  watchedWorkspaceDirectoriesKeyRef,
  workspaceReloadSuppressedUntilRef,
  workspaces,
}: UseWorkspaceLoadingControllerOptions) {
  const handleWorkspaceFileChangeEffect = useEffectEvent((workspaceEvent: WorkspaceFileChangeIPCEvent) => {
    handleWorkspaceFileChange({
      activeSessionDirectory,
      activeSessionID,
      gitRefreshSuppressedUntilRef,
      platform,
      refreshWorkspaceFromDirectory,
      scheduleSessionDiffRefreshForSession,
      setSessionDiffStateBySession,
      workspaceEvent,
      workspaces,
      workspaceReloadSuppressedUntilRef,
    })
  })

  useWorkspaceFileChangeSubscription(handleWorkspaceFileChangeEffect)

  useWorkspaceWatchDirectoriesEffect({
    activeSessionDirectory,
    activeWorkspace,
    isInitialWorkspaceLoadPending,
    platform,
    watchedWorkspaceDirectoriesKeyRef,
    workspaces,
  })

  useInitialFolderWorkspacesEffect({
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
  })
}
