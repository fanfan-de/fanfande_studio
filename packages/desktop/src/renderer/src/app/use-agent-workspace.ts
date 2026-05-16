import { useCallback, useEffect, useRef } from "react"
import { useComposerController } from "./agent-workspace/composer-controller"
import { useComposerDraftState } from "./agent-workspace/composer-draft-state"
import { useReviewPanelController } from "./agent-workspace/review-panel-controller"
import { useReviewPreviewState } from "./agent-workspace/review-preview-state"
import { useSessionLifecycleController } from "./agent-workspace/session-lifecycle-controller"
import { useSessionStreamController } from "./agent-workspace/session-stream-controller"
import { useStreamPermissionController } from "./agent-workspace/stream-permission-controller"
import { useWorkbenchState } from "./agent-workspace/workbench-state"
import { useWorkbenchTabController } from "./agent-workspace/workbench-tab-controller"
import {
  buildWorkspaceDerivedState,
  createCreateSessionTab,
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  getWorkbenchTabKey,
} from "./agent-workspace/workspace-derived-state"
import { useWorkspaceLoadingController } from "./agent-workspace/workspace-loading-controller"
import { useWorkspaceSessionStore } from "./agent-workspace/workspace-session-store"
import { createWorkspaceStore, seedWorkspaceIDs, type WorkspaceStoreApi } from "./agent-workspace/workspace-store"
import { initialSelection } from "./seed-data"
import type { LeftSidebarView, RightSidebarView, SessionDiffSummary, SessionModelSelection, Turn, WorkspaceGroup } from "./types"
import type { ThreadScrollSnapshot } from "./thread/ThreadView"
import { persistUserTurns } from "./user-turn-presentation"
import { updateSessionModelSelectionInWorkspaces } from "./workspace"
import {
  createInitialDockviewLayout,
  writePersistedDockviewLayout,
  type WorkbenchDockviewCommands,
} from "./workbench/dockview-state"

interface UseAgentWorkspaceOptions {
  agentConnected: boolean
  agentDefaultDirectory: string
  disableDockviewPersistence?: boolean
  initialDockviewLayout?: ReturnType<typeof createInitialDockviewLayout> | null
  initialSessionID?: string | null
  isRuntimeDebugEnabled: boolean
  platform: string
}

function createInitialWorkspaceState(shouldUseSeedData: boolean) {
  if (!shouldUseSeedData) {
    return {
      initialComposerTabKey: null,
      initialCreateSessionTab: null,
      initialDockviewLayout: null,
    }
  }

  const initialCreateSessionTab = initialSelection.session === null
    ? createCreateSessionTab(initialSelection.workspace?.id ?? null)
    : null
  const initialWorkbenchTab =
    initialSelection.session !== null
      ? createSessionWorkbenchTab(initialSelection.session.id)
      : initialCreateSessionTab
        ? createCreateSessionWorkbenchTab(initialCreateSessionTab.id)
        : null

  return {
    initialComposerTabKey: initialWorkbenchTab ? getWorkbenchTabKey(initialWorkbenchTab) : null,
    initialCreateSessionTab,
    initialDockviewLayout: initialWorkbenchTab ? createInitialDockviewLayout(initialWorkbenchTab) : null,
  }
}

function buildSessionDiffSummarySignature(diffSummary: SessionDiffSummary | undefined) {
  return diffSummary?.diffs
    .map((diff) => `${diff.file}\u0000${diff.additions}\u0000${diff.deletions}\u0000${diff.patch ?? ""}`)
    .join("\u0001") ?? ""
}

function hydrateTurnDiffSummary(
  turns: Turn[],
  turnID: string,
  diffSummary: SessionDiffSummary,
) {
  let didUpdate = false
  const nextTurns = turns.map((turn) => {
    if (turn.id !== turnID) return turn
    if (buildSessionDiffSummarySignature(turn.diffSummary) === buildSessionDiffSummarySignature(diffSummary)) return turn

    didUpdate = true
    return {
      ...turn,
      diffSummary,
    }
  })

  return didUpdate ? nextTurns : turns
}

function isThreadScrollKeyStale(key: string, validSessionIDs: Set<string>) {
  if (key.startsWith("session:")) {
    return !validSessionIDs.has(key.slice("session:".length))
  }

  if (key.startsWith("side-chat:")) {
    const [, parentSessionID, sideChatSessionID] = key.split(":")
    return !parentSessionID || !sideChatSessionID || !validSessionIDs.has(parentSessionID) || !validSessionIDs.has(sideChatSessionID)
  }

  return false
}

function deleteThreadScrollSnapshotsForSession(
  snapshots: Record<string, ThreadScrollSnapshot>,
  sessionID: string,
) {
  for (const key of Object.keys(snapshots)) {
    if (key === `session:${sessionID}` || key.startsWith(`side-chat:${sessionID}:`) || key.endsWith(`:${sessionID}`)) {
      delete snapshots[key]
    }
  }
}

export function useAgentWorkspace({
  agentConnected,
  agentDefaultDirectory,
  disableDockviewPersistence = false,
  initialDockviewLayout = null,
  initialSessionID = null,
  isRuntimeDebugEnabled,
  platform,
}: UseAgentWorkspaceOptions) {
  const workbenchDockviewCommandsRef = useRef<WorkbenchDockviewCommands | null>(null)
  const dockviewPersistenceTimerRef = useRef<number | null>(null)
  const threadScrollSnapshotsRef = useRef<Record<string, ThreadScrollSnapshot>>({})
  const workspaceStoreRef = useRef<WorkspaceStoreApi | null>(null)
  if (!workspaceStoreRef.current) {
    const hasFolderWorkspaceLoader = Boolean(window.desktop?.listFolderWorkspaces)
    const initialWorkspaceState = createInitialWorkspaceState(!hasFolderWorkspaceLoader)

    workspaceStoreRef.current = createWorkspaceStore({
      hasFolderWorkspaceLoader,
      initialComposerTabKey: initialWorkspaceState.initialComposerTabKey,
      initialCreateSessionTab: initialWorkspaceState.initialCreateSessionTab,
      initialDockviewLayout: initialDockviewLayout ?? initialWorkspaceState.initialDockviewLayout,
    })
  }
  const workspaceStore = workspaceStoreRef.current
  const { dockviewActiveState, dockviewLayout, setDockviewActiveState, setDockviewLayout } = useWorkbenchState({
    store: workspaceStore,
  })
  const handleWorkbenchDockviewCommandsReady = useCallback((commands: WorkbenchDockviewCommands | null) => {
    workbenchDockviewCommandsRef.current = commands
  }, [])
  const readThreadScrollSnapshot = useCallback((key: string) => {
    return threadScrollSnapshotsRef.current[key] ?? null
  }, [])
  const saveThreadScrollSnapshot = useCallback((key: string, snapshot: ThreadScrollSnapshot) => {
    threadScrollSnapshotsRef.current[key] = snapshot
  }, [])
  const clearThreadScrollSnapshotsForSession = useCallback((sessionID: string) => {
    deleteThreadScrollSnapshotsForSession(threadScrollSnapshotsRef.current, sessionID)
  }, [])
  const {
    activeSideChatSessionIDByParentSessionID,
    canLoadSessionHistory,
    createSessionTabs,
    deletingSessionID,
    expandedFolderIDs,
    gitRefreshSuppressedUntilRef,
    hoveredFolderID,
    initialFolderWorkspacesLoadedRef,
    isCreatingProject,
    isInitialWorkspaceLoadPending,
    leftSidebarView,
    pinnedWorkspaceIDs,
    preserveLocalWorkspaceStateOnInitialLoadRef,
    projectRowRefs,
    rightSidebarView,
    selectedFolderID,
    sessionCanvasUnreadBySession,
    setActiveSideChatSessionIDByParentSessionID,
    setCanLoadSessionHistory,
    setCreateSessionTabs,
    setDeletingSessionID,
    setExpandedFolderIDs,
    setHoveredFolderID,
    setIsCreatingProject,
    setIsInitialWorkspaceLoadPending,
    setLeftSidebarView,
    setPinnedWorkspaceIDs,
    setRightSidebarView,
    setSelectedFolderID,
    setSessionCanvasUnreadBySession,
    setWorkspaces,
    watchedWorkspaceDirectoriesKeyRef,
    workspaceRefreshRequestRef,
    workspaceReloadSuppressedUntilRef,
    workspaces,
  } = useWorkspaceSessionStore({ store: workspaceStore })
  const {
    previewByWorkspaceID,
    runtimeDebugRefreshTimerRef,
    runtimeDebugRequestRef,
    selectedDiffFileBySession,
    sessionDiffBySession,
    sessionDiffRefreshTimerRef,
    sessionDiffRequestRef,
    sessionDiffStateBySession,
    sessionRuntimeDebugBySession,
    sessionRuntimeDebugStateBySession,
    setPreviewByWorkspaceID,
    setSelectedDiffFileBySession,
    setSessionDiffBySession,
    setSessionDiffStateBySession,
    setSessionRuntimeDebugBySession,
    setSessionRuntimeDebugStateBySession,
    setWorkspaceFileCommentsByTarget,
    setWorkspaceFileReviewState,
    workspaceFileCommentsByTarget,
    workspaceFileReadRequestRef,
    workspaceFileReviewState,
    workspaceFileSearchRequestRef,
  } = useReviewPreviewState(workspaceStore)
  const {
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    composerRefreshVersion,
    isCreatingSessionByTabKey,
    isSendingByTabKey,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setComposerRefreshVersion,
    setIsCreatingSessionByTabKey,
    setIsSendingByTabKey,
  } = useComposerDraftState({ store: workspaceStore })
  const {
    agentSessionStoreRef,
    agentSessions,
    cancellingSessionIDs,
    contextUsageBySession,
    conversationVersionRef,
    conversations,
    historyRequestRef,
    lastFocusedSessionIDRef,
    pendingPermissionRequestsBySession,
    pendingStreamsRef,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    permissionRequestsRequestRef,
    sessionDataLoadCacheRef,
    sessionDirectoryBySession,
    sessionEventRouterRef,
    setAgentSessions,
    setCancellingSessionIDs,
    setContextUsageBySession,
    setConversations,
    setPendingPermissionRequestsBySession,
    setPermissionRequestActionError,
    setPermissionRequestActionRequestID,
    setSessionDirectoryBySession,
    skipNextHistoryLoadRef,
    subscribedSessionStreamsRef,
  } = useStreamPermissionController({ initialSessionID: initialSelection.session?.id ?? null, store: workspaceStore })
  const {
    activeCreateSessionTab,
    activeCreateSessionTabID,
    activePendingPermissionRequests,
    activePreviewState,
    activeSession,
    activeSessionContextUsage,
    activeSessionDiff,
    activeSessionDiffState,
    activeSessionDirectory,
    activeSessionID,
    activeSessionIsSideChat,
    activeSessionRuntimeDebug,
    activeSessionRuntimeDebugState,
    activeSessionSelectedDiffFile,
    activeSideChatAttachments,
    activeSideChatCountsByAnchorMessageID,
    activeSideChatDraftState,
    activeSideChatIsCancelling,
    activeSideChatIsInterruptible,
    activeSideChatIsSending,
    activeSideChatPendingPermissionRequests,
    activeSideChatSession,
    activeSideChatSessionsByAnchorMessageID,
    activeSideChatTabKey,
    activeSideChatTurns,
    activeTabKey,
    activeWorkspace,
    activeWorkspaceFileScopeDirectory,
    activeWorkspaceFileScopeName,
    activeWorkspaceFileState,
    activeTurns,
    canvasSessionTabs,
    canInsertPreviewInteractionsIntoDraft,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerAttachments,
    createSessionTitle,
    createSessionWorkspaceID,
    draftState,
    focusedPane,
    focusedPaneID,
    isCreateSessionTabActive,
    isCancelling,
    isCreatingSession,
    isInterruptible,
    isSending,
    openCanvasSessionIDs,
    runningSessionIDs,
    selectedProjectID,
    selectedWorkspace,
    visibleCanvasSessionIDs,
    workbenchPanelStateByID,
    workbenchPaneStateByID,
    workbenchPaneStates,
  } = buildWorkspaceDerivedState({
    activeSideChatSessionIDByParentSessionID,
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    contextUsageBySession,
    conversations,
    createSessionTabs,
    isCreatingSessionByTabKey,
    isInitialWorkspaceLoadPending,
    isSendingByTabKey,
    cancellingSessionIDs,
    pendingPermissionRequestsBySession,
    platform,
    previewByWorkspaceID,
    selectedDiffFileBySession,
    selectedFolderID,
    sessionDiffBySession,
    sessionDiffStateBySession,
    sessionDirectoryBySession,
    sessionRuntimeDebugBySession,
    sessionRuntimeDebugStateBySession,
    seedWorkspaceIDs,
    dockviewActiveState,
    dockviewLayout,
    workspaceFileCommentsByTarget,
    workspaceFileReviewState,
    workspaces,
  })

  const visibleCanvasSessionKey = visibleCanvasSessionIDs.join("\0")

  useEffect(() => {
    if (dockviewPersistenceTimerRef.current !== null) {
      window.clearTimeout(dockviewPersistenceTimerRef.current)
      dockviewPersistenceTimerRef.current = null
    }
    if (isInitialWorkspaceLoadPending || disableDockviewPersistence) return

    dockviewPersistenceTimerRef.current = window.setTimeout(() => {
      dockviewPersistenceTimerRef.current = null
      writePersistedDockviewLayout(dockviewLayout)
    }, 200)

    return () => {
      if (dockviewPersistenceTimerRef.current !== null) {
        window.clearTimeout(dockviewPersistenceTimerRef.current)
        dockviewPersistenceTimerRef.current = null
      }
    }
  }, [disableDockviewPersistence, dockviewLayout, isInitialWorkspaceLoadPending])

  useEffect(() => {
    const visibleSessionIDs = new Set(visibleCanvasSessionIDs)
    const validSessionIDs = new Set(
      workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id)),
    )

    setSessionCanvasUnreadBySession((current) => {
      let changed = false
      const next: Record<string, boolean> = {}

      for (const [sessionID, unread] of Object.entries(current)) {
        if (!unread || visibleSessionIDs.has(sessionID) || !validSessionIDs.has(sessionID)) {
          changed = true
          continue
        }

        next[sessionID] = unread
      }

      return changed ? next : current
    })
  }, [setSessionCanvasUnreadBySession, visibleCanvasSessionKey, workspaces])

  useEffect(() => {
    const validSessionIDs = new Set(
      workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id)),
    )

    for (const key of Object.keys(threadScrollSnapshotsRef.current)) {
      if (isThreadScrollKeyStale(key, validSessionIDs)) {
        delete threadScrollSnapshotsRef.current[key]
      }
    }
  }, [workspaces])

  function markSessionCanvasUnread(sessionID: string) {
    if (visibleCanvasSessionIDs.includes(sessionID)) return
    if (!workspaces.some((workspace) => workspace.sessions.some((session) => session.id === sessionID))) return

    setSessionCanvasUnreadBySession((current) => (
      current[sessionID]
        ? current
        : {
            ...current,
            [sessionID]: true,
          }
    ))
  }

  const streamController = useSessionStreamController({
    agentConnected,
    agentDefaultDirectory,
    agentSessionStoreRef,
    agentSessions,
    canLoadSessionHistory,
    contextUsageBySession,
    conversationVersionRef,
    conversations,
    historyRequestRef,
    isRuntimeDebugEnabled,
    openCanvasSessionIDs,
    onSessionCanvasActivity: markSessionCanvasUnread,
    pendingStreamsRef,
    permissionRequestsRequestRef,
    platform,
    runtimeDebugRefreshTimerRef,
    runtimeDebugRequestRef,
    sessionDiffBySession,
    sessionDiffRefreshTimerRef,
    sessionDiffRequestRef,
    sessionDirectoryBySession,
    sessionDataLoadCacheRef,
    sessionEventRouterRef,
    sessionRuntimeDebugBySession,
    setAgentSessions,
    setCancellingSessionIDs,
    setCanLoadSessionHistory,
    setContextUsageBySession,
    setConversations,
    setPendingPermissionRequestsBySession,
    setSessionDiffBySession,
    setSessionDiffStateBySession,
    setSessionDirectoryBySession,
    setSessionRuntimeDebugBySession,
    setSessionRuntimeDebugStateBySession,
    setWorkspaces,
    skipNextHistoryLoadRef,
    subscribedSessionStreamsRef,
    workspaceRefreshRequestRef,
    workspaces,
  })
  const {
    appendConversationTurns,
    clearRuntimeDebugRefreshTimer,
    clearSessionDiffRefreshTimer,
    ensurePendingPermissionRequestsLoaded,
    ensureSessionHistoryLoaded,
    loadPendingPermissionRequestsForSession,
    loadSessionDiffForSession,
    loadSessionRuntimeDebugForSession,
    refreshWorkspaceForSession,
    refreshWorkspaceFromDirectory,
    reloadSessionHistoryForSession,
    scheduleSessionDiffRefreshForSession,
    updateAssistantConversationTurn,
  } = streamController

  useWorkspaceLoadingController({
    activeSessionDirectory,
    activeSessionID,
    activeWorkspace,
    createCreateSessionTab,
    createCreateSessionWorkbenchTab,
    createSessionWorkbenchTab,
    gitRefreshSuppressedUntilRef,
    initialFolderWorkspacesLoadedRef,
    initialDockviewLayout,
    initialSessionID,
    isInitialWorkspaceLoadPending,
    lastFocusedSessionIDRef,
    platform,
    preserveLocalWorkspaceStateOnInitialLoadRef,
    refreshWorkspaceFromDirectory,
    scheduleSessionDiffRefreshForSession,
    setAgentSessions,
    setCanLoadSessionHistory,
    setConversations,
    setCreateSessionTabs,
    setExpandedFolderIDs,
    setIsInitialWorkspaceLoadPending,
    setSelectedFolderID,
    setSessionDiffStateBySession,
    setSessionDirectoryBySession,
    setDockviewLayout,
    setWorkspaces,
    watchedWorkspaceDirectoriesKeyRef,
    workspaceReloadSuppressedUntilRef,
    workspaces,
  })

  const {
    focusExistingCreateSessionTabAcrossPanes,
    focusSession,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCloseCreateSessionTab,
    handleCreateSessionTabSelect,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleOpenCreateSessionTab,
    handleDockviewActiveChange,
    handleMovePanelIntoSurface,
    handleMovePanelOutOfSurface,
    handlePaneFocus,
    handlePaneSplit,
    handlePaneTabDrop,
    handleSplitResize,
    openCreateSessionTab,
  } = useWorkbenchTabController({
    activeCreateSessionTab,
    activeCreateSessionTabID,
    activeSessionID,
    activeWorkspace,
    createSessionTabs,
    dockviewActiveState,
    dockviewLayout,
    focusedPane,
    focusedPaneID,
    isCreateSessionTabActive,
    lastFocusedSessionIDRef,
    projectRowRefs,
    selectedFolderID,
    setCreateSessionTabs,
    setDockviewActiveState,
    setDockviewLayout,
    setExpandedFolderIDs,
    setSelectedFolderID,
    workbenchDockviewCommandsRef,
    workspaces,
  })

  const {
    createSessionForWorkspace,
    handleCreateSessionSubmit,
    handleCreateSideChatTab,
    handleDeleteSideChatTab,
    handleOpenSideChat,
    handleOpenSideChatInTab,
    handleProjectClick,
    handleProjectArchiveSessions,
    handleProjectCreateSession,
    handleProjectOpenInExplorer,
    handleProjectRemove,
    handleSessionDelete,
    handleSessionSelect,
    handleSelectSideChatTab,
    handleSidebarAction,
  } = useSessionLifecycleController({
    activeCreateSessionTab,
    activeCreateSessionTabID,
    activeSessionID,
    activeSideChatSessionIDByParentSessionID,
    activeWorkspace,
    agentSessionStoreRef,
    canLoadSessionHistory,
    conversationVersionRef,
    createSessionTabs,
    createSessionWorkspaceID,
    deletingSessionID,
    dockviewLayout,
    expandedFolderIDs,
    focusExistingCreateSessionTabAcrossPanes,
    focusSession,
    focusedPane,
    focusedPaneID,
    handleCreateSessionWorkspaceChange,
    historyRequestRef,
    initialFolderWorkspacesLoadedRef,
    isCreateSessionTabActive,
    isCreatingProject,
    isCreatingSessionByTabKey,
    lastFocusedSessionIDRef,
    ensurePendingPermissionRequestsLoaded,
    ensureSessionHistoryLoaded,
    openCreateSessionTab,
    pendingStreamsRef,
    permissionRequestsRequestRef,
    preserveLocalWorkspaceStateOnInitialLoadRef,
    runtimeDebugRequestRef,
    sessionDiffRequestRef,
    sessionDataLoadCacheRef,
    sessionEventRouterRef,
    setActiveSideChatSessionIDByParentSessionID,
    setAgentSessions,
    setCanLoadSessionHistory,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setContextUsageBySession,
    setConversations,
    setCreateSessionTabs,
    setDeletingSessionID,
    setExpandedFolderIDs,
    setHoveredFolderID,
    setIsCreatingProject,
    setIsCreatingSessionByTabKey,
    setIsSendingByTabKey,
    setPendingPermissionRequestsBySession,
    setSelectedDiffFileBySession,
    setSelectedFolderID,
    setSessionDiffBySession,
    setSessionDiffStateBySession,
    setSessionDirectoryBySession,
    setSessionRuntimeDebugBySession,
    setSessionRuntimeDebugStateBySession,
    setDockviewLayout,
    setWorkspaces,
    clearRuntimeDebugRefreshTimer,
    clearSessionDiffRefreshTimer,
    selectedFolderID,
    selectedWorkspace,
    skipNextHistoryLoadRef,
    subscribedSessionStreamsRef,
    workbenchDockviewCommandsRef,
    workspaces,
  })

  const {
    handleApproveProposedPlan,
    handleCancelSend,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handleRemoveComposerAttachment,
    handlePlanModeToggle,
    handleSend,
    setDraft,
    setDraftForTab,
  } = useComposerController({
    activeCreateSessionTabID,
    activeSessionID,
    activeTabKey,
    agentConnected,
    agentDefaultDirectory,
    agentSessions,
    cancellingSessionIDs,
    appendConversationTurns,
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    createSessionForWorkspace,
    createSessionTabs,
    getConversationTurns: (sessionID) => conversations[sessionID] ?? [],
    isSendingByTabKey,
    loadPendingPermissionRequestsForSession,
    loadSessionDiffForSession,
    loadSessionRuntimeDebugForSession,
    pendingPermissionRequestsBySession,
    pendingStreamsRef,
    permissionRequestActionRequestID,
    permissionRequestsRequestRef,
    platform,
    refreshWorkspaceForSession,
    refreshWorkspaceFromDirectory,
    reloadSessionHistoryForSession,
    sessionDirectoryBySession,
    setAgentSessions,
    setCancellingSessionIDs,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setCreateSessionTabs,
    setIsSendingByTabKey,
    setPendingPermissionRequestsBySession,
    setPermissionRequestActionError,
    setPermissionRequestActionRequestID,
    setSessionDirectoryBySession,
    setWorkspaces,
    updateAssistantConversationTurn,
    workspaces,
  })

  const {
    handleActiveSessionDiffFileSelect,
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
    handleActiveSessionDiffFileRestore,
    handleActiveSessionDiffFilesRestore,
    handleActiveSessionDiffPatchesReverseApply,
  } = useReviewPanelController({
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
  })

  function handleLeftSidebarViewChange(nextView: LeftSidebarView) {
    setLeftSidebarView(nextView)
  }

  function handleRightSidebarViewChange(nextView: RightSidebarView) {
    setRightSidebarView(nextView)
  }

  function handleProjectPin(workspace: WorkspaceGroup) {
    setPinnedWorkspaceIDs((current) => [workspace.id, ...current.filter((workspaceID) => workspaceID !== workspace.id)])
  }

  function invalidateProjectComposer() {
    setComposerRefreshVersion((current) => current + 1)
  }

  function refreshComposerModels() {
    invalidateProjectComposer()
  }

  function refreshComposerSkills() {
    invalidateProjectComposer()
  }

  function refreshComposerMcp() {
    invalidateProjectComposer()
  }

  function handleSessionModelSelectionChange(
    sessionID: string,
    selection: SessionModelSelection | undefined,
  ) {
    setWorkspaces((current) => updateSessionModelSelectionInWorkspaces(current, sessionID, selection))
  }

  function handleTurnDiffSummaryHydrate(
    turnID: string,
    diffSummary: SessionDiffSummary,
    sessionID = activeSessionID,
  ) {
    if (!sessionID) return

    setConversations((prev) => {
      const currentTurns = prev[sessionID] ?? []
      const nextTurns = hydrateTurnDiffSummary(currentTurns, turnID, diffSummary)
      if (nextTurns === currentTurns) return prev

      persistUserTurns(sessionID, nextTurns)
      return {
        ...prev,
        [sessionID]: nextTurns,
      }
    })
  }

  function handleCanvasSessionTabCloseWithScrollCleanup(sessionID: string, paneID?: string) {
    clearThreadScrollSnapshotsForSession(sessionID)
    handleCanvasSessionTabClose(sessionID)
  }

  return {
    activeCreateSessionTabID,
    activePreviewState,
    activeSession,
    activeSessionDirectory,
    activeSessionContextUsage,
    activeSessionDiff,
    activeSessionDiffState,
    activeSessionRuntimeDebug,
    activeSessionRuntimeDebugState,
    activePendingPermissionRequests,
    activeSideChatAttachments,
    activeSessionSelectedDiffFile,
    activeSideChatDraftState,
    activeSideChatIsCancelling,
    activeSideChatIsInterruptible,
    activeSideChatIsSending,
    activeSessionIsSideChat,
    activeSideChatCountsByAnchorMessageID,
    activeSideChatPendingPermissionRequests,
    activeSideChatSession,
    activeSideChatSessionsByAnchorMessageID,
    activeSideChatTabKey,
    activeSideChatTurns,
    activeWorkspaceFileScopeDirectory,
    activeWorkspaceFileScopeName,
    activeWorkspaceFileState,
    activeTurns,
    canvasSessionTabs,
    canInsertPreviewInteractionsIntoDraft,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerAttachments,
    composerRefreshVersion,
    createSessionTabs,
    createSessionTitle,
    createSessionWorkspaceID,
    deletingSessionID,
    draftState,
    expandedFolderIDs,
    handleCanvasSessionTabClose: handleCanvasSessionTabCloseWithScrollCleanup,
    handleCanvasSessionTabSelect,
    handleCancelSend,
    handleCreateSessionTabSelect,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSideChatTab,
    handleDeleteSideChatTab,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenSideChat,
    handleOpenSideChatInTab,
    handleOpenCreateSessionTab,
    handleMovePanelIntoSurface,
    handleMovePanelOutOfSurface,
    handlePaneFocus,
    handleDockviewActiveChange,
    handleSplitResize,
    handlePaneTabDrop,
    handlePaneSplit,
    handleApproveProposedPlan,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
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
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectArchiveSessions,
    handleProjectOpenInExplorer,
    handleProjectPin,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handlePlanModeToggle,
    handleSessionDelete,
    handleSessionSelect,
    handleSelectSideChatTab,
    handleSidebarAction,
    handleSessionModelSelectionChange,
    handleTurnDiffSummaryHydrate,
    readThreadScrollSnapshot,
    saveThreadScrollSnapshot,
    focusedPaneID,
    hoveredFolderID,
    isCreateSessionTabActive,
    isCancelling,
    isCreatingProject,
    isCreatingSession,
    isInterruptible,
    isResolvingPermissionRequest: permissionRequestActionRequestID !== null,
    isSending,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    pinnedWorkspaceIDs,
    projectRowRefs,
    refreshComposerMcp,
    refreshComposerModels,
    refreshComposerSkills,
    refreshWorkspaceFromDirectory,
    rightSidebarView,
    runningSessionIDs,
    selectedProjectID,
    selectedWorkspace,
    selectedFolderID,
    sessionCanvasUnreadBySession,
    setDraft,
    setDraftForTab,
    setHoveredFolderID,
    handleWorkbenchDockviewCommandsReady,
    setDockviewLayout,
    dockviewActiveState,
    visibleCanvasSessionIDs,
    dockviewLayout,
    workbenchPanelStateByID,
    workbenchPaneStateByID,
    workbenchPaneStates,
    workspaces,
  }
}
