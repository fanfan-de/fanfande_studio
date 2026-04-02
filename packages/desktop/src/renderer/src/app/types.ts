export type SessionStatus = "Live" | "Review" | "Ready"
export type TitlebarMenuKey = "file" | "edit" | "view" | "window" | "help"
export type SidebarActionKey = "project" | "density" | "sort" | "new"
export type CanvasMenuKey = "overview" | "artifacts" | "changes" | "console" | "deploy"
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

export type AssistantTraceStatus = "pending" | "running" | "completed" | "error"

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
