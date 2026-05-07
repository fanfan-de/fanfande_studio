import { useEffect, useRef } from "react"
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
  createWorkbenchPane,
  getWorkbenchTabKey,
} from "./agent-workspace/workspace-derived-state"
import { useWorkspaceLoadingController } from "./agent-workspace/workspace-loading-controller"
import { useWorkspaceSessionStore } from "./agent-workspace/workspace-session-store"
import { createWorkspaceStore, seedWorkspaceIDs, type WorkspaceStoreApi } from "./agent-workspace/workspace-store"
import { initialSelection } from "./seed-data"
import type { LeftSidebarView, RightSidebarView, SessionModelSelection } from "./types"
import { updateSessionModelSelectionInWorkspaces } from "./workspace"
import { createWorkbenchLayoutFromLegacyPanes } from "./workbench/core"

interface UseAgentWorkspaceOptions {
  agentConnected: boolean
  agentDefaultDirectory: string
  isRuntimeDebugEnabled: boolean
  platform: string
}

function createInitialWorkspaceState(shouldUseSeedData: boolean) {
  if (!shouldUseSeedData) {
    return {
      initialComposerTabKey: null,
      initialCreateSessionTab: null,
      initialWorkbenchLayout: createWorkbenchLayoutFromLegacyPanes([]),
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
  const initialWorkbenchPane = initialWorkbenchTab ? createWorkbenchPane([initialWorkbenchTab]) : null

  return {
    initialComposerTabKey: initialWorkbenchTab ? getWorkbenchTabKey(initialWorkbenchTab) : null,
    initialCreateSessionTab,
    initialWorkbenchLayout: createWorkbenchLayoutFromLegacyPanes(initialWorkbenchPane ? [initialWorkbenchPane] : []),
  }
}

export function useAgentWorkspace({
  agentConnected,
  agentDefaultDirectory,
  isRuntimeDebugEnabled,
  platform,
}: UseAgentWorkspaceOptions) {
  const workspaceStoreRef = useRef<WorkspaceStoreApi | null>(null)
  if (!workspaceStoreRef.current) {
    const hasFolderWorkspaceLoader = Boolean(window.desktop?.listFolderWorkspaces)
    const initialWorkspaceState = createInitialWorkspaceState(!hasFolderWorkspaceLoader)

    workspaceStoreRef.current = createWorkspaceStore({
      hasFolderWorkspaceLoader,
      initialComposerTabKey: initialWorkspaceState.initialComposerTabKey,
      initialCreateSessionTab: initialWorkspaceState.initialCreateSessionTab,
      initialWorkbenchLayout: initialWorkspaceState.initialWorkbenchLayout,
    })
  }
  const workspaceStore = workspaceStoreRef.current
  const { workbenchLayout, setWorkbenchLayout } = useWorkbenchState({ store: workspaceStore })
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
    sessionDirectoryBySession,
    sessionEventRouterRef,
    setAgentSessions,
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
    activeSideChatIsSending,
    activeSideChatPendingPermissionRequests,
    activeSideChatSession,
    activeSideChatTabKey,
    activeSideChatTurns,
    activeTabKey,
    activeWorkspace,
    activeWorkspaceFileScopeDirectory,
    activeWorkspaceFileScopeName,
    activeWorkspaceFileState,
    activeTurns,
    canvasSessionTabs,
    canInsertPreviewCommentsIntoDraft,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerAttachments,
    createSessionTitle,
    createSessionWorkspaceID,
    draftState,
    focusedPane,
    focusedPaneID,
    isCreateSessionTabActive,
    isCreatingSession,
    isSending,
    openCanvasSessionIDs,
    runningSessionIDs,
    selectedProjectID,
    selectedWorkspace,
    visibleCanvasSessionIDs,
    workbenchPanes,
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
    workbenchLayout,
    workspaceFileCommentsByTarget,
    workspaceFileReviewState,
    workspaces,
  })

  const visibleCanvasSessionKey = visibleCanvasSessionIDs.join("\0")

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
    activeSessionID,
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
    sessionEventRouterRef,
    sessionRuntimeDebugBySession,
    setAgentSessions,
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
    setWorkbenchLayout,
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
    focusedPane,
    focusedPaneID,
    isCreateSessionTabActive,
    lastFocusedSessionIDRef,
    projectRowRefs,
    selectedFolderID,
    setCreateSessionTabs,
    setExpandedFolderIDs,
    setSelectedFolderID,
    setWorkbenchLayout,
    workbenchLayout,
    workbenchPanes,
    workspaces,
  })

  const {
    createSessionForWorkspace,
    handleCreateSessionSubmit,
    handleOpenSideChat,
    handleOpenSideChatInTab,
    handleProjectClick,
    handleProjectCreateSession,
    handleProjectRemove,
    handleSessionDelete,
    handleSessionSelect,
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
    expandedFolderIDs,
    focusExistingCreateSessionTabAcrossPanes,
    focusSession,
    focusedPane,
    handleCreateSessionWorkspaceChange,
    initialFolderWorkspacesLoadedRef,
    isCreateSessionTabActive,
    isCreatingProject,
    isCreatingSessionByTabKey,
    lastFocusedSessionIDRef,
    loadPendingPermissionRequestsForSession,
    openCreateSessionTab,
    pendingStreamsRef,
    permissionRequestsRequestRef,
    preserveLocalWorkspaceStateOnInitialLoadRef,
    reloadSessionHistoryForSession,
    runtimeDebugRequestRef,
    sessionDiffRequestRef,
    sessionEventRouterRef,
    setActiveSideChatSessionIDByParentSessionID,
    setAgentSessions,
    setCanLoadSessionHistory,
    setContextUsageBySession,
    setConversations,
    setCreateSessionTabs,
    setDeletingSessionID,
    setExpandedFolderIDs,
    setHoveredFolderID,
    setIsCreatingProject,
    setIsCreatingSessionByTabKey,
    setPendingPermissionRequestsBySession,
    setSelectedDiffFileBySession,
    setSelectedFolderID,
    setSessionDiffBySession,
    setSessionDiffStateBySession,
    setSessionDirectoryBySession,
    setSessionRuntimeDebugBySession,
    setSessionRuntimeDebugStateBySession,
    setWorkbenchLayout,
    setWorkspaces,
    clearRuntimeDebugRefreshTimer,
    clearSessionDiffRefreshTimer,
    selectedFolderID,
    selectedWorkspace,
    skipNextHistoryLoadRef,
    subscribedSessionStreamsRef,
    workbenchLayout,
    workbenchPanes,
    workspaces,
  })

  const {
    handleCancelSend,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handleRemoveComposerAttachment,
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
    appendConversationTurns,
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    createSessionForWorkspace,
    createSessionTabs,
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
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
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
    handleActiveSessionDiffFileRestore,
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
    activeSideChatIsSending,
    activeSessionIsSideChat,
    activeSideChatCountsByAnchorMessageID,
    activeSideChatPendingPermissionRequests,
    activeSideChatSession,
    activeSideChatTabKey,
    activeSideChatTurns,
    activeWorkspaceFileScopeDirectory,
    activeWorkspaceFileScopeName,
    activeWorkspaceFileState,
    activeTurns,
    canvasSessionTabs,
    canInsertPreviewCommentsIntoDraft,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerAttachments,
    composerRefreshVersion,
    createSessionTabs,
    createSessionTitle,
    createSessionWorkspaceID,
    deletingSessionID,
    draftState,
    expandedFolderIDs,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCancelSend,
    handleCreateSessionTabSelect,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenSideChat,
    handleOpenSideChatInTab,
    handleOpenCreateSessionTab,
    handlePaneFocus,
    handleSplitResize,
    handlePaneTabDrop,
    handlePaneSplit,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffFileRestore,
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
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    handleSessionModelSelectionChange,
    focusedPaneID,
    hoveredFolderID,
    isCreateSessionTabActive,
    isCreatingProject,
    isCreatingSession,
    isResolvingPermissionRequest: permissionRequestActionRequestID !== null,
    isSending,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
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
    visibleCanvasSessionIDs,
    workbenchLayout,
    workbenchPanes,
    workbenchPaneStateByID,
    workbenchPaneStates,
    workspaces,
  }
}
