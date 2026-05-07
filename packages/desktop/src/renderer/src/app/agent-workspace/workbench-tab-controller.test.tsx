import { act, renderHook } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it } from "vitest"
import type { CreateSessionTab, SessionSummary, WorkspaceGroup } from "../types"
import { createWorkbenchLayoutFromLegacyPanes } from "../workbench/core"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"
import { useWorkbenchTabController } from "./workbench-tab-controller"
import {
  buildWorkspaceDerivedState,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  createWorkbenchPane,
  getWorkbenchTabKey,
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

function useWorkbenchHarness() {
  const fixtureRef = useRef<{
    session: SessionSummary
    workspace: WorkspaceGroup
    workspaces: WorkspaceGroup[]
  } | null>(null)
  if (!fixtureRef.current) {
    const session = createSession("session-1")
    const workspace = createWorkspace("workspace-1", [session])
    fixtureRef.current = {
      session,
      workspace,
      workspaces: [workspace],
    }
  }
  const { session, workspace, workspaces } = fixtureRef.current
  const [createSessionTabs, setCreateSessionTabs] = useState<CreateSessionTab[]>([
    {
      id: "create-1",
      workspaceID: workspace.id,
      title: "",
    },
  ])
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(workspace.id)
  const [, setExpandedFolderIDs] = useState<string[]>([workspace.id])
  const [workbenchLayout, setWorkbenchLayout] = useState(() =>
    createWorkbenchLayoutFromLegacyPanes([
      createWorkbenchPane([
        createSessionWorkbenchTab(session.id),
        createCreateSessionWorkbenchTab("create-1"),
      ], "pane-1"),
    ]),
  )
  const lastFocusedSessionIDRef = useRef<string | null>(null)
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const derived = buildWorkspaceDerivedState({
    activeSideChatSessionIDByParentSessionID: {},
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
    workbenchLayout,
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
    focusedPane: derived.focusedPane,
    focusedPaneID: derived.focusedPaneID,
    isCreateSessionTabActive: derived.isCreateSessionTabActive,
    lastFocusedSessionIDRef,
    projectRowRefs,
    selectedFolderID,
    setCreateSessionTabs,
    setExpandedFolderIDs,
    setSelectedFolderID,
    setWorkbenchLayout,
    workbenchLayout,
    workbenchPanes: derived.workbenchPanes,
    workspaces,
  })

  return {
    ...controller,
    createSessionTabs,
    selectedFolderID,
    workbenchPanes: derived.workbenchPanes,
  }
}

describe("workbench tab controller", () => {
  it("selects and closes create-session tabs without changing the public tab shape", () => {
    const { result } = renderHook(() => useWorkbenchHarness())

    act(() => {
      result.current.handleCreateSessionTabSelect("create-1", "pane-1")
    })

    expect(result.current.workbenchPanes[0]?.activeTabKey).toBe(getWorkbenchTabKey(createCreateSessionWorkbenchTab("create-1")))

    act(() => {
      result.current.handleCloseCreateSessionTab("create-1", "pane-1")
    })

    expect(result.current.createSessionTabs).toEqual([])
    expect(result.current.workbenchPanes[0]?.tabs.map(getWorkbenchTabKey)).toEqual([
      getWorkbenchTabKey(createSessionWorkbenchTab("session-1")),
    ])
  })

  it("splits a pane by creating a scoped create-session tab", () => {
    const { result } = renderHook(() => useWorkbenchHarness())

    act(() => {
      result.current.handlePaneSplit("pane-1")
    })

    expect(result.current.createSessionTabs).toHaveLength(2)
    expect(result.current.createSessionTabs[1]?.workspaceID).toBe("workspace-1")
    expect(result.current.workbenchPanes).toHaveLength(2)
  })
})
