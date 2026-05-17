import type {
  PermissionDecision,
  PermissionPromptDetails,
  PermissionPromptSnapshot,
  PermissionRequestPrompt as PermissionRequest,
  PermissionRequestResolutionRecord,
  PermissionRequestStatus,
  PermissionRisk,
  PermissionToolKind,
  ToolPermissionMode,
} from "../../../shared/permission"
import type { ReasoningEffort as SharedReasoningEffort } from "@fanfande/shared"
import type {
  DesktopPreviewRenderer,
  DesktopResolvedPreviewTarget,
} from "../../../shared/desktop-ipc-contract"

export type {
  PermissionDecision,
  PermissionPromptDetails,
  PermissionPromptSnapshot,
  PermissionRequest,
  PermissionRequestResolutionRecord,
  PermissionRequestStatus,
  PermissionRisk,
  PermissionToolKind,
  ToolPermissionMode
}

export type SessionStatus = "Live" | "Review" | "Ready"
export type SidebarActionKey = "project" | "sort" | "new"
export type LeftSidebarView = "workspace" | "skills" | "prompts" | "mcp" | "plugins" | "tools"
export type WorkspaceMode = "chat" | "code"
export type RightSidebarView = "changes" | "runtime" | "preview" | "files"
export type AppMode = "Autopilot" | "Review"
export type WindowAction = "minimize" | "toggle-maximize" | "close"
export type PreviewLoadStatus = "idle" | "resolving" | "ready" | "error"
export type PreviewRenderer = DesktopPreviewRenderer
export type ResolvedPreviewTarget = DesktopResolvedPreviewTarget
export type PreviewErrorKind =
  | "empty-url"
  | "invalid-url"
  | "unsupported-protocol"
  | "connection-refused"
  | "dns"
  | "connection-reset"
  | "timeout"
  | "certificate"
  | "embedded-blocked"
  | "script"
  | "webview-init"
  | "unknown"

export interface SessionWorkflowSummary {
  mode: "execution" | "planning"
  plan: {
    status: "idle" | "draft" | "pending-approval" | "approved"
    updatedAt: number
    approvedAt?: number
  }
}

export type SessionTaskStatus = "pending" | "in_progress" | "completed"

export interface SessionTaskPeer {
  id: string
  subject: string
  status: SessionTaskStatus
  owner: string
}

export interface SessionTaskSummary {
  id: string
  sessionID: string
  subject: string
  description: string
  activeForm: string
  owner: string
  status: SessionTaskStatus
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
  blockingTasks: SessionTaskPeer[]
  blockedTasks: SessionTaskPeer[]
}

export interface SessionTaskOwnerActivity {
  owner: string
  current?: SessionTaskSummary
  next?: SessionTaskSummary
}

export interface SessionTaskTeammateActivity {
  id: string
  owner: string
  title: string
  status: string
  active: boolean
  childSessionID?: string
  updatedAt?: number
}

export interface SessionTaskListView {
  sessionID: string
  generatedAt: number
  tasks: SessionTaskSummary[]
  current: SessionTaskSummary[]
  next: SessionTaskSummary[]
  blocked: SessionTaskSummary[]
  owners: SessionTaskOwnerActivity[]
  teammateActivity: SessionTaskTeammateActivity[]
  summary: {
    total: number
    completed: number
    pending: number
    inProgress: number
    blocked: number
  }
}

export type SessionKind = "main" | "side-chat"
export type SessionToolPolicy = "default" | "read-only"

export interface SessionPolicy {
  toolPolicy: SessionToolPolicy
  ignoreFullAccess?: boolean
}

export interface SessionOrigin {
  parentSessionID: string
  anchorMessageID: string
  anchorPreview: string
}

export interface SessionModelSelection {
  model?: string
  small_model?: string
}

export interface SideChatSource {
  kind: "url" | "document"
  title: string
  url?: string
}

export interface SideChatToolSummary {
  tool: string
  status: "completed" | "error" | "denied"
  summary: string
}

export interface SideChatSnapshot {
  userText?: string
  assistantText: string
  sources?: SideChatSource[]
  toolSummaries?: SideChatToolSummary[]
  filePaths?: string[]
}

export interface SideChatLink {
  sessionID: string
  parentSessionID: string
  anchorMessageID: string
  anchorUserMessageID?: string
  createdAt: number
  anchorPreview: string
  snapshotVersion: 1
  snapshot: SideChatSnapshot
  session?: LoadedSessionSnapshot
  archived?: boolean
}

export interface SessionSummary {
  id: string
  title: string
  branch: string
  status: SessionStatus
  created?: number
  updated: number
  focus: string
  summary: string
  kind?: SessionKind
  policy?: SessionPolicy
  origin?: SessionOrigin
  workflow?: SessionWorkflowSummary
  modelSelection?: SessionModelSelection
}

export interface CreateSessionTab {
  id: string
  initialWorkflowMode?: "execution" | "planning"
  workspaceID: string | null
  title: string
}

export type WorkbenchTabKind = "session" | "create-session"

export type WorkbenchTabReference =
  | {
      kind: "session"
      sessionID: string
    }
  | {
      kind: "create-session"
      createSessionTabID: string
    }

export interface WorkspaceGroup {
  id: string
  name: string
  directory: string
  exists?: boolean
  created: number
  updated: number
  project: {
    id: string
    name: string
    worktree: string
  }
  sessions: SessionSummary[]
}

export interface LoadedSessionSnapshot {
  id: string
  projectID: string
  directory: string
  title: string
  kind?: SessionKind
  policy?: SessionPolicy
  origin?: SessionOrigin
  created: number
  updated: number
  workflow?: SessionWorkflowSummary
  modelSelection?: SessionModelSelection
}

export interface ArchivedSessionSummary {
  id: string
  projectID: string
  projectName: string | null
  projectMissing: boolean
  directory: string
  title: string
  kind?: SessionKind
  policy?: SessionPolicy
  origin?: SessionOrigin
  created: number
  updated: number
  archivedAt: number
  messageCount: number
  eventCount: number
}

export interface LoadedFolderWorkspace {
  id: string
  directory: string
  name: string
  exists?: boolean
  created: number
  updated: number
  project: {
    id: string
    name: string
    worktree: string
  }
  sessions: LoadedSessionSnapshot[]
}

export interface LoadedSessionHistoryInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  created: number
  parentMessageID?: string | null
  completed?: number
  diffSummary?: SessionDiffSummary
  error?: {
    message?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface LoadedSessionHistoryTurnErrorInfo {
  name?: string
  message: string
  code?: string
  statusCode?: number
  retryable?: boolean
  providerID?: string
  modelID?: string
}

export interface LoadedSessionHistoryTurn {
  id: string
  sessionID: string
  projectID: string
  userMessageID?: string
  resume?: boolean
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
  status: "running" | "completed" | "blocked" | "failed" | "cancelled"
  phase?: string
  lastMessageID?: string
  finishReason?: string
  error?: string
  errorInfo?: LoadedSessionHistoryTurnErrorInfo
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface LoadedSessionHistoryMessage {
  info: LoadedSessionHistoryInfo
  parts: unknown[]
  turn?: LoadedSessionHistoryTurn
}

export interface SessionDiffFile {
  file: string
  additions: number
  deletions: number
  patch?: string
}

export interface SessionDiffSummary {
  title?: string
  body?: string
  stats?: {
    additions: number
    deletions: number
    files: number
  }
  diffs: SessionDiffFile[]
}

export type SessionDiffStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error"

export interface SessionDiffState {
  status: SessionDiffStatus
  errorMessage: string | null
  updatedAt: number | null
  isStale: boolean
}

export type PreviewInteractionPluginID = "web.comment" | (string & {})

export interface PreviewInteractionRect {
  bottom?: number
  height: number
  left: number
  right?: number
  top: number
  width: number
}

export type PreviewInteractionAnchor =
  | {
      type: "coordinate"
    }
  | {
      type: "element"
      label?: string
      path?: string
      rect?: PreviewInteractionRect
      selector?: string
      tagName?: string
      text?: string
    }

export interface WebCommentInteractionPayload {
  kind: "web-comment"
  anchor?: PreviewInteractionAnchor
  frame?: string
  nodePosition?: string
  pageUrl: string
  screenshotPath?: string | null
  text: string
  x: number
  y: number
}

export type PreviewInteractionPayload =
  | WebCommentInteractionPayload
  | {
      kind: string
      [key: string]: unknown
    }

export interface PreviewInteractionRecord {
  id: string
  pluginID: PreviewInteractionPluginID
  targetKey: string
  renderer: PreviewRenderer
  createdAt: number
  payload: PreviewInteractionPayload
  snapshot?: {
    mime?: string
    path?: string
    title?: string
    url?: string
  }
}

export interface PreviewInteractionCommitInput {
  pluginID: PreviewInteractionPluginID
  targetKey: string
  renderer: PreviewRenderer
  payload: PreviewInteractionPayload
  snapshot?: PreviewInteractionRecord["snapshot"]
}

export interface WorkspacePreviewState {
  activeTargetInput: string | null
  activeInteractionID: PreviewInteractionPluginID | null
  draftUrl: string
  draftTarget: string
  committedUrl: string | null
  reloadToken: number
  errorKind: PreviewErrorKind | null
  errorMessage: string | null
  navigationHistory: string[]
  navigationIndex: number
  interactions: PreviewInteractionRecord[]
  resolvedTarget: ResolvedPreviewTarget | null
  status: PreviewLoadStatus
}

export interface WorkspaceFileSearchResult {
  path: string
  absolutePath?: string
  name: string
  extension: string | null
}

export interface WorkspaceFileLineRange {
  startLineNumber: number
  endLineNumber: number
}

export interface WorkspaceFileComment extends WorkspaceFileLineRange {
  id: string
  filePath: string
  text: string
  createdAt: number
}

export interface WorkspaceFilePendingComment extends WorkspaceFileLineRange {
  text: string
}

export type WorkspaceFileReviewStatus = "idle" | "searching" | "reading" | "ready" | "empty" | "unsupported" | "error"

export interface WorkspaceFileReviewState {
  scopeDirectory: string | null
  query: string
  results: WorkspaceFileSearchResult[]
  selectedFilePath: string | null
  selectedFileContent: string | null
  selectedFileKind: "text" | "unsupported" | null
  selectedFileExtension: string | null
  status: WorkspaceFileReviewStatus
  errorMessage: string | null
  comments: WorkspaceFileComment[]
  linkedLineRange: WorkspaceFileLineRange | null
  pendingComment: WorkspaceFilePendingComment | null
}

export type RuntimeDebugLoadStatus = "idle" | "loading" | "refreshing" | "ready" | "error"

export interface SessionRuntimeDebugState {
  status: RuntimeDebugLoadStatus
  errorMessage: string | null
  updatedAt: number | null
  isStale: boolean
}

export type RuntimePhase =
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

export interface SessionRuntimeEventSummary {
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

export interface SessionRuntimeToolSummary {
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

export interface SessionRuntimeLlmCallSummary {
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

export interface SessionRuntimeErrorContext {
  phase?: RuntimePhase
  messageID?: string
  agent?: string
  model?: string
  iteration?: number
  error: {
    name?: string
    message: string
    code?: string
    statusCode?: number
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

export interface SessionRuntimeTurnSummary {
  turnID: string
  startedAt?: number
  endedAt?: number
  durationMs?: number
  lastEventAt?: number
  status: "running" | "completed" | "blocked" | "stopped" | "failed"
  phase?: RuntimePhase
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
  llmCalls: SessionRuntimeLlmCallSummary[]
  tools: SessionRuntimeToolSummary[]
  error?: {
    name?: string
    message: string
    code?: string
    statusCode?: number
    retryable?: boolean
    messageID?: string
    providerID?: string
    modelID?: string
    agent?: string
  } | null
  errorContext?: SessionRuntimeErrorContext | null
  recentEvents: SessionRuntimeEventSummary[]
}

export interface SessionRuntimeDebugSnapshot {
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
    phase?: RuntimePhase
  }
  running: {
    sessionID: string
    startedAt: number | null
    activeForMs: number
    reason?: string
  }
  activeTurnID: string | null
  latestTurn: SessionRuntimeTurnSummary | null
  turns: SessionRuntimeTurnSummary[]
  recentEvents: SessionRuntimeEventSummary[]
  tasks?: SessionTaskListView
  diagnostics: {
    blockedOnApproval: boolean
    activeToolCount: number
    failedToolCount: number
    llmFailureCount: number
    lastErrorMessage?: string
  }
}

export interface SessionContextUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  measuredAt: number
}

export interface UserTurn {
  id: string
  kind: "user"
  text: string
  displayText?: string
  attachments?: UserTurnAttachment[]
  references?: UserTurnReference[]
  questionAnswer?: {
    questionID: string
    selectedOptions?: string[]
    freeformText?: string
  }
  diffSummary?: SessionDiffSummary
  submissionMode?: "steer"
  streamInsertion?: {
    assistantTurnID: string
    afterItemCount: number
  }
  timestamp: number
}

export interface UserTurnAttachment {
  name: string
  path?: string
}

export interface UserTurnReference {
  id: string
  label: string
  title?: string
  kind?: "comment" | "file"
}

export type AssistantTraceItemKind =
  | "system"
  | "reasoning"
  | "text"
  | "question"
  | "tool"
  | "source"
  | "file"
  | "image"
  | "patch"
  | "subtask"
  | "compaction"
  | "step"
  | "retry"
  | "snapshot"
  | "task-state"
  | "error"

export type AssistantTraceSectionKey =
  | "reasoning"
  | "tools"
  | "sources"
  | "response"
  | "approvals"
  | "workflow"
  | "file-change"
  | "debug"

export type AssistantTraceVisibilityKey =
  | "response"
  | "reasoning"
  | "toolCalls"
  | "toolInputs"
  | "toolOutputs"
  | "sources"
  | "files"
  | "approvals"
  | "workflow"
  | "debugMetadata"

export interface AssistantTraceVisibility {
  response: boolean
  reasoning: boolean
  toolCalls: boolean
  toolInputs: boolean
  toolOutputs: boolean
  sources: boolean
  files: boolean
  approvals: boolean
  workflow: boolean
  debugMetadata: boolean
}

export const DEFAULT_ASSISTANT_TRACE_VISIBILITY: AssistantTraceVisibility = {
  response: true,
  reasoning: true,
  toolCalls: true,
  toolInputs: false,
  toolOutputs: true,
  sources: true,
  files: true,
  approvals: true,
  workflow: false,
  debugMetadata: false,
}

export type AssistantTraceStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "waiting-approval"
  | "denied"
  | "cancelled"

export type AssistantTurnPhase =
  | "requesting"
  | "waiting_first_event"
  | "preparing"
  | "waiting_llm"
  | "reasoning"
  | "tool_running"
  | "waiting_approval"
  | "blocked"
  | "responding"
  | "completed"
  | "cancelled"
  | "failed"

export interface AssistantTurnRuntime {
  phase: AssistantTurnPhase
  startedAt: number
  updatedAt: number
  firstVisibleAt?: number
  toolName?: string
  approvalRequestID?: string
  errorMessage?: string
}

export interface AssistantTraceDebugEntry {
  label: string
  value: string
}

export interface AssistantQuestionOption {
  label: string
  value: string
  description?: string
}

export interface AssistantQuestionPrompt {
  questionID?: string
  header?: string
  question: string
  options: AssistantQuestionOption[]
  allowFreeform: boolean
  placeholder?: string
  multiple: boolean
  required: boolean
  answered?: boolean
  answerText?: string
  selectedOptions?: string[]
  freeformText?: string
  answeredAt?: number
}

export interface AssistantTraceProgressItem {
  id: string
  step: string
  status: SessionTaskStatus
}

export interface AssistantTraceFileChange {
  file: string
  additions: number
  deletions: number
  patch?: string
}

export interface AssistantTraceItem {
  id: string
  kind: AssistantTraceItemKind
  timestamp: number
  label: string
  title?: string
  text?: string
  detail?: string
  src?: string
  mimeType?: string
  width?: number
  height?: number
  alt?: string
  toolInputText?: string
  toolOutputText?: string
  fileChanges?: AssistantTraceFileChange[]
  filePaths?: string[]
  status?: AssistantTraceStatus
  sourceID?: string
  messageID?: string
  partID?: string
  toolCallID?: string
  section?: AssistantTraceSectionKey
  visibilityKey?: AssistantTraceVisibilityKey
  isStreaming?: boolean
  debugEntries?: AssistantTraceDebugEntry[]
  questionPrompt?: AssistantQuestionPrompt
  progressItems?: AssistantTraceProgressItem[]
}

export interface AssistantTurn {
  id: string
  messageID?: string
  kind: "assistant"
  timestamp: number
  diffSummary?: SessionDiffSummary
  runtime: AssistantTurnRuntime
  state: string
  items: AssistantTraceItem[]
  isStreaming?: boolean
}

export type Turn = UserTurn | AssistantTurn

export interface AgentStreamEvent {
  id?: string
  event: string
  data: unknown
}

export interface AgentRuntimeEvent {
  eventID: string
  sessionID: string
  turnID: string
  seq: number
  timestamp: number
  type: string
  payload: Record<string, unknown>
}

export interface AgentStreamIPCEvent extends AgentStreamEvent {
  streamID: string
}

export interface AgentSessionStreamIPCEvent extends AgentStreamEvent {
  sessionID: string
}

export interface WorkspaceFileChangeIPCEvent {
  directory: string
  paths: string[]
}

export interface PendingAgentStream {
  sessionID: string
  backendSessionID?: string
  assistantTurnID: string
  backendTurnID?: string
  cancelRequested?: boolean
}

export interface ProviderCatalogItem {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]
  configured: boolean
  available: boolean
  apiKeyConfigured: boolean
  baseURL?: string
  modelCount: number
  authCapabilities: ProviderAuthCapability[]
  authState: ProviderAuthState
  authScope: "global"
  activeAuthMethod?: string
  connectionLabel?: string
  lastAuthError?: string
}

export interface ProviderAuthCapability {
  method: string
  label: string
  description?: string
  kind: "browser_oauth" | "device_code" | "api_key"
  recommended?: boolean
  supportsPolling?: boolean
  supportsRefresh?: boolean
  supportsDisconnect?: boolean
}

export interface ProviderAuthAccountSummary {
  accountID?: string
  userID?: string
  email?: string
  planType?: string
  workspaceID?: string
  workspaceName?: string
  balanceMicrocents?: number
  currency?: string
  rechargeUrl?: string
  label?: string
}

export interface ProviderAuthFlow {
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
  errorCode?: string
  diagnostics?: Record<string, unknown>
  connectionLabel?: string
  account?: ProviderAuthAccountSummary
}

export interface ProviderAuthState {
  providerID: string
  scope: "global"
  activeMethod?: string
  status: "connected" | "pending" | "expired" | "error" | "not_connected"
  connectionLabel?: string
  lastError?: string
  expiresAt?: number
  account?: ProviderAuthAccountSummary
  capabilities: ProviderAuthCapability[]
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
    balanceMicrocents?: number
    currency?: string
    rechargeUrl?: string
  }>
  flow?: ProviderAuthFlow
}

export interface ProviderModelCapabilitiesModalities {
  text: boolean
  audio: boolean
  image: boolean
  video: boolean
  pdf: boolean
}

export interface ProviderModelCapabilities {
  temperature: boolean
  reasoning: boolean
  attachment: boolean
  toolcall: boolean
  input: ProviderModelCapabilitiesModalities
  output: ProviderModelCapabilitiesModalities
}

export interface ProviderModel {
  id: string
  providerID: string
  providerName?: string
  name: string
  family?: string
  status: "alpha" | "beta" | "deprecated" | "active"
  available: boolean
  capabilities: ProviderModelCapabilities
  limit: {
    context: number
    input?: number
    output: number
  }
}

export interface ProjectModelSelection {
  model: string | null
  smallModel: string | null
  imageModel: string | null
  imageDefaultSize: string | null
  imageDefaultCount: number | null
}

export interface ProjectSkillSelection {
  skillIDs: string[]
}

export interface ProjectMcpSelection {
  serverIDs: string[]
}

export type PromptPresetSource = "bundled" | "custom"

export interface PromptPresetSelection {
  systemPromptPresetID: string
  planModePromptPresetID: string
  sideChatPromptPresetID: string
}

export interface PromptPresetSummary {
  id: string
  label: string
  description: string
  source: PromptPresetSource
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
  filePath?: string
  root?: string
}

export interface PromptPresetDocument extends PromptPresetSummary {
  content: string
}

export interface PromptUrlInstallCandidate {
  id: string
  label: string
  description: string
  sourcePath: string
  available: boolean
  reason?: string
}

export interface PromptUrlInstallPreview {
  previewID: string
  source: string
  prompts: PromptUrlInstallCandidate[]
}

export interface PromptUrlInstallResult {
  installed: PromptPresetDocument[]
}

export type BuiltinToolKind =
  | "read"
  | "write"
  | "search"
  | "exec"
  | "workflow"
  | "interaction"
  | "delegation"
  | "other"
export type BuiltinToolConcurrency = "safe" | "exclusive"

export interface BuiltinToolCapabilities {
  kind?: BuiltinToolKind
  readOnly?: boolean
  destructive?: boolean
  concurrency?: BuiltinToolConcurrency
  needsShell?: boolean
}

export interface BuiltinToolSummary {
  id: string
  title: string
  description: string
  inputSchema?: unknown
  aliases: string[]
  capabilities: BuiltinToolCapabilities
  enabled: boolean
}

export interface BuiltinToolSelection {
  tools: Record<string, boolean>
}

export interface BuiltinToolsPayload {
  items: BuiltinToolSummary[]
  selection: BuiltinToolSelection
}

export interface ComposerAttachment {
  path: string
  name: string
}

export interface ComposerPastedImageAttachment {
  dataUrl: string
  mimeType: string
  name?: string
}

export interface ComposerFileCommentReference {
  source: "file"
  id: string
  filePath: string
  startLineNumber: number
  endLineNumber: number
  label: string
  title: string
  prompt: string
}

export interface ComposerPreviewInteractionReference {
  source: "preview"
  id: string
  label: string
  title: string
  prompt: string
  interaction: PreviewInteractionRecord
  pageUrl: string
}

export type ComposerCommentReference =
  | ComposerFileCommentReference
  | ComposerPreviewInteractionReference

export interface ComposerDraftState {
  lexicalJSON: string
  plainText: string
}

export interface ComposerFileTagData {
  kind: "file"
  id: string
  label: string
  filePath: string
}

export interface ComposerFileCommentTagData {
  kind: "comment"
  source: "file"
  id: string
  label: string
  filePath: string
  startLineNumber: number
  endLineNumber: number
  title: string
  prompt: string
}

export interface ComposerPreviewInteractionTagData {
  kind: "comment"
  source: "preview"
  id: string
  label: string
  title: string
  prompt: string
  interaction: PreviewInteractionRecord
  pageUrl: string
}

export type ComposerCommentTagData =
  | ComposerFileCommentTagData
  | ComposerPreviewInteractionTagData

export interface ComposerSkillTagData {
  kind: "skill"
  id: string
  label: string
  skillID: string
  description?: string
}

export interface ComposerMcpTagData {
  kind: "mcp"
  id: string
  label: string
  serverID: string
  description?: string
}

export type ComposerTagData =
  | ComposerFileTagData
  | ComposerCommentTagData
  | ComposerSkillTagData
  | ComposerMcpTagData

export type ColorMode = "system" | "light" | "dark"
export type BrandTheme = "terra" | "sage"

export type ReasoningEffort = SharedReasoningEffort
export type OpenAIReasoningEffort = ReasoningEffort

export interface ComposerModelOption {
  value: string
  label: string
  providerID: string
  providerLabel: string
}

export interface ComposerReasoningEffortOption {
  value: ReasoningEffort
  label: string
  description: string
}

export interface ComposerSkillOption {
  value: string
  label: string
  description: string
}

export interface ComposerMcpOption {
  value: string
  label: string
  description: string
}

export interface ProviderDraftState {
  apiKey: string
  baseURL: string
  selectedAuthMethod: string | null
  activeFlow?: ProviderAuthFlow | null
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  path: string
  scope: "project" | "user" | "plugin"
}

export interface GlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  role?: "folder" | "skill" | "resource"
  children?: GlobalSkillTreeNode[]
}

export interface GlobalSkillTree {
  root: string
  items: GlobalSkillTreeNode[]
}

export interface GlobalSkillFileDocument {
  path: string
  content: string
}

export interface SkillInstallCandidate {
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

export interface SkillGitInstallPreview {
  previewID: string
  source: string
  cloneUrl: string
  ref?: string
  subpath?: string
  skills: SkillInstallCandidate[]
}

export interface InstalledGlobalSkill {
  id: string
  name: string
  directory: string
  filePath: string
}

export interface SkillGitInstallResult {
  installed: InstalledGlobalSkill[]
}

export type McpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }

export type McpToolPolicyValue = "disabled" | "ask" | "auto"

export type McpToolPolicies = Record<string, {
  policy: McpToolPolicyValue
}>

export type McpRequireApproval =
  | "always"
  | "never"
  | {
      never?: {
        toolNames?: string[]
      }
    }

export interface StdioMcpServerSummary {
  id: string
  name?: string
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolPolicies?: McpToolPolicies
  enabled: boolean
  timeoutMs?: number
}

export interface RemoteMcpServerSummary {
  id: string
  name?: string
  transport: "remote"
  provider?: "openai"
  serverUrl?: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: McpAllowedTools
  toolPolicies?: McpToolPolicies
  requireApproval?: McpRequireApproval
  enabled: boolean
  timeoutMs?: number
}

export type McpServerSummary = StdioMcpServerSummary | RemoteMcpServerSummary

export interface McpToolDiagnostic {
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
  recommendedPolicy: McpToolPolicyValue
  configuredPolicy?: McpToolPolicyValue
}

export interface McpServerDiagnostic {
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  toolNames: string[]
  tools: McpToolDiagnostic[]
  error?: string
}

export type PluginCategory = "Code" | "Browser" | "Git" | "Database" | "Docs" | "Automation" | "Design"
export type PluginRisk = "low" | "medium" | "high" | "critical"

export interface PluginToolPreview {
  name: string
  title?: string
  description: string
  readOnly?: boolean
  destructive?: boolean
}

export interface PluginConfigField {
  key: string
  label: string
  type?: "text" | "password" | "url" | "path"
  required?: boolean
  secret?: boolean
  placeholder?: string
  defaultValue?: string
  description?: string
}

export interface PluginStdioRuntime {
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolPolicies?: McpToolPolicies
  timeoutMs?: number
}

export interface PluginRemoteRuntime {
  transport: "remote"
  provider?: "openai"
  serverUrl?: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: McpAllowedTools
  toolPolicies?: McpToolPolicies
  requireApproval?: McpRequireApproval
  timeoutMs?: number
}

export type PluginRuntimeTemplate = PluginStdioRuntime | PluginRemoteRuntime

export interface PluginMcpServerCatalogEntry {
  id: string
  name: string
  description?: string
  risk?: PluginRisk
  permissions?: string[]
  tools: PluginToolPreview[]
  configFields?: PluginConfigField[]
  runtime: PluginRuntimeTemplate
  installReview?: string[]
}

export interface PluginSkillPreview {
  id: string
  name: string
  description: string
  directory: string
}

export interface PluginAppConnector {
  appID: string
  name: string
  description?: string
  icon?: string
  risk?: PluginRisk
  permissions?: string[]
  tools?: PluginToolPreview[]
  credential: PluginConfigField
  runtime: PluginRemoteRuntime
  installReview?: string[]
}

export interface PluginCatalogItem {
  id: string
  name: string
  description: string
  version: string
  publisher: string
  category: PluginCategory
  icon?: string
  homepage?: string
  documentationUrl?: string
  risk: PluginRisk
  permissions: string[]
  tools: PluginToolPreview[]
  configFields: PluginConfigField[]
  runtime?: PluginRuntimeTemplate
  mcpServers: PluginMcpServerCatalogEntry[]
  skills: PluginSkillPreview[]
  apps: PluginAppConnector[]
  installReview?: string[]
}

export interface InstalledPlugin {
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
  lastDiagnostic?: McpServerDiagnostic
  lastConnectorDiagnostics?: Record<string, McpServerDiagnostic>
}

export interface PluginConnectorStatus {
  pluginID: string
  appID: string
  connectorID: string
  connected: boolean
  credentialLabel?: string
  generatedMcpServerID: string
  lastDiagnostic?: McpServerDiagnostic
}

export interface PluginDraftState {
  pluginID: string | null
  config: Record<string, string>
  appApiKeys: Record<string, string>
}

export interface McpServerDraftState {
  id: string
  name: string
  transport: "stdio" | "remote"
  command: string
  args: string
  env: string
  cwd: string
  serverUrl: string
  authorization: string
  headers: string
  allowedToolsMode: "all" | "names" | "read-only" | "read-only-names"
  allowedToolNames: string
  toolPolicies: Record<string, McpToolPolicyValue>
  enabled: boolean
  timeoutMs: string
}
