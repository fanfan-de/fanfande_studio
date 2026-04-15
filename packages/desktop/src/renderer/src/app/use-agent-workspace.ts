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
  SessionDiffSummary,
  SessionSummary,
  SkillInfo,
  SidebarActionKey,
  Turn,
  WorkspaceFileChangeIPCEvent,
  WorkspaceGroup,
} from "./types"
import { createID } from "./utils"
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
  const [activeSessionID, setActiveSessionID] = useState<string | null>(initialSelection.session?.id ?? null)
  const [openCanvasSessionIDs, setOpenCanvasSessionIDs] = useState<string[]>(
    initialSelection.session ? [initialSelection.session.id] : [],
  )
  const [createSessionTabs, setCreateSessionTabs] = useState<CreateSessionTab[]>(initialCreateSessionTab ? [initialCreateSessionTab] : [])
  const [activeCreateSessionTabID, setActiveCreateSessionTabID] = useState<string | null>(initialCreateSessionTab?.id ?? null)
  const [expandedFolderID, setExpandedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [hoveredFolderID, setHoveredFolderID] = useState<string | null>(null)
  const [leftSidebarView, setLeftSidebarView] = useState<LeftSidebarView>("workspace")
  const [rightSidebarView, setRightSidebarView] = useState<RightSidebarView>("changes")
  const [draft, setDraft] = useState("Help me align the desktop sidebar with the Pencil design.")
  const [conversations, setConversations] = useState(initialConversations)
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({})
  const [isSending, setIsSending] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)
  const [canLoadSessionHistory, setCanLoadSessionHistory] = useState(false)
  const [isInitialWorkspaceLoadPending, setIsInitialWorkspaceLoadPending] = useState(() =>
    Boolean(window.desktop?.listFolderWorkspaces),
  )
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySession] = useState<
    Record<string, PermissionRequest[]>
  >({})
  const [sessionDiffBySession, setSessionDiffBySession] = useState<Record<string, SessionDiffSummary>>({})
  const [contextUsageBySession, setContextUsageBySession] = useState<Record<string, SessionContextUsage>>({})
  const [permissionRequestActionRequestID, setPermissionRequestActionRequestID] = useState<string | null>(null)
  const [permissionRequestActionError, setPermissionRequestActionError] = useState<string | null>(null)
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([])
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

  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const selectedWorkspace = findWorkspaceByID(workspaces, selectedFolderID) ?? activeWorkspace ?? workspaces[0] ?? null
  const selectedProjectID =
    isInitialWorkspaceLoadPending && selectedWorkspace && seedWorkspaceIDs.has(selectedWorkspace.id)
      ? null
      : selectedWorkspace?.project.id ?? null
  const activeTurns = activeSession ? conversations[activeSession.id] ?? [] : []
  const activeSessionDiff = activeSession ? sessionDiffBySession[activeSession.id] ?? null : null
  const activePendingPermissionRequests = activeSession ? pendingPermissionRequestsBySession[activeSession.id] ?? [] : []
  const activeSessionContextUsage = activeSession ? contextUsageBySession[activeSession.id] ?? null : null
  const activeCreateSessionTab = createSessionTabs.find((tab) => tab.id === activeCreateSessionTabID) ?? null
  const isCreateSessionTabActive = activeCreateSessionTab !== null
  const createSessionWorkspaceID = activeCreateSessionTab?.workspaceID ?? null
  const createSessionTitle = activeCreateSessionTab?.title ?? ""
  const canvasSessionTabs = openCanvasSessionIDs.flatMap((sessionID) => {
    const { session } = findSession(workspaces, sessionID)
    return session ? [session] : []
  })
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

    try {
      const nextDiff = await getSessionDiff({ sessionID: backendSessionID })
      if (sessionDiffRequestRef.current[sessionID] !== requestID) return

      setSessionDiffBySession((prev) => ({
        ...prev,
        [sessionID]: nextDiff,
      }))
    } catch (error) {
      if (sessionDiffRequestRef.current[sessionID] !== requestID) return
      console.error("[desktop] getSessionDiff failed:", error)
    }
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
    const matchingWorkspace = workspaces.find(
      (workspace) => normalizeWorkspacePath(workspace.directory, platform) === normalizedEventDirectory,
    )
    if (!matchingWorkspace) return

    const now = Date.now()
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
        workspaces
          .filter((workspace) => !seedWorkspaceIDs.has(workspace.id) && isWorkspaceAvailable(workspace))
          .map((workspace) => workspace.directory.trim())
          .filter(Boolean),
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
  }, [platform, workspaces])

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
        setCanLoadSessionHistory(true)

        if (!preserveLocalWorkspaceState) {
          const nextSelection = findFirstSession(nextWorkspaces)
          const nextFolderID = nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
          const nextCreateSessionTab = nextSelection.session === null ? createCreateSessionTab(nextFolderID) : null
          setSelectedFolderID(nextFolderID)
          setExpandedFolderID(nextFolderID)
          setActiveSessionID(nextSelection.session?.id ?? null)
          setOpenCanvasSessionIDs(nextSelection.session ? [nextSelection.session.id] : [])
          setCreateSessionTabs(nextCreateSessionTab ? [nextCreateSessionTab] : [])
          setActiveCreateSessionTabID(nextCreateSessionTab?.id ?? null)
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

    void loadPendingPermissionRequestsForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

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

  useEffect(() => {
    void refreshComposerModels()
  }, [selectedProjectID])

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

  useEffect(() => {
    void refreshComposerSkills()
  }, [selectedProjectID])

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
    void refreshComposerMcp()
  }, [selectedProjectID])

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

    setOpenCanvasSessionIDs((current) => {
      const next = current.filter((sessionID) => validSessionIDs.has(sessionID))
      return next.length === current.length ? current : next
    })

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
    if (openCanvasSessionIDs.length > 0) return

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

    setActiveCreateSessionTabID(fallbackCreateSessionTab.id)
    setActiveSessionID(null)

    if (fallbackCreateSessionTab.workspaceID !== selectedFolderID) {
      setSelectedFolderID(fallbackCreateSessionTab.workspaceID)
      setExpandedFolderID(fallbackCreateSessionTab.workspaceID)
    }
  }, [activeCreateSessionTab, createSessionTabs, openCanvasSessionIDs, selectedFolderID, workspaces, activeWorkspace?.id])

  function activateSessionTab(workspaceID: string, sessionID: string) {
    lastFocusedSessionIDRef.current = sessionID
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
    setActiveSessionID(sessionID)
    setActiveCreateSessionTabID(null)
  }

  function focusSession(workspaceID: string, sessionID: string) {
    activateSessionTab(workspaceID, sessionID)
    setOpenCanvasSessionIDs((current) => getUniqueSessionIDs([...current, sessionID]))
  }

  function focusCreateSessionTab(createSessionTabID: string) {
    const nextCreateSessionTab = createSessionTabs.find((tab) => tab.id === createSessionTabID)
    if (!nextCreateSessionTab) return

    setActiveCreateSessionTabID(nextCreateSessionTab.id)
    setActiveSessionID(null)
    setSelectedFolderID(nextCreateSessionTab.workspaceID)
    setExpandedFolderID(nextCreateSessionTab.workspaceID)
  }

  function openCreateSessionTab(preferredWorkspaceID?: string | null) {
    const nextWorkspaceID = resolveCreateSessionWorkspaceID(
      workspaces,
      preferredWorkspaceID,
      selectedFolderID,
      activeWorkspace?.id ?? null,
    )
    const nextCreateSessionTab = createCreateSessionTab(nextWorkspaceID)

    setCreateSessionTabs((current) => [...current, nextCreateSessionTab])
    setActiveCreateSessionTabID(nextCreateSessionTab.id)
    setActiveSessionID(null)

    setSelectedFolderID(nextWorkspaceID)
    setExpandedFolderID(nextWorkspaceID)
  }

  function focusMostRecentCreateSessionTab(preferredWorkspaceID?: string | null) {
    const nextCreateSessionTabID = activeCreateSessionTabID ?? createSessionTabs[createSessionTabs.length - 1]?.id ?? null
    if (nextCreateSessionTabID) {
      focusCreateSessionTab(nextCreateSessionTabID)
      return
    }

    openCreateSessionTab(preferredWorkspaceID)
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
      skipInitialHistoryLoad?: boolean
      title?: string
    },
  ) {
    if (isCreatingSession || !window.desktop?.createFolderSession) return null

    setIsCreatingSession(true)
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
      setCanLoadSessionHistory(true)
      if (options?.skipInitialHistoryLoad) {
        skipNextHistoryLoadRef.current[created.session.id] = true
      }

      if (options?.closeCreateTab && options.createSessionTabID) {
        setCreateSessionTabs((current) => current.filter((tab) => tab.id !== options.createSessionTabID))
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
      }

      focusSession(workspace.id, created.session.id)
      return {
        backendSessionID: created.session.id,
        session: nextSession,
        workspace,
      }
    } catch (error) {
      console.error("[desktop] createFolderSession failed:", error)
      return null
    } finally {
      setIsCreatingSession(false)
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
        setCanLoadSessionHistory(true)
        setExpandedFolderID(createdWorkspace.id)
        setSelectedFolderID(createdWorkspace.id)
        setActiveSessionID(createdWorkspace.sessions[0]?.id ?? null)
        setOpenCanvasSessionIDs(createdWorkspace.sessions[0]?.id ? [createdWorkspace.sessions[0].id] : [])
        if (createdWorkspace.sessions[0]) {
          setCreateSessionTabs([])
          setActiveCreateSessionTabID(null)
        } else {
          const nextCreateSessionTab = createCreateSessionTab(createdWorkspace.id)
          setCreateSessionTabs([nextCreateSessionTab])
          setActiveCreateSessionTabID(nextCreateSessionTab.id)
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
    if (openCanvasSessionIDs.includes(sessionID)) {
      activateSessionTab(workspaceID, sessionID)
      return
    }

    if (activeSessionID) {
      activateSessionTab(workspaceID, sessionID)
      setOpenCanvasSessionIDs((current) => {
        const activeIndex = current.indexOf(activeSessionID)
        if (activeIndex === -1) {
          return getUniqueSessionIDs([...current, sessionID])
        }

        const nextSessionIDs = [...current]
        nextSessionIDs[activeIndex] = sessionID
        return nextSessionIDs
      })
      return
    }

    if (activeCreateSessionTabID) {
      activateSessionTab(workspaceID, sessionID)
      setCreateSessionTabs((current) => current.filter((tab) => tab.id !== activeCreateSessionTabID))
      setOpenCanvasSessionIDs((current) => getUniqueSessionIDs([...current, sessionID]))
      return
    }

    focusSession(workspaceID, sessionID)
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
    const nextOpenCanvasSessionIDs = openCanvasSessionIDs.filter((sessionID) => !removedSessionIDs.has(sessionID))
    const nextFallbackSessionID =
      (lastFocusedSessionIDRef.current && nextOpenCanvasSessionIDs.includes(lastFocusedSessionIDRef.current)
        ? lastFocusedSessionIDRef.current
        : null) ??
      nextOpenCanvasSessionIDs[nextOpenCanvasSessionIDs.length - 1] ??
      null
    const nextFallbackSelection = nextFallbackSessionID ? findSession(nextWorkspaces, nextFallbackSessionID) : { workspace: null, session: null }
    const nextCreateSessionWorkspaceID = resolveCreateSessionWorkspaceID(
      nextWorkspaces,
      activeCreateSessionTab?.workspaceID === workspace.id ? null : activeCreateSessionTab?.workspaceID ?? null,
      nextFallbackSelection.workspace?.id ?? selectedFolderID,
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
    const nextActiveCreateSessionTabID =
      (activeCreateSessionTabID && nextCreateSessionTabs.some((tab) => tab.id === activeCreateSessionTabID) ? activeCreateSessionTabID : null) ??
      nextCreateSessionTabs[nextCreateSessionTabs.length - 1]?.id ??
      null

    setWorkspaces(nextWorkspaces)
    setOpenCanvasSessionIDs(nextOpenCanvasSessionIDs)
    removeWorkspaceSessionState(workspace)
    setCreateSessionTabs(nextCreateSessionTabs)
    setHoveredFolderID((current) => (current === workspace.id ? null : current))

    if (isCreateSessionTabActive || nextFallbackSelection.session === null) {
      const nextActiveCreateSessionTab = nextCreateSessionTabs.find((tab) => tab.id === nextActiveCreateSessionTabID) ?? null
      setActiveCreateSessionTabID(nextActiveCreateSessionTabID)
      setSelectedFolderID(nextActiveCreateSessionTab?.workspaceID ?? nextCreateSessionWorkspaceID)
      setExpandedFolderID(nextActiveCreateSessionTab?.workspaceID ?? nextCreateSessionWorkspaceID)
      setActiveSessionID(null)
      return
    }

    lastFocusedSessionIDRef.current = nextFallbackSelection.session.id
    setSelectedFolderID(nextFallbackSelection.workspace?.id ?? nextCreateSessionWorkspaceID)
    setExpandedFolderID(nextFallbackSelection.workspace?.id ?? nextCreateSessionWorkspaceID)
    setActiveSessionID(nextFallbackSelection.session.id)
    setActiveCreateSessionTabID(null)
  }

  async function handleSessionDelete(workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (deletingSessionID || !window.desktop?.deleteAgentSession) return

    setDeletingSessionID(session.id)
    try {
      await window.desktop.deleteAgentSession({ sessionID: session.id })
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
      const nextOpenCanvasSessionIDs = openCanvasSessionIDs.filter((sessionID) => sessionID !== session.id)
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
      const nextSessionID =
        getNextSessionTabAfterClose(openCanvasSessionIDs, session.id) &&
        nextOpenCanvasSessionIDs.includes(getNextSessionTabAfterClose(openCanvasSessionIDs, session.id) ?? "")
          ? getNextSessionTabAfterClose(openCanvasSessionIDs, session.id)
          : null
      const nextSelection =
        nextSessionID && activeSessionID === session.id
          ? findSession(nextWorkspaces, nextSessionID)
          : selectAfterSessionDelete(nextWorkspaces, workspace.id, session.id, activeSessionID)

      setWorkspaces(nextWorkspaces)
      setOpenCanvasSessionIDs(nextOpenCanvasSessionIDs)
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
      setContextUsageBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      delete conversationVersionRef.current[session.id]
      delete permissionRequestsRequestRef.current[session.id]
      delete sessionDiffRequestRef.current[session.id]
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

      if (nextOpenCanvasSessionIDs.length === 0) {
        const nextFallbackCreateSessionTab =
          (activeCreateSessionTabID ? nextCreateSessionTabs.find((tab) => tab.id === activeCreateSessionTabID) : null) ??
          nextCreateSessionTabs[nextCreateSessionTabs.length - 1] ??
          createCreateSessionTab(nextCreateSessionWorkspaceID)

        if (nextCreateSessionTabs.length === 0) {
          setCreateSessionTabs([nextFallbackCreateSessionTab])
        }

        setActiveCreateSessionTabID(nextFallbackCreateSessionTab.id)
        setSelectedFolderID(nextFallbackCreateSessionTab.workspaceID)
        setExpandedFolderID(nextFallbackCreateSessionTab.workspaceID)
        setActiveSessionID(null)
      } else {
        setSelectedFolderID(nextSelection.workspace?.id ?? nextCreateSessionWorkspaceID ?? nextWorkspaces[0]?.id ?? null)
        setExpandedFolderID(nextSelection.workspace?.id ?? nextCreateSessionWorkspaceID ?? null)
        setActiveSessionID(nextSelection.session?.id ?? null)
        setActiveCreateSessionTabID(null)
        if (nextSelection.session) {
          lastFocusedSessionIDRef.current = nextSelection.session.id
        }
      }
    } catch (error) {
      console.error("[desktop] deleteAgentSession failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  function handleCanvasSessionTabSelect(sessionID: string) {
    const nextSelection = findSession(workspaces, sessionID)
    if (!nextSelection.workspace || !nextSelection.session) return

    focusSession(nextSelection.workspace.id, nextSelection.session.id)
  }

  function handleCanvasSessionTabClose(sessionID: string) {
    const nextOpenCanvasSessionIDs = openCanvasSessionIDs.filter((currentSessionID) => currentSessionID !== sessionID)
    setOpenCanvasSessionIDs(nextOpenCanvasSessionIDs)

    if (activeSessionID !== sessionID || isCreateSessionTabActive) {
      if (nextOpenCanvasSessionIDs.length === 0) {
        focusMostRecentCreateSessionTab(selectedFolderID)
      }
      return
    }

    const nextSessionID = getNextSessionTabAfterClose(openCanvasSessionIDs, sessionID)
    if (nextSessionID) {
      const nextSelection = findSession(workspaces, nextSessionID)
      if (nextSelection.workspace && nextSelection.session) {
        focusSession(nextSelection.workspace.id, nextSelection.session.id)
        return
      }
    }

    focusMostRecentCreateSessionTab(selectedFolderID)
  }

  function handleCreateSessionTabSelect(createSessionTabID: string) {
    focusCreateSessionTab(createSessionTabID)
  }

  function handleOpenCreateSessionTab(preferredWorkspaceID?: string | null) {
    openCreateSessionTab(preferredWorkspaceID)
  }

  function handleCloseCreateSessionTab(createSessionTabID: string) {
    if (openCanvasSessionIDs.length === 0 && createSessionTabs.length === 1) {
      return
    }

    const nextCreateSessionTabs = createSessionTabs.filter((tab) => tab.id !== createSessionTabID)
    setCreateSessionTabs(nextCreateSessionTabs)

    if (activeCreateSessionTabID !== createSessionTabID) {
      return
    }

    const nextCreateSessionTabID = getNextSessionTabAfterClose(
      createSessionTabs.map((tab) => tab.id),
      createSessionTabID,
    )
    if (nextCreateSessionTabID) {
      focusCreateSessionTab(nextCreateSessionTabID)
      return
    }

    const nextSessionID =
      (lastFocusedSessionIDRef.current && openCanvasSessionIDs.includes(lastFocusedSessionIDRef.current)
        ? lastFocusedSessionIDRef.current
        : null) ?? openCanvasSessionIDs[openCanvasSessionIDs.length - 1] ?? null

    if (!nextSessionID) return

    const nextSelection = findSession(workspaces, nextSessionID)
    if (!nextSelection.workspace || !nextSelection.session) return

    focusSession(nextSelection.workspace.id, nextSelection.session.id)
  }

  function handleCreateSessionWorkspaceChange(workspaceID: string) {
    if (!activeCreateSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === activeCreateSessionTabID
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

  function handleCreateSessionTitleChange(value: string) {
    if (!activeCreateSessionTabID) return

    setCreateSessionTabs((current) =>
      current.map((tab) =>
        tab.id === activeCreateSessionTabID
          ? {
              ...tab,
              title: value,
            }
          : tab,
      ),
    )
  }

  async function handleCreateSessionSubmit() {
    if (!activeCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, activeCreateSessionTab.workspaceID)
    if (!workspace) return

    await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID: activeCreateSessionTab.id,
    })
  }

  async function sendPromptToSession(input: {
    backendSessionID?: string | null
    session: SessionSummary
    text: string
    workspace: WorkspaceGroup
  }) {
    const { session, text, workspace } = input
    const uiSessionID = session.id
    const canStream = Boolean(window.desktop?.streamAgentMessage && window.desktop?.onAgentStreamEvent)
    const attachments = composerAttachments
    const selectedSkillIDs = composerSelectedSkillIDs
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

    setDraft("")
    setComposerAttachments([])

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

    setIsSending(true)
    let streamingTurnID: string | null = null
    let streamID: string | null = null

    try {
      let backendSessionID = input.backendSessionID ?? agentSessions[uiSessionID]
      if (!backendSessionID) {
        const created = await window.desktop.createAgentSession({
          directory: agentDefaultDirectory || undefined,
        })
        backendSessionID = created.session.id
        setAgentSessions((prev) => ({
          ...prev,
          [uiSessionID]: backendSessionID!,
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
          skills: selectedSkillIDs,
        })

        return
      }

      const result = await window.desktop.sendAgentMessage?.({
        sessionID: backendSessionID,
        ...(normalizedText ? { text: normalizedText } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
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
      setIsSending(false)
    }
  }

  async function handleSend(draftOverride?: string) {
    const text = (draftOverride ?? draft).trim()
    if ((!text && composerAttachments.length === 0) || isSending || activePendingPermissionRequests.length > 0) return
    if (pendingModelSelectionRef.current) {
      await pendingModelSelectionRef.current.catch(() => undefined)
    }
    if (composerAttachmentPolicyRef.current.attachmentError) return

    if (activeSession && activeWorkspace) {
      await sendPromptToSession({
        session: activeSession,
        text,
        workspace: activeWorkspace,
      })
      return
    }

    if (!activeCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, activeCreateSessionTab.workspaceID)
    if (!workspace) return

    const created = await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID: activeCreateSessionTab.id,
      skipInitialHistoryLoad: true,
    })
    if (!created) return

    await sendPromptToSession({
      backendSessionID: created.backendSessionID,
      session: created.session,
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

  async function handlePickComposerAttachments() {
    const pickComposerAttachments = window.desktop?.pickComposerAttachments
    if (!pickComposerAttachments) return

    const { allowImage, allowPdf, disabledReason } = composerAttachmentPolicyRef.current
    if (disabledReason) return

    try {
      const pickedPaths = await pickComposerAttachments({
        allowImage,
        allowPdf,
      })
      if (!pickedPaths || pickedPaths.length === 0) return

      setComposerAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.path))
        const nextAttachments = [...current]
        const supportedCapabilities = { image: allowImage, pdf: allowPdf }

        for (const path of pickedPaths) {
          if (!isComposerAttachmentSupported(path, supportedCapabilities)) continue
          if (seen.has(path)) continue
          seen.add(path)
          nextAttachments.push(buildComposerAttachment(path))
        }

        return nextAttachments
      })
    } catch (error) {
      console.error("[desktop] pickComposerAttachments failed:", error)
    }
  }

  function handleRemoveComposerAttachment(path: string) {
    setComposerAttachments((current) => current.filter((attachment) => attachment.path !== path))
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

  return {
    activeCreateSessionTabID,
    activeSession,
    activeSessionContextUsage,
    activeSessionDiff,
    activePendingPermissionRequests,
    activeTurns,
    canvasSessionTabs,
    composerAttachments,
    composerAttachmentButtonTitle,
    composerAttachmentDisabledReason,
    composerAttachmentError,
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
    handleComposerMcpToggle,
    handleComposerSkillToggle,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenCreateSessionTab,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
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
    rightSidebarView,
    selectedProjectID,
    selectedWorkspace,
    selectedFolderID,
    setDraft,
    setHoveredFolderID,
    threadColumnRef,
    workspaces,
  }
}
