import { useRef } from "react"
import { seedWorkspaces } from "../seed-data"
import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface WorkspaceSessionStoreOptions {
  store: WorkspaceStoreApi
}

export const seedWorkspaceIDs = new Set(seedWorkspaces.map((workspace) => workspace.id))

export function useWorkspaceSessionStore({ store }: WorkspaceSessionStoreOptions) {
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const initialFolderWorkspacesLoadedRef = useRef(false)
  const preserveLocalWorkspaceStateOnInitialLoadRef = useRef(false)
  const workspaceRefreshRequestRef = useRef<Record<string, number>>({})
  const watchedWorkspaceDirectoriesKeyRef = useRef("")
  const gitRefreshSuppressedUntilRef = useRef<Record<string, number>>({})
  const workspaceReloadSuppressedUntilRef = useRef<Record<string, number>>({})

  const activeSideChatSessionIDByParentSessionID = useWorkspaceStoreSelector(
    store,
    (state) => state.sessions.activeSideChatSessionIDByParentSessionID,
  )
  const canLoadSessionHistory = useWorkspaceStoreSelector(store, (state) => state.sessions.canLoadSessionHistory)
  const createSessionTabs = useWorkspaceStoreSelector(store, (state) => state.sessions.createSessionTabs)
  const deletingSessionID = useWorkspaceStoreSelector(store, (state) => state.sessions.deletingSessionID)
  const expandedFolderID = useWorkspaceStoreSelector(store, (state) => state.sessions.expandedFolderID)
  const hoveredFolderID = useWorkspaceStoreSelector(store, (state) => state.sessions.hoveredFolderID)
  const isCreatingProject = useWorkspaceStoreSelector(store, (state) => state.sessions.isCreatingProject)
  const isInitialWorkspaceLoadPending = useWorkspaceStoreSelector(
    store,
    (state) => state.sessions.isInitialWorkspaceLoadPending,
  )
  const leftSidebarView = useWorkspaceStoreSelector(store, (state) => state.sessions.leftSidebarView)
  const rightSidebarView = useWorkspaceStoreSelector(store, (state) => state.sessions.rightSidebarView)
  const selectedFolderID = useWorkspaceStoreSelector(store, (state) => state.sessions.selectedFolderID)
  const workspaces = useWorkspaceStoreSelector(store, (state) => state.sessions.workspaces)
  const setActiveSideChatSessionIDByParentSessionID = useWorkspaceStoreSelector(
    store,
    (state) => state.sessionsActions.setActiveSideChatSessionIDByParentSessionID,
  )
  const setCanLoadSessionHistory = useWorkspaceStoreSelector(
    store,
    (state) => state.sessionsActions.setCanLoadSessionHistory,
  )
  const setCreateSessionTabs = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setCreateSessionTabs)
  const setDeletingSessionID = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setDeletingSessionID)
  const setExpandedFolderID = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setExpandedFolderID)
  const setHoveredFolderID = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setHoveredFolderID)
  const setIsCreatingProject = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setIsCreatingProject)
  const setIsInitialWorkspaceLoadPending = useWorkspaceStoreSelector(
    store,
    (state) => state.sessionsActions.setIsInitialWorkspaceLoadPending,
  )
  const setLeftSidebarView = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setLeftSidebarView)
  const setRightSidebarView = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setRightSidebarView)
  const setSelectedFolderID = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setSelectedFolderID)
  const setWorkspaces = useWorkspaceStoreSelector(store, (state) => state.sessionsActions.setWorkspaces)

  return {
    activeSideChatSessionIDByParentSessionID,
    canLoadSessionHistory,
    createSessionTabs,
    deletingSessionID,
    expandedFolderID,
    gitRefreshSuppressedUntilRef,
    hoveredFolderID,
    initialFolderWorkspacesLoadedRef,
    isCreatingProject,
    isInitialWorkspaceLoadPending,
    leftSidebarView,
    preserveLocalWorkspaceStateOnInitialLoadRef,
    projectRowRefs,
    rightSidebarView,
    selectedFolderID,
    setActiveSideChatSessionIDByParentSessionID,
    setCanLoadSessionHistory,
    setCreateSessionTabs,
    setDeletingSessionID,
    setExpandedFolderID,
    setHoveredFolderID,
    setIsCreatingProject,
    setIsInitialWorkspaceLoadPending,
    setLeftSidebarView,
    setRightSidebarView,
    setSelectedFolderID,
    setWorkspaces,
    watchedWorkspaceDirectoriesKeyRef,
    workspaceRefreshRequestRef,
    workspaceReloadSuppressedUntilRef,
    workspaces,
  }
}
