import { act, renderHook } from "@testing-library/react"
import { useMemo, useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { SerializedDockview } from "dockview-react"
import type { CreateSessionTab, SessionSummary, WorkspaceGroup } from "../types"
import {
  createInitialDockviewLayout,
  getWorkbenchDockPanelId,
  WORKBENCH_DOCK_PANEL_COMPONENT,
  WORKBENCH_DOCK_TAB_COMPONENT,
  type WorkbenchDockviewCommands,
} from "../workbench/dockview-state"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"
import { useWorkbenchTabController } from "./workbench-tab-controller"
import {
  buildWorkspaceDerivedState,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
} from "./workspace-derived-state"

function createSession(id: string): SessionSummary {
  return {
    id,
    title: id,
    branch: "main",
    status: "Ready",
    updated: 1,
    focus: "",
    summary: "",
  }
}

function createWorkspace(id: string, sessions: SessionSummary[]): WorkspaceGroup {
  return {
    id,
    name: id,
    directory: `C:/work/${id}`,
    created: 1,
    updated: 1,
    project: {
      id: `project-${id}`,
      name: `Project ${id}`,
      worktree: `C:/work/${id}`,
    },
    sessions,
  }
}

function createHarnessDockviewLayout(sessionID: string, createSessionTabID: string) {
  const sessionReference = createSessionWorkbenchTab(sessionID)
  const createReference = createCreateSessionWorkbenchTab(createSessionTabID)
  const sessionPanelID = getWorkbenchDockPanelId(sessionReference)
  const createPanelID = getWorkbenchDockPanelId(createReference)
  const layout = createInitialDockviewLayout(sessionReference, sessionID)
  const root = layout.grid.root
  if (root.type === "branch" && Array.isArray(root.data)) {
    const leaf = root.data[0]
    if (leaf?.type === "leaf") {
      ;(leaf.data as { views: string[] }).views = [sessionPanelID, createPanelID]
    }
  }
  layout.panels[createPanelID] = {
    id: createPanelID,
    contentComponent: WORKBENCH_DOCK_PANEL_COMPONENT,
    tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
    title: "Create session",
    params: createReference,
  }
  return layout
}

function useWorkbenchHarness() {
  const session = useMemo(() => createSession("session-1"), [])
  const secondarySession = useMemo(() => createSession("session-2"), [])
  const workspace = useMemo(() => createWorkspace("workspace-1", [session]), [session])
  const secondaryWorkspace = useMemo(() => createWorkspace("workspace-2", [secondarySession]), [secondarySession])
  const workspaces = useMemo(() => [workspace, secondaryWorkspace], [secondaryWorkspace, workspace])
  const [createSessionTabs, setCreateSessionTabs] = useState<CreateSessionTab[]>([
    {
      id: "create-1",
      workspaceID: workspace.id,
      title: "",
    },
  ])
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(workspace.id)
  const [expandedFolderIDs, setExpandedFolderIDs] = useState<string[]>([workspace.id])
  const [dockviewLayout, setDockviewLayout] = useState<SerializedDockview | null>(() =>
    createHarnessDockviewLayout(session.id, "create-1"),
  )
  const lastFocusedSessionIDRef = useRef<string | null>(null)
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const commandsRef = useRef<WorkbenchDockviewCommands | null>(null)
  if (!commandsRef.current) {
    commandsRef.current = {
      closePanel: vi.fn(() => true),
      focusPanel: vi.fn(() => false),
      getSnapshot: vi.fn(() => null),
      openPanel: vi.fn(() => true),
      replacePanel: vi.fn(() => true),
      splitPanel: vi.fn(() => true),
    }
  }
  vi.mocked(commandsRef.current.getSnapshot).mockReturnValue(dockviewLayout)
  const derived = buildWorkspaceDerivedState({
    activeSideChatSessionIDByParentSessionID: {},
    cancellingSessionIDs: {},
    composerAttachmentsByTabKey: {},
    composerDraftStateByTabKey: {},
    contextUsageBySession: {},
    conversations: {},
    createSessionTabs,
    isCreatingSessionByTabKey: {},
    isInitialWorkspaceLoadPending: false,
    isSendingByTabKey: {},
    pendingPermissionRequestsBySession: {},
    platform: "win32",
    previewByWorkspaceID: {},
    selectedDiffFileBySession: {},
    selectedFolderID,
    sessionDiffBySession: {},
    sessionDiffStateBySession: {},
    sessionDirectoryBySession: {},
    sessionRuntimeDebugBySession: {},
    sessionRuntimeDebugStateBySession: {},
    seedWorkspaceIDs: new Set(),
    dockviewLayout,
    workspaceFileCommentsByTarget: {},
    workspaceFileReviewState: DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
    workspaces,
  })

  const controller = useWorkbenchTabController({
    activeCreateSessionTab: derived.activeCreateSessionTab,
    activeCreateSessionTabID: derived.activeCreateSessionTabID,
    activeSessionID: derived.activeSessionID,
    activeWorkspace: derived.activeWorkspace,
    createSessionTabs,
    dockviewLayout,
    focusedPane: derived.focusedPane,
    focusedPaneID: derived.focusedPaneID,
    isCreateSessionTabActive: derived.isCreateSessionTabActive,
    lastFocusedSessionIDRef,
    projectRowRefs,
    selectedFolderID,
    setCreateSessionTabs,
    setDockviewLayout,
    setExpandedFolderIDs,
    setSelectedFolderID,
    workbenchDockviewCommandsRef: commandsRef,
    workspaces,
  })

  return {
    ...controller,
    commands: commandsRef.current,
    createSessionTabs,
    dockviewLayout,
    expandedFolderIDs,
    lastFocusedSessionID: lastFocusedSessionIDRef.current,
    selectedFolderID,
  }
}

describe("workbench tab controller", () => {
  it("selects and closes create-session tabs through Dockview commands", () => {
    const { result } = renderHook(() => useWorkbenchHarness())

    act(() => {
      result.current.handleCreateSessionTabSelect("create-1", "group-1")
    })

    expect(result.current.commands.openPanel).toHaveBeenCalledWith(
      createCreateSessionWorkbenchTab("create-1"),
      expect.objectContaining({ targetGroupID: "group-1" }),
    )

    act(() => {
      result.current.handleCloseCreateSessionTab("create-1")
    })

    expect(result.current.createSessionTabs).toEqual([])
    expect(result.current.commands.closePanel).toHaveBeenCalledWith(createCreateSessionWorkbenchTab("create-1"))
  })

  it("splits a pane by creating a scoped create-session panel", () => {
    const { result } = renderHook(() => useWorkbenchHarness())

    act(() => {
      result.current.handlePaneSplit("group-1")
    })

    expect(result.current.createSessionTabs).toHaveLength(2)
    expect(result.current.createSessionTabs[1]?.workspaceID).toBe("workspace-1")
    expect(result.current.commands.splitPanel).toHaveBeenCalledWith(
      createCreateSessionWorkbenchTab(result.current.createSessionTabs[1]!.id),
      expect.objectContaining({ direction: "right", targetGroupID: "group-1" }),
    )
  })

  it("syncs business focus from Dockview active changes", () => {
    const { result } = renderHook(() => useWorkbenchHarness())

    act(() => {
      result.current.handleDockviewActiveChange({
        groupID: "group-2",
        layout: result.current.dockviewLayout,
        panelID: "session:session-2",
        reference: createSessionWorkbenchTab("session-2"),
      })
    })

    expect(result.current.selectedFolderID).toBe("workspace-2")
    expect(result.current.expandedFolderIDs).toContain("workspace-2")
    expect(result.current.lastFocusedSessionID).toBe("session-2")
  })
})
