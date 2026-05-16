import { createEmptyComposerDraftState } from "../composer/draft-state"
import type { SerializedDockview } from "dockview-react"
import type {
  ComposerAttachment,
  ComposerDraftState,
  CreateSessionTab,
  PermissionRequest,
  SessionContextUsage,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  Turn,
  WorkbenchTabReference,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspaceGroup,
  WorkspacePreviewState,
} from "../types"
import { createID } from "../utils"
import {
  getActiveDockviewPanelReferenceFromState,
  getActivePanelForGroupFromState,
  getDockviewGroupsInOrder,
  getFocusedDockviewGroupIDFromState,
  getOpenSessionIDs,
  getVisibleSessionIDsFromState,
  getWorkbenchDockPanelId,
  normalizeDockviewActiveState,
  type WorkbenchDockviewActiveState,
  type WorkbenchDockviewGroupLocation,
} from "../workbench/dockview-state"
import { findSession, findWorkspaceByID, isSideChatSession, isWorkspaceAvailable } from "../workspace"
import {
  DEFAULT_SESSION_DIFF_STATE,
  DEFAULT_SESSION_RUNTIME_DEBUG_STATE,
  DEFAULT_WORKSPACE_PREVIEW_STATE,
  getWorkspaceFileCommentKey,
  resolvePreviewScopeID,
} from "./review-preview-state"

function getSideChatCreatedAt(session: SessionSummary) {
  return session.created ?? session.updated
}

function compareSideChatSessions(left: SessionSummary, right: SessionSummary) {
  const createdDelta = getSideChatCreatedAt(left) - getSideChatCreatedAt(right)
  if (createdDelta !== 0) return createdDelta

  const updatedDelta = left.updated - right.updated
  if (updatedDelta !== 0) return updatedDelta

  return left.id.localeCompare(right.id)
}

export function collectSideChatSessionsByAnchorMessageID(workspaces: WorkspaceGroup[], parentSessionID: string) {
  const sessionsByAnchorMessageID: Record<string, SessionSummary[]> = {}

  for (const workspace of workspaces) {
    for (const session of workspace.sessions) {
      if (!isSideChatSession(session)) continue
      if (session.origin?.parentSessionID !== parentSessionID) continue
      const anchorMessageID = session.origin.anchorMessageID
      sessionsByAnchorMessageID[anchorMessageID] = [...(sessionsByAnchorMessageID[anchorMessageID] ?? []), session]
    }
  }

  for (const [anchorMessageID, sessions] of Object.entries(sessionsByAnchorMessageID)) {
    sessionsByAnchorMessageID[anchorMessageID] = [...sessions].sort(compareSideChatSessions)
  }

  return sessionsByAnchorMessageID
}

export function collectSideChatCountsFromSessionsByAnchorMessageID(sessionsByAnchorMessageID: Record<string, SessionSummary[]>) {
  const counts: Record<string, number> = {}

  for (const [anchorMessageID, sessions] of Object.entries(sessionsByAnchorMessageID)) {
    counts[anchorMessageID] = sessions.length
  }

  return counts
}

export function collectSideChatCountsForParentSession(workspaces: WorkspaceGroup[], parentSessionID: string) {
  return collectSideChatCountsFromSessionsByAnchorMessageID(collectSideChatSessionsByAnchorMessageID(workspaces, parentSessionID))
}

export function findLatestSideChatForAnchor(
  workspaces: WorkspaceGroup[],
  parentSessionID: string,
  anchorMessageID: string,
) {
  let match: { workspace: WorkspaceGroup; session: SessionSummary } | null = null

  for (const workspace of workspaces) {
    for (const session of workspace.sessions) {
      if (!isSideChatSession(session)) continue
      if (session.origin?.parentSessionID !== parentSessionID) continue
      if (session.origin.anchorMessageID !== anchorMessageID) continue
      if (!match || compareSideChatSessions(match.session, session) < 0) {
        match = { workspace, session }
      }
    }
  }

  return match
}

export function getUniqueSessionIDs(sessionIDs: string[]) {
  const seen = new Set<string>()
  const nextSessionIDs: string[] = []

  for (const sessionID of sessionIDs) {
    if (seen.has(sessionID)) continue
    seen.add(sessionID)
    nextSessionIDs.push(sessionID)
  }

  return nextSessionIDs
}

export function createSessionWorkbenchTab(sessionID: string): WorkbenchTabReference {
  return {
    kind: "session",
    sessionID,
  }
}

export function createCreateSessionWorkbenchTab(createSessionTabID: string): WorkbenchTabReference {
  return {
    kind: "create-session",
    createSessionTabID,
  }
}

export function getWorkbenchTabKey(tab: WorkbenchTabReference) {
  return tab.kind === "session" ? `session:${tab.sessionID}` : `create-session:${tab.createSessionTabID}`
}

export function getWorkbenchTabReferenceFromKey(tabKey: string): WorkbenchTabReference | null {
  if (tabKey.startsWith("session:")) {
    return {
      kind: "session",
      sessionID: tabKey.slice("session:".length),
    }
  }

  if (tabKey.startsWith("create-session:")) {
    return {
      kind: "create-session",
      createSessionTabID: tabKey.slice("create-session:".length),
    }
  }

  return null
}

export function createCreateSessionTab(workspaceID: string | null): CreateSessionTab {
  return {
    id: createID("create-session-tab"),
    workspaceID,
    title: "",
  }
}

export function resolveCreateSessionWorkspaceID(
  workspaces: WorkspaceGroup[],
  preferredWorkspaceID?: string | null,
  selectedFolderID?: string | null,
  activeWorkspaceID?: string | null,
) {
  const candidateIDs = [preferredWorkspaceID, selectedFolderID, activeWorkspaceID]

  for (const candidateID of candidateIDs) {
    if (!candidateID) continue
    const workspace = findWorkspaceByID(workspaces, candidateID)
    if (workspace && isWorkspaceAvailable(workspace)) return candidateID
  }

  return workspaces.find((workspace) => isWorkspaceAvailable(workspace))?.id ?? workspaces[0]?.id ?? null
}

function getSessionIDFromTabKey(tabKey: string) {
  return tabKey.startsWith("session:") ? tabKey.slice("session:".length) : null
}

function getRunningSessionIDs(
  conversations: Record<string, Turn[]>,
  isSendingByTabKey: Record<string, boolean>,
) {
  const sessionIDs = new Set<string>()

  for (const [tabKey, isSending] of Object.entries(isSendingByTabKey)) {
    const sessionID = isSending ? getSessionIDFromTabKey(tabKey) : null
    if (sessionID) sessionIDs.add(sessionID)
  }

  for (const [sessionID, turns] of Object.entries(conversations)) {
    if (turns.some((turn) => turn.kind === "assistant" && turn.isStreaming)) {
      sessionIDs.add(sessionID)
    }
  }

  return Array.from(sessionIDs)
}

function hasStreamingAssistantTurn(turns: Turn[]) {
  return turns.some((turn) => turn.kind === "assistant" && turn.isStreaming)
}

function isRuntimeDebugBusy(debug: SessionRuntimeDebugSnapshot | null | undefined) {
  return debug?.status.type === "busy" || Boolean(debug?.activeTurnID)
}

function isSessionInterruptible(input: {
  cancellingSessionIDs: Record<string, boolean>
  conversations: Record<string, Turn[]>
  isSendingByTabKey: Record<string, boolean>
  sessionID: string | null | undefined
  sessionRuntimeDebugBySession: Record<string, SessionRuntimeDebugSnapshot>
  tabKey: string | null | undefined
}) {
  if (!input.sessionID) return false
  return (
    Boolean(input.tabKey && input.isSendingByTabKey[input.tabKey]) ||
    Boolean(input.cancellingSessionIDs[input.sessionID]) ||
    hasStreamingAssistantTurn(input.conversations[input.sessionID] ?? []) ||
    isRuntimeDebugBusy(input.sessionRuntimeDebugBySession[input.sessionID])
  )
}

type WorkbenchPaneTab =
  | {
      key: string
      kind: "session"
      sessionID: string
      title: string
      sessionKind?: SessionSummary["kind"]
      workflow?: SessionSummary["workflow"]
    }
  | {
      key: string
      kind: "create-session"
      createSessionTabID: string
      title: string
    }

interface BuildWorkspaceDerivedStateInput {
  activeSideChatSessionIDByParentSessionID: Record<string, string>
  cancellingSessionIDs: Record<string, boolean>
  composerAttachmentsByTabKey: Record<string, ComposerAttachment[]>
  composerDraftStateByTabKey: Record<string, ComposerDraftState>
  contextUsageBySession: Record<string, SessionContextUsage>
  conversations: Record<string, Turn[]>
  createSessionTabs: CreateSessionTab[]
  isCreatingSessionByTabKey: Record<string, boolean>
  isInitialWorkspaceLoadPending: boolean
  isSendingByTabKey: Record<string, boolean>
  pendingPermissionRequestsBySession: Record<string, PermissionRequest[]>
  platform: string
  previewByWorkspaceID: Record<string, WorkspacePreviewState>
  selectedDiffFileBySession: Record<string, string | null>
  selectedFolderID: string | null
  sessionDiffBySession: Record<string, SessionDiffSummary>
  sessionDiffStateBySession: Record<string, SessionDiffState>
  sessionDirectoryBySession: Record<string, string>
  sessionRuntimeDebugBySession: Record<string, SessionRuntimeDebugSnapshot>
  sessionRuntimeDebugStateBySession: Record<string, SessionRuntimeDebugState>
  seedWorkspaceIDs: Set<string>
  dockviewActiveState: WorkbenchDockviewActiveState
  dockviewLayout: SerializedDockview | null
  workspaceFileCommentsByTarget: Record<string, WorkspaceFileComment[]>
  workspaceFileReviewState: WorkspaceFileReviewState
  workspaces: WorkspaceGroup[]
}

export function buildWorkspaceDerivedState({
  activeSideChatSessionIDByParentSessionID,
  cancellingSessionIDs,
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
  dockviewActiveState,
  dockviewLayout,
  workspaceFileCommentsByTarget,
  workspaceFileReviewState,
  workspaces,
}: BuildWorkspaceDerivedStateInput) {
  const orderedDockviewGroups = getDockviewGroupsInOrder(dockviewLayout)
  const normalizedDockviewActiveState = normalizeDockviewActiveState(dockviewLayout, dockviewActiveState)
  const focusedPaneID = getFocusedDockviewGroupIDFromState(dockviewLayout, normalizedDockviewActiveState)
  const focusedPane = focusedPaneID
    ? orderedDockviewGroups.find((group) => group.id === focusedPaneID) ?? null
    : null
  const activeTab = getActiveDockviewPanelReferenceFromState(dockviewLayout, normalizedDockviewActiveState, focusedPaneID)
  const activeTabKey = activeTab ? getWorkbenchTabKey(activeTab) : null
  const activeSessionID = activeTab?.kind === "session" ? activeTab.sessionID : null
  const activeCreateSessionTabID = activeTab?.kind === "create-session" ? activeTab.createSessionTabID : null
  const openCanvasSessionIDs = getOpenSessionIDs(dockviewLayout)
  const visibleCanvasSessionIDs = getVisibleSessionIDsFromState(dockviewLayout, normalizedDockviewActiveState)
  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const activeCreateSessionTab = createSessionTabs.find((tab) => tab.id === activeCreateSessionTabID) ?? null
  const focusedPaneCreateSessionTab =
    activeTab?.kind === "create-session"
      ? createSessionTabs.find((tab) => tab.id === activeTab.createSessionTabID) ?? null
      : null
  const activeTabWorkspaceID =
    activeTab?.kind === "session"
      ? findSession(workspaces, activeTab.sessionID).workspace?.id ?? null
      : createSessionTabs.find((item) => item.id === activeTab?.createSessionTabID)?.workspaceID ?? null
  const selectedWorkspace =
    findWorkspaceByID(workspaces, selectedFolderID) ??
    findWorkspaceByID(workspaces, activeTabWorkspaceID) ??
    activeWorkspace ??
    workspaces[0] ??
    null
  const focusedPaneWorkspace =
    activeWorkspace ??
    findWorkspaceByID(workspaces, focusedPaneCreateSessionTab?.workspaceID ?? null) ??
    null
  const activePreviewScopeID = resolvePreviewScopeID(selectedWorkspace?.id ?? null)
  const activeWorkspaceFileScopeDirectory = focusedPaneWorkspace?.directory ?? selectedWorkspace?.directory ?? null
  const activeWorkspaceFileScopeName = focusedPaneWorkspace?.name ?? selectedWorkspace?.name ?? null
  const activeWorkspaceFileCommentKey = getWorkspaceFileCommentKey(
    activeWorkspaceFileScopeDirectory,
    workspaceFileReviewState.selectedFilePath,
    platform,
  )
  const activeWorkspaceFileState: WorkspaceFileReviewState =
    activeWorkspaceFileCommentKey
      ? {
          ...workspaceFileReviewState,
          comments: workspaceFileCommentsByTarget[activeWorkspaceFileCommentKey] ?? [],
        }
      : {
          ...workspaceFileReviewState,
          comments: [],
        }
  const selectedProjectID =
    isInitialWorkspaceLoadPending && selectedWorkspace && seedWorkspaceIDs.has(selectedWorkspace.id)
      ? null
      : selectedWorkspace?.project.id ?? null
  const activeTurns = activeSession ? conversations[activeSession.id] ?? [] : []
  const activeSessionDiff = activeSession ? sessionDiffBySession[activeSession.id] ?? null : null
  const activeSessionDiffState = activeSession
    ? sessionDiffStateBySession[activeSession.id] ?? DEFAULT_SESSION_DIFF_STATE
    : DEFAULT_SESSION_DIFF_STATE
  const activeSessionRuntimeDebug = activeSession ? sessionRuntimeDebugBySession[activeSession.id] ?? null : null
  const activeSessionRuntimeDebugState = activeSession
    ? sessionRuntimeDebugStateBySession[activeSession.id] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
    : DEFAULT_SESSION_RUNTIME_DEBUG_STATE
  const activeSessionDirectory = activeSession
    ? sessionDirectoryBySession[activeSession.id] ?? activeWorkspace?.directory ?? null
    : null
  const activeSessionSelectedDiffFile = activeSession ? selectedDiffFileBySession[activeSession.id] ?? null : null
  const activePendingPermissionRequests = activeSession ? pendingPermissionRequestsBySession[activeSession.id] ?? [] : []
  const activeSessionContextUsage = activeSession ? contextUsageBySession[activeSession.id] ?? null : null
  const activeSessionIsSideChat = isSideChatSession(activeSession)
  const activeSideChatSessionID =
    activeSession && !activeSessionIsSideChat
      ? activeSideChatSessionIDByParentSessionID[activeSession.id] ?? null
      : null
  const activeSideChatSelection = findSession(workspaces, activeSideChatSessionID)
  const activeSideChatSession =
    activeSession &&
    !activeSessionIsSideChat &&
    activeSideChatSelection.session?.origin?.parentSessionID === activeSession.id
      ? activeSideChatSelection.session
      : null
  const activeSideChatTabKey = activeSideChatSession ? getWorkbenchTabKey(createSessionWorkbenchTab(activeSideChatSession.id)) : null
  const activeSideChatTurns = activeSideChatSession ? conversations[activeSideChatSession.id] ?? [] : []
  const activeSideChatPendingPermissionRequests =
    activeSideChatSession ? pendingPermissionRequestsBySession[activeSideChatSession.id] ?? [] : []
  const activeSideChatDraftState = activeSideChatTabKey
    ? composerDraftStateByTabKey[activeSideChatTabKey] ?? createEmptyComposerDraftState()
    : createEmptyComposerDraftState()
  const activeSideChatAttachments = activeSideChatTabKey ? composerAttachmentsByTabKey[activeSideChatTabKey] ?? [] : []
  const activeSideChatIsSending = activeSideChatTabKey ? Boolean(isSendingByTabKey[activeSideChatTabKey]) : false
  const activeSideChatIsCancelling = activeSideChatSession ? Boolean(cancellingSessionIDs[activeSideChatSession.id]) : false
  const activeSideChatIsInterruptible = isSessionInterruptible({
    cancellingSessionIDs,
    conversations,
    isSendingByTabKey,
    sessionID: activeSideChatSession?.id,
    sessionRuntimeDebugBySession,
    tabKey: activeSideChatTabKey,
  })
  const activeSideChatSessionsByAnchorMessageID =
    activeSession && !activeSessionIsSideChat ? collectSideChatSessionsByAnchorMessageID(workspaces, activeSession.id) : {}
  const activeSideChatCountsByAnchorMessageID =
    collectSideChatCountsFromSessionsByAnchorMessageID(activeSideChatSessionsByAnchorMessageID)
  const isCreateSessionTabActive = activeCreateSessionTab !== null
  const createSessionWorkspaceID = activeCreateSessionTab?.workspaceID ?? null
  const createSessionTitle = activeCreateSessionTab?.title ?? ""
  const draftState = activeTabKey
    ? composerDraftStateByTabKey[activeTabKey] ?? createEmptyComposerDraftState()
    : createEmptyComposerDraftState()
  const activePreviewState = previewByWorkspaceID[activePreviewScopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
  const canInsertPreviewInteractionsIntoDraft = Boolean(activeTabKey)
  const canInsertWorkspaceFileCommentsIntoDraft = Boolean(activeTabKey)
  const composerAttachments = activeTabKey ? composerAttachmentsByTabKey[activeTabKey] ?? [] : []
  const isSending = activeTabKey ? Boolean(isSendingByTabKey[activeTabKey]) : false
  const isCancelling = activeSession ? Boolean(cancellingSessionIDs[activeSession.id]) : false
  const isInterruptible = isSessionInterruptible({
    cancellingSessionIDs,
    conversations,
    isSendingByTabKey,
    sessionID: activeSession?.id,
    sessionRuntimeDebugBySession,
    tabKey: activeTabKey,
  })
  const isCreatingSession = activeTabKey ? Boolean(isCreatingSessionByTabKey[activeTabKey]) : false
  const runningSessionIDs = getRunningSessionIDs(conversations, isSendingByTabKey)
  const canvasSessionTabs = focusedPane
    ? focusedPane.views.flatMap((reference) => {
        if (reference.kind !== "session") return []
        const { session } = findSession(workspaces, reference.sessionID)
        return session ? [session] : []
      })
    : []

  function buildWorkbenchPaneTabs(tabs: WorkbenchTabReference[]) {
    const paneTabs: WorkbenchPaneTab[] = []

    for (const tab of tabs) {
      if (tab.kind === "session") {
        const { session } = findSession(workspaces, tab.sessionID)
        if (!session) continue
        paneTabs.push({
          key: getWorkbenchTabKey(tab),
          kind: tab.kind,
          sessionID: tab.sessionID,
          title: session.title,
          sessionKind: session.kind,
          workflow: session.workflow,
        })
        continue
      }

      const createTab = createSessionTabs.find((item) => item.id === tab.createSessionTabID)
      const workspace = findWorkspaceByID(workspaces, createTab?.workspaceID ?? null)
      paneTabs.push({
        key: getWorkbenchTabKey(tab),
        kind: tab.kind,
        createSessionTabID: tab.createSessionTabID,
        title: workspace ? `Create / ${workspace.name}` : "Create session",
      })
    }

    return paneTabs
  }

  function buildWorkbenchSurfaceState(input: {
    id: string
    isActivePanel: boolean
    isFocused: boolean
    location: WorkbenchDockviewGroupLocation
    reference: WorkbenchTabReference | null
    tabs: WorkbenchPaneTab[]
  }) {
    const currentActiveTab = input.reference
    const currentActiveTabKey = currentActiveTab ? getWorkbenchTabKey(currentActiveTab) : null
    const currentActiveSessionID = currentActiveTab?.kind === "session" ? currentActiveTab.sessionID : null
    const currentActiveCreateSessionTab =
      currentActiveTab?.kind === "create-session"
        ? createSessionTabs.find((tab) => tab.id === currentActiveTab.createSessionTabID) ?? null
        : null
    const currentSessionSelection = findSession(workspaces, currentActiveSessionID)
    const currentWorkspace =
      currentSessionSelection.workspace ??
      findWorkspaceByID(workspaces, currentActiveCreateSessionTab?.workspaceID ?? null) ??
      null
    const currentSession = currentSessionSelection.session
    const currentSessionIsSideChat = isSideChatSession(currentSession)
    const paneSideChatSessionsByAnchorMessageID =
      currentSession && !currentSessionIsSideChat ? collectSideChatSessionsByAnchorMessageID(workspaces, currentSession.id) : {}
    const paneActiveSideChatSessionID =
      currentSession && !currentSessionIsSideChat ? activeSideChatSessionIDByParentSessionID[currentSession.id] ?? null : null
    const paneActiveSideChatSelection = findSession(workspaces, paneActiveSideChatSessionID)
    const paneActiveSideChatSession =
      currentSession &&
      !currentSessionIsSideChat &&
      paneActiveSideChatSelection.session?.origin?.parentSessionID === currentSession.id
        ? paneActiveSideChatSelection.session
        : null
    const paneActiveSideChatTabKey = paneActiveSideChatSession
      ? getWorkbenchTabKey(createSessionWorkbenchTab(paneActiveSideChatSession.id))
      : null
    const paneActiveSideChatIsCancelling = paneActiveSideChatSession ? Boolean(cancellingSessionIDs[paneActiveSideChatSession.id]) : false
    const paneActiveSideChatIsInterruptible = isSessionInterruptible({
      cancellingSessionIDs,
      conversations,
      isSendingByTabKey,
      sessionID: paneActiveSideChatSession?.id,
      sessionRuntimeDebugBySession,
      tabKey: paneActiveSideChatTabKey,
    })

    return {
      id: input.id,
      location: input.location,
      isActivePanel: input.isActivePanel,
      isFocused: input.isFocused,
      activeTabKey: currentActiveTabKey,
      activeSession: currentSession,
      activeSessionContextUsage: currentActiveSessionID ? contextUsageBySession[currentActiveSessionID] ?? null : null,
      activeSessionDiff: currentActiveSessionID ? sessionDiffBySession[currentActiveSessionID] ?? null : null,
      activeSessionDiffState: currentActiveSessionID
        ? sessionDiffStateBySession[currentActiveSessionID] ?? DEFAULT_SESSION_DIFF_STATE
        : DEFAULT_SESSION_DIFF_STATE,
      activeSessionRuntimeDebug: currentActiveSessionID ? sessionRuntimeDebugBySession[currentActiveSessionID] ?? null : null,
      activeSessionRuntimeDebugState: currentActiveSessionID
        ? sessionRuntimeDebugStateBySession[currentActiveSessionID] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
        : DEFAULT_SESSION_RUNTIME_DEBUG_STATE,
      activeSideChatAttachments: paneActiveSideChatTabKey ? composerAttachmentsByTabKey[paneActiveSideChatTabKey] ?? [] : [],
      activeSideChatDraftState: paneActiveSideChatTabKey
        ? composerDraftStateByTabKey[paneActiveSideChatTabKey] ?? createEmptyComposerDraftState()
        : createEmptyComposerDraftState(),
      activeSideChatIsSending: paneActiveSideChatTabKey ? Boolean(isSendingByTabKey[paneActiveSideChatTabKey]) : false,
      activeSideChatIsCancelling: paneActiveSideChatIsCancelling,
      activeSideChatIsInterruptible: paneActiveSideChatIsInterruptible,
      activeSideChatPendingPermissionRequests: paneActiveSideChatSession
        ? pendingPermissionRequestsBySession[paneActiveSideChatSession.id] ?? []
        : [],
      activeSideChatSession: paneActiveSideChatSession,
      activeSideChatTabKey: paneActiveSideChatTabKey,
      activeSideChatTurns: paneActiveSideChatSession ? conversations[paneActiveSideChatSession.id] ?? [] : [],
      activeSessionDirectory: currentActiveSessionID
        ? sessionDirectoryBySession[currentActiveSessionID] ?? currentWorkspace?.directory ?? null
        : null,
      activeSessionSelectedDiffFile: currentActiveSessionID ? selectedDiffFileBySession[currentActiveSessionID] ?? null : null,
      activeTurns: currentActiveSessionID ? conversations[currentActiveSessionID] ?? [] : [],
      composerAttachments: currentActiveTabKey ? composerAttachmentsByTabKey[currentActiveTabKey] ?? [] : [],
      composerProjectID:
        isInitialWorkspaceLoadPending && currentWorkspace && seedWorkspaceIDs.has(currentWorkspace.id)
          ? null
          : currentWorkspace?.project.id ?? null,
      contextLabel: currentActiveCreateSessionTab ? "Create session" : currentSessionIsSideChat ? "Side chat" : "Session",
      contextTitle: currentSession
        ? currentSession.title
        : currentWorkspace
          ? `${currentWorkspace.project.name} / ${currentWorkspace.name}`
          : "No project selected",
      createSessionTabID: currentActiveCreateSessionTab?.id ?? null,
      createSessionInitialWorkflowMode: currentActiveCreateSessionTab?.initialWorkflowMode ?? "execution",
      createSessionWorkspaceID: currentActiveCreateSessionTab?.workspaceID ?? null,
      draftState: currentActiveTabKey
        ? composerDraftStateByTabKey[currentActiveTabKey] ?? createEmptyComposerDraftState()
        : createEmptyComposerDraftState(),
      isCreatingSession:
        currentActiveTabKey && currentActiveCreateSessionTab
          ? Boolean(isCreatingSessionByTabKey[currentActiveTabKey])
          : false,
      isSending: currentActiveTabKey ? Boolean(isSendingByTabKey[currentActiveTabKey]) : false,
      isCancelling: currentSession ? Boolean(cancellingSessionIDs[currentSession.id]) : false,
      isInterruptible: isSessionInterruptible({
        cancellingSessionIDs,
        conversations,
        isSendingByTabKey,
        sessionID: currentSession?.id,
        sessionRuntimeDebugBySession,
        tabKey: currentActiveTabKey,
      }),
      pendingPermissionRequests: currentActiveSessionID ? pendingPermissionRequestsBySession[currentActiveSessionID] ?? [] : [],
      projectID:
        isInitialWorkspaceLoadPending && currentWorkspace && seedWorkspaceIDs.has(currentWorkspace.id)
          ? null
          : currentWorkspace?.project.id ?? null,
      size: 1,
      sessionID: currentSession?.id ?? null,
      sideChatCountsByAnchorMessageID: collectSideChatCountsFromSessionsByAnchorMessageID(paneSideChatSessionsByAnchorMessageID),
      sideChatSessionsByAnchorMessageID: paneSideChatSessionsByAnchorMessageID,
      tabKey: currentActiveTabKey,
      tabs: input.tabs,
      workspace: currentWorkspace,
    }
  }

  const workbenchPaneStates = orderedDockviewGroups.map((pane) => {
    const currentActiveTab = getActivePanelForGroupFromState(dockviewLayout, normalizedDockviewActiveState, pane.id)
    return buildWorkbenchSurfaceState({
      id: pane.id,
      location: pane.location,
      isActivePanel: true,
      isFocused: pane.id === focusedPaneID,
      reference: currentActiveTab,
      tabs: buildWorkbenchPaneTabs(pane.views),
    })
  })
  const workbenchPanelStates = orderedDockviewGroups.flatMap((pane) => {
    const paneTabs = buildWorkbenchPaneTabs(pane.views)
    const currentActiveTab = getActivePanelForGroupFromState(dockviewLayout, normalizedDockviewActiveState, pane.id)
    return pane.views.map((reference) => [
      getWorkbenchDockPanelId(reference),
      buildWorkbenchSurfaceState({
        id: pane.id,
        location: pane.location,
        isActivePanel: Boolean(currentActiveTab && getWorkbenchTabKey(currentActiveTab) === getWorkbenchTabKey(reference)),
        isFocused: pane.id === focusedPaneID,
        reference,
        tabs: paneTabs,
      }),
    ] as const)
  })
  const workbenchPaneStateByID = Object.fromEntries(workbenchPaneStates.map((pane) => [pane.id, pane]))
  const workbenchPanelStateByID = Object.fromEntries(workbenchPanelStates)

  return {
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
    activeTab,
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
  }
}
