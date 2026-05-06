import type {
  PermissionDecision as AgentPermissionDecision,
  PermissionPromptSnapshot as AgentPermissionPromptSnapshot,
  PermissionRequestPrompt as AgentPermissionRequest,
  PermissionRequestResolutionRecord as AgentPermissionRequestResolutionRecord,
  PermissionRequestStatus as AgentPermissionRequestStatus,
  PermissionResolveResult as AgentPermissionResolveResult,
  PermissionRisk as AgentPermissionRisk,
  PermissionToolKind as AgentPermissionToolKind,
  ToolPermissionMode as AgentToolPermissionMode,
  ToolPermissionModePayload as AgentToolPermissionModePayload,
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

export type AgentSessionTaskStatus = "pending" | "in_progress" | "completed"

export interface AgentSessionTaskPeer {
  id: string
  subject: string
  status: AgentSessionTaskStatus
  owner: string
}

export interface AgentSessionTaskSummary {
  id: string
  sessionID: string
  subject: string
  description: string
  activeForm: string
  owner: string
  status: AgentSessionTaskStatus
  sortIndex: number
  blocks: string[]
  blockedBy: string[]
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  sourceAssistantMessageID?: string
  sourceUserMessageID?: string
  toolCallID?: string
  isBlocked: boolean
  blockingTasks: AgentSessionTaskPeer[]
  blockedTasks: AgentSessionTaskPeer[]
}

export interface AgentSessionTaskOwnerActivity {
  owner: string
  current?: AgentSessionTaskSummary
  next?: AgentSessionTaskSummary
}

export interface AgentSessionTaskTeammateActivity {
  id: string
  owner: string
  title: string
  status: string
  active: boolean
  childSessionID?: string
  updatedAt?: number
}

export interface AgentSessionTaskListView {
  sessionID: string
  generatedAt: number
  tasks: AgentSessionTaskSummary[]
  current: AgentSessionTaskSummary[]
  next: AgentSessionTaskSummary[]
  blocked: AgentSessionTaskSummary[]
  owners: AgentSessionTaskOwnerActivity[]
  teammateActivity: AgentSessionTaskTeammateActivity[]
  summary: {
    total: number
    completed: number
    pending: number
    inProgress: number
    blocked: number
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

export interface AgentSessionModelSelection {
  model?: string
  small_model?: string
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
  modelSelection?: AgentSessionModelSelection
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
  modelSelection?: AgentSessionModelSelection
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

export type AgentBuiltinToolKind =
  | "read"
  | "write"
  | "search"
  | "exec"
  | "workflow"
  | "interaction"
  | "delegation"
  | "other"
export type AgentBuiltinToolConcurrency = "safe" | "exclusive"

export interface AgentBuiltinToolCapabilities {
  kind?: AgentBuiltinToolKind
  readOnly?: boolean
  destructive?: boolean
  concurrency?: AgentBuiltinToolConcurrency
  needsShell?: boolean
}

export interface AgentBuiltinToolSummary {
  id: string
  title: string
  description: string
  aliases: string[]
  capabilities: AgentBuiltinToolCapabilities
  enabled: boolean
}

export interface AgentBuiltinToolSelection {
  tools: Record<string, boolean>
}

export interface AgentBuiltinToolsPayload {
  items: AgentBuiltinToolSummary[]
  selection: AgentBuiltinToolSelection
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

export interface AgentSessionQuestionAnswerResult extends AgentSessionQuestionAnswerInput {
  sessionID: string
  answerText: string
  answeredAt: number
}

export interface AgentSessionTurnRequestInput {
  clientTurnID: string
  backendSessionID: string
  text?: string
  attachments?: AgentSessionComposerAttachmentInput[]
  questionAnswer?: AgentSessionQuestionAnswerInput
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  model?: {
    providerID: string
    modelID: string
  }
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
  tasks?: AgentSessionTaskListView
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
  AgentToolPermissionMode,
  AgentToolPermissionModePayload
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

export interface AgentProviderConnectionTestResult {
  providerID: string
  ok: boolean
  status:
    | "working"
    | "not_connected"
    | "auth_error"
    | "network_error"
    | "config_error"
    | "unsupported"
    | "unknown_error"
  checkedAt: number
  message: string
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
  providerName?: string
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
  image_model?: string
  image_generation?: {
    default_size?: string
    default_count?: number
  }
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
  scope: "project" | "user" | "plugin"
}

export interface AgentGlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  role: "folder" | "skill" | "resource"
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

export interface AgentGlobalSkillFolderResult {
  directory: string
}

export interface AgentGlobalSkillFolderRenameResult {
  previousDirectory: string
  directory: string
}

export interface AgentGlobalSkillMoveResult {
  previousDirectory: string
  directory: string
  filePath: string | null
}

export interface AgentSkillInstallCandidate {
  id: string
  name: string
  description: string
  relativePath: string
  directoryName: string
  targetDirectory: string
  available: boolean
  reason?: string
  filePath: string
}

export interface AgentSkillGitInstallPreview {
  previewID: string
  source: string
  cloneUrl: string
  ref?: string
  subpath?: string
  skills: AgentSkillInstallCandidate[]
}

export interface AgentInstalledGlobalSkill {
  id: string
  name: string
  directory: string
  filePath: string
}

export interface AgentSkillGitInstallResult {
  installed: AgentInstalledGlobalSkill[]
}

export type AgentPromptPresetSource = "bundled" | "custom"

export interface AgentPromptPresetSelection {
  systemPromptPresetID: string
  planModePromptPresetID: string
  sideChatPromptPresetID: string
}

export interface AgentPromptPresetSummary {
  id: string
  label: string
  description: string
  source: AgentPromptPresetSource
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
  filePath?: string
  root?: string
}

export interface AgentPromptPresetDocument extends AgentPromptPresetSummary {
  content: string
}

export interface AgentPromptUrlInstallCandidate {
  id: string
  label: string
  description: string
  sourcePath: string
  available: boolean
  reason?: string
}

export interface AgentPromptUrlInstallPreview {
  previewID: string
  source: string
  prompts: AgentPromptUrlInstallCandidate[]
}

export interface AgentPromptUrlInstallResult {
  installed: AgentPromptPresetDocument[]
}

export type AgentMcpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }

export type AgentMcpToolPolicyValue = "disabled" | "ask" | "auto"

export type AgentMcpToolPolicies = Record<string, {
  policy: AgentMcpToolPolicyValue
}>

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
  toolPolicies?: AgentMcpToolPolicies
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
  toolPolicies?: AgentMcpToolPolicies
  requireApproval?: AgentMcpRequireApproval
  enabled: boolean
  timeoutMs?: number
}

export type AgentMcpServerSummary = AgentStdioMcpServerSummary | AgentRemoteMcpServerSummary

export interface AgentMcpToolDiagnostic {
  name: string
  title?: string
  displayName: string
  description?: string
  inputSchema?: unknown
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  riskHint: "read-only" | "destructive" | "open-world" | "unknown"
  recommendedPolicy: AgentMcpToolPolicyValue
  configuredPolicy?: AgentMcpToolPolicyValue
}

export interface AgentMcpServerDiagnostic {
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  toolNames: string[]
  tools: AgentMcpToolDiagnostic[]
  error?: string
}

export type AgentPluginCategory = "Code" | "Browser" | "Git" | "Database" | "Docs" | "Automation" | "Design"
export type AgentPluginRisk = "low" | "medium" | "high" | "critical"

export interface AgentPluginToolPreview {
  name: string
  title?: string
  description: string
  readOnly?: boolean
  destructive?: boolean
}

export interface AgentPluginConfigField {
  key: string
  label: string
  type?: "text" | "password" | "url" | "path"
  required?: boolean
  secret?: boolean
  placeholder?: string
  defaultValue?: string
  description?: string
}

export interface AgentPluginStdioRuntime {
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolPolicies?: AgentMcpToolPolicies
  timeoutMs?: number
}

export interface AgentPluginRemoteRuntime {
  transport: "remote"
  provider?: "openai"
  serverUrl?: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: AgentMcpAllowedTools
  toolPolicies?: AgentMcpToolPolicies
  requireApproval?: AgentMcpRequireApproval
  timeoutMs?: number
}

export type AgentPluginRuntimeTemplate = AgentPluginStdioRuntime | AgentPluginRemoteRuntime

export interface AgentPluginMcpServerCatalogEntry {
  id: string
  name: string
  description?: string
  risk?: AgentPluginRisk
  permissions?: string[]
  tools: AgentPluginToolPreview[]
  configFields?: AgentPluginConfigField[]
  runtime: AgentPluginRuntimeTemplate
  installReview?: string[]
}

export interface AgentPluginSkillPreview {
  id: string
  name: string
  description: string
  directory: string
}

export interface AgentPluginAppConnector {
  appID: string
  name: string
  description?: string
  icon?: string
  risk?: AgentPluginRisk
  permissions?: string[]
  tools?: AgentPluginToolPreview[]
  credential: AgentPluginConfigField
  runtime: AgentPluginRemoteRuntime
  installReview?: string[]
}

export interface AgentPluginCatalogItem {
  id: string
  name: string
  description: string
  version: string
  publisher: string
  category: AgentPluginCategory
  icon?: string
  homepage?: string
  documentationUrl?: string
  risk: AgentPluginRisk
  permissions: string[]
  tools: AgentPluginToolPreview[]
  configFields: AgentPluginConfigField[]
  runtime?: AgentPluginRuntimeTemplate
  mcpServers: AgentPluginMcpServerCatalogEntry[]
  skills: AgentPluginSkillPreview[]
  apps: AgentPluginAppConnector[]
  installReview?: string[]
}

export interface AgentInstalledPlugin {
  pluginID: string
  version: string
  enabled: boolean
  mcpServerID?: string
  mcpServerIDs: string[]
  skillIDs: string[]
  connectorIDs: string[]
  config: Record<string, string>
  installedAt: number
  updatedAt: number
  lastDiagnostic?: AgentMcpServerDiagnostic
  lastConnectorDiagnostics?: Record<string, AgentMcpServerDiagnostic>
}

export interface AgentPluginInstallInput {
  pluginID: string
  config?: Record<string, string>
  enabled?: boolean
}

export interface AgentPluginUpdateInput {
  pluginID: string
  config?: Record<string, string>
  enabled?: boolean
}

export interface AgentPluginDeleteResult {
  pluginID: string
  mcpServerID?: string
  mcpServerIDs: string[]
  connectorIDs: string[]
  removed: boolean
}

export interface AgentPluginConnectorStatus {
  pluginID: string
  appID: string
  connectorID: string
  connected: boolean
  credentialLabel?: string
  generatedMcpServerID: string
  lastDiagnostic?: AgentMcpServerDiagnostic
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
