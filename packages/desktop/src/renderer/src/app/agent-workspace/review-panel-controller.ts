import { useDeferredValue, type MutableRefObject } from "react"
import {
  appendComposerTagToDraftState,
  createComposerCommentTagData,
  createEmptyComposerDraftState,
} from "../composer/draft-state"
import {
  buildWorkspaceFileCommentDraft,
  buildWorkspaceFileCommentReferenceLabel,
  formatWorkspaceFileLineRangeLabel,
  normalizeWorkspaceFileLineRange,
} from "../files/utils"
import { buildPreviewCommentDraft, normalizePreviewUrlInput } from "../preview/utils"
import type {
  ComposerCommentReference,
  ComposerDraftState,
  PreviewComment,
  PreviewMode,
  RightSidebarView,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspaceGroup,
  WorkspacePreviewState,
} from "../types"
import { createID } from "../utils"
import { useWorkspaceFileReviewSearchEffects } from "./review-diff-runtime-hooks"
import {
  DEFAULT_WORKSPACE_PREVIEW_STATE,
  getWorkspaceFileCommentKey,
  resolvePreviewScopeID,
  resolveWorkspaceFileReviewStatus,
} from "./review-preview-state"
import type { WorkspaceStateUpdater } from "./workspace-store"

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

interface UseReviewPanelControllerOptions {
  activeSessionDirectory: string | null
  activeSessionID: string | null
  activeTabKey: string | null
  activeWorkspaceFileScopeDirectory: string | null
  appendDraftForTab: (tabKey: string, value: string) => void
  loadSessionDiffForSession: (sessionID: string) => Promise<void>
  loadSessionRuntimeDebugForSession: (sessionID: string) => Promise<void>
  platform: string
  previewByWorkspaceID: Record<string, WorkspacePreviewState>
  selectedWorkspace: WorkspaceGroup | null
  setComposerDraftStateByTabKey: StateSetter<Record<string, ComposerDraftState>>
  setPreviewByWorkspaceID: StateSetter<Record<string, WorkspacePreviewState>>
  setRightSidebarView: StateSetter<RightSidebarView>
  setSelectedDiffFileBySession: StateSetter<Record<string, string | null>>
  setWorkspaceFileCommentsByTarget: StateSetter<Record<string, WorkspaceFileComment[]>>
  setWorkspaceFileReviewState: StateSetter<WorkspaceFileReviewState>
  workspaceFileCommentsByTarget: Record<string, WorkspaceFileComment[]>
  workspaceFileReadRequestRef: MutableRefObject<number>
  workspaceFileReviewState: WorkspaceFileReviewState
  workspaceFileSearchRequestRef: MutableRefObject<number>
}

export function useReviewPanelController({
  activeSessionDirectory,
  activeSessionID,
  activeTabKey,
  activeWorkspaceFileScopeDirectory,
  appendDraftForTab,
  loadSessionDiffForSession,
  loadSessionRuntimeDebugForSession,
  platform,
  previewByWorkspaceID,
  selectedWorkspace,
  setComposerDraftStateByTabKey,
  setPreviewByWorkspaceID,
  setRightSidebarView,
  setSelectedDiffFileBySession,
  setWorkspaceFileCommentsByTarget,
  setWorkspaceFileReviewState,
  workspaceFileCommentsByTarget,
  workspaceFileReadRequestRef,
  workspaceFileReviewState,
  workspaceFileSearchRequestRef,
}: UseReviewPanelControllerOptions) {
  const deferredWorkspaceFileQuery = useDeferredValue(workspaceFileReviewState.query)

  function updatePreviewState(
    updater: (current: WorkspacePreviewState) => WorkspacePreviewState,
    workspaceID = selectedWorkspace?.id ?? null,
  ) {
    const scopeID = resolvePreviewScopeID(workspaceID)
    setPreviewByWorkspaceID((current) => {
      const previousState = current[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
      const nextState = updater(previousState)
      if (nextState === previousState) return current
      return {
        ...current,
        [scopeID]: nextState,
      }
    })
  }

  function handlePreviewDraftUrlChange(value: string, workspaceID = selectedWorkspace?.id ?? null) {
    updatePreviewState(
      (current) => ({
        ...current,
        draftUrl: value,
        errorMessage: null,
      }),
      workspaceID,
    )
  }

  function handlePreviewOpen(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState((current) => {
      const { errorMessage, normalizedUrl } = normalizePreviewUrlInput(current.draftUrl || current.committedUrl || "")
      if (!normalizedUrl) {
        return {
          ...current,
          errorMessage,
        }
      }

      return {
        ...current,
        draftUrl: normalizedUrl,
        committedUrl: normalizedUrl,
        errorMessage: null,
        reloadToken: current.committedUrl === normalizedUrl ? current.reloadToken + 1 : current.reloadToken,
      }
    }, workspaceID)
  }

  function handlePreviewReload(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState(
      (current) => current.committedUrl
        ? {
            ...current,
            errorMessage: null,
            reloadToken: current.reloadToken + 1,
          }
        : current,
      workspaceID,
    )
  }

  function handlePreviewModeChange(mode: PreviewMode, workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState(
      (current) => ({
        ...current,
        mode,
      }),
      workspaceID,
    )
  }

  function handlePreviewAddComment(
    input: {
      x: number
      y: number
      text: string
      anchor?: PreviewComment["anchor"]
    },
    workspaceID = selectedWorkspace?.id ?? null,
  ) {
    setRightSidebarView("preview")
    updatePreviewState((current) => {
      const trimmedText = input.text.trim()
      if (!current.committedUrl || !trimmedText) return current

      const nextComment: PreviewComment = {
        id: createID("preview-comment"),
        url: current.committedUrl,
        x: input.x,
        y: input.y,
        text: trimmedText,
        createdAt: Date.now(),
        anchor: input.anchor,
      }

      return {
        ...current,
        comments: [...current.comments, nextComment],
        errorMessage: null,
      }
    }, workspaceID)
  }

  function handlePreviewDeleteComment(commentID: string, workspaceID = selectedWorkspace?.id ?? null) {
    updatePreviewState(
      (current) => ({
        ...current,
        comments: current.comments.filter((comment) => comment.id !== commentID),
      }),
      workspaceID,
    )
  }

  function handlePreviewInsertCommentsIntoDraft(workspaceID = selectedWorkspace?.id ?? null) {
    if (!activeTabKey) return

    const previewState = previewByWorkspaceID[resolvePreviewScopeID(workspaceID)] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    if (!previewState.committedUrl) return

    const relevantComments = previewState.comments.filter((comment) => comment.url === previewState.committedUrl)
    const commentDraft = buildPreviewCommentDraft(previewState.committedUrl, relevantComments)
    if (!commentDraft) return

    appendDraftForTab(activeTabKey, commentDraft)
  }

  async function handlePreviewOpenExternal(workspaceID = selectedWorkspace?.id ?? null) {
    const openExternalUrl = window.desktop?.openExternalUrl
    if (!openExternalUrl) return

    const scopeID = resolvePreviewScopeID(workspaceID)
    const previewState = previewByWorkspaceID[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const { errorMessage, normalizedUrl } = normalizePreviewUrlInput(previewState.committedUrl ?? previewState.draftUrl)

    if (!normalizedUrl) {
      updatePreviewState(
        (current) => ({
          ...current,
          errorMessage,
        }),
        workspaceID,
      )
      return
    }

    try {
      await openExternalUrl({ url: normalizedUrl })
      updatePreviewState(
        (current) => ({
          ...current,
          draftUrl: normalizedUrl,
          errorMessage: null,
        }),
        workspaceID,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updatePreviewState(
        (current) => ({
          ...current,
          errorMessage: message,
        }),
        workspaceID,
      )
    }
  }

  function handleWorkspaceFileQueryChange(value: string) {
    setRightSidebarView("files")
    setWorkspaceFileReviewState((current) => {
      const nextErrorMessage = current.selectedFileKind === "unsupported" ? current.errorMessage : null
      const nextState = {
        ...current,
        query: value,
        results: value.trim() ? current.results : [],
        errorMessage: nextErrorMessage,
        pendingComment: null,
      }

      return {
        ...nextState,
        status: value.trim() ? current.status : resolveWorkspaceFileReviewStatus(nextState),
      }
    })
  }

  async function handleWorkspaceFileSelect(path: string) {
    const readWorkspaceFile = window.desktop?.readWorkspaceFile
    const scopeDirectory = activeWorkspaceFileScopeDirectory
    const trimmedPath = path.trim()
    if (!readWorkspaceFile || !scopeDirectory || !trimmedPath) return

    const requestID = workspaceFileReadRequestRef.current + 1
    workspaceFileReadRequestRef.current = requestID
    setRightSidebarView("files")
    setWorkspaceFileReviewState((current) => ({
      ...current,
      selectedFilePath: trimmedPath,
      selectedFileContent: null,
      selectedFileKind: null,
      selectedFileExtension: null,
      comments: [],
      pendingComment: null,
      errorMessage: null,
      status: "reading",
    }))

    try {
      const nextFile = await readWorkspaceFile({
        directory: scopeDirectory,
        path: trimmedPath,
      })
      if (workspaceFileReadRequestRef.current !== requestID) return

      const commentKey = getWorkspaceFileCommentKey(scopeDirectory, nextFile.path, platform)
      const nextComments = commentKey ? workspaceFileCommentsByTarget[commentKey] ?? [] : []
      const nextErrorMessage = nextFile.kind === "unsupported" ? nextFile.unsupportedReason ?? null : null

      setWorkspaceFileReviewState((current) => ({
        ...current,
        selectedFilePath: nextFile.path,
        selectedFileContent: nextFile.kind === "text" ? nextFile.content ?? "" : null,
        selectedFileKind: nextFile.kind,
        selectedFileExtension: nextFile.extension,
        comments: nextComments,
        pendingComment: null,
        errorMessage: nextErrorMessage,
        status: nextFile.kind === "text" ? "ready" : "unsupported",
      }))
    } catch (error) {
      if (workspaceFileReadRequestRef.current !== requestID) return
      const message = error instanceof Error ? error.message : String(error)

      setWorkspaceFileReviewState((current) => ({
        ...current,
        selectedFilePath: trimmedPath,
        selectedFileContent: null,
        selectedFileKind: null,
        selectedFileExtension: null,
        comments: [],
        pendingComment: null,
        errorMessage: message,
        status: "error",
      }))
      console.error("[desktop] readWorkspaceFile failed:", error)
    }
  }

  function handleWorkspaceFileCommentStart(startLineNumber: number, endLineNumber = startLineNumber) {
    if (!workspaceFileReviewState.selectedFilePath) return
    const nextRange = normalizeWorkspaceFileLineRange(startLineNumber, endLineNumber)
    setRightSidebarView("files")
    setWorkspaceFileReviewState((current) => ({
      ...current,
      pendingComment: {
        ...nextRange,
        text:
          current.pendingComment &&
          current.pendingComment.startLineNumber === nextRange.startLineNumber &&
          current.pendingComment.endLineNumber === nextRange.endLineNumber
            ? current.pendingComment.text
            : "",
      },
    }))
  }

  function handleWorkspaceFileCommentChange(text: string) {
    setWorkspaceFileReviewState((current) =>
      current.pendingComment
        ? {
            ...current,
            pendingComment: {
              ...current.pendingComment,
              text,
            },
          }
        : current,
    )
  }

  function handleWorkspaceFileCommentCancel() {
    setWorkspaceFileReviewState((current) => ({
      ...current,
      pendingComment: null,
    }))
  }

  function commitWorkspaceFileComment(insertIntoComposer: boolean) {
    const scopeDirectory = activeWorkspaceFileScopeDirectory
    const selectedFilePath = workspaceFileReviewState.selectedFilePath
    const selectedFileContent = workspaceFileReviewState.selectedFileContent
    const selectedFileExtension = workspaceFileReviewState.selectedFileExtension
    const pendingComment = workspaceFileReviewState.pendingComment
    if (!scopeDirectory || !selectedFilePath || !pendingComment) return

    const trimmedText = pendingComment.text.trim()
    const commentKey = getWorkspaceFileCommentKey(scopeDirectory, selectedFilePath, platform)
    if (!trimmedText || !commentKey) return

    const nextComment: WorkspaceFileComment = {
      id: createID("file-comment"),
      filePath: selectedFilePath,
      startLineNumber: pendingComment.startLineNumber,
      endLineNumber: pendingComment.endLineNumber,
      text: trimmedText,
      createdAt: Date.now(),
    }

    setWorkspaceFileCommentsByTarget((current) => ({
      ...current,
      [commentKey]: [...(current[commentKey] ?? []), nextComment],
    }))
    setWorkspaceFileReviewState((current) => ({
      ...current,
      comments: [...current.comments, nextComment],
      pendingComment: null,
      errorMessage: current.selectedFileKind === "unsupported" ? current.errorMessage : null,
      status: current.selectedFileKind === "unsupported" ? "unsupported" : "ready",
    }))

    if (insertIntoComposer && activeTabKey && selectedFileContent !== null) {
      const prompt = buildWorkspaceFileCommentDraft({
        content: selectedFileContent,
        extension: selectedFileExtension,
        filePath: selectedFilePath,
        comment: nextComment,
      })

      if (!prompt) return

      const label = buildWorkspaceFileCommentReferenceLabel(
        selectedFilePath,
        nextComment.startLineNumber,
        nextComment.endLineNumber,
      )

      const nextReference: ComposerCommentReference = {
        id: createID("composer-comment-reference"),
        filePath: selectedFilePath,
        startLineNumber: nextComment.startLineNumber,
        endLineNumber: nextComment.endLineNumber,
        label,
        title: `${selectedFilePath} (${formatWorkspaceFileLineRangeLabel(nextComment.startLineNumber, nextComment.endLineNumber)})`,
        prompt,
      }

      setComposerDraftStateByTabKey((current) => ({
        ...current,
        [activeTabKey]: appendComposerTagToDraftState(
          current[activeTabKey] ?? createEmptyComposerDraftState(),
          createComposerCommentTagData(nextReference),
        ),
      }))
    }
  }

  function handleWorkspaceFileCommentSubmit() {
    commitWorkspaceFileComment(false)
  }

  function handleWorkspaceFileCommentConfirm() {
    commitWorkspaceFileComment(true)
  }

  function handleActiveSessionDiffFileSelect(file: string | null, sessionID = activeSessionID) {
    if (!sessionID) return

    setRightSidebarView("changes")
    setSelectedDiffFileBySession((prev) => ({
      ...prev,
      [sessionID]: file,
    }))
  }

  async function handleActiveSessionDiffRefresh(sessionID = activeSessionID) {
    if (!sessionID) return
    await loadSessionDiffForSession(sessionID)
  }

  async function handleActiveSessionDiffFileRestore(file: string, sessionID = activeSessionID) {
    const restoreWorkspaceDiffFile = window.desktop?.restoreWorkspaceDiffFile
    if (!restoreWorkspaceDiffFile) {
      throw new Error("Workspace diff restore bridge is unavailable.")
    }
    if (!sessionID || !activeSessionDirectory) {
      throw new Error("Select a session before restoring a file.")
    }

    await restoreWorkspaceDiffFile({
      directory: activeSessionDirectory,
      file,
    })
    setSelectedDiffFileBySession((prev) => ({
      ...prev,
      [sessionID]: null,
    }))
    await loadSessionDiffForSession(sessionID)
  }

  async function handleActiveSessionRuntimeDebugRefresh(sessionID = activeSessionID) {
    if (!sessionID) return
    await loadSessionRuntimeDebugForSession(sessionID)
  }

  useWorkspaceFileReviewSearchEffects({
    activeWorkspaceFileScopeDirectory,
    deferredWorkspaceFileQuery,
    platform,
    setWorkspaceFileReviewState,
    workspaceFileReadRequestRef,
    workspaceFileReviewState,
    workspaceFileSearchRequestRef,
  })

  return {
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffFileRestore,
    handleActiveSessionDiffRefresh,
    handleActiveSessionRuntimeDebugRefresh,
    handlePreviewAddComment,
    handlePreviewDeleteComment,
    handlePreviewDraftUrlChange,
    handlePreviewInsertCommentsIntoDraft,
    handlePreviewModeChange,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewReload,
    handleWorkspaceFileCommentCancel,
    handleWorkspaceFileCommentChange,
    handleWorkspaceFileCommentConfirm,
    handleWorkspaceFileCommentStart,
    handleWorkspaceFileCommentSubmit,
    handleWorkspaceFileQueryChange,
    handleWorkspaceFileSelect,
  }
}
