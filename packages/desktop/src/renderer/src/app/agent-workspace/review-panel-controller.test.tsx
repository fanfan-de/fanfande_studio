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
    const workspace = createWorkspace()
    const previewState: WorkspacePreviewState = {
      draftUrl: "http://localhost:5173",
      committedUrl: "http://localhost:5173",
      mode: "comment",
      reloadToken: 0,
      errorKind: null,
      errorMessage: null,
      navigationHistory: ["http://localhost:5173"],
      navigationIndex: 0,
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
      const [composerDraftStateByTabKey, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("changes")
      const [, setSelectedDiffFileBySessionState] = useState<Record<string, string | null>>({})
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      const controller = useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        loadSessionDiffForSession: vi.fn(async () => undefined),
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: setComposerDraftStateByTabKeyState,
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

      return { composerDraftStateByTabKey, controller }
    })

    act(() => {
      result.current.controller.handlePreviewInsertCommentsIntoDraft()
    })

    const draftState = result.current.composerDraftStateByTabKey["session:session-1"]
    expect(draftState?.plainText).toContain("@preview:localhost:5173#1")
    expect(draftState?.plainText).not.toContain("Button is misaligned")
  })

  it("tracks manual preview navigation history", () => {
    const workspace = createWorkspace()

    const { result } = renderHook(() => {
      const [previewByWorkspaceID, setPreviewByWorkspaceIDState] = useState<Record<string, WorkspacePreviewState>>({})
      const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTargetState] = useState<Record<string, WorkspaceFileComment[]>>({})
      const [workspaceFileReviewState, setWorkspaceFileReviewStateState] =
        useState<WorkspaceFileReviewState>(DEFAULT_WORKSPACE_FILE_REVIEW_STATE)
      const [, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("changes")
      const [, setSelectedDiffFileBySessionState] = useState<Record<string, string | null>>({})
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      const controller = useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        loadSessionDiffForSession: vi.fn(async () => undefined),
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: setComposerDraftStateByTabKeyState,
        setPreviewByWorkspaceID: setPreviewByWorkspaceIDState,
        setRightSidebarView: setRightSidebarViewState,
        setSelectedDiffFileBySession: setSelectedDiffFileBySessionState,
        setWorkspaceFileCommentsByTarget: setWorkspaceFileCommentsByTargetState,
        setWorkspaceFileReviewState: setWorkspaceFileReviewStateState,
        workspaceFileCommentsByTarget,
        workspaceFileReadRequestRef,
        workspaceFileReviewState,
        workspaceFileSearchRequestRef,
      })

      return { controller, previewByWorkspaceID }
    })

    act(() => {
      result.current.controller.handlePreviewOpenUrl("localhost:3000")
    })
    expect(result.current.previewByWorkspaceID[workspace.id]).toMatchObject({
      committedUrl: "http://localhost:3000/",
      navigationHistory: ["http://localhost:3000/"],
      navigationIndex: 0,
    })

    act(() => {
      result.current.controller.handlePreviewOpenUrl("localhost:5173")
    })
    expect(result.current.previewByWorkspaceID[workspace.id]).toMatchObject({
      committedUrl: "http://localhost:5173/",
      navigationHistory: ["http://localhost:3000/", "http://localhost:5173/"],
      navigationIndex: 1,
    })

    act(() => {
      result.current.controller.handlePreviewBack()
    })
    expect(result.current.previewByWorkspaceID[workspace.id]).toMatchObject({
      committedUrl: "http://localhost:3000/",
      navigationIndex: 0,
    })

    act(() => {
      result.current.controller.handlePreviewForward()
    })
    const beforeReload = result.current.previewByWorkspaceID[workspace.id]
    expect(beforeReload).toMatchObject({
      committedUrl: "http://localhost:5173/",
      navigationIndex: 1,
    })

    act(() => {
      result.current.controller.handlePreviewOpenUrl("http://localhost:5173/")
    })
    expect(result.current.previewByWorkspaceID[workspace.id]).toMatchObject({
      navigationHistory: ["http://localhost:3000/", "http://localhost:5173/"],
      navigationIndex: 1,
      reloadToken: beforeReload.reloadToken + 1,
    })
  })

  it("clears linked file highlights when starting a file comment", () => {
    const workspace = createWorkspace()

    const { result } = renderHook(() => {
      const [previewByWorkspaceID, setPreviewByWorkspaceIDState] = useState<Record<string, WorkspacePreviewState>>({})
      const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTargetState] = useState<Record<string, WorkspaceFileComment[]>>({})
      const [workspaceFileReviewState, setWorkspaceFileReviewStateState] = useState<WorkspaceFileReviewState>({
        ...DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
        linkedLineRange: {
          startLineNumber: 2,
          endLineNumber: 3,
        },
        scopeDirectory: workspace.directory,
        selectedFileContent: "const a = 1\nconst b = 2",
        selectedFileExtension: "ts",
        selectedFileKind: "text",
        selectedFilePath: "src/linked.ts",
        status: "ready",
      })
      const [, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("files")
      const [, setSelectedDiffFileBySessionState] = useState<Record<string, string | null>>({})
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      const controller = useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        loadSessionDiffForSession: vi.fn(async () => undefined),
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: setComposerDraftStateByTabKeyState,
        setPreviewByWorkspaceID: (update) => applyUpdate(setPreviewByWorkspaceIDState, previewByWorkspaceID, update),
        setRightSidebarView: setRightSidebarViewState,
        setSelectedDiffFileBySession: setSelectedDiffFileBySessionState,
        setWorkspaceFileCommentsByTarget: (update) =>
          applyUpdate(setWorkspaceFileCommentsByTargetState, workspaceFileCommentsByTarget, update),
        setWorkspaceFileReviewState: (update) => applyUpdate(setWorkspaceFileReviewStateState, workspaceFileReviewState, update),
        workspaceFileCommentsByTarget,
        workspaceFileReadRequestRef,
        workspaceFileReviewState,
        workspaceFileSearchRequestRef,
      })

      return { controller, workspaceFileReviewState }
    })

    act(() => {
      result.current.controller.handleWorkspaceFileCommentStart(2, 3)
    })

    expect(result.current.workspaceFileReviewState.linkedLineRange).toBeNull()
    expect(result.current.workspaceFileReviewState.pendingComment).toMatchObject({
      startLineNumber: 2,
      endLineNumber: 3,
    })
  })

  it("restores multiple active session diff files and refreshes once", async () => {
    const workspace = createWorkspace()
    const restoreWorkspaceDiffFile = vi.fn().mockResolvedValue({
      directory: workspace.directory,
      file: "src/App.tsx",
    })
    const loadSessionDiffForSession = vi.fn(async () => undefined)
    const setSelectedDiffFileBySession = vi.fn()
    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        restoreWorkspaceDiffFile,
      },
    })

    const { result } = renderHook(() => {
      const [previewByWorkspaceID, setPreviewByWorkspaceIDState] = useState<Record<string, WorkspacePreviewState>>({})
      const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTargetState] = useState<Record<string, WorkspaceFileComment[]>>({})
      const [workspaceFileReviewState, setWorkspaceFileReviewStateState] =
        useState<WorkspaceFileReviewState>(DEFAULT_WORKSPACE_FILE_REVIEW_STATE)
      const [, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("changes")
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      const controller = useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        loadSessionDiffForSession,
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: setComposerDraftStateByTabKeyState,
        setPreviewByWorkspaceID: (update) => applyUpdate(setPreviewByWorkspaceIDState, previewByWorkspaceID, update),
        setRightSidebarView: setRightSidebarViewState,
        setSelectedDiffFileBySession,
        setWorkspaceFileCommentsByTarget: (update) =>
          applyUpdate(setWorkspaceFileCommentsByTargetState, workspaceFileCommentsByTarget, update),
        setWorkspaceFileReviewState: (update) => applyUpdate(setWorkspaceFileReviewStateState, workspaceFileReviewState, update),
        workspaceFileCommentsByTarget,
        workspaceFileReadRequestRef,
        workspaceFileReviewState,
        workspaceFileSearchRequestRef,
      })

      return { controller }
    })

    await act(async () => {
      await result.current.controller.handleActiveSessionDiffFilesRestore([
        "src/App.tsx",
        "src/App.tsx",
        "src/styles.css",
      ])
    })

    expect(restoreWorkspaceDiffFile).toHaveBeenCalledTimes(2)
    expect(restoreWorkspaceDiffFile).toHaveBeenNthCalledWith(1, {
      directory: workspace.directory,
      file: "src/App.tsx",
    })
    expect(restoreWorkspaceDiffFile).toHaveBeenNthCalledWith(2, {
      directory: workspace.directory,
      file: "src/styles.css",
    })
    expect(setSelectedDiffFileBySession).toHaveBeenCalled()
    expect(loadSessionDiffForSession).toHaveBeenCalledTimes(1)
    expect(loadSessionDiffForSession).toHaveBeenCalledWith("session-1")
  })

  it("reverse-applies active session diff patches and reports partial failures", async () => {
    const workspace = createWorkspace()
    const reverseApplyWorkspaceDiffPatches = vi.fn().mockResolvedValue({
      directory: workspace.directory,
      restored: [{ file: "src/App.tsx" }],
      failed: [{ file: "src/styles.css", message: "patch does not apply" }],
    })
    const loadSessionDiffForSession = vi.fn(async () => undefined)
    const setSelectedDiffFileBySession = vi.fn()
    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        reverseApplyWorkspaceDiffPatches,
      },
    })

    const { result } = renderHook(() => {
      const [previewByWorkspaceID, setPreviewByWorkspaceIDState] = useState<Record<string, WorkspacePreviewState>>({})
      const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTargetState] = useState<Record<string, WorkspaceFileComment[]>>({})
      const [workspaceFileReviewState, setWorkspaceFileReviewStateState] =
        useState<WorkspaceFileReviewState>(DEFAULT_WORKSPACE_FILE_REVIEW_STATE)
      const [, setComposerDraftStateByTabKeyState] = useState<Record<string, ComposerDraftState>>({})
      const [, setRightSidebarViewState] = useState<RightSidebarView>("changes")
      const workspaceFileReadRequestRef = useRef(0)
      const workspaceFileSearchRequestRef = useRef(0)

      const controller = useReviewPanelController({
        activeSessionDirectory: workspace.directory,
        activeSessionID: "session-1",
        activeTabKey: "session:session-1",
        activeWorkspaceFileScopeDirectory: workspace.directory,
        loadSessionDiffForSession,
        loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
        platform: "win32",
        previewByWorkspaceID,
        selectedWorkspace: workspace,
        setComposerDraftStateByTabKey: setComposerDraftStateByTabKeyState,
        setPreviewByWorkspaceID: (update) => applyUpdate(setPreviewByWorkspaceIDState, previewByWorkspaceID, update),
        setRightSidebarView: setRightSidebarViewState,
        setSelectedDiffFileBySession,
        setWorkspaceFileCommentsByTarget: (update) =>
          applyUpdate(setWorkspaceFileCommentsByTargetState, workspaceFileCommentsByTarget, update),
        setWorkspaceFileReviewState: (update) => applyUpdate(setWorkspaceFileReviewStateState, workspaceFileReviewState, update),
        workspaceFileCommentsByTarget,
        workspaceFileReadRequestRef,
        workspaceFileReviewState,
        workspaceFileSearchRequestRef,
      })

      return { controller }
    })

    await expect(
      act(async () => {
        await result.current.controller.handleActiveSessionDiffPatchesReverseApply([
          {
            file: "src/App.tsx",
            additions: 1,
            deletions: 1,
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
          {
            file: "src/styles.css",
            additions: 1,
            deletions: 0,
            patch: "@@ -1,0 +1 @@\n+.toolbar {}",
          },
        ])
      }),
    ).rejects.toThrow("已撤销 1 个文件；1 个文件无法自动反向应用变更：src/styles.css: patch does not apply")

    expect(reverseApplyWorkspaceDiffPatches).toHaveBeenCalledWith({
      directory: workspace.directory,
      diffs: [
        {
          file: "src/App.tsx",
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
        {
          file: "src/styles.css",
          patch: "@@ -1,0 +1 @@\n+.toolbar {}",
        },
      ],
    })
    expect(setSelectedDiffFileBySession).toHaveBeenCalled()
    expect(loadSessionDiffForSession).toHaveBeenCalledTimes(1)
    expect(loadSessionDiffForSession).toHaveBeenCalledWith("session-1")
  })
})
