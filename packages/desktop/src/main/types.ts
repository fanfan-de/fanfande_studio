import type {
  PermissionDecision as AgentPermissionDecision,
  PermissionPromptSnapshot as AgentPermissionPromptSnapshot,
  PermissionRequestPrompt as AgentPermissionRequest,
  PermissionRequestResolutionRecord as AgentPermissionRequestResolutionRecord,
  PermissionRequestStatus as AgentPermissionRequestStatus,
  PermissionResolveResult as AgentPermissionResolveResult,
  PermissionRisk as AgentPermissionRisk,
  PermissionToolKind as AgentPermissionToolKind,
} from "../shared/permission"

export type MenuKey = "file" | "edit" | "view" | "window" | "help"
export type WindowAction = "minimize" | "toggle-maximize" | "close"

export interface MenuAnchor {
  x: number
  y: number
}

export interface AgentConfig {
  baseURL: string
  defaultDirectory: string
}

export interface AgentProjectInfo {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sandboxes: string[]
}

export interface AgentSessionWorkflowSummary {
  mode: "execution" | "planning"
  plan: {
    status: "idle" | "draft" | "pending-approval" | "approved"
    updatedAt: number
    approvedAt?: number
  }
}

export type AgentSessionKind = "main" | "side-chat"
export type AgentSessionToolPolicy = "default" | "read-only"

export interface AgentSessionPolicy {
  toolPolicy: AgentSessionToolPolicy
  ignoreFullAccess?: boolean
}

export interface AgentSessionOrigin {
  parentSessionID: string
  anchorMessageID: string
  anchorPreview: string
}

export interface AgentSessionInfo {
  id: string
  projectID: string
  directory: string
  title: string
  version?: string
  kind?: AgentSessionKind
  policy?: AgentSessionPolicy
  origin?: AgentSessionOrigin
  workflow?: AgentSessionWorkflowSummary
  time: {
    created: number
    updated: number
  }
}

export interface AgentWorkspaceSession {
  id: string
  projectID: string
  directory: string
  title: string
  kind?: AgentSessionKind
  policy?: AgentSessionPolicy
  origin?: AgentSessionOrigin
  created: number
  updated: number
  workflow?: AgentSessionWorkflowSummary
}

export interface AgentProjectWorkspace {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sessions: AgentWorkspaceSession[]
}

export interface AgentFolderProjectSummary {
  id: string
  name: string
  worktree: string
}

export interface AgentFolderWorkspace {
  id: string
  directory: string
  name: string
  exists: boolean
  created: number
  updated: number
  project: AgentFolderProjectSummary
  sessions: AgentWorkspaceSession[]
}

export interface AgentProjectDeleteResult {
  projectID: string
  deletedSessionIDs: string[]
}

export interface AgentSessionDeleteResult {
  sessionID: string
  projectID: string
}

export interface AgentSessionArchiveResult {
  sessionID: string
  projectID: string
  directory: string
  archivedAt: number
  archivedSessionIDs?: string[]
}

export interface AgentArchivedSessionSummary {
  id: string
  projectID: string
  projectName: string | null
  projectMissing: boolean
  directory: string
  title: string
  kind?: AgentSessionKind
  policy?: AgentSessionPolicy
  origin?: AgentSessionOrigin
  created: number
  updated: number
  archivedAt: number
  messageCount: number
  eventCount: number
}

export interface AgentSideChatSource {
  kind: "url" | "document"
  title: string
  url?: string
}

export interface AgentSideChatToolSummary {
  tool: string
  status: "completed" | "error" | "denied"
  summary: string
}

export interface AgentSideChatSnapshot {
  userText?: string
  assistantText: string
  sources?: AgentSideChatSource[]
  toolSummaries?: AgentSideChatToolSummary[]
  filePaths?: string[]
}

export interface AgentSideChatLink {
  sessionID: string
  parentSessionID: string
  anchorMessageID: string
  anchorUserMessageID?: string
  createdAt: number
  anchorPreview: string
  snapshotVersion: 1
  snapshot: AgentSideChatSnapshot
  session?: AgentSessionInfo
  archived?: boolean
}

export interface AgentArchivedSessionDeleteResult {
  sessionID: string
}

export interface AgentEnvelope<T> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

export interface AgentSSEEvent {
  id?: string
  event: string
  data: unknown
}

export interface AgentStreamIPCEvent extends AgentSSEEvent {
  streamID: string
}

export interface AgentSessionStreamIPCEvent extends AgentSSEEvent {
  sessionID: string
}

export interface AgentSessionComposerAttachmentInput {
  path: string
  name?: string
}

export interface AgentSessionQuestionAnswerInput {
  questionID: string
  selectedOptions?: string[]
  freeformText?: string
}

export interface AgentSessionTurnRequestInput {
  clientTurnID: string
  backendSessionID: string
  text?: string
  attachments?: AgentSessionComposerAttachmentInput[]
  questionAnswer?: AgentSessionQuestionAnswerInput
  permissionMode?: "default" | "full-access"
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  system?: string
  agent?: string
  skills?: string[]
}

export type AgentSessionBridgeIPCEvent =
  | {
      kind: "stream"
      source: "request" | "subscription"
      backendSessionID: string
      uiSessionID?: string
      clientTurnID?: string
      id?: string
      event: string
      data: unknown
      receivedAt: number
    }
  | {
      kind: "subscription-state"
      backendSessionID: string
      uiSessionID?: string
      state: "connecting" | "connected" | "reconnecting" | "closed" | "error"
      message?: string
      lastEventID?: string
      receivedAt: number
    }

export interface AgentSessionHistoryInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  created: number
  completed?: number
  error?: {
    message?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface AgentSessionHistoryMessage {
  info: AgentSessionHistoryInfo
  parts: unknown[]
}

export interface AgentSessionDiffFile {
  file: string
  additions: number
  deletions: number
  patch?: string
}

export interface AgentSessionDiffSummary {
  title?: string
  body?: string
  stats?: {
    additions: number
    deletions: number
    files: number
  }
  diffs: AgentSessionDiffFile[]
}

export interface AgentWorkspaceFileSearchResult {
  path: string
  absolutePath?: string
  name: string
  extension: string | null
}

export interface AgentWorkspaceFileDocument {
  path: string
  name: string
  extension: string | null
  kind: "text" | "unsupported"
  content?: string
  unsupportedReason?: string
}

export interface AgentSessionRuntimeEventSummary {
  eventID: string
  type: string
  sessionID: string
  turnID: string
  seq: number
  timestamp: number
  cursor: string
  title: string
  detail?: string
  tone: "info" | "success" | "warning" | "error"
  summary?: Record<string, unknown>
}

export interface AgentSessionRuntimeToolSummary {
  callID: string
  tool: string
  title?: string
  status: string
  startedAt?: number
  endedAt?: number
  durationMs?: number
  approvalID?: string
  inputPreview?: string
  outputPreview?: string
  error?: string
}

export interface AgentSessionRuntimeLlmCallSummary {
  id: string
  messageID: string
  providerID: string
  modelID: string
  agent?: string
  iteration?: number
  status: "running" | "completed" | "failed"
  startedAt: number
  endedAt?: number
  durationMs?: number
  messageCount: number
  toolCount?: number
  hasAttachments?: boolean
  finishReason?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  error?: string
  retryable?: boolean
}

export interface AgentSessionRuntimeErrorContext {
  phase?:
    | "preparing"
    | "waiting_llm"
    | "reasoning"
    | "executing_tool"
    | "waiting_approval"
    | "responding"
    | "retrying"
    | "blocked"
    | "completed"
    | "cancelled"
    | "failed"
  messageID?: string
  agent?: string
  model?: string
  iteration?: number
  error: {
    name?: string
    message: string
    code?: string
    retryable?: boolean
  }
  activeTools: Array<{
    callID: string
    tool: string
    status: string
  }>
  latestTool?: {
    callID: string
    tool: string
    status: string
  }
}

export interface AgentSessionRuntimeTurnSummary {
  turnID: string
  startedAt?: number
  endedAt?: number
  durationMs?: number
  lastEventAt?: number
  status: "running" | "completed" | "blocked" | "stopped" | "failed"
  phase?:
    | "preparing"
    | "waiting_llm"
    | "reasoning"
    | "executing_tool"
    | "waiting_approval"
    | "responding"
    | "retrying"
    | "blocked"
    | "completed"
    | "cancelled"
    | "failed"
  phaseReason?: string
  phaseUpdatedAt?: number
  userMessageID?: string
  agent?: string
  model?: string
  resume: boolean
  finishReason?: string
  message?: {
    messageID?: string
    role?: string
    created?: number
    completed?: number
    finishReason?: string
    providerID?: string
    modelID?: string
    agent?: string
    error?: string
  } | null
  llmCalls: AgentSessionRuntimeLlmCallSummary[]
  tools: AgentSessionRuntimeToolSummary[]
  error?: {
    message: string
    messageID?: string
    providerID?: string
    modelID?: string
    agent?: string
  } | null
  errorContext?: AgentSessionRuntimeErrorContext | null
  recentEvents: AgentSessionRuntimeEventSummary[]
}

export interface AgentSessionRuntimeDebugSnapshot {
  generatedAt: number
  logging: Record<string, unknown>
  session: {
    id: string
    projectID?: string
    directory?: string
    title?: string
    created?: number
    updated?: number
    missing: boolean
  }
  status: {
    type: "busy" | "idle"
    phase?:
      | "preparing"
      | "waiting_llm"
      | "reasoning"
      | "executing_tool"
      | "waiting_approval"
      | "responding"
      | "retrying"
      | "blocked"
      | "completed"
      | "cancelled"
      | "failed"
  }
  running: {
    sessionID: string
    startedAt: number | null
    activeForMs: number
    reason?: string
  }
  activeTurnID: string | null
  latestTurn: AgentSessionRuntimeTurnSummary | null
  turns: AgentSessionRuntimeTurnSummary[]
  recentEvents: AgentSessionRuntimeEventSummary[]
  diagnostics: {
    blockedOnApproval: boolean
    activeToolCount: number
    failedToolCount: number
    llmFailureCount: number
    lastErrorMessage?: string
  }
}

export type {
  AgentPermissionDecision,
  AgentPermissionPromptSnapshot,
  AgentPermissionRequest,
  AgentPermissionRequestResolutionRecord,
  AgentPermissionRequestStatus,
  AgentPermissionResolveResult,
  AgentPermissionRisk,
  AgentPermissionToolKind,
}

export interface AgentProviderCatalogItem {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]
  configured: boolean
  available: boolean
  apiKeyConfigured: boolean
  baseURL?: string
  modelCount: number
  authCapabilities: AgentProviderAuthCapability[]
  authState: AgentProviderAuthState
  authScope: "global"
  activeAuthMethod?: string
  connectionLabel?: string
  lastAuthError?: string
}

export interface AgentProviderAuthCapability {
  method: string
  label: string
  description?: string
  kind: "browser_oauth" | "device_code" | "api_key"
  recommended?: boolean
  supportsPolling?: boolean
  supportsRefresh?: boolean
  supportsDisconnect?: boolean
}

export interface AgentProviderAuthAccountSummary {
  accountID?: string
  userID?: string
  email?: string
  planType?: string
  workspaceID?: string
  workspaceName?: string
  label?: string
}

export interface AgentProviderAuthFlow {
  id: string
  providerID: string
  method: string
  kind: "browser_oauth" | "device_code" | "api_key"
  status: "pending" | "waiting_user" | "authorizing" | "connected" | "error" | "expired" | "cancelled"
  startedAt: number
  updatedAt: number
  expiresAt?: number
  authorizationURL?: string
  verificationURI?: string
  userCode?: string
  errorMessage?: string
  connectionLabel?: string
  account?: AgentProviderAuthAccountSummary
}

export interface AgentProviderAuthState {
  providerID: string
  scope: "global"
  activeMethod?: string
  status: "connected" | "pending" | "expired" | "error" | "not_connected"
  connectionLabel?: string
  lastError?: string
  expiresAt?: number
  account?: AgentProviderAuthAccountSummary
  capabilities: AgentProviderAuthCapability[]
  credentials: Array<{
    method: string
    kind: "api_key" | "oauth_session"
    source: "credential_store" | "legacy_config" | "environment" | "external_cache"
    configured: boolean
    expiresAt?: number
    label?: string
    email?: string
    planType?: string
    workspaceID?: string
    workspaceName?: string
  }>
  flow?: AgentProviderAuthFlow
}

export interface AgentProviderModelCapabilitiesModalities {
  text: boolean
  audio: boolean
  image: boolean
  video: boolean
  pdf: boolean
}

export interface AgentProviderModelCapabilities {
  temperature: boolean
  reasoning: boolean
  attachment: boolean
  toolcall: boolean
  input: AgentProviderModelCapabilitiesModalities
  output: AgentProviderModelCapabilitiesModalities
}

export interface AgentProviderModel {
  id: string
  providerID: string
  name: string
  family?: string
  status: "alpha" | "beta" | "deprecated" | "active"
  available: boolean
  capabilities: AgentProviderModelCapabilities
  limit: {
    context: number
    input?: number
    output: number
  }
}

export interface AgentProjectModelSelection {
  model?: string
  small_model?: string
}

export interface AgentProjectModelsResult {
  items: AgentProviderModel[]
  selection: AgentProjectModelSelection
  effectiveModel?: AgentProviderModel | null
}

export interface AgentProjectSkillSelection {
  skillIDs: string[]
}

export interface AgentProjectMcpSelection {
  serverIDs: string[]
}

export interface AgentSkillInfo {
  id: string
  name: string
  description: string
  path: string
  scope: "project" | "user"
}

export interface AgentGlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  children?: AgentGlobalSkillTreeNode[]
}

export interface AgentGlobalSkillTree {
  root: string
  items: AgentGlobalSkillTreeNode[]
}

export interface AgentGlobalSkillFileDocument {
  path: string
  content: string
}

export interface AgentGlobalSkillRenameResult {
  previousDirectory: string
  directory: string
  filePath: string | null
}

export type AgentPromptPresetSource = "bundled" | "custom"

export interface AgentPromptPresetSelection {
  systemPromptPresetID: string
  planModePromptPresetID: string
}

export interface AgentPromptPresetSummary {
  id: string
  label: string
  description: string
  source: AgentPromptPresetSource
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
}

export interface AgentPromptPresetDocument extends AgentPromptPresetSummary {
  content: string
}

export type AgentMcpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }

export type AgentMcpRequireApproval =
  | "always"
  | "never"
  | {
      never?: {
        toolNames?: string[]
      }
    }

export interface AgentStdioMcpServerSummary {
  id: string
  name?: string
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
  timeoutMs?: number
}

export interface AgentRemoteMcpServerSummary {
  id: string
  name?: string
  transport: "remote"
  provider?: "openai"
  serverUrl?: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: AgentMcpAllowedTools
  requireApproval?: AgentMcpRequireApproval
  enabled: boolean
  timeoutMs?: number
}

export type AgentMcpServerSummary = AgentStdioMcpServerSummary | AgentRemoteMcpServerSummary

export interface AgentMcpServerDiagnostic {
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  toolNames: string[]
  error?: string
}

export interface AgentPtySessionInfo {
  id: string
  title: string
  cwd: string
  shell: string
  rows: number
  cols: number
  status: "running" | "exited" | "deleted"
  exitCode: number | null
  createdAt: number
  updatedAt: number
  cursor: number
}

export interface AgentPtyReplayPayload {
  mode: "delta" | "reset"
  buffer: string
  cursor: number
  startCursor: number
}

export type AgentPtySocketMessage =
  | {
      type: "ready"
      session: AgentPtySessionInfo
      replay: AgentPtyReplayPayload
    }
  | {
      type: "output"
      id: string
      data: string
      cursor: number
    }
  | {
      type: "state"
      session: AgentPtySessionInfo
    }
  | {
      type: "exited"
      session: AgentPtySessionInfo
    }
  | {
      type: "deleted"
      session: AgentPtySessionInfo
    }
  | {
      type: "error"
      code: string
      message: string
    }

export type PtyTransportIPCEvent =
  | {
      ptyID: string
      type: "transport"
      state: "connecting" | "connected" | "disconnected" | "error"
      code?: number
      reason?: string
      userInitiated?: boolean
      message?: string
    }
  | ({
      ptyID: string
    } & AgentPtySocketMessage)
