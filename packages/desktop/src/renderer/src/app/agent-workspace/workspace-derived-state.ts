import { createEmptyComposerDraftState } from "../composer/draft-state"
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
  WorkbenchPane,
  WorkbenchTabReference,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspaceGroup,
  WorkspacePreviewState,
} from "../types"
import { createID } from "../utils"
import {
  getFirstGroupId,
  getGroupIdForTabId,
  getGroupIdsInOrder,
  getGroupNode,
  getReferenceForTabId,
  getTabIdForReference,
  type WorkbenchLayoutState,
} from "../workbench/core"
import { findSession, findWorkspaceByID, isSideChatSession, isWorkspaceAvailable } from "../workspace"
import {
  DEFAULT_SESSION_DIFF_STATE,
  DEFAULT_SESSION_RUNTIME_DEBUG_STATE,
  DEFAULT_WORKSPACE_PREVIEW_STATE,
  getWorkspaceFileCommentKey,
  resolvePreviewScopeID,
} from "./review-preview-state"

export function collectSideChatCountsForParentSession(workspaces: WorkspaceGroup[], parentSessionID: string) {
  const counts: Record<string, number> = {}

  for (const workspace of workspaces) {
    for (const session of workspace.sessions) {
      if (!isSideChatSession(session)) continue
      if (session.origin?.parentSessionID !== parentSessionID) continue
      const anchorMessageID = session.origin.anchorMessageID
      counts[anchorMessageID] = (counts[anchorMessageID] ?? 0) + 1
    }
  }

  return counts
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
      if (!match || session.updated > match.session.updated) {
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

export function buildLegacyWorkbenchPanesFromLayout(layout: WorkbenchLayoutState): WorkbenchPane[] {
  return getGroupIdsInOrder(layout).map((groupID) => {
    const group = getGroupNode(layout, groupID)
    const tabs = group?.tabs.flatMap((tabID) => {
      const reference = getReferenceForTabId(layout, tabID)
      return reference ? [reference] : []
    }) ?? []
    const activeReference = group?.activeTabId ? getReferenceForTabId(layout, group.activeTabId) : null

    return {
      id: groupID,
      size: 1,
      tabs,
      activeTabKey: activeReference ? getWorkbenchTabKey(activeReference) : null,
    }
  })
}

export function createWorkbenchPane(tabs: WorkbenchTabReference[], paneID = createID("pane"), size = 1): WorkbenchPane {
  const nextTabs = tabs.length > 0 ? tabs : []
  return {
    id: paneID,
    size,
    tabs: nextTabs,
    activeTabKey: nextTabs[0] ? getWorkbenchTabKey(nextTabs[0]) : null,
  }
}

export function getPaneActiveTab(pane: WorkbenchPane | null | undefined) {
  if (!pane) return null
  return pane.tabs.find((tab) => getWorkbenchTabKey(tab) === pane.activeTabKey) ?? pane.tabs[0] ?? null
}

export function getPaneByID(panes: WorkbenchPane[], paneID: string | null) {
  if (!paneID) return null
  return panes.find((pane) => pane.id === paneID) ?? null
}

export function getPaneByTabKey(panes: WorkbenchPane[], tabKey: string) {
  return panes.find((pane) => pane.tabs.some((tab) => getWorkbenchTabKey(tab) === tabKey)) ?? null
}

export function resolveWorkbenchGroupID(layout: WorkbenchLayoutState, preferredGroupID?: string | null) {
  if (preferredGroupID && getGroupNode(layout, preferredGroupID)) return preferredGroupID
  return getFirstGroupId(layout)
}

export function getWorkbenchGroupIDForTabKey(layout: WorkbenchLayoutState, tabKey: string) {
  const reference = getWorkbenchTabReferenceFromKey(tabKey)
  return reference ? getGroupIdForTabId(layout, getTabIdForReference(reference)) : null
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

interface BuildWorkspaceDerivedStateInput {
  activeSideChatSessionIDByParentSessionID: Record<string, string>
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
  workbenchLayout: WorkbenchLayoutState
  workspaceFileCommentsByTarget: Record<string, WorkspaceFileComment[]>
  workspaceFileReviewState: WorkspaceFileReviewState
  workspaces: WorkspaceGroup[]
}

export function buildWorkspaceDerivedState({
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
}: BuildWorkspaceDerivedStateInput) {
  const orderedWorkbenchGroupIDs = getGroupIdsInOrder(workbenchLayout)
  const focusedPaneID = workbenchLayout.focusedGroupId ?? orderedWorkbenchGroupIDs[0] ?? null
  const focusedPane = getGroupNode(workbenchLayout, focusedPaneID)
  const activeTab = focusedPane?.activeTabId ? getReferenceForTabId(workbenchLayout, focusedPane.activeTabId) : null
  const activeTabKey = activeTab ? getWorkbenchTabKey(activeTab) : null
  const activeSessionID = activeTab?.kind === "session" ? activeTab.sessionID : null
  const activeCreateSessionTabID = activeTab?.kind === "create-session" ? activeTab.createSessionTabID : null
  const openCanvasSessionIDs = getUniqueSessionIDs(
    Object.values(workbenchLayout.docs).flatMap((doc) => (doc.type === "session" ? [doc.sessionID] : [])),
  )
  const visibleCanvasSessionIDs = getUniqueSessionIDs(
    orderedWorkbenchGroupIDs.flatMap((groupID) => {
      const group = getGroupNode(workbenchLayout, groupID)
      const reference = group?.activeTabId ? getReferenceForTabId(workbenchLayout, group.activeTabId) : null
      return reference?.kind === "session" ? [reference.sessionID] : []
    }),
  )
  const workbenchPanes = buildLegacyWorkbenchPanesFromLayout(workbenchLayout)
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
  const activeSideChatCountsByAnchorMessageID =
    activeSession && !activeSessionIsSideChat ? collectSideChatCountsForParentSession(workspaces, activeSession.id) : {}
  const isCreateSessionTabActive = activeCreateSessionTab !== null
  const createSessionWorkspaceID = activeCreateSessionTab?.workspaceID ?? null
  const createSessionTitle = activeCreateSessionTab?.title ?? ""
  const draftState = activeTabKey
    ? composerDraftStateByTabKey[activeTabKey] ?? createEmptyComposerDraftState()
    : createEmptyComposerDraftState()
  const activePreviewState = previewByWorkspaceID[activePreviewScopeID] ?? DEFAULT_WORKSPACE_PREVIEW_STATE
  const canInsertPreviewCommentsIntoDraft = Boolean(activeTabKey)
  const canInsertWorkspaceFileCommentsIntoDraft = Boolean(activeTabKey)
  const composerAttachments = activeTabKey ? composerAttachmentsByTabKey[activeTabKey] ?? [] : []
  const isSending = activeTabKey ? Boolean(isSendingByTabKey[activeTabKey]) : false
  const isCreatingSession = activeTabKey ? Boolean(isCreatingSessionByTabKey[activeTabKey]) : false
  const runningSessionIDs = getRunningSessionIDs(conversations, isSendingByTabKey)
  const canvasSessionTabs = focusedPane
    ? focusedPane.tabs.flatMap((tabID) => {
        const reference = getReferenceForTabId(workbenchLayout, tabID)
        if (!reference || reference.kind !== "session") return []
        const { session } = findSession(workspaces, reference.sessionID)
        return session ? [session] : []
      })
    : []

  const workbenchPaneStates = workbenchPanes.map((pane) => {
    const currentActiveTab = getPaneActiveTab(pane)
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
    const paneTabs: Array<
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
    > = []

    for (const tab of pane.tabs) {
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

    return {
      id: pane.id,
      isFocused: pane.id === focusedPaneID,
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
      pendingPermissionRequests: currentActiveSessionID ? pendingPermissionRequestsBySession[currentActiveSessionID] ?? [] : [],
      projectID:
        isInitialWorkspaceLoadPending && currentWorkspace && seedWorkspaceIDs.has(currentWorkspace.id)
          ? null
          : currentWorkspace?.project.id ?? null,
      size: pane.size,
      sessionID: currentSession?.id ?? null,
      sideChatCountsByAnchorMessageID:
        currentSession && !currentSessionIsSideChat
          ? collectSideChatCountsForParentSession(workspaces, currentSession.id)
          : {},
      tabKey: currentActiveTabKey,
      tabs: paneTabs,
      workspace: currentWorkspace,
    }
  })
  const workbenchPaneStateByID = Object.fromEntries(workbenchPaneStates.map((pane) => [pane.id, pane]))

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
    activeSideChatIsSending,
    activeSideChatPendingPermissionRequests,
    activeSideChatSession,
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
  }
}
