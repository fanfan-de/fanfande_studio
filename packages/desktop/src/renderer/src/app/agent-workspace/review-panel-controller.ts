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
import {
  buildPreviewCommentReferenceLabel,
  buildPreviewCommentReferenceTitle,
  normalizePreviewUrlInput,
} from "../preview/utils"
import type {
  ComposerCommentReference,
  ComposerDraftState,
  PreviewComment,
  PreviewErrorKind,
  PreviewMode,
  RightSidebarView,
  WorkspaceFileComment,
  WorkspaceFileLineRange,
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

const MAX_PREVIEW_NAVIGATION_HISTORY = 50

interface WorkspaceFileSelectOptions {
  linkedLineRange?: WorkspaceFileLineRange | null
  scopeDirectory?: string | null
}

interface UseReviewPanelControllerOptions {
  activeSessionDirectory: string | null
  activeSessionID: string | null
  activeTabKey: string | null
  activeWorkspaceFileScopeDirectory: string | null
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

  function getPreviewNavigationState(current: WorkspacePreviewState) {
    const history = Array.isArray(current.navigationHistory)
      ? current.navigationHistory
      : current.committedUrl
        ? [current.committedUrl]
        : []
    const index = Number.isInteger(current.navigationIndex)
      ? Math.min(Math.max(current.navigationIndex, -1), history.length - 1)
      : history.length - 1

    return { history, index }
  }

  function setPreviewError(
    current: WorkspacePreviewState,
    errorMessage: string | null,
    errorKind: PreviewErrorKind | null,
  ): WorkspacePreviewState {
    return {
      ...current,
      errorKind,
      errorMessage,
    }
  }

  function commitPreviewUrl(current: WorkspacePreviewState, input: string): WorkspacePreviewState {
    const { errorKind, errorMessage, normalizedUrl } = normalizePreviewUrlInput(input)
    if (!normalizedUrl) {
      return setPreviewError(current, errorMessage, errorKind)
    }

    if (current.committedUrl === normalizedUrl) {
      return {
        ...current,
        draftUrl: normalizedUrl,
        errorKind: null,
        errorMessage: null,
        reloadToken: current.reloadToken + 1,
      }
    }

    const { history, index } = getPreviewNavigationState(current)
    const activeHistory = index >= 0 ? history.slice(0, index + 1) : []
    const nextHistory = [...activeHistory, normalizedUrl].slice(-MAX_PREVIEW_NAVIGATION_HISTORY)

    return {
      ...current,
      draftUrl: normalizedUrl,
      committedUrl: normalizedUrl,
      errorKind: null,
      errorMessage: null,
      navigationHistory: nextHistory,
      navigationIndex: nextHistory.length - 1,
    }
  }

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
        errorKind: null,
        errorMessage: null,
      }),
      workspaceID,
    )
  }

  function handlePreviewOpenUrl(url: string, workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState((current) => commitPreviewUrl(current, url), workspaceID)
  }

  function handlePreviewOpen(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState((current) => commitPreviewUrl(current, current.draftUrl || current.committedUrl || ""), workspaceID)
  }

  function handlePreviewReload(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState(
      (current) => current.committedUrl
          ? {
              ...current,
              errorKind: null,
              errorMessage: null,
              reloadToken: current.reloadToken + 1,
            }
        : current,
      workspaceID,
    )
  }

  function handlePreviewBack(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState((current) => {
      const { history, index } = getPreviewNavigationState(current)
      if (index <= 0) return current
      const nextUrl = history[index - 1]
      if (!nextUrl) return current

      return {
        ...current,
        draftUrl: nextUrl,
        committedUrl: nextUrl,
        errorKind: null,
        errorMessage: null,
        navigationHistory: history,
        navigationIndex: index - 1,
      }
    }, workspaceID)
  }

  function handlePreviewForward(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    updatePreviewState((current) => {
      const { history, index } = getPreviewNavigationState(current)
      if (index < 0 || index >= history.length - 1) return current
      const nextUrl = history[index + 1]
      if (!nextUrl) return current

      return {
        ...current,
        draftUrl: nextUrl,
        committedUrl: nextUrl,
        errorKind: null,
        errorMessage: null,
        navigationHistory: history,
        navigationIndex: index + 1,
      }
    }, workspaceID)
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
      frame?: string
      nodePosition?: string
      pageUrl?: string
      screenshotPath?: string | null
      x: number
      y: number
      text: string
      anchor?: PreviewComment["anchor"]
    },
    workspaceID = selectedWorkspace?.id ?? null,
  ) {
    const scopeID = resolvePreviewScopeID(workspaceID)
    const previewState = previewByWorkspaceID[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const trimmedText = input.text.trim()

    setRightSidebarView("preview")
    if (!previewState.committedUrl || !trimmedText) return

    const nextComment: PreviewComment = {
      id: createID("preview-comment"),
      url: previewState.committedUrl,
      pageUrl: input.pageUrl ?? previewState.committedUrl,
      x: input.x,
      y: input.y,
      text: trimmedText,
      createdAt: Date.now(),
      frame: input.frame,
      nodePosition: input.nodePosition,
      screenshotPath: input.screenshotPath ?? null,
      anchor: input.anchor,
    }
    const commentIndex = previewState.comments.filter((comment) => comment.url === nextComment.url).length + 1

    updatePreviewState((current) => {
      if (current.committedUrl !== nextComment.url) return current

      return {
        ...current,
        errorKind: null,
        comments: [...current.comments, nextComment],
        errorMessage: null,
      }
    }, workspaceID)

    if (activeTabKey) {
      const nextReference: ComposerCommentReference = {
        source: "preview",
        id: createID("composer-preview-comment-reference"),
        label: buildPreviewCommentReferenceLabel(nextComment.url, commentIndex),
        title: buildPreviewCommentReferenceTitle(nextComment),
        prompt: `Preview feedback for ${nextComment.pageUrl ?? nextComment.url}`,
        comment: nextComment,
        pageUrl: nextComment.pageUrl ?? nextComment.url,
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
    if (relevantComments.length === 0) return

    setComposerDraftStateByTabKey((current) => {
      let nextDraftState = current[activeTabKey] ?? createEmptyComposerDraftState()
      relevantComments.forEach((comment, index) => {
        const nextReference: ComposerCommentReference = {
          source: "preview",
          id: createID("composer-preview-comment-reference"),
          label: buildPreviewCommentReferenceLabel(comment.url, index + 1),
          title: buildPreviewCommentReferenceTitle(comment),
          prompt: `Preview feedback for ${comment.pageUrl ?? comment.url}`,
          comment,
          pageUrl: comment.pageUrl ?? comment.url,
        }
        nextDraftState = appendComposerTagToDraftState(nextDraftState, createComposerCommentTagData(nextReference))
      })

      return {
        ...current,
        [activeTabKey]: nextDraftState,
      }
    })
  }

  async function handlePreviewOpenExternal(workspaceID = selectedWorkspace?.id ?? null) {
    const openExternalUrl = window.desktop?.openExternalUrl
    if (!openExternalUrl) return

    const scopeID = resolvePreviewScopeID(workspaceID)
    const previewState = previewByWorkspaceID[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const { errorKind, errorMessage, normalizedUrl } = normalizePreviewUrlInput(previewState.committedUrl ?? previewState.draftUrl)

    if (!normalizedUrl) {
      updatePreviewState(
        (current) => ({
          ...current,
          errorKind,
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
          errorKind: null,
          errorMessage: null,
        }),
        workspaceID,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updatePreviewState(
        (current) => ({
          ...current,
          errorKind: "unknown",
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
        linkedLineRange: null,
        pendingComment: null,
      }

      return {
        ...nextState,
        status: value.trim() ? current.status : resolveWorkspaceFileReviewStatus(nextState),
      }
    })
  }

  async function handleWorkspaceFileSelect(path: string, options: WorkspaceFileSelectOptions = {}) {
    const readWorkspaceFile = window.desktop?.readWorkspaceFile
    const scopeDirectory = options.scopeDirectory ?? activeWorkspaceFileScopeDirectory
    const trimmedPath = path.trim()
    if (!readWorkspaceFile || !scopeDirectory || !trimmedPath) return

    const linkedLineRange = options.linkedLineRange ?? null
    const requestID = workspaceFileReadRequestRef.current + 1
    workspaceFileReadRequestRef.current = requestID
    setRightSidebarView("files")
    setWorkspaceFileReviewState((current) => ({
      ...current,
      scopeDirectory,
      selectedFilePath: trimmedPath,
      selectedFileContent: null,
      selectedFileKind: null,
      selectedFileExtension: null,
      comments: [],
      linkedLineRange,
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
        linkedLineRange: nextFile.kind === "text" ? linkedLineRange : null,
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
        linkedLineRange,
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
      linkedLineRange: null,
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
        source: "file",
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

  async function handleActiveSessionDiffFilesRestore(files: string[], sessionID = activeSessionID) {
    const uniqueFiles = [...new Set(files.map((file) => file.trim()).filter(Boolean))]
    if (uniqueFiles.length === 0) return

    const restoreWorkspaceDiffFile = window.desktop?.restoreWorkspaceDiffFile
    if (!restoreWorkspaceDiffFile) {
      throw new Error("Workspace diff restore bridge is unavailable.")
    }
    if (!sessionID || !activeSessionDirectory) {
      throw new Error("Select a session before restoring a file.")
    }

    for (const file of uniqueFiles) {
      await restoreWorkspaceDiffFile({
        directory: activeSessionDirectory,
        file,
      })
    }
    setSelectedDiffFileBySession((prev) => ({
      ...prev,
      [sessionID]: null,
    }))
    await loadSessionDiffForSession(sessionID)
  }

  async function handleActiveSessionDiffFileRestore(file: string, sessionID = activeSessionID) {
    await handleActiveSessionDiffFilesRestore([file], sessionID)
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
    handleActiveSessionDiffFilesRestore,
    handleActiveSessionDiffRefresh,
    handleActiveSessionRuntimeDebugRefresh,
    handlePreviewAddComment,
    handlePreviewBack,
    handlePreviewDeleteComment,
    handlePreviewDraftUrlChange,
    handlePreviewForward,
    handlePreviewInsertCommentsIntoDraft,
    handlePreviewModeChange,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewOpenUrl,
    handlePreviewReload,
    handleWorkspaceFileCommentCancel,
    handleWorkspaceFileCommentChange,
    handleWorkspaceFileCommentConfirm,
    handleWorkspaceFileCommentStart,
    handleWorkspaceFileQueryChange,
    handleWorkspaceFileSelect,
  }
}
