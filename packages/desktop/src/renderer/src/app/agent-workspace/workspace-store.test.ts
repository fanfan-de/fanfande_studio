import { describe, expect, it } from "vitest"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type { PermissionRequest, WorkspacePreviewState } from "../types"
import { createInitialDockviewLayout } from "../workbench/dockview-state"
import { DEFAULT_SESSION_DIFF_STATE, DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"
import { createWorkspaceStore } from "./workspace-store"

function createTestStore(options?: {
  initialComposerTabKey?: string | null
  initialDockviewLayout?: ReturnType<typeof createInitialDockviewLayout> | null
}) {
  return createWorkspaceStore({
    hasFolderWorkspaceLoader: false,
    initialComposerTabKey: options?.initialComposerTabKey ?? null,
    initialCreateSessionTab: null,
    initialDockviewLayout: options?.initialDockviewLayout ?? null,
  })
}

describe("workspace store", () => {
  it("updates dockview layout through value and functional actions", () => {
    const store = createTestStore()
    const nextLayout = createInitialDockviewLayout({ kind: "session", sessionID: "session-1" })

    store.getState().workbenchActions.setDockviewLayout(nextLayout)
    expect(store.getState().workbench.dockviewLayout?.activeGroup).toBe(nextLayout.activeGroup)

    store.getState().workbenchActions.setDockviewLayout((current) => current && ({
      ...current,
      activeGroup: undefined,
    }))

    expect(store.getState().workbench.dockviewLayout?.activeGroup).toBeUndefined()
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
      initialDockviewLayout: null,
    })

    expect(store.getState().sessions.workspaces).toEqual([])
    expect(store.getState().sessions.selectedFolderID).toBeNull()
    expect(store.getState().sessions.expandedFolderIDs).toEqual([])
    expect(store.getState().sessions.isInitialWorkspaceLoadPending).toBe(true)
    expect(store.getState().agentStream.conversations).toEqual({})
  })

  it("starts with the seed selected workspace expanded when seed data is used", () => {
    const store = createTestStore()

    expect(store.getState().sessions.selectedFolderID).not.toBeNull()
    expect(store.getState().sessions.expandedFolderIDs).toEqual([
      store.getState().sessions.selectedFolderID,
    ])
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
