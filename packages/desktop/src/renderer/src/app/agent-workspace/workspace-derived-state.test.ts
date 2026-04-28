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
          errorMessage: null,
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
    expect(derived.workbenchPaneStates[0]).toMatchObject({
      id: "pane-1",
      activeTabKey: getWorkbenchTabKey(createSessionWorkbenchTab(parentSession.id)),
      sessionID: parentSession.id,
      workspace,
    })
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
