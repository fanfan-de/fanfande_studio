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
export type RightSidebarView = "changes"
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

export interface WorkspaceGroup {
  id: string
  name: string
  directory: string
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

export interface LoadedFolderWorkspace {
  id: string
  directory: string
  name: string
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

export interface AssistantTraceItem {
  id: string
  kind: AssistantTraceItemKind
  timestamp: number
  label: string
  title?: string
  text?: string
  detail?: string
  status?: AssistantTraceStatus
  sourceID?: string
  isStreaming?: boolean
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
