import { useRef, useState } from "react"
import { initialSelection, seedWorkspaces } from "../seed-data"
import type { CreateSessionTab, LeftSidebarView, RightSidebarView } from "../types"

interface WorkspaceSessionStoreOptions {
  initialCreateSessionTab: CreateSessionTab | null
}

export const seedWorkspaceIDs = new Set(seedWorkspaces.map((workspace) => workspace.id))

export function useWorkspaceSessionStore({ initialCreateSessionTab }: WorkspaceSessionStoreOptions) {
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const initialFolderWorkspacesLoadedRef = useRef(false)
  const preserveLocalWorkspaceStateOnInitialLoadRef = useRef(false)
  const workspaceRefreshRequestRef = useRef<Record<string, number>>({})
  const watchedWorkspaceDirectoriesKeyRef = useRef("")
  const gitRefreshSuppressedUntilRef = useRef<Record<string, number>>({})
  const workspaceReloadSuppressedUntilRef = useRef<Record<string, number>>({})

  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [createSessionTabs, setCreateSessionTabs] = useState<CreateSessionTab[]>(
    initialCreateSessionTab ? [initialCreateSessionTab] : [],
  )
  const [expandedFolderID, setExpandedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [hoveredFolderID, setHoveredFolderID] = useState<string | null>(null)
  const [leftSidebarView, setLeftSidebarView] = useState<LeftSidebarView>("workspace")
  const [rightSidebarView, setRightSidebarView] = useState<RightSidebarView>("changes")
  const [activeSideChatSessionIDByParentSessionID, setActiveSideChatSessionIDByParentSessionID] = useState<
    Record<string, string>
  >({})
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)
  const [canLoadSessionHistory, setCanLoadSessionHistory] = useState(false)
  const [isInitialWorkspaceLoadPending, setIsInitialWorkspaceLoadPending] = useState(() =>
    Boolean(window.desktop?.listFolderWorkspaces),
  )

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
