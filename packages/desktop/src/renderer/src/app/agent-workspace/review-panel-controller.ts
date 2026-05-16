import { useDeferredValue, useRef, type MutableRefObject } from "react"
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
  formatPreviewInteractionReferenceLabel,
  formatPreviewInteractionReferenceTitle,
  getPreviewInteractionPlugins,
  getPreviewInteractionPageUrl,
} from "../preview/interactions/registry"
import {
  normalizePreviewUrlInput,
} from "../preview/utils"
import type {
  ComposerCommentReference,
  ComposerDraftState,
  PreviewInteractionCommitInput,
  PreviewInteractionPluginID,
  PreviewInteractionRecord,
  RightSidebarView,
  SessionDiffFile,
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

function formatReverseApplyFailureMessage(result: {
  restored: Array<{ file: string }>
  failed: Array<{ file: string; message: string }>
}) {
  const failedDetails = result.failed
    .map((failure) => `${failure.file}: ${failure.message}`)
    .join("；")
  return `已撤销 ${result.restored.length} 个文件；${result.failed.length} 个文件无法自动反向应用变更：${failedDetails}`
}

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
  const previewResolveRequestRef = useRef(0)

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
        draftTarget: value,
        errorKind: null,
        errorMessage: null,
      }),
      workspaceID,
    )
  }

  async function handlePreviewOpenTarget(
    value: string,
    workspaceID = selectedWorkspace?.id ?? null,
    workspaceRootOverride?: string | null,
  ) {
    setRightSidebarView("preview")
    const trimmedValue = value.trim()
    const workspaceRoot = workspaceRootOverride ?? selectedWorkspace?.directory ?? activeSessionDirectory ?? null
    const resolvePreviewTarget = window.desktop?.resolvePreviewTarget
    const requestID = previewResolveRequestRef.current + 1
    previewResolveRequestRef.current = requestID

    if (!trimmedValue) {
      updatePreviewState(
        (current) => ({
          ...current,
          activeInteractionID: null,
          activeTargetInput: null,
          draftTarget: value,
          draftUrl: value,
          errorKind: "empty-url",
          errorMessage: "Enter a URL, Artifact link, or workspace file path to preview.",
          resolvedTarget: null,
          status: "error",
        }),
        workspaceID,
      )
      return
    }

    if (!resolvePreviewTarget) {
      updatePreviewState(
        (current) => ({
          ...current,
          activeInteractionID: null,
          activeTargetInput: trimmedValue,
          draftTarget: trimmedValue,
          draftUrl: trimmedValue,
          errorKind: "unknown",
          errorMessage: "Preview resolver is unavailable in this runtime.",
          resolvedTarget: null,
          status: "error",
        }),
        workspaceID,
      )
      return
    }

    updatePreviewState(
      (current) => ({
        ...current,
        activeInteractionID: null,
        activeTargetInput: trimmedValue,
        draftTarget: trimmedValue,
        draftUrl: trimmedValue,
        errorKind: null,
        errorMessage: null,
        status: "resolving",
      }),
      workspaceID,
    )

    try {
      const resolvedTarget = await resolvePreviewTarget({
        value: trimmedValue,
        workspaceRoot,
      })
      if (previewResolveRequestRef.current !== requestID) return

      updatePreviewState(
        (current) => ({
          ...current,
          activeInteractionID: null,
          activeTargetInput: trimmedValue,
          committedUrl: resolvedTarget.kind === "url" ? resolvedTarget.safePreviewUrl ?? resolvedTarget.normalizedInput : null,
          draftTarget: resolvedTarget.normalizedInput || trimmedValue,
          draftUrl: resolvedTarget.normalizedInput || trimmedValue,
          errorKind: null,
          errorMessage: null,
          reloadToken: current.reloadToken + 1,
          resolvedTarget,
          status: "ready",
        }),
        workspaceID,
      )
    } catch (error) {
      if (previewResolveRequestRef.current !== requestID) return
      const message = error instanceof Error ? error.message : String(error)
      updatePreviewState(
        (current) => ({
          ...current,
          activeInteractionID: null,
          committedUrl: null,
          errorKind: "unknown",
          errorMessage: message,
          resolvedTarget: null,
          status: "error",
        }),
        workspaceID,
      )
    }
  }

  function handlePreviewOpenUrl(url: string, workspaceID = selectedWorkspace?.id ?? null) {
    void handlePreviewOpenTarget(url, workspaceID)
  }

  function handlePreviewOpen(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    const previewState = previewByWorkspaceID[resolvePreviewScopeID(workspaceID)] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    void handlePreviewOpenTarget(previewState.draftTarget || previewState.draftUrl || previewState.committedUrl || "", workspaceID)
  }

  function handlePreviewReload(workspaceID = selectedWorkspace?.id ?? null) {
    setRightSidebarView("preview")
    const previewState = previewByWorkspaceID[resolvePreviewScopeID(workspaceID)] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const target = previewState.activeTargetInput ?? previewState.resolvedTarget?.normalizedInput ?? previewState.draftTarget
    if (target) {
      void handlePreviewOpenTarget(target, workspaceID, previewState.resolvedTarget?.workspaceRoot ?? undefined)
    }
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

  function handlePreviewActiveInteractionChange(
    pluginID: PreviewInteractionPluginID | null,
    workspaceID = selectedWorkspace?.id ?? null,
  ) {
    setRightSidebarView("preview")
    updatePreviewState(
      (current) => ({
        ...current,
        activeInteractionID: pluginID,
      }),
      workspaceID,
    )
  }

  function createPreviewInteractionReference(
    interaction: PreviewInteractionRecord,
    interactionIndex: number,
  ): ComposerCommentReference {
    const pageUrl = getPreviewInteractionPageUrl(interaction)
    return {
      source: "preview",
      id: createID("composer-preview-interaction-reference"),
      label: formatPreviewInteractionReferenceLabel(interaction, interactionIndex),
      title: formatPreviewInteractionReferenceTitle(interaction),
      prompt: `Preview feedback for ${pageUrl}`,
      interaction,
      pageUrl,
    }
  }

  function handlePreviewCommitInteraction(
    input: PreviewInteractionCommitInput,
    workspaceID = selectedWorkspace?.id ?? null,
  ) {
    const scopeID = resolvePreviewScopeID(workspaceID)
    const previewState = previewByWorkspaceID[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE

    setRightSidebarView("preview")
    if (!previewState.resolvedTarget) return

    const nextInteraction: PreviewInteractionRecord = {
      createdAt: Date.now(),
      id: createID("preview-interaction"),
      ...input,
    }
    const interactionIndex = previewState.interactions.filter((interaction) =>
      interaction.pluginID === nextInteraction.pluginID && interaction.targetKey === nextInteraction.targetKey
    ).length + 1

    updatePreviewState((current) => {
      if (current.resolvedTarget?.normalizedInput !== previewState.resolvedTarget?.normalizedInput) return current

      return {
        ...current,
        errorKind: null,
        interactions: [...current.interactions, nextInteraction],
        errorMessage: null,
      }
    }, workspaceID)

    if (activeTabKey) {
      const nextReference = createPreviewInteractionReference(nextInteraction, interactionIndex)

      setComposerDraftStateByTabKey((current) => ({
        ...current,
        [activeTabKey]: appendComposerTagToDraftState(
          current[activeTabKey] ?? createEmptyComposerDraftState(),
          createComposerCommentTagData(nextReference),
        ),
      }))
    }
  }

  function handlePreviewDeleteInteraction(interactionID: string, workspaceID = selectedWorkspace?.id ?? null) {
    updatePreviewState(
      (current) => ({
        ...current,
        interactions: current.interactions.filter((interaction) => interaction.id !== interactionID),
      }),
      workspaceID,
    )
  }

  function handlePreviewInsertInteractionsIntoDraft(workspaceID = selectedWorkspace?.id ?? null) {
    if (!activeTabKey) return

    const previewState = previewByWorkspaceID[resolvePreviewScopeID(workspaceID)] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const target = previewState.resolvedTarget
    if (!target) return

    const targetKeys = new Set(getPreviewInteractionPlugins(target).map((plugin) => plugin.resolveTargetKey(target)))
    const relevantInteractions = previewState.interactions.filter((interaction) => targetKeys.has(interaction.targetKey))
    if (relevantInteractions.length === 0) return

    setComposerDraftStateByTabKey((current) => {
      let nextDraftState = current[activeTabKey] ?? createEmptyComposerDraftState()
      relevantInteractions.forEach((interaction, index) => {
        const nextReference = createPreviewInteractionReference(interaction, index + 1)
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
    const openPath = window.desktop?.openPath

    const scopeID = resolvePreviewScopeID(workspaceID)
    const previewState = previewByWorkspaceID[scopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
    const externalTarget = previewState.resolvedTarget?.externalOpenTarget

    if (externalTarget?.kind === "path" && openPath) {
      try {
        await openPath({ targetPath: externalTarget.value })
        updatePreviewState(
          (current) => ({
            ...current,
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
      return
    }

    if (!openExternalUrl) return

    if (externalTarget?.kind === "url") {
      try {
        await openExternalUrl({ url: externalTarget.value })
        updatePreviewState(
          (current) => ({
            ...current,
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
      return
    }

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

  async function handleActiveSessionDiffPatchesReverseApply(diffs: SessionDiffFile[], sessionID = activeSessionID) {
    const patchDiffs = diffs
      .map((diff) => ({
        file: diff.file.trim(),
        ...(diff.patch?.trim() ? { patch: diff.patch } : {}),
      }))
      .filter((diff) => diff.file)
    if (patchDiffs.length === 0) return

    const reverseApplyWorkspaceDiffPatches = window.desktop?.reverseApplyWorkspaceDiffPatches
    if (!reverseApplyWorkspaceDiffPatches) {
      throw new Error("Workspace diff reverse-apply bridge is unavailable.")
    }
    if (!sessionID || !activeSessionDirectory) {
      throw new Error("Select a session before restoring a file.")
    }

    let result: Awaited<ReturnType<typeof reverseApplyWorkspaceDiffPatches>> | null = null
    try {
      result = await reverseApplyWorkspaceDiffPatches({
        directory: activeSessionDirectory,
        diffs: patchDiffs,
      })
    } finally {
      setSelectedDiffFileBySession((prev) => ({
        ...prev,
        [sessionID]: null,
      }))
      await loadSessionDiffForSession(sessionID)
    }

    if (result.failed.length > 0) {
      throw new Error(formatReverseApplyFailureMessage(result))
    }
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
    handleActiveSessionDiffPatchesReverseApply,
    handleActiveSessionDiffRefresh,
    handleActiveSessionRuntimeDebugRefresh,
    handlePreviewActiveInteractionChange,
    handlePreviewBack,
    handlePreviewCommitInteraction,
    handlePreviewDeleteInteraction,
    handlePreviewDraftUrlChange,
    handlePreviewForward,
    handlePreviewInsertInteractionsIntoDraft,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewOpenTarget,
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
