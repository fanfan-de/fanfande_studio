import type {
  PermissionDecision,
  PermissionPromptDetails,
  PermissionPromptSnapshot,
  PermissionRequestPrompt as PermissionRequest,
  PermissionRequestResolutionRecord,
  PermissionRequestStatus,
  PermissionRisk,
  PermissionToolKind,
} from "../../../shared/permission"

export type {
  PermissionDecision,
  PermissionPromptDetails,
  PermissionPromptSnapshot,
  PermissionRequest,
  PermissionRequestResolutionRecord,
  PermissionRequestStatus,
  PermissionRisk,
  PermissionToolKind,
}

export type SessionStatus = "Live" | "Review" | "Ready"
export type SidebarActionKey = "project" | "sort" | "new"
export type LeftSidebarView = "workspace" | "skills"
export type RightSidebarView = "changes" | "runtime"
export type AppMode = "Autopilot" | "Review"
export type WindowAction = "minimize" | "toggle-maximize" | "close"

export interface SessionSummary {
  id: string
  title: string
  branch: string
  status: SessionStatus
  updated: number
  focus: string
  summary: string
}

export interface CreateSessionTab {
  id: string
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

export interface WorkbenchPane {
  id: string
  size: number
  tabs: WorkbenchTabReference[]
  activeTabKey: string | null
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
  created: number
  updated: number
}

export interface ArchivedSessionSummary {
  id: string
  projectID: string
  projectName: string | null
  projectMissing: boolean
  directory: string
  title: string
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
  completed?: number
  error?: {
    message?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface LoadedSessionHistoryMessage {
  info: LoadedSessionHistoryInfo
  parts: unknown[]
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
    message: string
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
  timestamp: number
}

export type AssistantTraceItemKind =
  | "system"
  | "reasoning"
  | "text"
  | "tool"
  | "file"
  | "image"
  | "patch"
  | "subtask"
  | "step"
  | "retry"
  | "snapshot"
  | "error"

export type AssistantTraceStatus = "pending" | "running" | "completed" | "error" | "waiting-approval" | "denied"

export type AssistantTurnPhase =
  | "requesting"
  | "waiting_first_event"
  | "reasoning"
  | "tool_running"
  | "waiting_approval"
  | "responding"
  | "completed"
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

export interface AssistantTraceItem {
  id: string
  kind: AssistantTraceItemKind
  timestamp: number
  label: string
  title?: string
  text?: string
  detail?: string
  filePaths?: string[]
  status?: AssistantTraceStatus
  sourceID?: string
  isStreaming?: boolean
  debugEntries?: AssistantTraceDebugEntry[]
}

export interface AssistantTurn {
  id: string
  kind: "assistant"
  timestamp: number
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
}

export interface ProjectSkillSelection {
  skillIDs: string[]
}

export interface ProjectMcpSelection {
  serverIDs: string[]
}

export interface ComposerAttachment {
  path: string
  name: string
}

export type ComposerPermissionMode = "default" | "full-access"

export interface ComposerModelOption {
  value: string
  label: string
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
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  path: string
  scope: "project" | "user"
}

export interface GlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
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

export type McpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }

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
  requireApproval?: McpRequireApproval
  enabled: boolean
  timeoutMs?: number
}

export type McpServerSummary = StdioMcpServerSummary | RemoteMcpServerSummary

export interface McpServerDiagnostic {
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  toolNames: string[]
  error?: string
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
  enabled: boolean
  timeoutMs: string
}
