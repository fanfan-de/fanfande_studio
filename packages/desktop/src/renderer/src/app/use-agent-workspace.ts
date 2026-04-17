import { startTransition, useEffect, useEffectEvent, useRef, useState, type MouseEvent } from "react"
import {
  appendConversationTurns as appendConversationTurnsToMap,
  ensureAgentSessions,
  ensureConversationSessions,
  removeAgentSession,
  removeConversationSession,
  updateAssistantTurn as updateAssistantTurnInMap,
} from "./conversation-state"
import { initialConversations, initialSelection, seedWorkspaces } from "./seed-data"
import {
  applyAgentStreamEventToTurn,
  buildAgentTurn,
  buildAgentTurnFromEvents,
  buildUserTurnText,
  buildTurnsFromHistory,
  buildFailureTurn,
  buildSessionStreamingAssistantTurn,
  buildStreamingAssistantTurn,
} from "./stream"
import type {
  AgentStreamIPCEvent,
  AgentSessionStreamIPCEvent,
  ComposerAttachment,
  ComposerPermissionMode,
  ComposerMcpOption,
  ComposerModelOption,
  ComposerSkillOption,
  CreateSessionTab,
  LeftSidebarView,
  LoadedSessionHistoryMessage,
  McpServerSummary,
  PermissionDecision,
  PermissionRequest,
  PendingAgentStream,
  ProviderModel,
  RightSidebarView,
  SessionContextUsage,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  SkillInfo,
  SidebarActionKey,
  Turn,
  WorkbenchPane,
  WorkbenchTabReference,
  WorkspaceFileChangeIPCEvent,
  WorkspaceGroup,
} from "./types"
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

interface UseAgentWorkspaceOptions {
  agentConnected: boolean
  agentDefaultDirectory: string
  platform: string
}

interface ComposerAttachmentCapabilities {
  image: boolean
  pdf: boolean
}

type ComposerAttachmentKind = "image" | "pdf" | "unsupported"

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"])
const GIT_REFRESH_SUPPRESSION_MS = 1000
const WORKSPACE_RELOAD_SUPPRESSION_MS = 1500
const DEFAULT_SESSION_DIFF_STATE: SessionDiffState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}
const DEFAULT_SESSION_RUNTIME_DEBUG_STATE: SessionRuntimeDebugState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

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

function normalizeModelSelection(selection?: { model?: string; small_model?: string }) {
  return {
    model: selection?.model ?? null,
    smallModel: selection?.small_model ?? null,
  }
}

function getComposerAttachmentName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function buildComposerAttachment(path: string): ComposerAttachment {
  return {
    path,
    name: getComposerAttachmentName(path),
  }
}

function getComposerAttachmentKind(path: string): ComposerAttachmentKind {
  const normalizedPath = path.trim().toLowerCase()
  const extension = normalizedPath.split(".").pop() ?? ""
  if (IMAGE_ATTACHMENT_EXTENSIONS.has(extension)) return "image"
  if (extension === "pdf") return "pdf"
  return "unsupported"
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

function resolveComposerEffectiveModel(
  selectedModel: string | null,
  models: ProviderModel[],
  defaultModel: ProviderModel | null,
) {
  if (!selectedModel) return defaultModel
  return models.find((model) => toComposerModelValue(model) === selectedModel) ?? defaultModel
}

function getComposerAttachmentCapabilities(model: ProviderModel | null): ComposerAttachmentCapabilities {
  return {
    image: Boolean(model?.capabilities.input.image),
    pdf: Boolean(model?.capabilities.attachment && model?.capabilities.input.pdf),
  }
}

function isComposerAttachmentSupported(path: string, capabilities: ComposerAttachmentCapabilities) {
  const kind = getComposerAttachmentKind(path)
  if (kind === "image") return capabilities.image
  if (kind === "pdf") return capabilities.pdf
  return false
}

function describeComposerAttachmentSupport(capabilities: ComposerAttachmentCapabilities) {
  if (capabilities.image && capabilities.pdf) return "images and PDFs"
  if (capabilities.image) return "images"
  if (capabilities.pdf) return "PDFs"
  return null
}

function getComposerAttachmentDisabledReason(
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
  isLoading: boolean,
) {
  if (describeComposerAttachmentSupport(capabilities)) return null
  if (isLoading) return "Loading model capabilities..."
  if (!model) return "No available model for this project supports image or PDF input."
  return `${model.name} does not support image or PDF input.`
}

function getComposerAttachmentError(
  attachments: ComposerAttachment[],
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
) {
  const unsupportedAttachments = attachments.filter((attachment) => !isComposerAttachmentSupported(attachment.path, capabilities))
  if (unsupportedAttachments.length === 0) return null

  const unsupportedKinds = new Set(unsupportedAttachments.map((attachment) => getComposerAttachmentKind(attachment.path)))
  if (unsupportedKinds.has("unsupported")) {
    return "Desktop composer attachments currently support images and PDFs only."
  }

  const supportedDescription = describeComposerAttachmentSupport(capabilities)
  if (!supportedDescription) {
    if (!model) return "Attachments are unavailable until a compatible model is available."
    return `${model.name} does not support image or PDF input. Remove attachments or switch models.`
  }

  return `${model?.name ?? "The current model"} only accepts ${supportedDescription}. Remove incompatible attachments or switch models.`
}

function toComposerModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toComposerModelLabel(model: ProviderModel) {
  return model.name
}

function resolveComposerModelLabel(
  selectedModel: string | null,
  models: ProviderModel[],
  effectiveModel: ProviderModel | null,
  isLoading: boolean,
) {
  if (isLoading && models.length === 0 && !effectiveModel) return "Loading..."
  if (!selectedModel) {
    return effectiveModel ? `Server default (${effectiveModel.name})` : "Server default"
  }
  return models.find((model) => toComposerModelValue(model) === selectedModel)?.name ?? selectedModel
}

function resolveComposerSkillLabel(selectedSkillIDs: string[], skills: SkillInfo[], isLoading: boolean) {
  if (isLoading && skills.length === 0) return "Loading skills..."
  if (selectedSkillIDs.length === 0) return "Skills"
  if (selectedSkillIDs.length === 1) {
    return skills.find((skill) => skill.id === selectedSkillIDs[0])?.name ?? "1 skill"
  }
  return `${selectedSkillIDs.length} skills`
}

function describeComposerMcpServer(server: McpServerSummary) {
  if (server.transport === "stdio") {
    return server.command
  }

  return server.serverUrl ?? server.connectorId ?? "Remote HTTP MCP"
}

function resolveComposerMcpLabel(selectedServerIDs: string[], servers: McpServerSummary[], isLoading: boolean) {
  if (isLoading && servers.length === 0) return "Loading MCP..."
  if (selectedServerIDs.length === 0) return "MCP"
  if (selectedServerIDs.length === 1) {
    return servers.find((server) => server.id === selectedServerIDs[0])?.name ?? "1 server"
  }
  return `${selectedServerIDs.length} servers`
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
const seedWorkspaceIDs = new Set(seedWorkspaces.map((workspace) => workspace.id))
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
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const historyRequestRef = useRef(0)
  const sessionDiffRequestRef = useRef<Record<string, number>>({})
  const runtimeDebugRequestRef = useRef<Record<string, number>>({})
  const runtimeDebugRefreshTimerRef = useRef<Record<string, number>>({})
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
  const workspaceRefreshRequestRef = useRef<Record<string, number>>({})
  const conversationVersionRef = useRef<Record<string, number>>({})
  const skipNextHistoryLoadRef = useRef<Record<string, boolean>>({})
  const initialFolderWorkspacesLoadedRef = useRef(false)
  const preserveLocalWorkspaceStateOnInitialLoadRef = useRef(false)
  const subscribedSessionStreamsRef = useRef<Record<string, string>>({})
  const seenStreamCursorsRef = useRef<Record<string, string[]>>({})
  const turnTargetsRef = useRef<Record<string, { sessionID: string; assistantTurnID: string }>>({})
  const lastFocusedSessionIDRef = useRef<string | null>(initialSelection.session?.id ?? null)
  const watchedWorkspaceDirectoriesKeyRef = useRef("")
  const gitRefreshSuppressedUntilRef = useRef<Record<string, number>>({})
  const workspaceReloadSuppressedUntilRef = useRef<Record<string, number>>({})
  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [createSessionTabs, setCreateSessionTabs] = useState<CreateSessionTab[]>(initialCreateSessionTab ? [initialCreateSessionTab] : [])
  const [workbenchLayout, setWorkbenchLayout] = useState<WorkbenchLayoutState>(initialWorkbenchLayout)
  const [expandedFolderID, setExpandedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [hoveredFolderID, setHoveredFolderID] = useState<string | null>(null)
  const [leftSidebarView, setLeftSidebarView] = useState<LeftSidebarView>("workspace")
  const [rightSidebarView, setRightSidebarView] = useState<RightSidebarView>("changes")
  const [draftByTabKey, setDraftByTabKey] = useState<Record<string, string>>(() =>
    initialWorkbenchTab
      ? {
          [getWorkbenchTabKey(initialWorkbenchTab)]: "Help me align the desktop sidebar with the Pencil design.",
        }
      : {},
  )
  const [conversations, setConversations] = useState(initialConversations)
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({})
  const [sessionDirectoryBySession, setSessionDirectoryBySession] = useState<Record<string, string>>({})
  const [composerAttachmentsByTabKey, setComposerAttachmentsByTabKey] = useState<Record<string, ComposerAttachment[]>>({})
  const [composerPermissionModeByTabKey, setComposerPermissionModeByTabKey] = useState<
    Record<string, ComposerPermissionMode>
  >(
    () =>
      initialWorkbenchTab
        ? {
            [getWorkbenchTabKey(initialWorkbenchTab)]: "default",
          }
        : {},
  )
  const [isSendingByTabKey, setIsSendingByTabKey] = useState<Record<string, boolean>>({})
  const [isCreatingSessionByTabKey, setIsCreatingSessionByTabKey] = useState<Record<string, boolean>>({})
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)
  const [canLoadSessionHistory, setCanLoadSessionHistory] = useState(false)
  const [isInitialWorkspaceLoadPending, setIsInitialWorkspaceLoadPending] = useState(() =>
    Boolean(window.desktop?.listFolderWorkspaces),
  )
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySession] = useState<
    Record<string, PermissionRequest[]>
  >({})
  const [sessionDiffBySession, setSessionDiffBySession] = useState<Record<string, SessionDiffSummary>>({})
  const [sessionDiffStateBySession, setSessionDiffStateBySession] = useState<Record<string, SessionDiffState>>({})
  const [sessionRuntimeDebugBySession, setSessionRuntimeDebugBySession] = useState<
    Record<string, SessionRuntimeDebugSnapshot>
  >({})
  const [sessionRuntimeDebugStateBySession, setSessionRuntimeDebugStateBySession] = useState<
    Record<string, SessionRuntimeDebugState>
  >({})
  const [selectedDiffFileBySession, setSelectedDiffFileBySession] = useState<Record<string, string | null>>({})
  const [contextUsageBySession, setContextUsageBySession] = useState<Record<string, SessionContextUsage>>({})
  const [permissionRequestActionRequestID, setPermissionRequestActionRequestID] = useState<string | null>(null)
  const [permissionRequestActionError, setPermissionRequestActionError] = useState<string | null>(null)
  const [composerRefreshVersion, setComposerRefreshVersion] = useState(0)
  const [composerModels, setComposerModels] = useState<ProviderModel[]>([])
  const [composerDefaultModel, setComposerDefaultModel] = useState<ProviderModel | null>(null)
  const [composerSelectedModel, setComposerSelectedModel] = useState<string | null>(null)
  const [composerSmallModel, setComposerSmallModel] = useState<string | null>(null)
  const [isLoadingComposerModels, setIsLoadingComposerModels] = useState(false)
  const [composerSkills, setComposerSkills] = useState<SkillInfo[]>([])
  const [composerSelectedSkillIDs, setComposerSelectedSkillIDs] = useState<string[]>([])
  const [isLoadingComposerSkills, setIsLoadingComposerSkills] = useState(false)
  const [composerMcpServers, setComposerMcpServers] = useState<McpServerSummary[]>([])
  const [composerSelectedMcpServerIDs, setComposerSelectedMcpServerIDs] = useState<string[]>([])
  const [isLoadingComposerMcp, setIsLoadingComposerMcp] = useState(false)
  const composerModelsRequestRef = useRef(0)
  const composerSkillsRequestRef = useRef(0)
  const composerSkillSelectionRequestRef = useRef(0)
  const composerMcpRequestRef = useRef(0)
  const composerMcpSelectionRequestRef = useRef(0)
  const pendingModelSelectionRef = useRef<Promise<void> | null>(null)
  const composerAttachmentPolicyRef = useRef<{
    attachmentError: string | null
    disabledReason: string | null
    allowImage: boolean
    allowPdf: boolean
  }>({
    attachmentError: null,
    disabledReason: "Loading model capabilities...",
    allowImage: false,
    allowPdf: false,
  })

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
  const activeTabWorkspaceID = resolveWorkspaceIDForTab(activeTab)
  const selectedWorkspace =
    findWorkspaceByID(workspaces, selectedFolderID) ??
    findWorkspaceByID(workspaces, activeTabWorkspaceID) ??
    activeWorkspace ??
    workspaces[0] ??
    null
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
  const isCreateSessionTabActive = activeCreateSessionTab !== null
  const createSessionWorkspaceID = activeCreateSessionTab?.workspaceID ?? null
  const createSessionTitle = activeCreateSessionTab?.title ?? ""
  const draft = activeTabKey ? draftByTabKey[activeTabKey] ?? "" : ""
  const composerAttachments = activeTabKey ? composerAttachmentsByTabKey[activeTabKey] ?? [] : []
  const composerPermissionMode = activeTabKey ? composerPermissionModeByTabKey[activeTabKey] ?? "default" : "default"
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
  const composerModelOptions: ComposerModelOption[] = composerModels
    .filter((model) => model.available)
    .map((model) => ({
      value: toComposerModelValue(model),
      label: toComposerModelLabel(model),
    }))
  const composerEffectiveModel = resolveComposerEffectiveModel(composerSelectedModel, composerModels, composerDefaultModel)
  const composerAttachmentCapabilities = getComposerAttachmentCapabilities(composerEffectiveModel)
  const composerAttachmentDisabledReason = getComposerAttachmentDisabledReason(
    composerEffectiveModel,
    composerAttachmentCapabilities,
    isLoadingComposerModels,
  )
  const composerUnsupportedAttachments = composerAttachments.filter(
    (attachment) => !isComposerAttachmentSupported(attachment.path, composerAttachmentCapabilities),
  )
  const composerAttachmentError = getComposerAttachmentError(
    composerAttachments,
    composerEffectiveModel,
    composerAttachmentCapabilities,
  )
  const composerAttachmentButtonTitle =
    composerAttachmentDisabledReason ??
    `Add ${describeComposerAttachmentSupport(composerAttachmentCapabilities) ?? "attachments"}.`
  const composerSkillOptions: ComposerSkillOption[] = composerSkills.map((skill) => ({
    value: skill.id,
    label: skill.name,
    description: skill.description,
  }))
  const composerMcpOptions: ComposerMcpOption[] = composerMcpServers.map((server) => ({
    value: server.id,
    label: server.name ?? server.id,
    description: describeComposerMcpServer(server),
  }))
  const composerSelectedModelLabel = resolveComposerModelLabel(
    composerSelectedModel,
    composerModels,
    composerEffectiveModel,
    isLoadingComposerModels,
  )
  const composerSelectedSkillLabel = resolveComposerSkillLabel(
    composerSelectedSkillIDs,
    composerSkills,
    isLoadingComposerSkills,
  )
  const composerSelectedMcpLabel = resolveComposerMcpLabel(
    composerSelectedMcpServerIDs,
    composerMcpServers,
    isLoadingComposerMcp,
  )
  const composerContextWindow = composerEffectiveModel?.limit.context ?? null
  composerAttachmentPolicyRef.current = {
    attachmentError: composerAttachmentError,
    disabledReason: composerAttachmentDisabledReason,
    allowImage: composerAttachmentCapabilities.image,
    allowPdf: composerAttachmentCapabilities.pdf,
  }

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

  function turnTargetKey(backendSessionID: string, turnID: string) {
    return `${backendSessionID}:${turnID}`
  }

  function rememberSeenCursor(sessionID: string, cursor: string) {
    if (!cursor) return false

    const current = seenStreamCursorsRef.current[sessionID] ?? []
    if (current.includes(cursor)) {
      return true
    }

    const next = [...current, cursor]
    if (next.length > 200) {
      next.splice(0, next.length - 200)
    }
    seenStreamCursorsRef.current[sessionID] = next
    return false
  }

  function cleanupTurnTarget(backendSessionID: string | undefined, turnID: string | undefined) {
    if (!backendSessionID || !turnID) return
    delete turnTargetsRef.current[turnTargetKey(backendSessionID, turnID)]
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
    setConversations((prev) => appendConversationTurnsToMap(prev, sessionID, nextTurns))
  }

  function updateAssistantConversationTurn(
    sessionID: string,
    turnID: string,
    updater: Parameters<typeof updateAssistantTurnInMap>[3],
  ) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => updateAssistantTurnInMap(prev, sessionID, turnID, updater))
  }

  function resolveStreamCursor(event: { id?: string; data: unknown }) {
    const payload = readStreamRecord(event.data)
    return readStreamString(payload?.cursor) || event.id || ""
  }

  function resolveStreamTurnID(event: { data: unknown }) {
    const payload = readStreamRecord(event.data)
    return readStreamString(payload?.turnID) || undefined
  }

  function ensureAssistantTurnForBackendTurn(input: {
    uiSessionID: string
    backendSessionID: string
    turnID: string
  }) {
    const targetKey = turnTargetKey(input.backendSessionID, input.turnID)
    const existing = turnTargetsRef.current[targetKey]
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
      turnTargetsRef.current[targetKey] = {
        sessionID: input.uiSessionID,
        assistantTurnID: pending.assistantTurnID,
      }
      return pending.assistantTurnID
    }

    const streamingTurn = buildSessionStreamingAssistantTurn()
    turnTargetsRef.current[targetKey] = {
      sessionID: input.uiSessionID,
      assistantTurnID: streamingTurn.id,
    }

    appendConversationTurns(input.uiSessionID, [streamingTurn])

    return streamingTurn.id
  }

  function handleRequestStreamEvent(streamEvent: AgentStreamIPCEvent) {
    const target = pendingStreamsRef.current[streamEvent.streamID]
    if (!target) return

    const cursor = resolveStreamCursor(streamEvent)
    if (cursor && rememberSeenCursor(target.sessionID, cursor)) {
      return
    }

    const backendTurnID = resolveStreamTurnID(streamEvent)
    if (backendTurnID) {
      const backendSessionID = target.backendSessionID ?? resolveBackendSessionID(target.sessionID)
      target.backendSessionID = backendSessionID
      target.backendTurnID = backendTurnID
      turnTargetsRef.current[turnTargetKey(backendSessionID, backendTurnID)] = {
        sessionID: target.sessionID,
        assistantTurnID: target.assistantTurnID,
      }
    }

    startTransition(() => {
      updateAssistantConversationTurn(target.sessionID, target.assistantTurnID, (turn) =>
        applyAgentStreamEventToTurn(turn, streamEvent),
      )
    })

    scheduleRuntimeDebugRefresh(
      target.sessionID,
      target.backendSessionID ?? resolveBackendSessionID(target.sessionID),
    )

    if (streamEvent.event === "done" || streamEvent.event === "error") {
      if (streamEvent.event === "done") {
        updateSessionContextUsage(target.sessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
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
      if (streamEvent.event === "done" || streamEvent.event === "error") {
        if (streamEvent.event === "done") {
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

    const assistantTurnID = ensureAssistantTurnForBackendTurn({
      uiSessionID,
      backendSessionID: streamEvent.sessionID,
      turnID: backendTurnID,
    })

    startTransition(() => {
      updateAssistantConversationTurn(uiSessionID, assistantTurnID, (turn) => applyAgentStreamEventToTurn(turn, streamEvent))
    })

    scheduleRuntimeDebugRefresh(uiSessionID, streamEvent.sessionID)

    if (streamEvent.event === "done" || streamEvent.event === "error") {
      if (streamEvent.event === "done") {
        updateSessionContextUsage(uiSessionID, readSessionContextUsageFromDoneEventData(streamEvent.data))
      }
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

  async function reloadSessionHistoryForSession(sessionID: string, backendSessionID = resolveBackendSessionID(sessionID)) {
    const getSessionHistory = window.desktop?.getSessionHistory
    if (!getSessionHistory) return

    const messages = await getSessionHistory({ sessionID: backendSessionID })
    const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)
    startTransition(() => {
      replaceConversationTurns(sessionID, buildTurnsFromHistory(messages))
      syncSessionContextUsageFromHistory(sessionID, nextContextUsage)
    })
  }

  async function loadSessionDiffForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    const getSessionDiff = window.desktop?.getSessionDiff
    if (!getSessionDiff) return

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
    const getSessionPermissionRequests = window.desktop?.getSessionPermissionRequests
    if (!getSessionPermissionRequests) return

    const requestID = (permissionRequestsRequestRef.current[sessionID] ?? 0) + 1
    permissionRequestsRequestRef.current[sessionID] = requestID

    try {
      const nextRequests = await getSessionPermissionRequests({ sessionID: backendSessionID })
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return

      setPendingPermissionRequestsBySession((prev) => ({
        ...prev,
        [sessionID]: nextRequests.filter((request) => request.status === "pending"),
      }))
    } catch (error) {
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return
      console.error("[desktop] getSessionPermissionRequests failed:", error)
    }
  }

  const handleRequestStreamEventEffect = useEffectEvent((streamEvent: AgentStreamIPCEvent) => {
    handleRequestStreamEvent(streamEvent)
  })

  const handleSessionStreamEventEffect = useEffectEvent((streamEvent: AgentSessionStreamIPCEvent) => {
    handleSessionStreamEvent(streamEvent)
  })

  const handleWorkspaceFileChangeEffect = useEffectEvent((workspaceEvent: WorkspaceFileChangeIPCEvent) => {
    const normalizedEventDirectory = normalizeWorkspacePath(workspaceEvent.directory, platform)
    const normalizedActiveSessionDirectory = activeSessionDirectory
      ? normalizeWorkspacePath(activeSessionDirectory, platform)
      : null
    const now = Date.now()

    if (activeSessionID && normalizedActiveSessionDirectory === normalizedEventDirectory) {
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
      void loadSessionDiffForSession(activeSessionID).catch((error) => {
        console.error("[desktop] workspace diff refresh failed:", error)
      })
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
    const unsubscribe = window.desktop?.onAgentStreamEvent?.((streamEvent: AgentStreamIPCEvent) => {
      handleRequestStreamEventEffect(streamEvent)
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.desktop?.onAgentSessionStreamEvent?.((streamEvent: AgentSessionStreamIPCEvent) => {
      handleSessionStreamEventEffect(streamEvent)
    })

    return () => {
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
    const subscribeSessionStream = window.desktop?.subscribeAgentSessionStream
    const unsubscribeSessionStream = window.desktop?.unsubscribeAgentSessionStream

    if (!agentConnected || !canLoadSessionHistory || !subscribeSessionStream || !unsubscribeSessionStream) {
      if (unsubscribeSessionStream) {
        for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
          void unsubscribeSessionStream({ sessionID: backendSessionID }).catch(() => undefined)
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
      void unsubscribeSessionStream({ sessionID: backendSessionID }).catch(() => undefined)
      delete subscribedSessionStreamsRef.current[uiSessionID]
    }

    for (const [uiSessionID, backendSessionID] of Object.entries(nextSubscriptions)) {
      if (subscribedSessionStreamsRef.current[uiSessionID] === backendSessionID) continue
      subscribedSessionStreamsRef.current[uiSessionID] = backendSessionID
      void subscribeSessionStream({ sessionID: backendSessionID }).catch((error) => {
        console.error("[desktop] subscribeAgentSessionStream failed:", error)
      })
    }
  }, [agentConnected, canLoadSessionHistory, openCanvasSessionIDs, agentSessions])

  useEffect(() => {
    return () => {
      const unsubscribeSessionStream = window.desktop?.unsubscribeAgentSessionStream
      if (!unsubscribeSessionStream) return

      for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
        void unsubscribeSessionStream({ sessionID: backendSessionID }).catch(() => undefined)
      }
      subscribedSessionStreamsRef.current = {}
    }
  }, [])

  useEffect(() => {
    const updateWorkspaceWatchDirectories = window.desktop?.updateWorkspaceWatchDirectories
    if (!updateWorkspaceWatchDirectories) return

    const uniqueDirectories = [
      ...new Set(
        [
          ...workspaces
            .filter((workspace) => !seedWorkspaceIDs.has(workspace.id) && isWorkspaceAvailable(workspace))
            .map((workspace) => workspace.directory.trim()),
          activeSessionDirectory?.trim() ?? "",
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
  }, [activeSessionDirectory, platform, workspaces])

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
    const getSessionHistory = window.desktop?.getSessionHistory
    if (!canLoadSessionHistory || !activeSessionID || !getSessionHistory) return

    if (skipNextHistoryLoadRef.current[activeSessionID]) {
      delete skipNextHistoryLoadRef.current[activeSessionID]
      return
    }

    let cancelled = false
    const sessionID = activeSessionID
    const requestID = ++historyRequestRef.current
    const baselineVersion = conversationVersionRef.current[sessionID] ?? 0

    getSessionHistory({ sessionID })
      .then((messages) => {
        if (cancelled || historyRequestRef.current !== requestID) return
        if ((conversationVersionRef.current[sessionID] ?? 0) !== baselineVersion) return
        const nextContextUsage = readLatestSessionContextUsageFromHistory(messages)

        startTransition(() => {
          replaceConversationTurns(sessionID, buildTurnsFromHistory(messages))
          updateSessionContextUsage(sessionID, nextContextUsage)
        })
      })
      .catch((error) => {
        console.error("[desktop] getSessionHistory failed:", error)
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
      for (const sessionID of Object.keys(runtimeDebugRefreshTimerRef.current)) {
        clearRuntimeDebugRefreshTimer(sessionID)
      }
    }
  }, [])

  async function refreshComposerModels() {
    const projectID = selectedProjectID
    const getProjectModels = window.desktop?.getProjectModels

    if (!projectID || !getProjectModels) {
      setComposerModels([])
      setComposerDefaultModel(null)
      setComposerSelectedModel(null)
      setComposerSmallModel(null)
      return
    }

    const requestID = ++composerModelsRequestRef.current
    setIsLoadingComposerModels(true)

    try {
      const payload = await getProjectModels({ projectID })
      if (composerModelsRequestRef.current !== requestID) return
      const nextSelection = normalizeModelSelection(payload.selection)
      setComposerModels(payload.items)
      setComposerDefaultModel(payload.effectiveModel ?? null)
      setComposerSelectedModel(nextSelection.model)
      setComposerSmallModel(nextSelection.smallModel)
    } catch (error) {
      if (composerModelsRequestRef.current !== requestID) return
      console.error("[desktop] refreshComposerModels failed:", error)
      setComposerModels([])
      setComposerDefaultModel(null)
      setComposerSelectedModel(null)
      setComposerSmallModel(null)
    } finally {
      if (composerModelsRequestRef.current === requestID) {
        setIsLoadingComposerModels(false)
      }
    }
  }

  async function refreshComposerSkills() {
    const projectID = selectedProjectID
    const getProjectSkills = window.desktop?.getProjectSkills
    const getProjectSkillSelection = window.desktop?.getProjectSkillSelection
    if (!projectID || !getProjectSkills || !getProjectSkillSelection) {
      setComposerSkills([])
      setComposerSelectedSkillIDs([])
      setIsLoadingComposerSkills(false)
      return
    }

    const requestID = ++composerSkillsRequestRef.current
    setIsLoadingComposerSkills(true)

    try {
      const [skills, selection] = await Promise.all([
        getProjectSkills({ projectID }),
        getProjectSkillSelection({ projectID }),
      ])
      if (composerSkillsRequestRef.current !== requestID) return
      const availableSkillIDs = new Set(skills.map((skill) => skill.id))
      setComposerSkills(skills)
      setComposerSelectedSkillIDs(selection.skillIDs.filter((skillID) => availableSkillIDs.has(skillID)))
    } catch (error) {
      if (composerSkillsRequestRef.current !== requestID) return
      console.error("[desktop] refreshComposerSkills failed:", error)
      setComposerSkills([])
      setComposerSelectedSkillIDs([])
    } finally {
      if (composerSkillsRequestRef.current === requestID) {
        setIsLoadingComposerSkills(false)
      }
    }
  }

  async function refreshComposerMcp() {
    const projectID = selectedProjectID
    const getGlobalMcpServers = window.desktop?.getGlobalMcpServers
    const getProjectMcpSelection = window.desktop?.getProjectMcpSelection
    if (!projectID || !getGlobalMcpServers || !getProjectMcpSelection) {
      setComposerMcpServers([])
      setComposerSelectedMcpServerIDs([])
      setIsLoadingComposerMcp(false)
      return
    }

    const requestID = ++composerMcpRequestRef.current
    setIsLoadingComposerMcp(true)

    try {
      const [servers, selection] = await Promise.all([
        getGlobalMcpServers(),
        getProjectMcpSelection({ projectID }),
      ])
      if (composerMcpRequestRef.current !== requestID) return

      const availableServerIDs = new Set(servers.map((server) => server.id))
      setComposerMcpServers(servers)
      setComposerSelectedMcpServerIDs(selection.serverIDs.filter((serverID) => availableServerIDs.has(serverID)))
    } catch (error) {
      if (composerMcpRequestRef.current !== requestID) return
      console.error("[desktop] MCP selector refresh failed:", error)
      setComposerMcpServers([])
      setComposerSelectedMcpServerIDs([])
    } finally {
      if (composerMcpRequestRef.current === requestID) {
        setIsLoadingComposerMcp(false)
      }
    }
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
      delete runtimeDebugRequestRef.current[sessionID]
      clearRuntimeDebugRefreshTimer(sessionID)
      delete seenStreamCursorsRef.current[sessionID]
      delete subscribedSessionStreamsRef.current[sessionID]
    }

    for (const [turnKey, target] of Object.entries(turnTargetsRef.current)) {
      if (sessionIDs.has(target.sessionID)) {
        delete turnTargetsRef.current[turnKey]
      }
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
        if (createdWorkspace.sessions[0]) {
          focusSession(createdWorkspace.id, createdWorkspace.sessions[0].id)
        } else {
          openCreateSessionTab(createdWorkspace.id, undefined, [...workspaces, nextWorkspace])
        }
        lastFocusedSessionIDRef.current = createdWorkspace.sessions[0]?.id ?? null
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
      if (workspace.sessions.length === 0) {
        if (!isWorkspaceAvailable(workspace)) return
        openCreateSessionTab(workspace.id)
        return
      }

      if (isCreateSessionTabActive || !workspace.sessions.some((session) => session.id === activeSessionID)) {
        focusSession(workspace.id, workspace.sessions[0].id)
      }
      return
    }

    setExpandedFolderID(workspace.id)
    const currentSessionInWorkspace = workspace.sessions.some((session) => session.id === activeSessionID)
    if (workspace.sessions.length === 0) {
      if (!isWorkspaceAvailable(workspace)) return
      openCreateSessionTab(workspace.id)
      return
    }

    if (currentSessionInWorkspace && !isCreateSessionTabActive && activeSessionID) {
      return
    }

    focusSession(workspace.id, workspace.sessions[0].id)
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

  async function handleProjectCreateSession(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (!isWorkspaceAvailable(workspace)) return
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
      await window.desktop.archiveAgentSession({ sessionID: session.id })
      const nextWorkspaces = sortWorkspaceGroups(
        workspaces.map((item) =>
          item.id === workspace.id
            ? {
                ...item,
                sessions: item.sessions.filter((existing) => existing.id !== session.id),
              }
            : item,
        ),
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
        (reference) => reference.kind !== "session" || reference.sessionID !== session.id,
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
      setConversations((prev) => removeConversationSession(prev, session.id))
      setAgentSessions((prev) => removeAgentSession(prev, session.id))
      setPendingPermissionRequestsBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSessionDiffBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSessionDiffStateBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSessionRuntimeDebugBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSessionRuntimeDebugStateBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSelectedDiffFileBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setSessionDirectoryBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setContextUsageBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      delete conversationVersionRef.current[session.id]
      delete permissionRequestsRequestRef.current[session.id]
      delete sessionDiffRequestRef.current[session.id]
      delete runtimeDebugRequestRef.current[session.id]
      clearRuntimeDebugRefreshTimer(session.id)
      delete seenStreamCursorsRef.current[session.id]
      delete subscribedSessionStreamsRef.current[session.id]
      for (const [turnKey, target] of Object.entries(turnTargetsRef.current)) {
        if (target.sessionID === session.id) {
          delete turnTargetsRef.current[turnKey]
        }
      }
      for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
        if (target.sessionID === session.id) {
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

  function setDraftForTab(tabKey: string, value: string) {
    setDraftByTabKey((current) => ({
      ...current,
      [tabKey]: value,
    }))
  }

  function setDraft(value: string) {
    if (!activeTabKey) return
    setDraftForTab(activeTabKey, value)
  }

  async function sendPromptToSession(input: {
    attachments: ComposerAttachment[]
    backendSessionID?: string | null
    permissionMode: ComposerPermissionMode
    session: SessionSummary
    selectedSkillIDs: string[]
    tabKey: string
    text: string
    workspace: WorkspaceGroup
  }) {
    const { attachments, permissionMode, session, selectedSkillIDs, tabKey, text, workspace } = input
    const uiSessionID = session.id
    const canStream = Boolean(window.desktop?.streamAgentMessage && window.desktop?.onAgentStreamEvent)
    const normalizedText = text.trim()
    const attachmentInputs = attachments.map((attachment) => ({
      path: attachment.path,
      name: attachment.name,
    }))
    const userTurnText = buildUserTurnText({
      text: normalizedText,
      attachmentNames: attachments.map((attachment) => attachment.name),
    })

    const userTurn: Turn = {
      id: createID("user"),
      kind: "user",
      text: userTurnText,
      timestamp: Date.now(),
    }

    setDraftByTabKey((current) => ({
      ...current,
      [tabKey]: "",
    }))
    setComposerAttachmentsByTabKey((current) => ({
      ...current,
      [tabKey]: [],
    }))

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
                summary: userTurnText,
                updated: nextUpdatedAt,
              }
            : currentSession,
        ),
      }))
    })

    if (!agentConnected || !window.desktop?.createAgentSession || (!canStream && !window.desktop?.sendAgentMessage)) {
      const fallback = buildAgentTurn(userTurnText, session, workspace.name, platform)
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

      if (canStream && window.desktop?.streamAgentMessage) {
        const streamingTurn = buildStreamingAssistantTurn(userTurnText)
        streamingTurnID = streamingTurn.id
        streamID = createID("stream")
        pendingStreamsRef.current[streamID] = {
          sessionID: uiSessionID,
          backendSessionID,
          assistantTurnID: streamingTurn.id,
        }

        appendConversationTurns(uiSessionID, [streamingTurn])

        await window.desktop.streamAgentMessage({
          streamID,
          sessionID: backendSessionID,
          ...(normalizedText ? { text: normalizedText } : {}),
          ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
          permissionMode,
          skills: selectedSkillIDs,
        })

        return
      }

      const result = await window.desktop.sendAgentMessage?.({
        sessionID: backendSessionID,
        ...(normalizedText ? { text: normalizedText } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
        permissionMode,
        skills: selectedSkillIDs,
      })

      if (!result) {
        throw new Error("Desktop preload does not expose an agent send method")
      }

      const backendTurn = buildAgentTurnFromEvents(result.events, userTurnText)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [backendTurn])
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
    createSessionTabID?: string | null
    draftOverride?: string
    paneID?: string | null
    selectedSkillIDs?: string[]
    sessionID?: string | null
    tabKey?: string | null
    waitForPendingModelSelection?: (() => Promise<void>) | null
  }) {
    const targetTabKey = input?.tabKey ?? activeTabKey
    const targetSessionID = input?.sessionID ?? activeSessionID
    const targetCreateSessionTabID = input?.createSessionTabID ?? activeCreateSessionTabID
    const attachments = targetTabKey ? composerAttachmentsByTabKey[targetTabKey] ?? [] : []
    const permissionMode = targetTabKey ? composerPermissionModeByTabKey[targetTabKey] ?? "default" : "default"
    const text = (input?.draftOverride ?? (targetTabKey ? draftByTabKey[targetTabKey] ?? "" : "")).trim()
    const pendingPermissionRequests = targetSessionID ? pendingPermissionRequestsBySession[targetSessionID] ?? [] : []
    if (!targetTabKey || ((!text && attachments.length === 0) || isSendingByTabKey[targetTabKey] || pendingPermissionRequests.length > 0)) return
    if (input?.waitForPendingModelSelection) {
      await input.waitForPendingModelSelection().catch(() => undefined)
    } else if (pendingModelSelectionRef.current) {
      await pendingModelSelectionRef.current.catch(() => undefined)
    }
    if (input?.attachmentError) return

    if (targetSessionID) {
      const nextSelection = findSession(workspaces, targetSessionID)
      if (!nextSelection.workspace || !nextSelection.session) return
      await sendPromptToSession({
        attachments,
        permissionMode,
        selectedSkillIDs: input?.selectedSkillIDs ?? [],
        session: nextSelection.session,
        tabKey: targetTabKey,
        text,
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
      permissionMode,
      selectedSkillIDs: input?.selectedSkillIDs ?? [],
      session: created.session,
      tabKey: targetTabKey,
      text,
      workspace: created.workspace,
    })
  }

  async function handlePermissionRequestResponse(input: {
    sessionID: string
    request: PermissionRequest
    decision: PermissionDecision
    note?: string
  }) {
    const respondPermissionRequest = window.desktop?.respondPermissionRequest
    const resumeAgentMessageStream = window.desktop?.resumeAgentMessageStream
    if (!respondPermissionRequest || permissionRequestActionRequestID) return

    permissionRequestsRequestRef.current[input.sessionID] = (permissionRequestsRequestRef.current[input.sessionID] ?? 0) + 1
    const removedRequest = input.request
    const canStreamResume = Boolean(resumeAgentMessageStream)
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
      await respondPermissionRequest({
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

      if (resumeAgentMessageStream) {
        const streamID = createID("stream")
        const streamingTurn = buildStreamingAssistantTurn(input.decision === "deny" ? "Continue after denial" : "Continue after approval")
        pendingStreamsRef.current[streamID] = {
          sessionID: input.sessionID,
          backendSessionID: input.request.sessionID,
          assistantTurnID: streamingTurn.id,
        }

        appendConversationTurns(input.sessionID, [streamingTurn])

        try {
          await resumeAgentMessageStream({
            streamID,
            sessionID: input.request.sessionID,
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
    const allowImage = input?.allowImage ?? composerAttachmentPolicyRef.current.allowImage
    const allowPdf = input?.allowPdf ?? composerAttachmentPolicyRef.current.allowPdf
    const disabledReason = input ? input.disabledReason ?? null : composerAttachmentPolicyRef.current.disabledReason
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
    setComposerPermissionModeByTabKey((current) => ({
      ...current,
      [tabKey]: current[tabKey] === "full-access" ? "default" : "full-access",
    }))
  }

  async function handleComposerModelChange(value: string | null) {
    const projectID = selectedProjectID
    const updateProjectModelSelection = window.desktop?.updateProjectModelSelection
    const previousSelection = composerSelectedModel
    setComposerSelectedModel(value)

    if (!projectID || !updateProjectModelSelection) {
      return
    }

    const saveTask = (async () => {
      try {
        const result = await updateProjectModelSelection({
          projectID,
          model: value,
          small_model: composerSmallModel,
        })
        setComposerSelectedModel(result.model ?? null)
        setComposerSmallModel(result.small_model ?? composerSmallModel)
      } catch (error) {
        console.error("[desktop] updateProjectModelSelection failed:", error)
        setComposerSelectedModel(previousSelection)
        throw error
      }
    })()

    const trackedTask = saveTask.finally(() => {
      if (pendingModelSelectionRef.current === trackedTask) {
        pendingModelSelectionRef.current = null
      }
    })
    pendingModelSelectionRef.current = trackedTask

    await trackedTask
  }

  async function handleComposerSkillToggle(value: string) {
    const projectID = selectedProjectID
    const updateProjectSkillSelection = window.desktop?.updateProjectSkillSelection
    if (!projectID || !updateProjectSkillSelection) {
      return
    }

    let nextSelection: string[] = []
    setComposerSelectedSkillIDs((current) => {
      nextSelection = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      return nextSelection
    })

    const requestID = ++composerSkillSelectionRequestRef.current

    try {
      const result = await updateProjectSkillSelection({
        projectID,
        skillIDs: nextSelection,
      })
      if (composerSkillSelectionRequestRef.current !== requestID) return

      const availableSkillIDs = new Set(composerSkills.map((skill) => skill.id))
      setComposerSelectedSkillIDs(result.skillIDs.filter((skillID) => availableSkillIDs.has(skillID)))
    } catch (error) {
      if (composerSkillSelectionRequestRef.current !== requestID) return
      console.error("[desktop] updateProjectSkillSelection failed:", error)
      void refreshComposerSkills()
    }
  }

  async function handleComposerMcpToggle(value: string) {
    const projectID = selectedProjectID
    const updateProjectMcpSelection = window.desktop?.updateProjectMcpSelection
    if (!projectID || !updateProjectMcpSelection) {
      return
    }

    let nextSelection: string[] = []
    setComposerSelectedMcpServerIDs((current) => {
      nextSelection = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      return nextSelection
    })

    const requestID = ++composerMcpSelectionRequestRef.current

    try {
      const result = await updateProjectMcpSelection({
        projectID,
        serverIDs: nextSelection,
      })
      if (composerMcpSelectionRequestRef.current !== requestID) return

      const availableServerIDs = new Set(composerMcpServers.map((server) => server.id))
      setComposerSelectedMcpServerIDs(result.serverIDs.filter((serverID) => availableServerIDs.has(serverID)))
    } catch (error) {
      if (composerMcpSelectionRequestRef.current !== requestID) return
      console.error("[desktop] updateProjectMcpSelection failed:", error)
      void refreshComposerMcp()
    }
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
    const paneTabs: Array<
      | {
          key: string
          kind: "session"
          sessionID: string
          title: string
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
      activeSessionDirectory: currentActiveSessionID
        ? sessionDirectoryBySession[currentActiveSessionID] ?? currentWorkspace?.directory ?? null
        : null,
      activeSessionSelectedDiffFile: currentActiveSessionID ? selectedDiffFileBySession[currentActiveSessionID] ?? null : null,
      activeTurns: currentActiveSessionID ? conversations[currentActiveSessionID] ?? [] : [],
      composerAttachments: currentActiveTabKey ? composerAttachmentsByTabKey[currentActiveTabKey] ?? [] : [],
      composerPermissionMode: currentActiveTabKey ? composerPermissionModeByTabKey[currentActiveTabKey] ?? "default" : "default",
      composerProjectID:
        isInitialWorkspaceLoadPending && currentWorkspace && seedWorkspaceIDs.has(currentWorkspace.id)
          ? null
          : currentWorkspace?.project.id ?? null,
      contextLabel: currentActiveCreateSessionTab ? "Create session" : "Session",
      contextTitle: currentSession
        ? currentSession.title
        : currentWorkspace
          ? `${currentWorkspace.project.name} / ${currentWorkspace.name}`
          : "No project selected",
      createSessionTabID: currentActiveCreateSessionTab?.id ?? null,
      createSessionWorkspaceID: currentActiveCreateSessionTab?.workspaceID ?? null,
      draft: currentActiveTabKey ? draftByTabKey[currentActiveTabKey] ?? "" : "",
      isCreatingSession:
        currentActiveTabKey && currentActiveCreateSessionTab
          ? Boolean(isCreatingSessionByTabKey[currentActiveTabKey])
          : false,
      isSending: currentActiveTabKey ? Boolean(isSendingByTabKey[currentActiveTabKey]) : false,
      pendingPermissionRequests: currentActiveSessionID ? pendingPermissionRequestsBySession[currentActiveSessionID] ?? [] : [],
      projectID: currentWorkspace?.project.id ?? null,
      size: pane.size,
      sessionID: currentSession?.id ?? null,
      tabKey: currentActiveTabKey,
      tabs: paneTabs,
      workspace: currentWorkspace,
    }
  })
  const workbenchPaneStateByID = Object.fromEntries(workbenchPaneStates.map((pane) => [pane.id, pane]))

  return {
    activeCreateSessionTabID,
    activeSession,
    activeSessionDirectory,
    activeSessionContextUsage,
    activeSessionDiff,
    activeSessionDiffState,
    activeSessionRuntimeDebug,
    activeSessionRuntimeDebugState,
    activePendingPermissionRequests,
    activeSessionSelectedDiffFile,
    activeTurns,
    canvasSessionTabs,
    composerAttachments,
    composerAttachmentButtonTitle,
    composerAttachmentDisabledReason,
    composerAttachmentError,
    composerPermissionMode,
    composerMcpOptions,
    composerModelOptions,
    composerContextWindow,
    composerSelectedMcpLabel,
    composerSelectedMcpServerIDs,
    composerSkillOptions,
    composerSelectedModel,
    composerSelectedModelLabel,
    composerSelectedSkillIDs,
    composerSelectedSkillLabel,
    composerUnsupportedAttachmentPaths: composerUnsupportedAttachments.map((attachment) => attachment.path),
    composerRefreshVersion,
    createSessionTabs,
    createSessionTitle,
    createSessionWorkspaceID,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleComposerModelChange,
    handleComposerPermissionModeToggle,
    handleComposerMcpToggle,
    handleComposerSkillToggle,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
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
