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
export type LeftSidebarView = "workspace"
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
  state: string
  items: AssistantTraceItem[]
  isStreaming?: boolean
}

export type Turn = UserTurn | AssistantTurn

export interface AgentStreamEvent {
  event: string
  data: unknown
}

export interface AgentStreamIPCEvent extends AgentStreamEvent {
  streamID: string
}

export interface PendingAgentStream {
  sessionID: string
  assistantTurnID: string
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

export interface ComposerAttachment {
  path: string
  name: string
}

export interface ComposerModelOption {
  value: string
  label: string
}

export interface ProviderDraftState {
  apiKey: string
  baseURL: string
}
