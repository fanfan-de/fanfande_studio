export interface ApiErrorShape {
  code: string
  message: string
}

export type ApiEnvelope<T> =
  | { success: true; data: T; requestId?: string }
  | { success: false; error: ApiErrorShape; requestId?: string }

export interface ProjectInfo {
  id: string
  worktree?: string
  name?: string
  sandboxes?: string[]
  created?: number
  updated?: number
}

export interface SessionInfo {
  id: string
  projectID: string
  directory: string
  title?: string
  time?: {
    created: number
    updated: number
  }
}

export interface ModelSelection {
  providerID: string
  modelID: string
}

export interface StreamSessionMessageInput {
  sessionID: string
  text: string
  system?: string
  agent?: string
  model?: ModelSelection
}

export interface StreamRawEvent {
  event: string
  data: unknown
}

export interface StreamSessionHandlers {
  onStarted?: (payload: unknown) => void
  onDelta?: (delta: string, payload: unknown) => void
  onPart?: (payload: unknown) => void
  onDone?: (payload: unknown) => void
  onError?: (message: string, payload?: unknown) => void
  onEvent?: (event: StreamRawEvent) => void
}

export interface StreamHandle {
  cancel: () => void
  done: Promise<void>
}

export interface AgentGateway {
  listProjects: () => Promise<ProjectInfo[]>
  createSession: (input: { directory: string }) => Promise<SessionInfo>
  streamSessionMessage: (input: StreamSessionMessageInput, handlers: StreamSessionHandlers) => StreamHandle
}
