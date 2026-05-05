import { describe, expect, it } from "vitest"
import type { SessionSummary, WorkspaceGroup } from "../types"
import { createWorkbenchLayoutFromLegacyPanes } from "../workbench/core"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"
import {
  buildWorkspaceDerivedState,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  createWorkbenchPane,
  getWorkbenchTabKey,
  resolveCreateSessionWorkspaceID,
} from "./workspace-derived-state"

function createSession(id: string, title = id): SessionSummary {
  return {
    id,
    title,
    branch: "main",
    status: "Ready",
    updated: 100,
    focus: "",
    summary: "",
  }
}

function createWorkspace(id: string, sessions: SessionSummary[], exists = true): WorkspaceGroup {
  return {
    id,
    name: id,
    directory: `C:/work/${id}`,
    exists,
    created: 1,
    updated: 2,
    project: {
      id: `project-${id}`,
      name: `Project ${id}`,
      worktree: `C:/work/${id}`,
    },
    sessions,
  }
}

describe("workspace derived state", () => {
  it("builds active session, side chat, preview scope, and pane states from store slices", () => {
    const parentSession = createSession("session-parent", "Parent")
    const sideChatSession: SessionSummary = {
      ...createSession("side-chat-1", "Side chat"),
      kind: "side-chat",
      origin: {
        parentSessionID: parentSession.id,
        anchorMessageID: "message-1",
        anchorPreview: "Selected text",
      },
      updated: 200,
    }
    const workspace = createWorkspace("workspace-1", [parentSession, sideChatSession])
    const createSessionTab = {
      id: "create-1",
      workspaceID: workspace.id,
      title: "",
    }
    const layout = createWorkbenchLayoutFromLegacyPanes([
      createWorkbenchPane([
        createSessionWorkbenchTab(parentSession.id),
        createCreateSessionWorkbenchTab(createSessionTab.id),
      ], "pane-1"),
    ])

    const derived = buildWorkspaceDerivedState({
      activeSideChatSessionIDByParentSessionID: {
        [parentSession.id]: sideChatSession.id,
      },
      composerAttachmentsByTabKey: {},
      composerDraftStateByTabKey: {},
      contextUsageBySession: {},
      conversations: {
        [parentSession.id]: [{ id: "turn-1", kind: "user", text: "hello", timestamp: 1 }],
        [sideChatSession.id]: [{ id: "turn-2", kind: "user", text: "side", timestamp: 2 }],
      },
      createSessionTabs: [createSessionTab],
      isCreatingSessionByTabKey: {},
      isInitialWorkspaceLoadPending: false,
      isSendingByTabKey: {},
      pendingPermissionRequestsBySession: {},
      platform: "win32",
      previewByWorkspaceID: {
        [workspace.id]: {
          draftUrl: "http://localhost:5173",
          committedUrl: null,
          mode: "browse",
          reloadToken: 0,
          errorKind: null,
          errorMessage: null,
          navigationHistory: [],
          navigationIndex: -1,
          comments: [],
        },
      },
      selectedDiffFileBySession: {},
      selectedFolderID: workspace.id,
      sessionDiffBySession: {},
      sessionDiffStateBySession: {},
      sessionDirectoryBySession: {},
      sessionRuntimeDebugBySession: {},
      sessionRuntimeDebugStateBySession: {},
      seedWorkspaceIDs: new Set(),
      workbenchLayout: layout,
      workspaceFileCommentsByTarget: {},
      workspaceFileReviewState: DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
      workspaces: [workspace],
    })

    expect(derived.activeSession?.id).toBe(parentSession.id)
    expect(derived.activeTurns).toHaveLength(1)
    expect(derived.activeSideChatSession?.id).toBe(sideChatSession.id)
    expect(derived.activeSideChatTurns).toHaveLength(1)
    expect(derived.activeSideChatCountsByAnchorMessageID).toEqual({ "message-1": 1 })
    expect(derived.activePreviewState.draftUrl).toBe("http://localhost:5173")
    expect(derived.canvasSessionTabs.map((session) => session.id)).toEqual([parentSession.id])
    expect(derived.visibleCanvasSessionIDs).toEqual([parentSession.id])
    expect(derived.runningSessionIDs).toEqual([])
    expect(derived.workbenchPaneStates[0]).toMatchObject({
      id: "pane-1",
      activeTabKey: getWorkbenchTabKey(createSessionWorkbenchTab(parentSession.id)),
      sessionID: parentSession.id,
      workspace,
    })
  })

  it("derives running sessions from sending tabs and streaming assistant turns", () => {
    const sendingSession = createSession("session-sending", "Sending")
    const streamingSession = createSession("session-streaming", "Streaming")
    const idleSession = createSession("session-idle", "Idle")
    const workspace = createWorkspace("workspace-1", [sendingSession, streamingSession, idleSession])

    const derived = buildWorkspaceDerivedState({
      activeSideChatSessionIDByParentSessionID: {},
      composerAttachmentsByTabKey: {},
      composerDraftStateByTabKey: {},
      contextUsageBySession: {},
      conversations: {
        [streamingSession.id]: [
          {
            id: "assistant-1",
            kind: "assistant",
            timestamp: 1,
            runtime: {
              phase: "reasoning",
              startedAt: 1,
              updatedAt: 1,
            },
            state: "Reasoning",
            items: [],
            isStreaming: true,
          },
        ],
        [idleSession.id]: [
          {
            id: "assistant-2",
            kind: "assistant",
            timestamp: 2,
            runtime: {
              phase: "completed",
              startedAt: 2,
              updatedAt: 2,
            },
            state: "Done",
            items: [],
            isStreaming: false,
          },
        ],
      },
      createSessionTabs: [],
      isCreatingSessionByTabKey: {},
      isInitialWorkspaceLoadPending: false,
      isSendingByTabKey: {
        [`session:${sendingSession.id}`]: true,
        [`session:${idleSession.id}`]: false,
        "create-session:create-1": true,
      },
      pendingPermissionRequestsBySession: {},
      platform: "win32",
      previewByWorkspaceID: {},
      selectedDiffFileBySession: {},
      selectedFolderID: workspace.id,
      sessionDiffBySession: {},
      sessionDiffStateBySession: {},
      sessionDirectoryBySession: {},
      sessionRuntimeDebugBySession: {},
      sessionRuntimeDebugStateBySession: {},
      seedWorkspaceIDs: new Set(),
      workbenchLayout: createWorkbenchLayoutFromLegacyPanes([]),
      workspaceFileCommentsByTarget: {},
      workspaceFileReviewState: DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
      workspaces: [workspace],
    })

    expect([...derived.runningSessionIDs].sort()).toEqual([sendingSession.id, streamingSession.id].sort())
  })

  it("separates open canvas sessions from the visible active canvas sessions", () => {
    const sessionA = createSession("session-a", "A")
    const sessionB = createSession("session-b", "B")
    const sessionC = createSession("session-c", "C")
    const workspace = createWorkspace("workspace-1", [sessionA, sessionB, sessionC])
    const layout = createWorkbenchLayoutFromLegacyPanes([
      createWorkbenchPane([
        createSessionWorkbenchTab(sessionA.id),
        createSessionWorkbenchTab(sessionB.id),
      ], "pane-1"),
      createWorkbenchPane([
        createSessionWorkbenchTab(sessionC.id),
      ], "pane-2"),
    ])

    const derived = buildWorkspaceDerivedState({
      activeSideChatSessionIDByParentSessionID: {},
      composerAttachmentsByTabKey: {},
      composerDraftStateByTabKey: {},
      contextUsageBySession: {},
      conversations: {},
      createSessionTabs: [],
      isCreatingSessionByTabKey: {},
      isInitialWorkspaceLoadPending: false,
      isSendingByTabKey: {},
      pendingPermissionRequestsBySession: {},
      platform: "win32",
      previewByWorkspaceID: {},
      selectedDiffFileBySession: {},
      selectedFolderID: workspace.id,
      sessionDiffBySession: {},
      sessionDiffStateBySession: {},
      sessionDirectoryBySession: {},
      sessionRuntimeDebugBySession: {},
      sessionRuntimeDebugStateBySession: {},
      seedWorkspaceIDs: new Set(),
      workbenchLayout: layout,
      workspaceFileCommentsByTarget: {},
      workspaceFileReviewState: DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
      workspaces: [workspace],
    })

    expect(derived.openCanvasSessionIDs).toEqual([sessionA.id, sessionB.id, sessionC.id])
    expect(derived.visibleCanvasSessionIDs).toEqual([sessionA.id, sessionC.id])
  })

  it("resolves create-session workspace using preferred, selected, active, then available fallback order", () => {
    const unavailable = createWorkspace("workspace-unavailable", [], false)
    const selected = createWorkspace("workspace-selected", [])
    const active = createWorkspace("workspace-active", [])

    expect(resolveCreateSessionWorkspaceID([unavailable, selected, active], unavailable.id, selected.id, active.id)).toBe(selected.id)
    expect(resolveCreateSessionWorkspaceID([unavailable, active], null, null, active.id)).toBe(active.id)
    expect(resolveCreateSessionWorkspaceID([unavailable], null, null, null)).toBe(unavailable.id)
  })
})
