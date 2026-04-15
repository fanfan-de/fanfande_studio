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
}

export interface AgentArchivedSessionSummary {
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
