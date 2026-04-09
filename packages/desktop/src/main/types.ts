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

export interface AgentSessionInfo {
  id: string
  projectID: string
  directory: string
  title: string
  version?: string
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
  created: number
  updated: number
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

export interface AgentEnvelope<T> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

export interface AgentSSEEvent {
  event: string
  data: unknown
}

export interface AgentStreamIPCEvent extends AgentSSEEvent {
  streamID: string
}

export interface AgentSessionHistoryMessage {
  info: Record<string, unknown>
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
