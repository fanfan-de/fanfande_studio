import { act, renderHook } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type {
  ComposerDraftState,
  RightSidebarView,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspaceGroup,
  WorkspacePreviewState,
} from "../types"
import { useReviewPanelController } from "./review-panel-controller"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE } from "./review-preview-state"

function createWorkspace(): WorkspaceGroup {
  return {
    id: "workspace-1",
    name: "Workspace",
    directory: "C:/work/workspace-1",
    created: 1,
    updated: 1,
    project: {
      id: "project-1",
      name: "Project",
      worktree: "C:/work/workspace-1",
    },
    sessions: [],
  }
}

function applyUpdate<T>(setValue: (value: T) => void, current: T, update: T | ((value: T) => T)) {
  setValue(typeof update === "function" ? (update as (value: T) => T)(current) : update)
}

describe("review panel controller", () => {
  it("inserts committed preview comments into the active composer draft", () => {
    const appendedDrafts: Array<{ tabKey: string; value: string }> = []
    const workspace = createWorkspace()
    const previewState: WorkspacePreviewState = {
      draftUrl: "http://localhost:5173",
      committedUrl: "http://localhost:5173",
      mode: "comment",
      reloadToken: 0,
      errorMessage: null,
      comments: [
        {
          id: "comment-1",
          url: "http://localhost:5173",
          x: 0.2,
          y: 0.4,
          text: "Button is misaligned",
          createdAt: 1,
        },
      ],
    }

    const { result } = renderHook(() => {
      const [previewByWorkspaceID, setPreviewByWorkspaceIDState] = useState<Record<string, WorkspacePreviewState>>({
        [workspace.id]: previewState,
      })
      const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTargetState] = useState<Record<string, WorkspaceFileComment[]>>({})
      const [workspaceFileReviewState, setWorkspaceFileReviewStateState] =
        useState<WorkspaceFileReviewState>(DEFAULT_WORKSPACE_FILE_REVIEW_STATE)
      const [, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("changes")
      const [, setSelectedDiffFileBySessionState] = useState<Record<string, string | null>>({})
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      return useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        appendDraftForTab: (tabKey, value) => appendedDrafts.push({ tabKey, value }),
        loadSessionDiffForSession: vi.fn(async () => undefined),
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: (update) => applyUpdate(setComposerDraftStateByTabKeyState, {}, update),
        setPreviewByWorkspaceID: (update) => applyUpdate(setPreviewByWorkspaceIDState, previewByWorkspaceID, update),
        setRightSidebarView: (update) => applyUpdate(setRightSidebarViewState, "changes", update),
        setSelectedDiffFileBySession: (update) => applyUpdate(setSelectedDiffFileBySessionState, {}, update),
        setWorkspaceFileCommentsByTarget: (update) =>
          applyUpdate(setWorkspaceFileCommentsByTargetState, workspaceFileCommentsByTarget, update),
        setWorkspaceFileReviewState: (update) => applyUpdate(setWorkspaceFileReviewStateState, workspaceFileReviewState, update),
        workspaceFileCommentsByTarget,
        workspaceFileReadRequestRef,
        workspaceFileReviewState,
        workspaceFileSearchRequestRef,
      })
    })

    act(() => {
      result.current.handlePreviewInsertCommentsIntoDraft()
    })

    expect(appendedDrafts).toHaveLength(1)
    expect(appendedDrafts[0]?.tabKey).toBe("session:session-1")
    expect(appendedDrafts[0]?.value).toContain("Button is misaligned")
    expect(appendedDrafts[0]?.value).toContain("http://localhost:5173")
  })
})
