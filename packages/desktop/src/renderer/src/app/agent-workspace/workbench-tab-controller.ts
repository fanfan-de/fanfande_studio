import { useEffect, type MutableRefObject } from "react"
import type { CreateSessionTab, WorkbenchPane, WorkspaceGroup } from "../types"
import {
  createWorkbenchLayoutWithTab,
  dockTabAroundGroup,
  filterLayoutTabs,
  focusGroup,
  getGroupIdForTabId,
  getGroupNode,
  getReferenceForTabId,
  getTabIdForReference,
  moveTabToGroup,
  removeTabFromGroup,
  resizeSplitChildren,
  splitGroupWithReference,
  upsertTabReferenceInGroup,
  type WorkbenchLayoutState,
} from "../workbench/core"
import { findSession } from "../workspace"
import {
  createCreateSessionTab,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  getPaneActiveTab,
  getPaneByID,
  getPaneByTabKey,
  getWorkbenchGroupIDForTabKey,
  getWorkbenchTabReferenceFromKey,
  resolveCreateSessionWorkspaceID,
  resolveWorkbenchGroupID
} from "./workspace-derived-state"
import { ensureExpandedFolderID, filterExpandedFolderIDs, type WorkspaceStateUpdater } from "./workspace-store"

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

interface UseWorkbenchTabControllerOptions {
  activeCreateSessionTab: CreateSessionTab | null
  activeCreateSessionTabID: string | null
  activeSessionID: string | null
  activeWorkspace: WorkspaceGroup | null
  createSessionTabs: CreateSessionTab[]
  focusedPane: ReturnType<typeof getGroupNode>
  focusedPaneID: string | null
  isCreateSessionTabActive: boolean
  lastFocusedSessionIDRef: MutableRefObject<string | null>
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  setCreateSessionTabs: StateSetter<CreateSessionTab[]>
  setExpandedFolderIDs: StateSetter<string[]>
  setSelectedFolderID: StateSetter<string | null>
  setWorkbenchLayout: StateSetter<WorkbenchLayoutState>
  workbenchLayout: WorkbenchLayoutState
  workbenchPanes: WorkbenchPane[]
  workspaces: WorkspaceGroup[]
}

export function useWorkbenchTabController({
  activeCreateSessionTab,
  activeCreateSessionTabID,
  activeSessionID,
  activeWorkspace,
  createSessionTabs,
  focusedPane,
  focusedPaneID,
  isCreateSessionTabActive,
  lastFocusedSessionIDRef,
  projectRowRefs,
  selectedFolderID,
  setCreateSessionTabs,
  setExpandedFolderIDs,
  setSelectedFolderID,
  setWorkbenchLayout,
  workbenchLayout,
  workbenchPanes,
  workspaces,
}: UseWorkbenchTabControllerOptions) {
  function resolveWorkspaceIDForTab(tab: ReturnType<typeof getWorkbenchTabReferenceFromKey>) {
    if (!tab) return null
    if (tab.kind === "session") {
      return findSession(workspaces, tab.sessionID).workspace?.id ?? null
    }
    return createSessionTabs.find((item) => item.id === tab.createSessionTabID)?.workspaceID ?? null
  }

  function setFocusedPaneID(nextPaneID: string | null) {
    setWorkbenchLayout((current) => focusGroup(current, nextPaneID))
  }

  function activateSessionTab(workspaceID: string, sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    lastFocusedSessionIDRef.current = sessionID
    setSelectedFolderID(workspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, workspaceID))
    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createSessionWorkbenchTab(sessionID)),
    )
  }

  function focusSession(workspaceID: string, sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    const existingPaneID = getGroupIdForTabId(workbenchLayout, getTabIdForReference(createSessionWorkbenchTab(sessionID)))
    if (existingPaneID) {
      activateSessionTab(workspaceID, sessionID, existingPaneID)
      return
    }

    activateSessionTab(workspaceID, sessionID, paneID)
  }

  function focusCreateSessionTab(
    createSessionTabID: string,
    paneID = getPaneByTabKey(workbenchPanes, `create-session:${createSessionTabID}`)?.id ?? focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
  ) {
    const nextCreateSessionTab = createSessionTabs.find((tab) => tab.id === createSessionTabID)
    if (!nextCreateSessionTab) return

    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createCreateSessionWorkbenchTab(nextCreateSessionTab.id)),
    )
    setSelectedFolderID(nextCreateSessionTab.workspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, nextCreateSessionTab.workspaceID))
  }

  function openCreateSessionTab(
    preferredWorkspaceID?: string | null,
    paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
    workspaceScope = workspaces,
  ) {
    const nextWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaceScope,
      preferredWorkspaceID,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const nextCreateSessionTab = createCreateSessionTab(nextWorkspaceID)

    setCreateSessionTabs((current) => [...current, nextCreateSessionTab])
    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createCreateSessionWorkbenchTab(nextCreateSessionTab.id)),
    )

    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, nextWorkspaceID))
  }

  function focusMostRecentCreateSessionTab(
    preferredWorkspaceID?: string | null,
    paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
  ) {
    const paneActiveTab = paneID ? getPaneActiveTab(getPaneByID(workbenchPanes, paneID)) : null
    const nextCreateSessionTabID =
      (paneActiveTab?.kind === "create-session" ? paneActiveTab.createSessionTabID : null) ??
      createSessionTabs[createSessionTabs.length - 1]?.id ??
      null
    if (nextCreateSessionTabID) {
      focusCreateSessionTab(nextCreateSessionTabID, paneID)
      return
    }

    openCreateSessionTab(preferredWorkspaceID, paneID)
  }

  function focusExistingCreateSessionTabAcrossPanes(preferredWorkspaceID?: string | null) {
    const nextCreateSessionTabID = createSessionTabs[createSessionTabs.length - 1]?.id ?? null
    if (!nextCreateSessionTabID) return false

    focusCreateSessionTab(nextCreateSessionTabID)
    if (preferredWorkspaceID) {
      handleCreateSessionWorkspaceChange(preferredWorkspaceID, nextCreateSessionTabID)
    }
    return true
  }

  function handleCanvasSessionTabSelect(sessionID: string, paneID?: string) {
    const nextSelection = findSession(workspaces, sessionID)
    if (!nextSelection.workspace || !nextSelection.session) return

    focusSession(nextSelection.workspace.id, nextSelection.session.id, paneID)
  }

  function handleCanvasSessionTabClose(sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return

    setWorkbenchLayout((current) =>
      removeTabFromGroup(current, paneID, getTabIdForReference(createSessionWorkbenchTab(sessionID))),
    )
  }

  function handleCreateSessionTabSelect(createSessionTabID: string, paneID?: string) {
    focusCreateSessionTab(createSessionTabID, paneID)
  }

  function handleOpenCreateSessionTab(preferredWorkspaceID?: string | null, paneID?: string) {
    openCreateSessionTab(preferredWorkspaceID, paneID)
  }

  function handleCloseCreateSessionTab(createSessionTabID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return
    if (workbenchPanes.length === 1 && workbenchPanes[0]?.tabs.length === 1) {
      return
    }

    const nextCreateSessionTabs = createSessionTabs.filter((tab) => tab.id !== createSessionTabID)
    setCreateSessionTabs(nextCreateSessionTabs)
    setWorkbenchLayout((current) =>
      removeTabFromGroup(current, paneID, getTabIdForReference(createCreateSessionWorkbenchTab(createSessionTabID))),
    )
  }

  function handleCreateSessionWorkspaceChange(workspaceID: string, createSessionTabID = activeCreateSessionTabID) {
    if (!createSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === createSessionTabID
          ? {
              ...tab,
              workspaceID,
            }
          : tab,
      ),
    )
    setSelectedFolderID(workspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, workspaceID))
  }

  function handleCreateSessionTitleChange(value: string, createSessionTabID = activeCreateSessionTabID) {
    if (!createSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === createSessionTabID
          ? {
              ...tab,
              title: value,
            }
          : tab,
      ),
    )
  }

  function handlePaneFocus(paneID: string) {
    const pane = getGroupNode(workbenchLayout, paneID)
    if (!pane) return

    const nextActiveTab = pane.activeTabId ? getReferenceForTabId(workbenchLayout, pane.activeTabId) : null
    const nextWorkspaceID = resolveWorkspaceIDForTab(nextActiveTab)
    setFocusedPaneID(paneID)
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, nextWorkspaceID))
  }

  function handleSplitResize(splitID: string, leftIndex: number, leftSize: number, rightSize: number) {
    setWorkbenchLayout((current) => resizeSplitChildren(current, splitID, leftIndex, leftSize, rightSize))
  }

  function handlePaneTabDrop(input: {
    position: "center" | "left" | "right" | "top" | "bottom"
    sourcePaneID: string
    tabKey: string
    targetPaneID: string
  }) {
    const movedTab = getWorkbenchTabReferenceFromKey(input.tabKey)
    if (!movedTab) return

    if (input.position === "center") {
      setWorkbenchLayout((current) =>
        moveTabToGroup(
          current,
          getWorkbenchGroupIDForTabKey(current, input.tabKey) ?? input.sourcePaneID,
          getTabIdForReference(movedTab),
          input.targetPaneID,
        ),
      )
    } else {
      setWorkbenchLayout((current) =>
        dockTabAroundGroup(
          current,
          getWorkbenchGroupIDForTabKey(current, input.tabKey) ?? input.sourcePaneID,
          getTabIdForReference(movedTab),
          input.targetPaneID,
          input.position as "left" | "right" | "top" | "bottom",
        ),
      )
    }

    const nextWorkspaceID = resolveWorkspaceIDForTab(movedTab)
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, nextWorkspaceID))
  }

  function handlePaneSplit(paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return

    const nextWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaces,
      selectedFolderID,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const nextCreateSessionTab = createCreateSessionTab(nextWorkspaceID)

    setCreateSessionTabs((current) => [...current, nextCreateSessionTab])
    setWorkbenchLayout((current) =>
      splitGroupWithReference(current, paneID, createCreateSessionWorkbenchTab(nextCreateSessionTab.id), "right"),
    )
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, nextWorkspaceID))
  }

  useEffect(() => {
    if (!selectedFolderID) return

    const projectRow = projectRowRefs.current[selectedFolderID]
    projectRow?.scrollIntoView?.({
      block: "nearest",
    })
  }, [selectedFolderID, workspaces])

  useEffect(() => {
    const validWorkspaceIDs = new Set(workspaces.map((workspace) => workspace.id))
    const validSessionIDs = new Set(workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id)))

    setExpandedFolderIDs((current) => filterExpandedFolderIDs(current, validWorkspaceIDs))

    setWorkbenchLayout((current) =>
      filterLayoutTabs(current, (reference) => reference.kind !== "session" || validSessionIDs.has(reference.sessionID)),
    )

    const fallbackWorkspaceID = resolveCreateSessionWorkspaceID(workspaces, selectedFolderID, activeWorkspace?.id ?? null)

    setCreateSessionTabs((current) => {
      let changed = false
      const next = current.map((tab) => {
        const nextWorkspaceID = tab.workspaceID && validWorkspaceIDs.has(tab.workspaceID) ? tab.workspaceID : fallbackWorkspaceID

        if (nextWorkspaceID === tab.workspaceID) {
          return tab
        }

        changed = true
        return {
          ...tab,
          workspaceID: nextWorkspaceID,
        }
      })

      return changed ? next : current
    })
  }, [activeWorkspace?.id, selectedFolderID, workspaces])

  useEffect(() => {
    if (workbenchPanes.length > 0) return

    const fallbackWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaces,
      activeCreateSessionTab?.workspaceID ?? null,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const fallbackCreateSessionTab =
      activeCreateSessionTab ??
      createSessionTabs[createSessionTabs.length - 1] ??
      createCreateSessionTab(fallbackWorkspaceID)

    if (createSessionTabs.length === 0) {
      setCreateSessionTabs([fallbackCreateSessionTab])
    }

    setWorkbenchLayout(createWorkbenchLayoutWithTab(createCreateSessionWorkbenchTab(fallbackCreateSessionTab.id)))

    if (fallbackCreateSessionTab.workspaceID !== selectedFolderID) {
      setSelectedFolderID(fallbackCreateSessionTab.workspaceID)
      setExpandedFolderIDs((current) => ensureExpandedFolderID(current, fallbackCreateSessionTab.workspaceID))
    }
  }, [activeCreateSessionTab, createSessionTabs, selectedFolderID, workspaces, activeWorkspace?.id, workbenchPanes])

  useEffect(() => {
    if (focusedPaneID && workbenchPanes.some((pane) => pane.id === focusedPaneID)) return
    setFocusedPaneID(workbenchPanes[0]?.id ?? null)
  }, [focusedPaneID, workbenchPanes])

  return {
    activateSessionTab,
    focusExistingCreateSessionTabAcrossPanes,
    focusMostRecentCreateSessionTab,
    focusSession,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCloseCreateSessionTab,
    handleCreateSessionTabSelect,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleOpenCreateSessionTab,
    handlePaneFocus,
    handlePaneSplit,
    handlePaneTabDrop,
    handleSplitResize,
    isCreateSessionTabActive,
    openCreateSessionTab,
    setFocusedPaneID,
  }
}
