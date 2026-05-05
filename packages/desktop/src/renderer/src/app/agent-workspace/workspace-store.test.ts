import { describe, expect, it } from "vitest"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type { PermissionRequest, WorkspacePreviewState } from "../types"
import type { WorkbenchLayoutState } from "../workbench/core"
import { DEFAULT_SESSION_DIFF_STATE, DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"
import { createWorkspaceStore } from "./workspace-store"

function createEmptyWorkbenchLayout(): WorkbenchLayoutState {
  return {
    rootId: null,
    nodes: {},
    tabs: {},
    docs: {},
    focusedGroupId: null,
  }
}

function createTestStore(options?: {
  initialComposerTabKey?: string | null
  initialWorkbenchLayout?: WorkbenchLayoutState
}) {
  return createWorkspaceStore({
    hasFolderWorkspaceLoader: false,
    initialComposerTabKey: options?.initialComposerTabKey ?? null,
    initialCreateSessionTab: null,
    initialWorkbenchLayout: options?.initialWorkbenchLayout ?? createEmptyWorkbenchLayout(),
  })
}

describe("workspace store", () => {
  it("updates workbench layout through value and functional actions", () => {
    const store = createTestStore()
    const nextLayout: WorkbenchLayoutState = {
      rootId: "group-1",
      nodes: {
        "group-1": {
          id: "group-1",
          kind: "group",
          tabs: [],
          activeTabId: null,
        },
      },
      tabs: {},
      docs: {},
      focusedGroupId: "group-1",
    }

    store.getState().workbenchActions.setWorkbenchLayout(nextLayout)
    expect(store.getState().workbench.workbenchLayout.rootId).toBe("group-1")

    store.getState().workbenchActions.setWorkbenchLayout((current) => ({
      ...current,
      focusedGroupId: null,
    }))

    expect(store.getState().workbench.workbenchLayout.focusedGroupId).toBeNull()
  })

  it("keeps composer draft, attachment, and sending state isolated by tab", () => {
    const store = createTestStore({ initialComposerTabKey: "session:alpha" })
    const betaDraft = createComposerDraftStateFromPlainText("Follow up")

    store.getState().composerActions.setComposerDraftStateByTabKey((current) => ({
      ...current,
      "session:beta": betaDraft,
    }))
    store.getState().composerActions.setComposerAttachmentsByTabKey({
      "session:beta": [{ path: "C:/tmp/a.png", name: "a.png" }],
    })
    store.getState().composerActions.setIsSendingByTabKey({
      "session:beta": true,
    })

    expect(store.getState().composer.composerDraftStateByTabKey["session:alpha"]).toBeDefined()
    expect(store.getState().composer.composerDraftStateByTabKey["session:beta"]).toBe(betaDraft)
    expect(store.getState().composer.composerAttachmentsByTabKey["session:alpha"]).toBeUndefined()
    expect(store.getState().composer.composerAttachmentsByTabKey["session:beta"]).toHaveLength(1)
    expect(store.getState().composer.isSendingByTabKey["session:beta"]).toBe(true)
  })

  it("tracks session tab and side chat state in the sessions slice", () => {
    const store = createTestStore()

    store.getState().sessionsActions.setCreateSessionTabs([
      {
        id: "create-1",
        title: "",
        workspaceID: "workspace-1",
      },
    ])
    store.getState().sessionsActions.setActiveSideChatSessionIDByParentSessionID({
      "session-1": "side-chat-1",
    })
    store.getState().sessionsActions.setSessionCanvasUnreadBySession({
      "session-2": true,
    })
    store.getState().sessionsActions.setSelectedFolderID("workspace-1")

    expect(store.getState().sessions.createSessionTabs[0]?.id).toBe("create-1")
    expect(store.getState().sessions.activeSideChatSessionIDByParentSessionID["session-1"]).toBe("side-chat-1")
    expect(store.getState().sessions.sessionCanvasUnreadBySession["session-2"]).toBe(true)
    expect(store.getState().sessions.selectedFolderID).toBe("workspace-1")
  })

  it("starts without seed workspaces while the desktop workspace loader is available", () => {
    const store = createWorkspaceStore({
      hasFolderWorkspaceLoader: true,
      initialComposerTabKey: null,
      initialCreateSessionTab: null,
      initialWorkbenchLayout: createEmptyWorkbenchLayout(),
    })

    expect(store.getState().sessions.workspaces).toEqual([])
    expect(store.getState().sessions.selectedFolderID).toBeNull()
    expect(store.getState().sessions.expandedFolderID).toBeNull()
    expect(store.getState().sessions.isInitialWorkspaceLoadPending).toBe(true)
    expect(store.getState().agentStream.conversations).toEqual({})
  })

  it("tracks stream permissions and request lifecycle state", () => {
    const store = createTestStore()
    const permissionRequest = {
      id: "approval-1",
      status: "pending",
    } as PermissionRequest

    store.getState().agentStreamActions.setAgentSessions({
      "session-1": "backend-1",
    })
    store.getState().agentStreamActions.setPendingPermissionRequestsBySession({
      "session-1": [permissionRequest],
    })
    store.getState().agentStreamActions.setPermissionRequestActionRequestID("approval-1")

    expect(store.getState().agentStream.agentSessions["session-1"]).toBe("backend-1")
    expect(store.getState().agentStream.pendingPermissionRequestsBySession["session-1"]).toEqual([permissionRequest])
    expect(store.getState().agentStream.permissionRequestActionRequestID).toBe("approval-1")
  })

  it("updates review, preview, and file comment state independently", () => {
    const store = createTestStore()
    const preview: WorkspacePreviewState = {
      committedUrl: null,
      comments: [],
      draftUrl: "http://localhost:5173",
      errorKind: null,
      errorMessage: null,
      mode: "browse",
      navigationHistory: [],
      navigationIndex: -1,
      reloadToken: 1,
    }

    store.getState().reviewActions.setPreviewByWorkspaceID({
      "workspace-1": preview,
    })
    store.getState().reviewActions.setSessionDiffStateBySession({
      "session-1": {
        ...DEFAULT_SESSION_DIFF_STATE,
        isStale: true,
      },
    })
    store.getState().reviewActions.setWorkspaceFileReviewState({
      ...DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
      query: "App.tsx",
    })

    expect(store.getState().review.previewByWorkspaceID["workspace-1"]).toBe(preview)
    expect(store.getState().review.sessionDiffStateBySession["session-1"]?.isStale).toBe(true)
    expect(store.getState().review.workspaceFileReviewState.query).toBe("App.tsx")
  })
})
