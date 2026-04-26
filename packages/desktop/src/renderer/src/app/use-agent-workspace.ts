import { startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, type MouseEvent } from "react"
import {
  appendConversationTurns as appendConversationTurnsToMap,
  ensureAgentSessions,
  ensureConversationSessions,
  removeAgentSession,
  removeConversationSession,
  updateAssistantTurn as updateAssistantTurnInMap,
} from "./conversation-state"
import { initialSelection } from "./seed-data"
import {
  applyAgentStreamEventToTurn,
  buildAgentTurn,
  buildAgentTurnFromEvents,
  buildUserTurn,
  buildTurnsFromHistory,
  buildFailureTurn,
  buildSessionStreamingAssistantTurn,
  buildStreamingAssistantTurn,
} from "./stream"
import type {
  AgentStreamIPCEvent,
  AgentSessionStreamIPCEvent,
  ComposerAttachment,
  ComposerCommentReference,
  ComposerDraftState,
  ComposerPermissionMode,
  CreateSessionTab,
  LeftSidebarView,
  LoadedSessionHistoryMessage,
  OpenAIReasoningEffort,
  PermissionDecision,
  PermissionRequest,
  PreviewComment,
  PreviewMode,
  RightSidebarView,
  SessionContextUsage,
  SessionSummary,
  SidebarActionKey,
  Turn,
  UserTurn,
  WorkbenchPane,
  WorkbenchTabReference,
  WorkspacePreviewState,
  WorkspaceFileChangeIPCEvent,
  WorkspaceFileComment,
  WorkspaceFilePendingComment,
  WorkspaceFileReviewState,
  WorkspaceFileSearchResult,
  WorkspaceGroup,
} from "./types"
import {
  appendComposerTagToDraftState,
  appendTextToComposerDraftState,
  compileComposerSubmission,
  createComposerCommentTagData,
  createEmptyComposerDraftState,
  normalizeComposerDraftState,
} from "./composer/draft-state"
import { buildComposerAttachment, isComposerAttachmentSupported } from "./composer/attachment-utils"
import { buildPreviewCommentDraft, normalizePreviewUrlInput } from "./preview/utils"
import {
  buildWorkspaceFileCommentDraft,
  buildWorkspaceFileCommentReferenceLabel,
  formatWorkspaceFileLineRangeLabel,
  normalizeWorkspaceFileLineRange,
} from "./files/utils"
import { createID } from "./utils"
import {
  createWorkbenchLayoutFromLegacyPanes,
  createWorkbenchLayoutWithTab,
  dockTabAroundGroup,
  filterLayoutTabs,
  focusGroup,
  getFirstGroupId,
  getGroupIdsInOrder,
  getGroupNode,
  getGroupIdForTabId,
  getReferenceForTabId,
  getTabIdForReference,
  moveTabToGroup,
  normalizeLayoutState,
  removeTabFromGroup,
  replaceTabReferenceInGroup,
  resizeSplitChildren,
  setGroupActiveTab,
  splitGroupWithReference,
  upsertTabReferenceInGroup,
  type WorkbenchLayoutState,
} from "./workbench/core"
import {
  findFirstSession,
  findSession,
  findWorkspaceByID,
  getPrimaryWorkspaceSessions,
  isSideChatSession,
  isWorkspaceAvailable,
  mapLoadedSession,
  mapLoadedWorkspace,
  mapLoadedWorkspaces,
  selectAfterSessionDelete,
  sortWorkspaceGroups,
  upsertSessionInWorkspace,
  upsertWorkspaceGroup,
} from "./workspace"
import { notifyGitStateChanged } from "./git-events"
import { mergeUserTurnPresentationState, persistUserTurns, readPersistedUserTurns } from "./user-turn-presentation"
import { getAgentSessionBridge, type AgentSessionBridgeEvent } from "./agent-session/client"
import { useComposerDraftState } from "./agent-workspace/composer-draft-state"
import {
  DEFAULT_SESSION_DIFF_STATE,
  DEFAULT_SESSION_RUNTIME_DEBUG_STATE,
  DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
  DEFAULT_WORKSPACE_PREVIEW_STATE,
  getWorkspaceFileCommentKey,
  resolvePreviewScopeID,
  resolveWorkspaceFileReviewStatus,
  useReviewPreviewState,
} from "./agent-workspace/review-preview-state"
import { useStreamPermissionController } from "./agent-workspace/stream-permission-controller"
import { seedWorkspaceIDs, useWorkspaceSessionStore } from "./agent-workspace/workspace-session-store"
import { useWorkbenchState } from "./agent-workspace/workbench-state"

interface UseAgentWorkspaceOptions {
  agentConnected: boolean
  agentDefaultDirectory: string
  platform: string
}

const GIT_REFRESH_SUPPRESSION_MS = 1000
const WORKSPACE_DIFF_REFRESH_DEBOUNCE_MS = 500
const WORKSPACE_RELOAD_SUPPRESSION_MS = 1500

function collectSessionDirectoryMap(
  workspaces: Array<{
    sessions: Array<{
      id: string
      directory: string
    }>
  }>,
) {
  return Object.fromEntries(
    workspaces.flatMap((workspace) =>
      workspace.sessions.map((session) => [session.id, session.directory] as const),
    ),
  )
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readRuntimeStreamEvent(value: unknown) {
  const event = readRecord(value)
  if (!event || !readString(event.type) || !readString(event.eventID)) return null
  if (!readString(event.sessionID) || !readString(event.turnID)) return null
  if (!readRecord(event.payload)) return null
  return event
}

function readRuntimeStreamPayload(value: unknown) {
  return readRecord(readRuntimeStreamEvent(value)?.payload)
}

function readRuntimeStreamType(streamEvent: { event: string; data: unknown }) {
  if (streamEvent.event !== "runtime") return undefined
  return readString(readRuntimeStreamEvent(streamEvent.data)?.type)
}

function isTerminalStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) {
    return runtimeType === "turn.completed" || runtimeType === "turn.failed" || runtimeType === "turn.cancelled"
  }

  return streamEvent.event === "done" || streamEvent.event === "error"
}

function isCompletedStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) return runtimeType === "turn.completed"
  return streamEvent.event === "done"
}

function isPermissionRequestStreamEvent(streamEvent: { event: string; data: unknown }) {
  const runtimeType = readRuntimeStreamType(streamEvent)
  if (runtimeType) {
    if (runtimeType === "permission.requested" || runtimeType === "tool.call.waiting_approval") return true
  }

  if (streamEvent.event !== "part") return false
  const data = readRecord(streamEvent.data)
  const part = readRecord(data?.part)
  return readString(part?.type) === "permission" && readString(part?.action) === "ask"
}

function normalizeWorkspacePath(value: string, platform: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
  return platform === "win32" ? normalized.toLowerCase() : normalized
}

function resolveWorkspaceRelativePath(directory: string, target: string, platform: string) {
  const normalizedDirectory = normalizeWorkspacePath(directory, platform)
  const normalizedTarget = normalizeWorkspacePath(target, platform)
  if (!normalizedDirectory || !normalizedTarget) return null
  if (normalizedTarget === normalizedDirectory) return ""
  const prefix = `${normalizedDirectory}/`
  if (!normalizedTarget.startsWith(prefix)) return null
  return normalizedTarget.slice(prefix.length)
}

function shouldReloadWorkspaceFromRelativePath(relativePath: string) {
  return relativePath === ".git" || relativePath === ".git/config"
}

function isGitInternalRelativePath(relativePath: string) {
  return relativePath === ".git" || relativePath.startsWith(".git/")
}

function shouldRefreshWorkspaceDiffFromRelativePaths(relativePaths: string[]) {
  if (relativePaths.length === 0) return true
  return relativePaths.some((relativePath) => !isGitInternalRelativePath(relativePath))
}

function resolveComposerPermissionModeForSession(
  session: Pick<SessionSummary, "kind"> | null | undefined,
  permissionMode: ComposerPermissionMode,
) {
  return isSideChatSession(session) ? "default" : permissionMode
}

function resolveComposerSkillSelectionForSession(
  session: Pick<SessionSummary, "kind"> | null | undefined,
  selectedSkillIDs: string[],
) {
  return isSideChatSession(session) ? [] : selectedSkillIDs
}

function collectSideChatCountsForParentSession(workspaces: WorkspaceGroup[], parentSessionID: string) {
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

function findLatestSideChatForAnchor(workspaces: WorkspaceGroup[], parentSessionID: string, anchorMessageID: string) {
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

function getUniqueSessionIDs(sessionIDs: string[]) {
  const seen = new Set<string>()
  const nextSessionIDs: string[] = []

  for (const sessionID of sessionIDs) {
    if (seen.has(sessionID)) continue
    seen.add(sessionID)
    nextSessionIDs.push(sessionID)
  }

  return nextSessionIDs
}

function getNextSessionTabAfterClose(sessionIDs: string[], closedSessionID: string) {
  const index = sessionIDs.indexOf(closedSessionID)
  if (index === -1) return sessionIDs[sessionIDs.length - 1] ?? null

  return sessionIDs[index + 1] ?? sessionIDs[index - 1] ?? null
}

function createSessionWorkbenchTab(sessionID: string): WorkbenchTabReference {
  return {
    kind: "session",
    sessionID,
  }
}

function createCreateSessionWorkbenchTab(createSessionTabID: string): WorkbenchTabReference {
  return {
    kind: "create-session",
    createSessionTabID,
  }
}

function getWorkbenchTabKey(tab: WorkbenchTabReference) {
  return tab.kind === "session" ? `session:${tab.sessionID}` : `create-session:${tab.createSessionTabID}`
}

function getWorkbenchTabReferenceFromKey(tabKey: string): WorkbenchTabReference | null {
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

function buildLegacyWorkbenchPanesFromLayout(layout: WorkbenchLayoutState): WorkbenchPane[] {
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

function createWorkbenchPane(tabs: WorkbenchTabReference[], paneID = createID("pane"), size = 1): WorkbenchPane {
  const nextTabs = tabs.length > 0 ? tabs : []
  return {
    id: paneID,
    size,
    tabs: nextTabs,
    activeTabKey: nextTabs[0] ? getWorkbenchTabKey(nextTabs[0]) : null,
  }
}

function getPaneActiveTab(pane: WorkbenchPane | null | undefined) {
  if (!pane) return null
  return pane.tabs.find((tab) => getWorkbenchTabKey(tab) === pane.activeTabKey) ?? pane.tabs[0] ?? null
}

function getPaneByID(panes: WorkbenchPane[], paneID: string | null) {
  if (!paneID) return null
  return panes.find((pane) => pane.id === paneID) ?? null
}

function getPaneByTabKey(panes: WorkbenchPane[], tabKey: string) {
  return panes.find((pane) => pane.tabs.some((tab) => getWorkbenchTabKey(tab) === tabKey)) ?? null
}

function getPaneBySessionID(panes: WorkbenchPane[], sessionID: string) {
  return panes.find((pane) => pane.tabs.some((tab) => tab.kind === "session" && tab.sessionID === sessionID)) ?? null
}

function getPaneTabByKey(pane: WorkbenchPane | null | undefined, tabKey: string) {
  if (!pane) return null
  return pane.tabs.find((tab) => getWorkbenchTabKey(tab) === tabKey) ?? null
}

function updatePaneActiveTab(panes: WorkbenchPane[], paneID: string, tabKey: string | null) {
  return panes.map((pane) =>
    pane.id === paneID
      ? {
          ...pane,
          activeTabKey: tabKey,
        }
      : pane,
  )
}

function upsertPaneTab(panes: WorkbenchPane[], paneID: string, tab: WorkbenchTabReference) {
  const nextTabKey = getWorkbenchTabKey(tab)
  return panes.map((pane) => {
    if (pane.id !== paneID) return pane
    if (pane.tabs.some((current) => getWorkbenchTabKey(current) === nextTabKey)) {
      return {
        ...pane,
        activeTabKey: nextTabKey,
      }
    }

    return {
      ...pane,
      tabs: [...pane.tabs, tab],
      activeTabKey: nextTabKey,
    }
  })
}

function replacePaneTab(
  panes: WorkbenchPane[],
  paneID: string,
  currentTabKey: string,
  nextTab: WorkbenchTabReference,
) {
  const nextTabKey = getWorkbenchTabKey(nextTab)
  return panes.map((pane) => {
    if (pane.id !== paneID) return pane
    const nextTabs = pane.tabs.flatMap((tab) =>
      getWorkbenchTabKey(tab) === currentTabKey ? [nextTab] : getWorkbenchTabKey(tab) === nextTabKey ? [] : [tab],
    )
    return {
      ...pane,
      tabs: nextTabs,
      activeTabKey: nextTabKey,
    }
  })
}

function removePaneTab(panes: WorkbenchPane[], paneID: string, tabKey: string) {
  const nextPanes = panes
    .map((pane) => {
      if (pane.id !== paneID) return pane
      const nextTabs = pane.tabs.filter((tab) => getWorkbenchTabKey(tab) !== tabKey)
      const nextActiveTabKey =
        pane.activeTabKey !== tabKey
          ? pane.activeTabKey
          : getNextSessionTabAfterClose(
              pane.tabs.map((tab) => getWorkbenchTabKey(tab)),
              tabKey,
            )
      return {
        ...pane,
        tabs: nextTabs,
        activeTabKey: nextTabs.some((tab) => getWorkbenchTabKey(tab) === nextActiveTabKey) ? nextActiveTabKey : nextTabs[0] ? getWorkbenchTabKey(nextTabs[0]) : null,
      }
    })
    .filter((pane) => pane.tabs.length > 0)

  return nextPanes
}

function insertPaneAdjacent(panes: WorkbenchPane[], targetPaneID: string, nextPane: WorkbenchPane, side: "left" | "right") {
  const targetIndex = panes.findIndex((pane) => pane.id === targetPaneID)
  if (targetIndex === -1) {
    return [...panes, nextPane]
  }

  const targetPane = panes[targetIndex]
  const targetSize = Math.max(targetPane.size, 0.2)
  const splitSize = targetSize / 2
  const resizedTargetPane = {
    ...targetPane,
    size: splitSize,
  }
  const insertedPane = {
    ...nextPane,
    size: splitSize,
  }
  const nextPanes = [...panes]
  nextPanes[targetIndex] = resizedTargetPane
  nextPanes.splice(side === "left" ? targetIndex : targetIndex + 1, 0, insertedPane)
  return nextPanes
}

function getWorkbenchSessionIDs(panes: WorkbenchPane[]) {
  return getUniqueSessionIDs(
    panes.flatMap((pane) =>
      pane.tabs.flatMap((tab) => (tab.kind === "session" ? [tab.sessionID] : [])),
    ),
  )
}

function readStreamString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readStreamNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readStreamRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readSessionContextUsageFromMessageInfo(value: unknown): SessionContextUsage | null {
  const message = readStreamRecord(value)
  if (!message || readStreamString(message.role) !== "assistant") return null

  const tokens = readStreamRecord(message.tokens)
  if (!tokens) return null

  const inputTokens = readStreamNumber(tokens.input) ?? 0
  const outputTokens = readStreamNumber(tokens.output) ?? 0
  const reasoningTokens = readStreamNumber(tokens.reasoning) ?? 0
  const cache = readStreamRecord(tokens.cache)
  const cacheReadTokens = readStreamNumber(cache?.read) ?? 0
  const cacheWriteTokens = readStreamNumber(cache?.write) ?? 0
  const totalTokens = inputTokens + outputTokens

  if (inputTokens <= 0 && outputTokens <= 0 && reasoningTokens <= 0 && cacheReadTokens <= 0 && cacheWriteTokens <= 0) {
    return null
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    measuredAt: readStreamNumber(message.completed) ?? readStreamNumber(message.created) ?? Date.now(),
  }
}

function readSessionContextUsageFromDoneEventData(value: unknown) {
  const runtimePayload = readRuntimeStreamPayload(value)
  if (runtimePayload) {
    return readSessionContextUsageFromMessageInfo(runtimePayload.message)
  }

  const payload = readStreamRecord(value)
  return readSessionContextUsageFromMessageInfo(payload?.message)
}

function readLatestSessionContextUsageFromHistory(messages: LoadedSessionHistoryMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = readSessionContextUsageFromMessageInfo(messages[index]?.info)
    if (usage) return usage
  }

  return null
}

function normalizeQuestionAnswerText(input?: {
  selectedOptions?: string[]
  freeformText?: string
}) {
  const freeformText = input?.freeformText?.trim()
  if (freeformText) return freeformText

  const selectedOptions = (input?.selectedOptions ?? []).map((value) => value.trim()).filter(Boolean)
  if (selectedOptions.length > 0) return selectedOptions.join(", ")

  return ""
}

function createCreateSessionTab(workspaceID: string | null): CreateSessionTab {
  return {
    id: createID("create-session-tab"),
    workspaceID,
    title: "",
  }
}

function resolveCreateSessionWorkspaceID(
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
const initialWorkbenchLayout = createWorkbenchLayoutFromLegacyPanes(initialWorkbenchPane ? [initialWorkbenchPane] : [])

export function useAgentWorkspace({
  agentConnected,
  agentDefaultDirectory,
  platform,
}: UseAgentWorkspaceOptions) {
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const { workbenchLayout, setWorkbenchLayout } = useWorkbenchState({ initialWorkbenchLayout })
  const {
    activeSideChatSessionIDByParentSessionID,
    canLoadSessionHistory,
    createSessionTabs,
    deletingSessionID,
    expandedFolderID,
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
    setActiveSideChatSessionIDByParentSessionID,
    setCanLoadSessionHistory,
    setCreateSessionTabs,
    setDeletingSessionID,
    setExpandedFolderID,
    setHoveredFolderID,
    setIsCreatingProject,
    setIsInitialWorkspaceLoadPending,
    setLeftSidebarView,
    setRightSidebarView,
    setSelectedFolderID,
    setWorkspaces,
    watchedWorkspaceDirectoriesKeyRef,
    workspaceRefreshRequestRef,
    workspaceReloadSuppressedUntilRef,
    workspaces,
  } = useWorkspaceSessionStore({ initialCreateSessionTab })
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
  } = useReviewPreviewState()
  const {
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    composerPermissionModeByTabKey,
    composerRefreshVersion,
    isCreatingSessionByTabKey,
    isSendingByTabKey,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setComposerPermissionModeByTabKey,
    setComposerRefreshVersion,
    setIsCreatingSessionByTabKey,
    setIsSendingByTabKey,
  } = useComposerDraftState({ initialTabKey: initialWorkbenchTab ? getWorkbenchTabKey(initialWorkbenchTab) : null })
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
  } = useStreamPermissionController({ initialSessionID: initialSelection.session?.id ?? null })
  function resolveWorkspaceIDForTab(tab: WorkbenchTabReference | null) {
    if (!tab) return null
    if (tab.kind === "session") {
      return findSession(workspaces, tab.sessionID).workspace?.id ?? null
    }
    return createSessionTabs.find((item) => item.id === tab.createSessionTabID)?.workspaceID ?? null
  }

  function resolveWorkbenchGroupID(layout: WorkbenchLayoutState, preferredGroupID?: string | null) {
    if (preferredGroupID && getGroupNode(layout, preferredGroupID)) return preferredGroupID
    return getFirstGroupId(layout)
  }

  function getWorkbenchGroupIDForTabKey(layout: WorkbenchLayoutState, tabKey: string) {
    const reference = getWorkbenchTabReferenceFromKey(tabKey)
    return reference ? getGroupIdForTabId(layout, getTabIdForReference(reference)) : null
  }

  function setFocusedPaneID(nextPaneID: string | null) {
    setWorkbenchLayout((current) => focusGroup(current, nextPaneID))
  }

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
  const workbenchPanes = buildLegacyWorkbenchPanesFromLayout(workbenchLayout)
  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const activeCreateSessionTab = createSessionTabs.find((tab) => tab.id === activeCreateSessionTabID) ?? null
  const focusedPaneCreateSessionTab =
    activeTab?.kind === "create-session"
      ? createSessionTabs.find((tab) => tab.id === activeTab.createSessionTabID) ?? null
      : null
  const activeTabWorkspaceID = resolveWorkspaceIDForTab(activeTab)
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
  const activeSessionDiffState = activeSession ? sessionDiffStateBySession[activeSession.id] ?? DEFAULT_SESSION_DIFF_STATE : DEFAULT_SESSION_DIFF_STATE
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
  const deferredWorkspaceFileQuery = useDeferredValue(workspaceFileReviewState.query)
  const canInsertPreviewCommentsIntoDraft = Boolean(activeTabKey)
  const canInsertWorkspaceFileCommentsIntoDraft = Boolean(activeTabKey)
  const composerAttachments = activeTabKey ? composerAttachmentsByTabKey[activeTabKey] ?? [] : []
  const composerPermissionMode = activeTabKey
    ? resolveComposerPermissionModeForSession(activeSession, composerPermissionModeByTabKey[activeTabKey] ?? "default")
    : "default"
  const isSending = activeTabKey ? Boolean(isSendingByTabKey[activeTabKey]) : false
  const isCreatingSession = activeTabKey ? Boolean(isCreatingSessionByTabKey[activeTabKey]) : false
  const canvasSessionTabs = focusedPane
    ? focusedPane.tabs.flatMap((tabID) => {
        const reference = getReferenceForTabId(workbenchLayout, tabID)
        if (!reference || reference.kind !== "session") return []
        const { session } = findSession(workspaces, reference.sessionID)
        return session ? [session] : []
      })
    : []

  function updateSessionContextUsage(sessionID: string, usage: SessionContextUsage | null) {
    setContextUsageBySession((prev) => {
      if (!usage) {
        if (!(sessionID in prev)) return prev
        const next = { ...prev }
        delete next[sessionID]
        return next
      }

      const current = prev[sessionID]
      if (
        current &&
        current.inputTokens === usage.inputTokens &&
        current.outputTokens === usage.outputTokens &&
        current.totalTokens === usage.totalTokens &&
        current.reasoningTokens === usage.reasoningTokens &&
        current.cacheReadTokens === usage.cacheReadTokens &&
        current.cacheWriteTokens === usage.cacheWriteTokens &&
        current.measuredAt === usage.measuredAt
      ) {
        return prev
      }

      return {
        ...prev,
        [sessionID]: usage,
      }
    })
  }

  function syncSessionContextUsageFromHistory(sessionID: string, usage: SessionContextUsage | null) {
    setContextUsageBySession((prev) => {
      if (!usage) {
        return prev
      }

      const current = prev[sessionID]
      if (
        current &&
        current.inputTokens === usage.inputTokens &&
        current.outputTokens === usage.outputTokens &&
        current.totalTokens === usage.totalTokens &&
        current.reasoningTokens === usage.reasoningTokens &&
        current.cacheReadTokens === usage.cacheReadTokens &&
        current.cacheWriteTokens === usage.cacheWriteTokens &&
        current.measuredAt === usage.measuredAt
      ) {
        return prev
      }

      return {
        ...prev,
        [sessionID]: usage,
      }
    })
  }

  function bumpConversationVersion(sessionID: string) {
    conversationVersionRef.current[sessionID] = (conversationVersionRef.current[sessionID] ?? 0) + 1
  }

  function setSessionDiffRequestState(sessionID: string, hasExistingSummary: boolean) {
    setSessionDiffStateBySession((prev) => {
      const current = prev[sessionID] ?? DEFAULT_SESSION_DIFF_STATE
      return {
        ...prev,
        [sessionID]: {
          ...current,
          status: hasExistingSummary ? "refreshing" : "loading",
          errorMessage: null,
        },
      }
    })
  }

  function clearSessionDiffRefreshTimer(sessionID: string) {
    const timerID = sessionDiffRefreshTimerRef.current[sessionID]
    if (timerID === undefined) return
    window.clearTimeout(timerID)
    delete sessionDiffRefreshTimerRef.current[sessionID]
  }

  function scheduleSessionDiffRefreshForSession(sessionID: string) {
    clearSessionDiffRefreshTimer(sessionID)
    sessionDiffRefreshTimerRef.current[sessionID] = window.setTimeout(() => {
      delete sessionDiffRefreshTimerRef.current[sessionID]
      void loadSessionDiffForSession(sessionID).catch((error) => {
        console.error("[desktop] workspace diff refresh failed:", error)
      })
    }, WORKSPACE_DIFF_REFRESH_DEBOUNCE_MS)
  }

  function clearRuntimeDebugRefreshTimer(sessionID: string) {
    const timerID = runtimeDebugRefreshTimerRef.current[sessionID]
    if (timerID === undefined) return
    window.clearTimeout(timerID)
    delete runtimeDebugRefreshTimerRef.current[sessionID]
  }

  function setSessionRuntimeDebugRequestState(sessionID: string, hasExistingSnapshot: boolean) {
    setSessionRuntimeDebugStateBySession((prev) => {
      const current = prev[sessionID] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
      return {
        ...prev,
        [sessionID]: {
          ...current,
          status: hasExistingSnapshot ? "refreshing" : "loading",
          errorMessage: null,
        },
      }
    })
  }

  async function refreshWorkspaceFromDirectory(directory: string) {
    const openFolderWorkspace = window.desktop?.openFolderWorkspace
    const trimmedDirectory = directory.trim()
    if (!trimmedDirectory || !openFolderWorkspace) return null

    const requestID = (workspaceRefreshRequestRef.current[trimmedDirectory] ?? 0) + 1
    workspaceRefreshRequestRef.current[trimmedDirectory] = requestID

    try {
      const loadedWorkspace = await openFolderWorkspace({ directory: trimmedDirectory })
      if (!loadedWorkspace) return null
      if (workspaceRefreshRequestRef.current[trimmedDirectory] !== requestID) return null

      const nextWorkspace = mapLoadedWorkspace(loadedWorkspace)
      const loadedSessionIDs = loadedWorkspace.sessions.map((session) => session.id)
      setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
      setConversations((prev) => ensureConversationSessions(prev, loadedSessionIDs))
      setAgentSessions((prev) => ensureAgentSessions(prev, loadedSessionIDs))
      setSessionDirectoryBySession((prev) => ({
        ...prev,
        ...collectSessionDirectoryMap([loadedWorkspace]),
      }))
      setCanLoadSessionHistory(true)

      return nextWorkspace
    } catch (error) {
      if (workspaceRefreshRequestRef.current[trimmedDirectory] === requestID) {
        console.error("[desktop] workspace refresh failed:", error)
      }
      return null
    }
  }

  function refreshWorkspaceForSession(sessionID: string) {
    const { workspace } = findSession(workspaces, sessionID)
    if (!workspace) return
    void refreshWorkspaceFromDirectory(workspace.directory)
  }

  function resolveUISessionID(backendSessionID: string) {
    const directMatch = agentSessions[backendSessionID]
    if (directMatch === backendSessionID || conversations[backendSessionID]) {
      return backendSessionID
    }

    for (const [uiSessionID, mappedBackendSessionID] of Object.entries(agentSessions)) {
      if (mappedBackendSessionID === backendSessionID) {
        return uiSessionID
      }
    }

    return conversations[backendSessionID] ? backendSessionID : null
  }

  function resolveBackendSessionID(sessionID: string) {
    return agentSessions[sessionID] ?? sessionID
  }

  function rememberSeenCursor(sessionID: string, cursor: string) {
    return sessionEventRouterRef.current.rememberSeenCursor(sessionID, cursor)
  }

  function cleanupTurnTarget(backendSessionID: string | undefined, turnID: string | undefined) {
    sessionEventRouterRef.current.cleanupTurnTarget(backendSessionID, turnID)
  }

  function cleanupPendingStreamsForBackendTurn(backendSessionID: string | undefined, turnID: string | undefined) {
    if (!backendSessionID || !turnID) return

    for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
      if (target.backendSessionID === backendSessionID && target.backendTurnID === turnID) {
        delete pendingStreamsRef.current[streamID]
      }
    }
  }

  function markBackendTurnSettled(backendSessionID: string | undefined, turnID: string | undefined) {
    sessionEventRouterRef.current.markBackendTurnSettled(backendSessionID, turnID)
  }

  function hasBackendTurnSettled(backendSessionID: string | undefined, turnID: string | undefined) {
    return sessionEventRouterRef.current.hasBackendTurnSettled(backendSessionID, turnID)
  }

  function replaceConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => ({
      ...prev,
      [sessionID]: nextTurns,
    }))
  }

  function appendConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => {
      const next = appendConversationTurnsToMap(prev, sessionID, nextTurns)
      persistUserTurns(sessionID, next[sessionID] ?? [])
      return next
    })
  }

  function updateAssistantConversationTurn(
    sessionID: string,
    turnID: string,
    updater: Parameters<typeof updateAssistantTurnInMap>[3],
  ) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => updateAssistantTurnInMap(prev, sessionID, turnID, updater))
  }

  function replaceConversationTurnsFromHistory(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => {
      const previousTurns = prev[sessionID]?.length ? prev[sessionID] : readPersistedUserTurns(sessionID)
      const mergedTurns = mergeUserTurnPresentationState(previousTurns, nextTurns)
      persistUserTurns(sessionID, mergedTurns)
      return {
        ...prev,
        [sessionID]: mergedTurns,
      }
    })
  }

  function resolveStreamCursor(event: { id?: string; data: unknown }) {
    const runtimeEvent = readRuntimeStreamEvent(event.data)
    if (runtimeEvent) {
      return event.id || readStreamString(runtimeEvent.eventID)
    }

    const payload = readStreamRecord(event.data)
    return readStreamString(payload?.cursor) || event.id || ""
  }

  function resolveStreamTurnID(event: { data: unknown }) {
    const runtimeEvent = readRuntimeStreamEvent(event.data)
    if (runtimeEvent) {
      return readStreamString(runtimeEvent.turnID) || undefined
    }

    const payload = readStreamRecord(event.data)
    return readStreamString(payload?.turnID) || undefined
  }

  function ensureAssistantTurnForBackendTurn(input: {
    uiSessionID: string
    backendSessionID: string
    turnID: string
  }) {
    const existing = sessionEventRouterRef.current.getTurnTarget(input.backendSessionID, input.turnID)
    if (existing) {
      return existing.assistantTurnID
    }

    const pending = Object.values(pendingStreamsRef.current).find(
      (target) =>
        target.sessionID === input.uiSessionID &&
        target.backendSessionID === input.backendSessionID &&
        (!target.backendTurnID || target.backendTurnID === input.turnID),
    )

    if (pending) {
      pending.backendTurnID = input.turnID
      sessionEventRouterRef.current.setTurnTarget(input.backendSessionID, input.turnID, {
        sessionID: input.uiSessionID,
        assistantTurnID: pending.assistantTurnID,
      })
      return pending.assistantTurnID
    }

    const streamingTurn = buildSessionStreamingAssistantTurn()
    sessionEventRouterRef.current.setTurnTarget(input.backendSessionID, input.turnID, {
      sessionID: input.uiSessionID,
      assistantTurnID: streamingTurn.id,
    })

    appendConversationTurns(input.uiSessionID, [streamingTurn])

    return streamingTurn.id
  }

  function handleRequestStreamEvent(streamEvent: AgentStreamIPCEvent) {
    const target = pendingStreamsRef.current[streamEvent.streamID]
    if (!target) return

    const cursor = resolveStreamCursor(streamEvent)
    if (cursor && rememberSeenCursor(target.sessionID, cursor)) {
      const backendTurnID = resolveStreamTurnID(streamEvent)
      const backendSessionID = target.backendSessionID ?? resolveBackendSessionID(target.sessionID)
      if (backendTurnID && isTerminalStreamEvent(streamEvent)) {
        delete pendingStreamsRef.current[streamEvent.streamID]
        cleanupTurnTarget(backendSessionID, backendTurnID)
      }
      return
    }

    const backendTurnID = resolveStreamTurnID(streamEvent)
    if (backendTurnID) {
      const backendSessionID = target.backendSessionID ?? resolveBackendSessionID(target.sessionID)
      if (hasBackendTurnSettled(backendSessionID, backendTurnID)) {
        delete pendingStreamsRef.current[streamEvent.streamID]
        cleanupTurnTarget(backendSessionID, backendTurnID)
        return
      }

      target.backendSessionID = backendSessionID
      target.backendTurnID = backendTurnID
      sessionEventRouterRef.current.setTurnTarget(backendSessionID, backendTurnID, {
        sessionID: target.sessionID,
        assistantTurnID: target.assistantTurnID,
      })
    }

    startTransition(() => {
      updateAssistantConversationTurn(target.sessionID, target.assistantTurnID, (turn) =>
        applyAgentStreamEventToTurn(turn, streamEvent),
      )
    })

    if (isPermissionRequestStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(target.sessionID)
      void loadPendingPermissionRequestsForSession(target.sessionID).catch((error) => {
        console.error("[desktop] stream permission request refresh failed:", error)
      })
    }

    scheduleRuntimeDebugRefresh(
      target.sessionID,
      target.backendSessionID ?? resolveBackendSessionID(target.sessionID),
    )

    if (isTerminalStreamEvent(streamEvent)) {
      if (isCompletedStreamEvent(streamEvent)) {
        updateSessionContextUsage(target.sessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
      markBackendTurnSettled(target.backendSessionID, target.backendTurnID)
      delete pendingStreamsRef.current[streamEvent.streamID]
      cleanupTurnTarget(target.backendSessionID, target.backendTurnID)
      refreshWorkspaceForSession(target.sessionID)

      if (canLoadSessionHistory) {
        void reloadSessionHistoryForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream history refresh failed:", error)
        })
        void loadSessionDiffForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream diff refresh failed:", error)
        })
        void loadPendingPermissionRequestsForSession(target.sessionID).catch((error) => {
          console.error("[desktop] stream permission refresh failed:", error)
        })
      }
    }
  }

  function handleSessionStreamEvent(streamEvent: AgentSessionStreamIPCEvent) {
    const uiSessionID = resolveUISessionID(streamEvent.sessionID)
    if (!uiSessionID) return

    const cursor = resolveStreamCursor(streamEvent)
    if (cursor && rememberSeenCursor(uiSessionID, cursor)) {
      return
    }

    const backendTurnID = resolveStreamTurnID(streamEvent)
    if (!backendTurnID) {
      if (isTerminalStreamEvent(streamEvent)) {
        if (isCompletedStreamEvent(streamEvent)) {
          updateSessionContextUsage(uiSessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
        }
        refreshWorkspaceForSession(uiSessionID)
        scheduleRuntimeDebugRefresh(uiSessionID, streamEvent.sessionID)
        void reloadSessionHistoryForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream history refresh failed:", error)
        })
      }
      return
    }

    if (hasBackendTurnSettled(streamEvent.sessionID, backendTurnID)) return

    const assistantTurnID = ensureAssistantTurnForBackendTurn({
      uiSessionID,
      backendSessionID: streamEvent.sessionID,
      turnID: backendTurnID,
    })

    startTransition(() => {
      updateAssistantConversationTurn(uiSessionID, assistantTurnID, (turn) => applyAgentStreamEventToTurn(turn, streamEvent))
    })

    if (isPermissionRequestStreamEvent(streamEvent)) {
      refreshWorkspaceForSession(uiSessionID)
      void loadPendingPermissionRequestsForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
        console.error("[desktop] session stream permission request refresh failed:", error)
      })
    }

    scheduleRuntimeDebugRefresh(uiSessionID, streamEvent.sessionID)

    if (isTerminalStreamEvent(streamEvent)) {
      if (isCompletedStreamEvent(streamEvent)) {
        updateSessionContextUsage(uiSessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
      markBackendTurnSettled(streamEvent.sessionID, backendTurnID)
      cleanupPendingStreamsForBackendTurn(streamEvent.sessionID, backendTurnID)
      cleanupTurnTarget(streamEvent.sessionID, backendTurnID)
      refreshWorkspaceForSession(uiSessionID)
      if (canLoadSessionHistory) {
        void reloadSessionHistoryForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream history refresh failed:", error)
        })
        void loadSessionDiffForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream diff refresh failed:", error)
        })
        void loadPendingPermissionRequestsForSession(uiSessionID, streamEvent.sessionID).catch((error) => {
          console.error("[desktop] session stream permission refresh failed:", error)
        })
      }
    }
  }

  function handleAgentSessionBridgeEvent(sessionEvent: AgentSessionBridgeEvent) {
    if (sessionEvent.kind === "subscription-state") {
      agentSessionStoreRef.current.dispatch({
        type: "subscription.state",
        event: sessionEvent,
      })
      return
    }

    if (sessionEvent.source === "request") {
      if (!sessionEvent.clientTurnID) return
      handleRequestStreamEvent({
        streamID: sessionEvent.clientTurnID,
        id: sessionEvent.id,
        event: sessionEvent.event,
        data: sessionEvent.data,
      })
      return
    }

    handleSessionStreamEvent({
      sessionID: sessionEvent.backendSessionID,
      id: sessionEvent.id,
      event: sessionEvent.event,
      data: sessionEvent.data,
    })
  }

  async function reloadSessionHistoryForSession(sessionID: string, backendSessionID = resolveBackendSessionID(sessionID)) {
    const agentSession = getAgentSessionBridge()
    if (!agentSession) return

    const messages = await agentSession.loadHistory({ backendSessionID })
    const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)
    startTransition(() => {
      replaceConversationTurnsFromHistory(sessionID, buildTurnsFromHistory(messages))
      syncSessionContextUsageFromHistory(sessionID, nextContextUsage)
    })
  }

  async function loadSessionDiffForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    const getSessionDiff = window.desktop?.getSessionDiff
    if (!getSessionDiff) return

    clearSessionDiffRefreshTimer(sessionID)
    const requestID = (sessionDiffRequestRef.current[sessionID] ?? 0) + 1
    sessionDiffRequestRef.current[sessionID] = requestID
    const hasExistingSummary = Boolean(sessionDiffBySession[sessionID])
    setSessionDiffRequestState(sessionID, hasExistingSummary)

    try {
      const nextDiff = await getSessionDiff({ sessionID: backendSessionID })
      if (sessionDiffRequestRef.current[sessionID] !== requestID) return

      setSessionDiffBySession((prev) => ({
        ...prev,
        [sessionID]: nextDiff,
      }))
      setSessionDiffStateBySession((prev) => ({
        ...prev,
        [sessionID]: {
          status: nextDiff.diffs.length > 0 ? "ready" : "empty",
          errorMessage: null,
          updatedAt: Date.now(),
          isStale: false,
        },
      }))
    } catch (error) {
      if (sessionDiffRequestRef.current[sessionID] !== requestID) return
      const message = error instanceof Error ? error.message : String(error)
      setSessionDiffStateBySession((prev) => {
        const current = prev[sessionID] ?? DEFAULT_SESSION_DIFF_STATE
        return {
          ...prev,
          [sessionID]: {
            ...current,
            status: "error",
            errorMessage: message,
            isStale: hasExistingSummary || current.isStale,
          },
        }
      })
      console.error("[desktop] getSessionDiff failed:", error)
    }
  }

  async function loadSessionRuntimeDebugForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
    options?: {
      limit?: number
      turns?: number
    },
  ) {
    const getSessionRuntimeDebug = window.desktop?.getSessionRuntimeDebug
    if (!getSessionRuntimeDebug) return

    clearRuntimeDebugRefreshTimer(sessionID)

    const requestID = (runtimeDebugRequestRef.current[sessionID] ?? 0) + 1
    runtimeDebugRequestRef.current[sessionID] = requestID
    const hasExistingSnapshot = Boolean(sessionRuntimeDebugBySession[sessionID])
    setSessionRuntimeDebugRequestState(sessionID, hasExistingSnapshot)

    try {
      const nextRuntimeDebug = await getSessionRuntimeDebug({
        sessionID: backendSessionID,
        limit: options?.limit,
        turns: options?.turns,
      })
      if (runtimeDebugRequestRef.current[sessionID] !== requestID) return

      setSessionRuntimeDebugBySession((prev) => ({
        ...prev,
        [sessionID]: nextRuntimeDebug,
      }))
      setSessionRuntimeDebugStateBySession((prev) => ({
        ...prev,
        [sessionID]: {
          status: "ready",
          errorMessage: null,
          updatedAt: Date.now(),
          isStale: false,
        },
      }))
    } catch (error) {
      if (runtimeDebugRequestRef.current[sessionID] !== requestID) return
      const message = error instanceof Error ? error.message : String(error)
      setSessionRuntimeDebugStateBySession((prev) => {
        const current = prev[sessionID] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
        return {
          ...prev,
          [sessionID]: {
            ...current,
            status: "error",
            errorMessage: message,
            isStale: hasExistingSnapshot || current.isStale,
          },
        }
      })
      console.error("[desktop] getSessionRuntimeDebug failed:", error)
    }
  }

  function scheduleRuntimeDebugRefresh(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
    delayMs = 160,
  ) {
    if (!window.desktop?.getSessionRuntimeDebug) return

    clearRuntimeDebugRefreshTimer(sessionID)
    runtimeDebugRefreshTimerRef.current[sessionID] = window.setTimeout(() => {
      delete runtimeDebugRefreshTimerRef.current[sessionID]
      void loadSessionRuntimeDebugForSession(sessionID, backendSessionID).catch((error) => {
        console.error("[desktop] session runtime debug refresh failed:", error)
      })
    }, delayMs)
  }

  async function loadPendingPermissionRequestsForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    const agentSession = getAgentSessionBridge()
    if (!agentSession) return

    const requestID = (permissionRequestsRequestRef.current[sessionID] ?? 0) + 1
    permissionRequestsRequestRef.current[sessionID] = requestID

    try {
      const nextRequests = await agentSession.loadPermissionRequests({ backendSessionID })
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return

      setPendingPermissionRequestsBySession((prev) => ({
        ...prev,
        [sessionID]: nextRequests.filter((request) => request.status === "pending"),
      }))
    } catch (error) {
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return
      console.error("[desktop] agentSession.loadPermissionRequests failed:", error)
    }
  }

  const handleAgentSessionBridgeEventEffect = useEffectEvent((sessionEvent: AgentSessionBridgeEvent) => {
    handleAgentSessionBridgeEvent(sessionEvent)
  })

  const handleWorkspaceFileChangeEffect = useEffectEvent((workspaceEvent: WorkspaceFileChangeIPCEvent) => {
    const normalizedEventDirectory = normalizeWorkspacePath(workspaceEvent.directory, platform)
    const normalizedActiveSessionDirectory = activeSessionDirectory
      ? normalizeWorkspacePath(activeSessionDirectory, platform)
      : null
    const now = Date.now()

    if (activeSessionID && normalizedActiveSessionDirectory === normalizedEventDirectory) {
      const activeRelativePaths = workspaceEvent.paths
        .map((changedPath) =>
          resolveWorkspaceRelativePath(activeSessionDirectory ?? workspaceEvent.directory, changedPath, platform),
        )
        .filter((value): value is string => value !== null)

      if (shouldRefreshWorkspaceDiffFromRelativePaths(activeRelativePaths)) {
        setSessionDiffStateBySession((prev) => {
          const current = prev[activeSessionID] ?? DEFAULT_SESSION_DIFF_STATE
          return {
            ...prev,
            [activeSessionID]: {
              ...current,
              isStale: true,
            },
          }
        })
        scheduleSessionDiffRefreshForSession(activeSessionID)
      }
    }

    const matchingWorkspace = workspaces.find(
      (workspace) => normalizeWorkspacePath(workspace.directory, platform) === normalizedEventDirectory,
    )
    if (!matchingWorkspace) return

    const relativePaths = workspaceEvent.paths
      .map((changedPath) => resolveWorkspaceRelativePath(matchingWorkspace.directory, changedPath, platform))
      .filter((value): value is string => value !== null)
    const requiresWorkspaceReload = relativePaths.some(shouldReloadWorkspaceFromRelativePath)

    if (now >= (gitRefreshSuppressedUntilRef.current[normalizedEventDirectory] ?? 0)) {
      gitRefreshSuppressedUntilRef.current[normalizedEventDirectory] = now + GIT_REFRESH_SUPPRESSION_MS
      notifyGitStateChanged({
        directory: matchingWorkspace.directory,
      })
    }

    if (!requiresWorkspaceReload) return
    if (now < (workspaceReloadSuppressedUntilRef.current[normalizedEventDirectory] ?? 0)) return

    workspaceReloadSuppressedUntilRef.current[normalizedEventDirectory] = now + WORKSPACE_RELOAD_SUPPRESSION_MS
    void refreshWorkspaceFromDirectory(matchingWorkspace.directory)
  })

  useEffect(() => {
    const unsubscribe = getAgentSessionBridge()?.onEvent((sessionEvent) => {
      handleAgentSessionBridgeEventEffect(sessionEvent)
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.desktop?.onWorkspaceFileChange?.((workspaceEvent: WorkspaceFileChangeIPCEvent) => {
      handleWorkspaceFileChangeEffect(workspaceEvent)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const agentSession = getAgentSessionBridge()

    if (!agentConnected || !canLoadSessionHistory || !agentSession) {
      if (agentSession) {
        for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
          void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
        }
      }
      subscribedSessionStreamsRef.current = {}
      return
    }

    const nextSubscriptions = Object.fromEntries(
      openCanvasSessionIDs
        .map((uiSessionID) => [uiSessionID, resolveBackendSessionID(uiSessionID)] as const)
        .filter(([, backendSessionID]) => Boolean(backendSessionID)),
    )

    for (const [uiSessionID, backendSessionID] of Object.entries(subscribedSessionStreamsRef.current)) {
      if (nextSubscriptions[uiSessionID] === backendSessionID) continue
      void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
      delete subscribedSessionStreamsRef.current[uiSessionID]
    }

    for (const [uiSessionID, backendSessionID] of Object.entries(nextSubscriptions)) {
      if (subscribedSessionStreamsRef.current[uiSessionID] === backendSessionID) continue
      subscribedSessionStreamsRef.current[uiSessionID] = backendSessionID
      void agentSession.subscribe({ uiSessionID, backendSessionID }).catch((error) => {
        console.error("[desktop] agentSession.subscribe failed:", error)
      })
    }
  }, [agentConnected, canLoadSessionHistory, openCanvasSessionIDs, agentSessions])

  useEffect(() => {
    return () => {
      const agentSession = getAgentSessionBridge()
      if (!agentSession) return

      for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
        void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
      }
      subscribedSessionStreamsRef.current = {}
    }
  }, [])

  useEffect(() => {
    const updateWorkspaceWatchDirectories = window.desktop?.updateWorkspaceWatchDirectories
    if (!updateWorkspaceWatchDirectories) return

    const activeWorkspaceID = activeWorkspace?.id ?? null
    const shouldWatchActiveSessionDirectory =
      Boolean(activeSessionDirectory?.trim()) &&
      activeWorkspaceID !== null &&
      isWorkspaceAvailable(activeWorkspace) &&
      !(isInitialWorkspaceLoadPending && seedWorkspaceIDs.has(activeWorkspaceID))
    const uniqueDirectories = [
      ...new Set(
        [
          ...workspaces
            .filter((workspace) => !seedWorkspaceIDs.has(workspace.id) && isWorkspaceAvailable(workspace))
            .map((workspace) => workspace.directory.trim()),
          shouldWatchActiveSessionDirectory ? activeSessionDirectory?.trim() ?? "" : "",
        ].filter(Boolean),
      ),
    ]
    const normalizedKey = uniqueDirectories
      .map((directory) =>
        platform === "win32" ? directory.replace(/\//g, "\\").toLowerCase() : directory.replace(/\\/g, "/"),
      )
      .sort()
      .join("\n")

    if (normalizedKey === watchedWorkspaceDirectoriesKeyRef.current) return
    watchedWorkspaceDirectoriesKeyRef.current = normalizedKey

    void updateWorkspaceWatchDirectories({
      directories: uniqueDirectories,
    }).catch((error) => {
      console.error("[desktop] updateWorkspaceWatchDirectories failed:", error)
    })
  }, [activeSessionDirectory, activeWorkspace, isInitialWorkspaceLoadPending, platform, workspaces])

  useEffect(() => {
    let mounted = true

    const listFolderWorkspaces = window.desktop?.listFolderWorkspaces
    if (!listFolderWorkspaces) {
      return () => {
        mounted = false
      }
    }

    listFolderWorkspaces()
      .then((loadedWorkspaces) => {
        if (!mounted) return

        const nextWorkspaces = mapLoadedWorkspaces(loadedWorkspaces)
        const loadedSessionIDs = loadedWorkspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id))
        const preserveLocalWorkspaceState = preserveLocalWorkspaceStateOnInitialLoadRef.current
        setWorkspaces((current) => {
          if (!preserveLocalWorkspaceState) {
            return nextWorkspaces
          }

          const loadedWorkspaceIDs = new Set(nextWorkspaces.map((workspace) => workspace.id))
          const preservedWorkspaces = current.filter(
            (workspace) => !loadedWorkspaceIDs.has(workspace.id) && !seedWorkspaceIDs.has(workspace.id),
          )

          return sortWorkspaceGroups([...nextWorkspaces, ...preservedWorkspaces])
        })
        setConversations((prev) => ensureConversationSessions(prev, loadedSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, loadedSessionIDs))
        setSessionDirectoryBySession((prev) => ({
          ...prev,
          ...collectSessionDirectoryMap(loadedWorkspaces),
        }))
        setCanLoadSessionHistory(true)

        if (!preserveLocalWorkspaceState) {
          const nextSelection = findFirstSession(nextWorkspaces)
          const nextFolderID = nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
          const nextCreateSessionTab = nextSelection.session === null ? createCreateSessionTab(nextFolderID) : null
          const nextInitialTab =
            nextSelection.session !== null
              ? createSessionWorkbenchTab(nextSelection.session.id)
              : nextCreateSessionTab
                ? createCreateSessionWorkbenchTab(nextCreateSessionTab.id)
                : null
          const nextPane = nextInitialTab ? createWorkbenchPane([nextInitialTab]) : null
          setSelectedFolderID(nextFolderID)
          setExpandedFolderID(nextFolderID)
          setCreateSessionTabs(nextCreateSessionTab ? [nextCreateSessionTab] : [])
          setWorkbenchLayout(nextInitialTab ? createWorkbenchLayoutWithTab(nextInitialTab) : normalizeLayoutState({
            rootId: null,
            nodes: {},
            tabs: {},
            docs: {},
            focusedGroupId: null,
          }))
          lastFocusedSessionIDRef.current = nextSelection.session?.id ?? null
        }

        initialFolderWorkspacesLoadedRef.current = true
        setIsInitialWorkspaceLoadPending(false)
      })
      .catch(() => {
        setIsInitialWorkspaceLoadPending(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const agentSession = getAgentSessionBridge()
    if (!canLoadSessionHistory || !activeSessionID || !agentSession) return

    if (skipNextHistoryLoadRef.current[activeSessionID]) {
      delete skipNextHistoryLoadRef.current[activeSessionID]
      return
    }

    let cancelled = false
    const sessionID = activeSessionID
    const backendSessionID = resolveBackendSessionID(sessionID)
    const requestID = ++historyRequestRef.current
    const baselineVersion = conversationVersionRef.current[sessionID] ?? 0

    agentSession.loadHistory({ backendSessionID })
      .then((messages) => {
        if (cancelled || historyRequestRef.current !== requestID) return
        if ((conversationVersionRef.current[sessionID] ?? 0) !== baselineVersion) return
        const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)

        startTransition(() => {
          replaceConversationTurnsFromHistory(sessionID, buildTurnsFromHistory(messages))
          updateSessionContextUsage(sessionID, nextContextUsage)
        })
      })
      .catch((error) => {
        console.error("[desktop] agentSession.loadHistory failed:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeSessionID, canLoadSessionHistory])

  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadSessionDiffForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadSessionRuntimeDebugForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadPendingPermissionRequestsForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    return () => {
      for (const sessionID of Object.keys(sessionDiffRefreshTimerRef.current)) {
        clearSessionDiffRefreshTimer(sessionID)
      }
      for (const sessionID of Object.keys(runtimeDebugRefreshTimerRef.current)) {
        clearRuntimeDebugRefreshTimer(sessionID)
      }
    }
  }, [])

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

  useEffect(() => {
    if (!selectedFolderID) return

    const projectRow = projectRowRefs.current[selectedFolderID]
    projectRow?.scrollIntoView?.({
      block: "nearest",
    })
  }, [selectedFolderID, workspaces])

  useEffect(() => {
    const threadColumn = threadColumnRef.current
    if (!threadColumn) return

    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [activeSessionID, activeTurns, activePendingPermissionRequests.length, permissionRequestActionRequestID])

  useEffect(() => {
    const validWorkspaceIDs = new Set(workspaces.map((workspace) => workspace.id))
    const validSessionIDs = new Set(workspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id)))

    setWorkbenchLayout((current) =>
      filterLayoutTabs(current, (reference) => reference.kind !== "session" || validSessionIDs.has(reference.sessionID)),
    )

    const fallbackWorkspaceID = resolveCreateSessionWorkspaceID(workspaces, selectedFolderID, activeWorkspace?.id ?? null)

    setCreateSessionTabs((current) => {
      let changed = false
      const next = current.map((tab) => {
        const nextWorkspaceID = tab.workspaceID && validWorkspaceIDs.has(tab.workspaceID) ? tab.workspaceID : fallbackWorkspaceID

        if (nextWorkspaceID === tab.workspaceID) {
          return tab
        }

        changed = true
        return {
          ...tab,
          workspaceID: nextWorkspaceID,
        }
      })

      return changed ? next : current
    })
  }, [activeWorkspace?.id, selectedFolderID, workspaces])

  useEffect(() => {
    if (workbenchPanes.length > 0) return

    const fallbackWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaces,
      activeCreateSessionTab?.workspaceID ?? null,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const fallbackCreateSessionTab =
      activeCreateSessionTab ??
      createSessionTabs[createSessionTabs.length - 1] ??
      createCreateSessionTab(fallbackWorkspaceID)

    if (createSessionTabs.length === 0) {
      setCreateSessionTabs([fallbackCreateSessionTab])
    }

    setWorkbenchLayout(createWorkbenchLayoutWithTab(createCreateSessionWorkbenchTab(fallbackCreateSessionTab.id)))

    if (fallbackCreateSessionTab.workspaceID !== selectedFolderID) {
      setSelectedFolderID(fallbackCreateSessionTab.workspaceID)
      setExpandedFolderID(fallbackCreateSessionTab.workspaceID)
    }
  }, [activeCreateSessionTab, createSessionTabs, selectedFolderID, workspaces, activeWorkspace?.id, workbenchPanes])

  useEffect(() => {
    if (focusedPaneID && workbenchPanes.some((pane) => pane.id === focusedPaneID)) return
    setFocusedPaneID(workbenchPanes[0]?.id ?? null)
  }, [focusedPaneID, workbenchPanes])

  function activateSessionTab(workspaceID: string, sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    lastFocusedSessionIDRef.current = sessionID
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createSessionWorkbenchTab(sessionID)),
    )
  }

  function focusSession(workspaceID: string, sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    const existingPaneID = getGroupIdForTabId(workbenchLayout, getTabIdForReference(createSessionWorkbenchTab(sessionID)))
    if (existingPaneID) {
      activateSessionTab(workspaceID, sessionID, existingPaneID)
      return
    }

    activateSessionTab(workspaceID, sessionID, paneID)
  }

  function focusCreateSessionTab(
    createSessionTabID: string,
    paneID = getPaneByTabKey(workbenchPanes, `create-session:${createSessionTabID}`)?.id ?? focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
  ) {
    const nextCreateSessionTab = createSessionTabs.find((tab) => tab.id === createSessionTabID)
    if (!nextCreateSessionTab) return

    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createCreateSessionWorkbenchTab(nextCreateSessionTab.id)),
    )
    setSelectedFolderID(nextCreateSessionTab.workspaceID)
    setExpandedFolderID(nextCreateSessionTab.workspaceID)
  }

  function openCreateSessionTab(
    preferredWorkspaceID?: string | null,
    paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
    workspaceScope = workspaces,
  ) {
    const nextWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaceScope,
      preferredWorkspaceID,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const nextCreateSessionTab = createCreateSessionTab(nextWorkspaceID)

    setCreateSessionTabs((current) => [...current, nextCreateSessionTab])
    setWorkbenchLayout((current) =>
      upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, paneID), createCreateSessionWorkbenchTab(nextCreateSessionTab.id)),
    )

    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderID(nextWorkspaceID)
  }

  function focusMostRecentCreateSessionTab(
    preferredWorkspaceID?: string | null,
    paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null,
  ) {
    const paneActiveTab = paneID ? getPaneActiveTab(getPaneByID(workbenchPanes, paneID)) : null
    const nextCreateSessionTabID =
      (paneActiveTab?.kind === "create-session" ? paneActiveTab.createSessionTabID : null) ??
      createSessionTabs[createSessionTabs.length - 1]?.id ??
      null
    if (nextCreateSessionTabID) {
      focusCreateSessionTab(nextCreateSessionTabID, paneID)
      return
    }

    openCreateSessionTab(preferredWorkspaceID, paneID)
  }

  function focusExistingCreateSessionTabAcrossPanes(preferredWorkspaceID?: string | null) {
    const nextCreateSessionTabID = createSessionTabs[createSessionTabs.length - 1]?.id ?? null
    if (!nextCreateSessionTabID) return false

    focusCreateSessionTab(nextCreateSessionTabID)
    if (preferredWorkspaceID) {
      handleCreateSessionWorkspaceChange(preferredWorkspaceID, nextCreateSessionTabID)
    }
    return true
  }

  function removeWorkspaceSessionState(workspace: WorkspaceGroup) {
    const sessionIDs = new Set(workspace.sessions.map((session) => session.id))

    setConversations((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setAgentSessions((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setPendingPermissionRequestsBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionDiffBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionDiffStateBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionRuntimeDebugBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionRuntimeDebugStateBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSelectedDiffFileBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionDirectoryBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setContextUsageBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    for (const sessionID of sessionIDs) {
      delete conversationVersionRef.current[sessionID]
      delete permissionRequestsRequestRef.current[sessionID]
      delete sessionDiffRequestRef.current[sessionID]
      clearSessionDiffRefreshTimer(sessionID)
      delete runtimeDebugRequestRef.current[sessionID]
      clearRuntimeDebugRefreshTimer(sessionID)
      sessionEventRouterRef.current.cleanupUISession(sessionID)
      agentSessionStoreRef.current.dispatch({
        type: "session.cleanup",
        sessionID,
      })
      delete subscribedSessionStreamsRef.current[sessionID]
    }

    for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
      if (sessionIDs.has(target.sessionID)) {
        delete pendingStreamsRef.current[streamID]
      }
    }
  }

  async function createSessionForWorkspace(
    workspace: WorkspaceGroup,
    options?: {
      createSessionTabID?: string | null
      closeCreateTab?: boolean
      paneID?: string | null
      skipInitialHistoryLoad?: boolean
      title?: string
    },
  ) {
    const createTabKey = options?.createSessionTabID ? `create-session:${options.createSessionTabID}` : null
    if ((createTabKey && isCreatingSessionByTabKey[createTabKey]) || !window.desktop?.createFolderSession) return null

    if (createTabKey) {
      setIsCreatingSessionByTabKey((current) => ({
        ...current,
        [createTabKey]: true,
      }))
    }
    try {
      const nextTitle = options?.title?.trim()
      const created = await window.desktop.createFolderSession({
        projectID: workspace.project.id,
        directory: workspace.directory,
        title: nextTitle || undefined,
      })
      const nextSession = mapLoadedSession(created.session, workspace.sessions.length)
      setWorkspaces((prev) => upsertSessionInWorkspace(prev, workspace.id, nextSession))
      setConversations((prev) => ({
        ...prev,
        [created.session.id]: prev[created.session.id] ?? [],
      }))
      setAgentSessions((prev) => ({
        ...prev,
        [created.session.id]: created.session.id,
      }))
      setSessionDirectoryBySession((prev) => ({
        ...prev,
        [created.session.id]: created.session.directory,
      }))
      if (createTabKey) {
        const nextSessionTabKey = getWorkbenchTabKey(createSessionWorkbenchTab(created.session.id))
        setComposerPermissionModeByTabKey((current) => {
          const next = { ...current }
          next[nextSessionTabKey] = current[createTabKey] ?? "default"
          delete next[createTabKey]
          return next
        })
      }
      setCanLoadSessionHistory(true)
      if (options?.skipInitialHistoryLoad) {
        skipNextHistoryLoadRef.current[created.session.id] = true
      }

      if (options?.closeCreateTab && options.createSessionTabID) {
        setCreateSessionTabs((current) => current.filter((tab) => tab.id !== options.createSessionTabID))
        setWorkbenchLayout((current) => {
          const targetPaneID =
            options.paneID ??
            getGroupIdForTabId(current, getTabIdForReference(createCreateSessionWorkbenchTab(options.createSessionTabID!))) ??
            resolveWorkbenchGroupID(current, focusedPane?.id ?? null)
          if (!targetPaneID) return current
          return replaceTabReferenceInGroup(
            current,
            targetPaneID,
            getTabIdForReference(createCreateSessionWorkbenchTab(options.createSessionTabID!)),
            createSessionWorkbenchTab(created.session.id),
          )
        })
      } else if (options?.createSessionTabID) {
        setCreateSessionTabs((current) =>
          current.map((tab) =>
            tab.id === options.createSessionTabID
              ? {
                  ...tab,
                  title: "",
                  workspaceID: workspace.id,
                }
              : tab,
          ),
        )
        setWorkbenchLayout((current) => {
          const targetPaneID =
            options.paneID ??
            getGroupIdForTabId(current, getTabIdForReference(createCreateSessionWorkbenchTab(options.createSessionTabID!))) ??
            resolveWorkbenchGroupID(current, focusedPane?.id ?? null)
          if (!targetPaneID) return current
          return replaceTabReferenceInGroup(
            current,
            targetPaneID,
            getTabIdForReference(createCreateSessionWorkbenchTab(options.createSessionTabID!)),
            createSessionWorkbenchTab(created.session.id),
          )
        })
      } else if (options?.paneID) {
        setWorkbenchLayout((current) =>
          upsertTabReferenceInGroup(current, resolveWorkbenchGroupID(current, options.paneID), createSessionWorkbenchTab(created.session.id)),
        )
      }

      focusSession(workspace.id, created.session.id, options?.paneID ?? undefined)
      return {
        backendSessionID: created.session.id,
        session: nextSession,
        workspace,
      }
    } catch (error) {
      console.error("[desktop] createFolderSession failed:", error)
      return null
    } finally {
      if (createTabKey) {
        setIsCreatingSessionByTabKey((current) => {
          if (!(createTabKey in current)) return current
          const next = { ...current }
          delete next[createTabKey]
          return next
        })
      }
    }
  }

  async function handleSidebarAction(action: SidebarActionKey) {
    if (action === "project") {
      if (isCreatingProject || !window.desktop?.pickProjectDirectory || !window.desktop?.openFolderWorkspace) {
        return
      }

      setIsCreatingProject(true)
      try {
        const directory = await window.desktop.pickProjectDirectory()
        if (!directory) return

        const createdWorkspace = await window.desktop.openFolderWorkspace({ directory })
        if (!initialFolderWorkspacesLoadedRef.current) {
          preserveLocalWorkspaceStateOnInitialLoadRef.current = true
        }
        const nextWorkspace = mapLoadedWorkspace(createdWorkspace)
        const createdSessionIDs = createdWorkspace.sessions.map((session) => session.id)
        setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
        setConversations((prev) => ensureConversationSessions(prev, createdSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, createdSessionIDs))
        setSessionDirectoryBySession((prev) => ({
          ...prev,
          ...collectSessionDirectoryMap([createdWorkspace]),
        }))
        setCanLoadSessionHistory(true)
        setExpandedFolderID(createdWorkspace.id)
        setSelectedFolderID(createdWorkspace.id)
        const [initialWorkspaceSession] = getPrimaryWorkspaceSessions(nextWorkspace.sessions)
        if (initialWorkspaceSession) {
          focusSession(createdWorkspace.id, initialWorkspaceSession.id)
        } else if (!focusExistingCreateSessionTabAcrossPanes(createdWorkspace.id)) {
          openCreateSessionTab(createdWorkspace.id, undefined, [...workspaces, nextWorkspace])
        }
        lastFocusedSessionIDRef.current = initialWorkspaceSession?.id ?? null
      } catch (error) {
        console.error("[desktop] openFolderWorkspace failed:", error)
      } finally {
        setIsCreatingProject(false)
      }
      return
    }

    if (action === "sort") {
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: [...workspace.sessions].sort((left, right) => right.updated - left.updated),
        })),
      )
      return
    }

    openCreateSessionTab(selectedWorkspace?.id ?? workspaces[0]?.id ?? null)
  }

  function handleProjectClick(workspace: WorkspaceGroup) {
    const isSelected = selectedFolderID === workspace.id
    const isExpanded = expandedFolderID === workspace.id
    setSelectedFolderID(workspace.id)

    if (isSelected && isExpanded) {
      setExpandedFolderID(null)
      const primarySessions = getPrimaryWorkspaceSessions(workspace.sessions)
      if (primarySessions.length === 0) {
        return
      }

      if (isCreateSessionTabActive || !workspace.sessions.some((session) => session.id === activeSessionID)) {
        focusSession(workspace.id, primarySessions[0]!.id)
      }
      return
    }

    setExpandedFolderID(workspace.id)
    const currentSessionInWorkspace = workspace.sessions.some((session) => session.id === activeSessionID)
    const primarySessions = getPrimaryWorkspaceSessions(workspace.sessions)
    if (primarySessions.length === 0) {
      return
    }

    if (currentSessionInWorkspace && !isCreateSessionTabActive && activeSessionID) {
      return
    }

    focusSession(workspace.id, primarySessions[0]!.id)
  }

  function handleSessionSelect(workspaceID: string, sessionID: string) {
    const existingPaneID = getGroupIdForTabId(workbenchLayout, getTabIdForReference(createSessionWorkbenchTab(sessionID)))
    if (existingPaneID) {
      focusSession(workspaceID, sessionID, existingPaneID)
      return
    }

    const targetPaneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null
    if (!targetPaneID) {
      setWorkbenchLayout(createWorkbenchLayoutWithTab(createSessionWorkbenchTab(sessionID)))
      setSelectedFolderID(workspaceID)
      setExpandedFolderID(workspaceID)
      return
    }

    focusSession(workspaceID, sessionID, targetPaneID)
  }

  function handleOpenSideChatInTab(sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    const selection = findSession(workspaces, sessionID)
    if (!selection.workspace || !selection.session) return
    focusSession(selection.workspace.id, selection.session.id, paneID)
  }

  function closeActiveSideChat(parentSessionID: string) {
    setActiveSideChatSessionIDByParentSessionID((current) => {
      if (!(parentSessionID in current)) return current
      const next = { ...current }
      delete next[parentSessionID]
      return next
    })
  }

  async function activateSideChatThread(parentSessionID: string, sessionID: string, workspaceID: string) {
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
    setActiveSideChatSessionIDByParentSessionID((current) => ({
      ...current,
      [parentSessionID]: sessionID,
    }))

    await Promise.allSettled([
      reloadSessionHistoryForSession(sessionID),
      loadPendingPermissionRequestsForSession(sessionID),
    ])
  }

  async function handleOpenSideChat(anchorMessageID: string, input?: { parentSessionID?: string | null; paneID?: string | null }) {
    const createSideChat = window.desktop?.createSideChat
    const parentSessionID = input?.parentSessionID ?? activeSessionID
    if (!parentSessionID) return

    const parentSelection = findSession(workspaces, parentSessionID)
    if (!parentSelection.workspace || !parentSelection.session || isSideChatSession(parentSelection.session)) {
      return
    }

    const activeInlineSideChatID = activeSideChatSessionIDByParentSessionID[parentSessionID] ?? null
    const activeInlineSideChatSelection = findSession(workspaces, activeInlineSideChatID)
    if (
      activeInlineSideChatSelection.session?.origin?.parentSessionID === parentSessionID &&
      activeInlineSideChatSelection.session.origin.anchorMessageID === anchorMessageID
    ) {
      closeActiveSideChat(parentSessionID)
      return
    }

    const existing = findLatestSideChatForAnchor(workspaces, parentSessionID, anchorMessageID)
    if (existing) {
      await activateSideChatThread(parentSessionID, existing.session.id, existing.workspace.id)
      return
    }

    if (!createSideChat) {
      return
    }

    try {
      const created = await createSideChat({
        parentSessionID,
        anchorMessageID,
      })
      const nextSession = mapLoadedSession(created.session, parentSelection.workspace.sessions.length)
      const nextTabKey = getWorkbenchTabKey(createSessionWorkbenchTab(created.session.id))

      setWorkspaces((prev) => upsertSessionInWorkspace(prev, parentSelection.workspace!.id, nextSession))
      setConversations((prev) => ({
        ...prev,
        [created.session.id]: prev[created.session.id] ?? [],
      }))
      setAgentSessions((prev) => ({
        ...prev,
        [created.session.id]: created.session.id,
      }))
      setSessionDirectoryBySession((prev) => ({
        ...prev,
        [created.session.id]: created.session.directory,
      }))
      setComposerPermissionModeByTabKey((current) => ({
        ...current,
        [nextTabKey]: "default",
      }))
      setCanLoadSessionHistory(true)
      await activateSideChatThread(parentSessionID, created.session.id, parentSelection.workspace.id)
    } catch (error) {
      console.error("[desktop] createSideChat failed:", error)
    }
  }

  async function handleProjectCreateSession(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (!isWorkspaceAvailable(workspace)) return
    if (focusExistingCreateSessionTabAcrossPanes(workspace.id)) return
    openCreateSessionTab(workspace.id)
  }

  function handleProjectRemove(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    const nextWorkspaces = workspaces.filter((item) => item.id !== workspace.id)
    const removedSessionIDs = new Set(workspace.sessions.map((session) => session.id))
    const nextCreateSessionWorkspaceID = resolveCreateSessionWorkspaceID(
      nextWorkspaces,
      activeCreateSessionTab?.workspaceID === workspace.id ? null : activeCreateSessionTab?.workspaceID ?? null,
      selectedFolderID,
    )
    const nextCreateSessionTabs = createSessionTabs.map((tab) => {
      const nextWorkspaceID =
        (tab.workspaceID && tab.workspaceID !== workspace.id ? findWorkspaceByID(nextWorkspaces, tab.workspaceID)?.id : null) ??
        nextCreateSessionWorkspaceID

      return nextWorkspaceID === tab.workspaceID
        ? tab
        : {
            ...tab,
            workspaceID: nextWorkspaceID,
          }
    })
    const nextWorkbenchLayout = filterLayoutTabs(
      workbenchLayout,
      (reference) => reference.kind !== "session" || !removedSessionIDs.has(reference.sessionID),
    )
    const nextFocusedPaneID = nextWorkbenchLayout.focusedGroupId
    const nextFocusedPane = getGroupNode(nextWorkbenchLayout, nextFocusedPaneID)
    const nextFocusedTab = nextFocusedPane?.activeTabId ? getReferenceForTabId(nextWorkbenchLayout, nextFocusedPane.activeTabId) : null
    const nextFocusedWorkspaceID =
      nextFocusedTab?.kind === "session"
        ? findSession(nextWorkspaces, nextFocusedTab.sessionID).workspace?.id ?? null
        : nextCreateSessionTabs.find((tab) => tab.id === nextFocusedTab?.createSessionTabID)?.workspaceID ?? null

    setWorkspaces(nextWorkspaces)
    setWorkbenchLayout(nextWorkbenchLayout)
    removeWorkspaceSessionState(workspace)
    setCreateSessionTabs(nextCreateSessionTabs)
    setHoveredFolderID((current) => (current === workspace.id ? null : current))
    setSelectedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID)
    setExpandedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID)
  }

  async function handleSessionDelete(workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (deletingSessionID || !window.desktop?.archiveAgentSession) return

    setDeletingSessionID(session.id)
    try {
      const archiveResult = await window.desktop.archiveAgentSession({ sessionID: session.id })
      const archivedSessionIDs = new Set(archiveResult.archivedSessionIDs?.filter(Boolean) ?? [session.id])
      const nextWorkspaces = sortWorkspaceGroups(
        workspaces.map((item) => ({
          ...item,
          sessions: item.sessions.filter((existing) => !archivedSessionIDs.has(existing.id)),
        })),
      )
      const nextCreateSessionWorkspaceID = resolveCreateSessionWorkspaceID(
        nextWorkspaces,
        activeCreateSessionTab?.workspaceID ?? createSessionWorkspaceID,
        workspace.id,
      )
      const nextCreateSessionTabs = createSessionTabs.map((tab) => {
        const nextWorkspaceID = findWorkspaceByID(nextWorkspaces, tab.workspaceID ?? "")?.id ?? nextCreateSessionWorkspaceID

        return nextWorkspaceID === tab.workspaceID
          ? tab
          : {
              ...tab,
            workspaceID: nextWorkspaceID,
          }
      })
      const nextWorkbenchLayout = filterLayoutTabs(
        workbenchLayout,
        (reference) => reference.kind !== "session" || !archivedSessionIDs.has(reference.sessionID),
      )
      const nextFocusedPane = getGroupNode(nextWorkbenchLayout, nextWorkbenchLayout.focusedGroupId)
      const nextFocusedTab = nextFocusedPane?.activeTabId ? getReferenceForTabId(nextWorkbenchLayout, nextFocusedPane.activeTabId) : null
      const nextFocusedWorkspaceID =
        nextFocusedTab?.kind === "session"
          ? findSession(nextWorkspaces, nextFocusedTab.sessionID).workspace?.id ?? null
          : nextCreateSessionTabs.find((tab) => tab.id === nextFocusedTab?.createSessionTabID)?.workspaceID ?? null

      setWorkspaces(nextWorkspaces)
      setWorkbenchLayout(nextWorkbenchLayout)
      setCreateSessionTabs(nextCreateSessionTabs)
      setConversations((prev) => {
        let next = prev
        for (const archivedSessionID of archivedSessionIDs) {
          next = removeConversationSession(next, archivedSessionID)
        }
        return next
      })
      setAgentSessions((prev) => {
        let next = prev
        for (const archivedSessionID of archivedSessionIDs) {
          next = removeAgentSession(next, archivedSessionID)
        }
        return next
      })
      setPendingPermissionRequestsBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSessionDiffBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSessionDiffStateBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSessionRuntimeDebugBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSessionRuntimeDebugStateBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSelectedDiffFileBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setSessionDirectoryBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setContextUsageBySession((prev) => {
        const next = { ...prev }
        for (const archivedSessionID of archivedSessionIDs) {
          delete next[archivedSessionID]
        }
        return next
      })
      setActiveSideChatSessionIDByParentSessionID((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([parentSessionID, sideChatSessionID]) =>
            !archivedSessionIDs.has(parentSessionID) && !archivedSessionIDs.has(sideChatSessionID)
          ),
        )
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
      for (const archivedSessionID of archivedSessionIDs) {
        delete conversationVersionRef.current[archivedSessionID]
        delete permissionRequestsRequestRef.current[archivedSessionID]
        delete sessionDiffRequestRef.current[archivedSessionID]
        clearSessionDiffRefreshTimer(archivedSessionID)
        delete runtimeDebugRequestRef.current[archivedSessionID]
        clearRuntimeDebugRefreshTimer(archivedSessionID)
        sessionEventRouterRef.current.cleanupUISession(archivedSessionID)
        agentSessionStoreRef.current.dispatch({
          type: "session.cleanup",
          sessionID: archivedSessionID,
        })
        delete subscribedSessionStreamsRef.current[archivedSessionID]
      }
      for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
        if (archivedSessionIDs.has(target.sessionID)) {
          delete pendingStreamsRef.current[streamID]
        }
      }
      setSelectedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID ?? nextWorkspaces[0]?.id ?? null)
      setExpandedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID ?? null)
    } catch (error) {
      console.error("[desktop] archiveAgentSession failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  function handleCanvasSessionTabSelect(sessionID: string, paneID?: string) {
    const nextSelection = findSession(workspaces, sessionID)
    if (!nextSelection.workspace || !nextSelection.session) return

    focusSession(nextSelection.workspace.id, nextSelection.session.id, paneID)
  }

  function handleCanvasSessionTabClose(sessionID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return

    setWorkbenchLayout((current) =>
      removeTabFromGroup(current, paneID, getTabIdForReference(createSessionWorkbenchTab(sessionID))),
    )
  }

  function handleCreateSessionTabSelect(createSessionTabID: string, paneID?: string) {
    focusCreateSessionTab(createSessionTabID, paneID)
  }

  function handleOpenCreateSessionTab(preferredWorkspaceID?: string | null, paneID?: string) {
    openCreateSessionTab(preferredWorkspaceID, paneID)
  }

  function handleCloseCreateSessionTab(createSessionTabID: string, paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return
    if (workbenchPanes.length === 1 && workbenchPanes[0]?.tabs.length === 1) {
      return
    }

    const nextCreateSessionTabs = createSessionTabs.filter((tab) => tab.id !== createSessionTabID)
    setCreateSessionTabs(nextCreateSessionTabs)
    setWorkbenchLayout((current) =>
      removeTabFromGroup(current, paneID, getTabIdForReference(createCreateSessionWorkbenchTab(createSessionTabID))),
    )
  }

  function handleCreateSessionWorkspaceChange(workspaceID: string, createSessionTabID = activeCreateSessionTabID) {
    if (!createSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === createSessionTabID
          ? {
              ...tab,
              workspaceID,
            }
          : tab,
      ),
    )
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
  }

  function handleCreateSessionTitleChange(value: string, createSessionTabID = activeCreateSessionTabID) {
    if (!createSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === createSessionTabID
          ? {
              ...tab,
              title: value,
            }
          : tab,
      ),
    )
  }

  async function handleCreateSessionSubmit(createSessionTabID = activeCreateSessionTabID, paneID = focusedPane?.id ?? null) {
    if (!createSessionTabID) return
    const currentCreateSessionTab = createSessionTabs.find((tab) => tab.id === createSessionTabID)
    if (!currentCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, currentCreateSessionTab.workspaceID)
    if (!workspace) return

    await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID,
      paneID,
    })
  }

  function handlePaneFocus(paneID: string) {
    const pane = getGroupNode(workbenchLayout, paneID)
    if (!pane) return

    const nextActiveTab = pane.activeTabId ? getReferenceForTabId(workbenchLayout, pane.activeTabId) : null
    const nextWorkspaceID = resolveWorkspaceIDForTab(nextActiveTab)
    setFocusedPaneID(paneID)
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderID(nextWorkspaceID)
  }

  function handleSplitResize(splitID: string, leftIndex: number, leftSize: number, rightSize: number) {
    setWorkbenchLayout((current) => resizeSplitChildren(current, splitID, leftIndex, leftSize, rightSize))
  }

  function handlePaneTabDrop(input: {
    position: "center" | "left" | "right" | "top" | "bottom"
    sourcePaneID: string
    tabKey: string
    targetPaneID: string
  }) {
    const movedTab = getWorkbenchTabReferenceFromKey(input.tabKey)
    if (!movedTab) return

    if (input.position === "center") {
      setWorkbenchLayout((current) =>
        moveTabToGroup(
          current,
          getWorkbenchGroupIDForTabKey(current, input.tabKey) ?? input.sourcePaneID,
          getTabIdForReference(movedTab),
          input.targetPaneID,
        ),
      )
    } else {
      setWorkbenchLayout((current) =>
        dockTabAroundGroup(
          current,
          getWorkbenchGroupIDForTabKey(current, input.tabKey) ?? input.sourcePaneID,
          getTabIdForReference(movedTab),
          input.targetPaneID,
          input.position as "left" | "right" | "top" | "bottom",
        ),
      )
    }

    const nextWorkspaceID = resolveWorkspaceIDForTab(movedTab)
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderID(nextWorkspaceID)
  }

  function handlePaneSplit(paneID = focusedPane?.id ?? workbenchPanes[0]?.id ?? null) {
    if (!paneID) return

    const nextWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaces,
      selectedFolderID,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const nextCreateSessionTab = createCreateSessionTab(nextWorkspaceID)

    setCreateSessionTabs((current) => [...current, nextCreateSessionTab])
    setWorkbenchLayout((current) =>
      splitGroupWithReference(current, paneID, createCreateSessionWorkbenchTab(nextCreateSessionTab.id), "right"),
    )
    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderID(nextWorkspaceID)
  }

  function setDraftForTab(tabKey: string, value: ComposerDraftState) {
    setComposerDraftStateByTabKey((current) => ({
      ...current,
      [tabKey]: normalizeComposerDraftState(value),
    }))
  }

  function setDraft(value: ComposerDraftState) {
    if (!activeTabKey) return
    setDraftForTab(activeTabKey, value)
  }

  function appendDraftForTab(tabKey: string, value: string) {
    const trimmedValue = value.trim()
    if (!trimmedValue) return

    setComposerDraftStateByTabKey((current) => {
      const existingDraft = current[tabKey] ?? createEmptyComposerDraftState()
      return {
        ...current,
        [tabKey]: appendTextToComposerDraftState(existingDraft, trimmedValue),
      }
    })
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

  useEffect(() => {
    const nextScopeKey = activeWorkspaceFileScopeDirectory
      ? normalizeWorkspacePath(activeWorkspaceFileScopeDirectory, platform)
      : null

    setWorkspaceFileReviewState((current) => {
      const currentScopeKey = current.scopeDirectory ? normalizeWorkspacePath(current.scopeDirectory, platform) : null
      if (currentScopeKey === nextScopeKey) return current

      workspaceFileSearchRequestRef.current += 1
      workspaceFileReadRequestRef.current += 1
      return {
        ...DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
        scopeDirectory: activeWorkspaceFileScopeDirectory,
      }
    })
  }, [activeWorkspaceFileScopeDirectory, platform])

  useEffect(() => {
    const searchWorkspaceFiles = window.desktop?.searchWorkspaceFiles
    const scopeDirectory = workspaceFileReviewState.scopeDirectory
    const query = deferredWorkspaceFileQuery.trim()
    if (!searchWorkspaceFiles || !scopeDirectory) return

    if (!query) {
      setWorkspaceFileReviewState((current) => {
        const nextErrorMessage = current.selectedFileKind === "unsupported" ? current.errorMessage : null
        const nextState = {
          ...current,
          results: [],
          errorMessage: nextErrorMessage,
        }

        return {
          ...nextState,
          status: resolveWorkspaceFileReviewStatus(nextState),
        }
      })
      return
    }

    const requestID = workspaceFileSearchRequestRef.current + 1
    workspaceFileSearchRequestRef.current = requestID
    setWorkspaceFileReviewState((current) => ({
      ...current,
      errorMessage: current.selectedFileKind === "unsupported" ? current.errorMessage : null,
      status: "searching",
    }))

    searchWorkspaceFiles({
      directory: scopeDirectory,
      query,
    })
      .then((results) => {
        if (workspaceFileSearchRequestRef.current !== requestID) return

        setWorkspaceFileReviewState((current) => {
          const nextState = {
            ...current,
            results,
            errorMessage: current.selectedFileKind === "unsupported" ? current.errorMessage : null,
          }

          return {
            ...nextState,
            status: resolveWorkspaceFileReviewStatus(nextState),
          }
        })
      })
      .catch((error) => {
        if (workspaceFileSearchRequestRef.current !== requestID) return
        const message = error instanceof Error ? error.message : String(error)

        setWorkspaceFileReviewState((current) => ({
          ...current,
          results: [],
          errorMessage: message,
          status: "error",
        }))
        console.error("[desktop] searchWorkspaceFiles failed:", error)
      })
  }, [deferredWorkspaceFileQuery, platform, workspaceFileReviewState.scopeDirectory])

  async function sendPromptToSession(input: {
    attachments: ComposerAttachment[]
    backendSessionID?: string | null
    commentReferences?: ComposerCommentReference[]
    displayText?: string
    permissionMode: ComposerPermissionMode
    preserveComposerState?: boolean
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    reasoningEffort?: OpenAIReasoningEffort | null
    references?: UserTurn["references"]
    session: SessionSummary
    selectedSkillIDs: string[]
    tabKey: string
    text: string
    workspace: WorkspaceGroup
  }) {
    const {
      attachments,
      commentReferences = [],
      displayText,
      permissionMode,
      preserveComposerState,
      questionAnswer,
      reasoningEffort,
      references = [],
      session,
      selectedSkillIDs,
      tabKey,
      text,
      workspace,
    } = input
    const uiSessionID = session.id
    const agentSession = getAgentSessionBridge()
    const canStream = Boolean(agentSession?.canStream)
    const normalizedText = text.trim() || normalizeQuestionAnswerText(questionAnswer)
    const attachmentInputs = attachments.map((attachment) => ({
      path: attachment.path,
      name: attachment.name,
    }))
    const effectivePermissionMode = resolveComposerPermissionModeForSession(session, permissionMode)
    const effectiveSelectedSkillIDs = resolveComposerSkillSelectionForSession(session, selectedSkillIDs)
    const userTurnDisplayText = displayText?.trim() || normalizeQuestionAnswerText(questionAnswer) || undefined
    const userTurn: Turn = buildUserTurn({
      attachments: attachmentInputs,
      displayText: userTurnDisplayText,
      fallbackText: normalizedText,
      questionAnswer,
      references,
    })

    if (!preserveComposerState) {
      setComposerDraftStateByTabKey((current) => ({
        ...current,
        [tabKey]: createEmptyComposerDraftState(),
      }))
      setComposerAttachmentsByTabKey((current) => ({
        ...current,
        [tabKey]: [],
      }))
    }

    appendConversationTurns(uiSessionID, [userTurn])
    setWorkspaces((prev) => {
      const nextUpdatedAt = Date.now()

      return prev.map((currentWorkspace) => ({
        ...currentWorkspace,
        sessions: currentWorkspace.sessions.map((currentSession) =>
              currentSession.id === uiSessionID
            ? {
                ...currentSession,
                status: "Live",
                summary: userTurn.text,
                updated: nextUpdatedAt,
              }
            : currentSession,
        ),
      }))
    })

    if (!agentConnected || !window.desktop?.createAgentSession || !agentSession) {
      const fallback = buildAgentTurn(userTurn.text, session, workspace.name, platform)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [fallback])
      })
      return
    }

    setIsSendingByTabKey((current) => ({
      ...current,
      [tabKey]: true,
    }))
    let streamingTurnID: string | null = null
    let streamID: string | null = null

    try {
      let backendSessionID = input.backendSessionID ?? agentSessions[uiSessionID]
      if (!backendSessionID) {
        const requestedSessionDirectory = sessionDirectoryBySession[uiSessionID] ?? workspace.directory
        const created = await window.desktop.createAgentSession({
          directory: requestedSessionDirectory || agentDefaultDirectory || undefined,
        })
        backendSessionID = created.session.id
        setAgentSessions((prev) => ({
          ...prev,
          [uiSessionID]: backendSessionID!,
        }))
        setSessionDirectoryBySession((prev) => ({
          ...prev,
          [uiSessionID]: created.session.directory,
        }))
      }

      if (!backendSessionID) {
        throw new Error("Backend session id is missing")
      }

      if (canStream) {
        const streamingTurn = buildStreamingAssistantTurn(userTurn.text)
        streamingTurnID = streamingTurn.id
        streamID = createID("stream")
        pendingStreamsRef.current[streamID] = {
          sessionID: uiSessionID,
          backendSessionID,
          assistantTurnID: streamingTurn.id,
        }

        appendConversationTurns(uiSessionID, [streamingTurn])

        await agentSession.sendTurn({
          clientTurnID: streamID,
          backendSessionID,
          ...(normalizedText ? { text: normalizedText } : {}),
          ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
          ...(questionAnswer ? { questionAnswer } : {}),
          ...(effectivePermissionMode !== "default" ? { permissionMode: effectivePermissionMode } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          skills: effectiveSelectedSkillIDs,
        })

        return
      }

      const result = await agentSession.sendTurn({
        clientTurnID: createID("turn"),
        backendSessionID,
        ...(normalizedText ? { text: normalizedText } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
        ...(questionAnswer ? { questionAnswer } : {}),
        ...(effectivePermissionMode !== "default" ? { permissionMode: effectivePermissionMode } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        skills: effectiveSelectedSkillIDs,
      })

      if (!result.events) {
        throw new Error("Desktop preload did not return batch agent events")
      }

      const backendTurn = buildAgentTurnFromEvents(result.events, userTurn.text)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [backendTurn])
      })
      void reloadSessionHistoryForSession(uiSessionID, backendSessionID).catch((error) => {
        console.error("[desktop] session history refresh failed after send:", error)
      })
      void refreshWorkspaceFromDirectory(workspace.directory)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (streamID) {
        delete pendingStreamsRef.current[streamID]
      }

      startTransition(() => {
        if (streamingTurnID) {
          const failedTurnID = streamingTurnID
          updateAssistantConversationTurn(uiSessionID, failedTurnID, (current) => buildFailureTurn(message, current))
          return
        }

        appendConversationTurns(uiSessionID, [buildFailureTurn(message)])
      })
    } finally {
      setIsSendingByTabKey((current) => {
        if (!(tabKey in current)) return current
        const next = { ...current }
        delete next[tabKey]
        return next
      })
    }
  }

  async function handleSend(input?: {
    attachmentError?: string | null
    attachmentsOverride?: ComposerAttachment[]
    createSessionTabID?: string | null
    draftStateOverride?: ComposerDraftState
    paneID?: string | null
    preserveComposerState?: boolean
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedSkillIDs?: string[]
    sessionID?: string | null
    tabKey?: string | null
    waitForPendingModelSelection?: (() => Promise<void>) | null
  }) {
    const targetTabKey = input?.tabKey ?? activeTabKey
    const targetSessionID = input?.sessionID ?? activeSessionID
    const targetCreateSessionTabID = input?.createSessionTabID ?? activeCreateSessionTabID
    const attachments = input?.attachmentsOverride ?? (targetTabKey ? composerAttachmentsByTabKey[targetTabKey] ?? [] : [])
    const permissionMode = targetTabKey ? composerPermissionModeByTabKey[targetTabKey] ?? "default" : "default"
    const draftState = normalizeComposerDraftState(
      input?.draftStateOverride ??
        (targetTabKey ? composerDraftStateByTabKey[targetTabKey] ?? createEmptyComposerDraftState() : createEmptyComposerDraftState()),
    )
    const compiledSubmission = compileComposerSubmission({
      draftState,
      selectedSkillIDs: input?.selectedSkillIDs ?? [],
    })
    const normalizedQuestionAnswerText = normalizeQuestionAnswerText(input?.questionAnswer)
    const effectiveText = compiledSubmission.transportText || normalizedQuestionAnswerText
    const pendingPermissionRequests = targetSessionID ? pendingPermissionRequestsBySession[targetSessionID] ?? [] : []
    if (!targetTabKey || ((!effectiveText && attachments.length === 0) || isSendingByTabKey[targetTabKey] || pendingPermissionRequests.length > 0)) return
    if (input?.waitForPendingModelSelection) {
      await input.waitForPendingModelSelection().catch(() => undefined)
    }
    if (input?.attachmentError) return

    if (targetSessionID) {
      const nextSelection = findSession(workspaces, targetSessionID)
      if (!nextSelection.workspace || !nextSelection.session) return
      await sendPromptToSession({
        attachments,
        commentReferences: compiledSubmission.commentReferences,
        displayText: compiledSubmission.displayText,
        permissionMode,
        preserveComposerState: input?.preserveComposerState,
        questionAnswer: input?.questionAnswer,
        reasoningEffort: input?.selectedReasoningEffort,
        references: compiledSubmission.userReferences,
        selectedSkillIDs: compiledSubmission.selectedSkillIDs,
        session: nextSelection.session,
        tabKey: targetTabKey,
        text: effectiveText,
        workspace: nextSelection.workspace,
      })
      return
    }

    if (!targetCreateSessionTabID) return

    const currentCreateSessionTab = createSessionTabs.find((tab) => tab.id === targetCreateSessionTabID)
    if (!currentCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, currentCreateSessionTab.workspaceID)
    if (!workspace) return

    const created = await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID: targetCreateSessionTabID,
      paneID: input?.paneID,
      skipInitialHistoryLoad: true,
    })
    if (!created) return

    await sendPromptToSession({
      attachments,
      backendSessionID: created.backendSessionID,
      commentReferences: compiledSubmission.commentReferences,
      displayText: compiledSubmission.displayText,
      permissionMode,
      preserveComposerState: input?.preserveComposerState,
      questionAnswer: input?.questionAnswer,
      reasoningEffort: input?.selectedReasoningEffort,
      references: compiledSubmission.userReferences,
      selectedSkillIDs: compiledSubmission.selectedSkillIDs,
      session: created.session,
      tabKey: targetTabKey,
      text: effectiveText,
      workspace: created.workspace,
    })
  }

  async function handlePermissionRequestResponse(input: {
    sessionID: string
    request: PermissionRequest
    decision: PermissionDecision
    note?: string
  }) {
    const agentSession = getAgentSessionBridge()
    if (!agentSession || permissionRequestActionRequestID) return

    permissionRequestsRequestRef.current[input.sessionID] = (permissionRequestsRequestRef.current[input.sessionID] ?? 0) + 1
    const removedRequest = input.request
    const canStreamResume = agentSession.canResumeStream
    let requestResolved = false
    setPermissionRequestActionRequestID(input.request.id)
    setPermissionRequestActionError(null)
    setPendingPermissionRequestsBySession((prev) => {
      const current = prev[input.sessionID] ?? []
      return {
        ...prev,
        [input.sessionID]: current.filter((request) => request.id !== input.request.id),
      }
    })

    try {
      await agentSession.respondPermissionRequest({
        requestID: input.request.id,
        decision: input.decision,
        note: input.note?.trim() || undefined,
        resume: !canStreamResume,
      })
      requestResolved = true

      await reloadSessionHistoryForSession(input.sessionID, input.request.sessionID).catch((error) => {
        console.error("[desktop] permission history refresh failed:", error)
      })
      await loadSessionDiffForSession(input.sessionID, input.request.sessionID).catch((error) => {
        console.error("[desktop] permission diff refresh failed:", error)
      })
      await loadSessionRuntimeDebugForSession(input.sessionID, input.request.sessionID).catch((error) => {
        console.error("[desktop] permission runtime refresh failed:", error)
      })
      await loadPendingPermissionRequestsForSession(input.sessionID, input.request.sessionID).catch((error) => {
        console.error("[desktop] permission request refresh failed:", error)
      })
      refreshWorkspaceForSession(input.sessionID)

      if (canStreamResume) {
        const streamID = createID("stream")
        const streamingTurn = buildStreamingAssistantTurn(input.decision === "deny" ? "Continue after denial" : "Continue after approval")
        pendingStreamsRef.current[streamID] = {
          sessionID: input.sessionID,
          backendSessionID: input.request.sessionID,
          assistantTurnID: streamingTurn.id,
        }

        appendConversationTurns(input.sessionID, [streamingTurn])

        try {
          await agentSession.resumeTurn({
            clientTurnID: streamID,
            backendSessionID: input.request.sessionID,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          delete pendingStreamsRef.current[streamID]
          startTransition(() => {
            updateAssistantConversationTurn(input.sessionID, streamingTurn.id, (current) =>
              buildFailureTurn(message, current),
            )
          })
          throw error
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[desktop] respondPermissionRequest failed:", error)

      if (!requestResolved) {
        setPermissionRequestActionError(message)
        setPendingPermissionRequestsBySession((prev) => {
          const current = prev[input.sessionID] ?? []
          if (current.some((request) => request.id === removedRequest.id)) {
            return prev
          }

          return {
            ...prev,
            [input.sessionID]: [removedRequest, ...current],
          }
        })
      }
    } finally {
      setPermissionRequestActionRequestID(null)
    }
  }

  async function handlePickComposerAttachments(input?: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason?: string | null
    tabKey?: string | null
  }) {
    const pickComposerAttachments = window.desktop?.pickComposerAttachments
    if (!pickComposerAttachments) return

    const tabKey = input?.tabKey ?? activeTabKey
    const allowImage = input?.allowImage ?? false
    const allowPdf = input?.allowPdf ?? false
    const disabledReason = input?.disabledReason ?? null
    if (disabledReason) return
    if (!tabKey) return

    try {
      const pickedPaths = await pickComposerAttachments({
        allowImage,
        allowPdf,
      })
      if (!pickedPaths || pickedPaths.length === 0) return

      setComposerAttachmentsByTabKey((current) => {
        const existingAttachments = current[tabKey] ?? []
        const seen = new Set(existingAttachments.map((attachment) => attachment.path))
        const nextAttachments = [...existingAttachments]
        const supportedCapabilities = { image: allowImage, pdf: allowPdf }

        for (const path of pickedPaths) {
          if (!isComposerAttachmentSupported(path, supportedCapabilities)) continue
          if (seen.has(path)) continue
          seen.add(path)
          nextAttachments.push(buildComposerAttachment(path))
        }

        return {
          ...current,
          [tabKey]: nextAttachments,
        }
      })
    } catch (error) {
      console.error("[desktop] pickComposerAttachments failed:", error)
    }
  }

  function handleRemoveComposerAttachment(path: string, tabKey = activeTabKey) {
    if (!tabKey) return
    setComposerAttachmentsByTabKey((current) => ({
      ...current,
      [tabKey]: (current[tabKey] ?? []).filter((attachment) => attachment.path !== path),
    }))
  }

  function handleComposerPermissionModeToggle(tabKey = activeTabKey) {
    if (!tabKey) return
    const tabReference = getWorkbenchTabReferenceFromKey(tabKey)
    if (tabReference?.kind === "session" && isSideChatSession(findSession(workspaces, tabReference.sessionID).session)) {
      return
    }
    setComposerPermissionModeByTabKey((current) => ({
      ...current,
      [tabKey]: current[tabKey] === "full-access" ? "default" : "full-access",
    }))
  }

  function handleLeftSidebarViewChange(nextView: LeftSidebarView) {
    setLeftSidebarView(nextView)
  }

  function handleRightSidebarViewChange(nextView: RightSidebarView) {
    setRightSidebarView(nextView)
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

  async function handleActiveSessionRuntimeDebugRefresh(sessionID = activeSessionID) {
    if (!sessionID) return
    await loadSessionRuntimeDebugForSession(sessionID)
  }

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
      composerPermissionMode: currentActiveTabKey
        ? resolveComposerPermissionModeForSession(
            currentSession,
            composerPermissionModeByTabKey[currentActiveTabKey] ?? "default",
          )
        : "default",
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
    composerPermissionMode,
    composerRefreshVersion,
    createSessionTabs,
    createSessionTitle,
    createSessionWorkspaceID,
    deletingSessionID,
    draftState,
    expandedFolderID,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleComposerPermissionModeToggle,
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
    handlePickComposerAttachments,
    handleActiveSessionDiffFileSelect,
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
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
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
    selectedProjectID,
    selectedWorkspace,
    selectedFolderID,
    setDraft,
    setDraftForTab,
    setHoveredFolderID,
    threadColumnRef,
    workbenchLayout,
    workbenchPanes,
    workbenchPaneStateByID,
    workbenchPaneStates,
    workspaces,
  }
}
