import type {
  AgentStreamEvent,
  ComposerAttachment,
  ComposerPermissionMode,
  LoadedSessionHistoryMessage,
  OpenAIReasoningEffort,
} from "../types"
import type {
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
} from "../../../../shared/permission"

export type AgentSessionBridgeEvent =
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

export interface AgentSessionTurnInput {
  clientTurnID: string
  backendSessionID: string
  text?: string
  attachments?: Array<Pick<ComposerAttachment, "path" | "name">>
  questionAnswer?: {
    questionID: string
    selectedOptions?: string[]
    freeformText?: string
  }
  permissionMode?: ComposerPermissionMode
  reasoningEffort?: OpenAIReasoningEffort
  system?: string
  agent?: string
  skills?: string[]
}

export interface AgentSessionSendTurnResult {
  clientTurnID: string
  requestId?: string
  events?: AgentStreamEvent[]
}

export interface AgentSessionBridge {
  canStream: boolean
  canResumeStream: boolean
  loadHistory(input: { backendSessionID: string }): Promise<LoadedSessionHistoryMessage[]>
  sendTurn(input: AgentSessionTurnInput): Promise<AgentSessionSendTurnResult>
  resumeTurn(input: { clientTurnID: string; backendSessionID: string }): Promise<AgentSessionSendTurnResult>
  subscribe(input: { uiSessionID: string; backendSessionID: string }): Promise<{
    backendSessionID: string
    lastEventID?: string
  }>
  unsubscribe(input: { backendSessionID: string }): Promise<{
    backendSessionID: string
    removed: boolean
  }>
  loadPermissionRequests(input: { backendSessionID: string }): Promise<PermissionRequestPrompt[]>
  respondPermissionRequest(input: PermissionResolveInput): Promise<PermissionResolveResult>
  onEvent(listener: (event: AgentSessionBridgeEvent) => void): () => void
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readBackendSessionIDFromStreamData(data: unknown) {
  const payload = readRecord(data)
  return readString(payload?.sessionID)
}

function createModernAgentSessionBridge(desktop: NonNullable<Window["desktop"]>): AgentSessionBridge | null {
  const modern = desktop.agentSession
  if (!modern) return null

  return {
    canStream: true,
    canResumeStream: true,
    loadHistory: modern.loadHistory,
    sendTurn: modern.sendTurn,
    resumeTurn: modern.resumeTurn,
    subscribe: (input) => modern.subscribe(input),
    unsubscribe: modern.unsubscribe,
    loadPermissionRequests: modern.loadPermissionRequests,
    respondPermissionRequest: modern.respondPermissionRequest,
    onEvent: modern.onEvent,
  }
}

function createLegacyAgentSessionBridge(desktop: NonNullable<Window["desktop"]>): AgentSessionBridge | null {
  if (!desktop.getSessionHistory) return null

  const canStream = Boolean(desktop.streamAgentMessage && desktop.onAgentStreamEvent)
  const canResumeStream = Boolean(desktop.resumeAgentMessageStream && desktop.onAgentStreamEvent)

  return {
    canStream,
    canResumeStream,
    loadHistory: ({ backendSessionID }) => desktop.getSessionHistory!({ sessionID: backendSessionID }),
    async sendTurn(input) {
      if (canStream && desktop.streamAgentMessage) {
        const result = await desktop.streamAgentMessage({
          streamID: input.clientTurnID,
          sessionID: input.backendSessionID,
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
          ...(input.questionAnswer !== undefined ? { questionAnswer: input.questionAnswer } : {}),
          ...(input.permissionMode !== undefined ? { permissionMode: input.permissionMode } : {}),
          ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
          ...(input.system !== undefined ? { system: input.system } : {}),
          ...(input.agent !== undefined ? { agent: input.agent } : {}),
          ...(input.skills !== undefined ? { skills: input.skills } : {}),
        })
        return {
          clientTurnID: result.streamID,
          requestId: result.requestId,
        }
      }

      if (!desktop.sendAgentMessage) {
        throw new Error("Desktop preload does not expose an agent send method")
      }

      const result = await desktop.sendAgentMessage({
        sessionID: input.backendSessionID,
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
        ...(input.questionAnswer !== undefined ? { questionAnswer: input.questionAnswer } : {}),
        ...(input.permissionMode !== undefined ? { permissionMode: input.permissionMode } : {}),
        ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
        ...(input.system !== undefined ? { system: input.system } : {}),
        ...(input.agent !== undefined ? { agent: input.agent } : {}),
        ...(input.skills !== undefined ? { skills: input.skills } : {}),
      })

      return {
        clientTurnID: input.clientTurnID,
        requestId: result.requestId,
        events: result.events,
      }
    },
    async resumeTurn(input) {
      if (!desktop.resumeAgentMessageStream) {
        throw new Error("Desktop preload does not expose an agent resume method")
      }

      const result = await desktop.resumeAgentMessageStream({
        streamID: input.clientTurnID,
        sessionID: input.backendSessionID,
      })
      return {
        clientTurnID: result.streamID,
        requestId: result.requestId,
      }
    },
    async subscribe(input) {
      if (!desktop.subscribeAgentSessionStream) {
        return {
          backendSessionID: input.backendSessionID,
        }
      }

      const result = await desktop.subscribeAgentSessionStream({
        sessionID: input.backendSessionID,
      })
      return {
        backendSessionID: result.sessionID,
        lastEventID: result.lastEventID,
      }
    },
    async unsubscribe(input) {
      if (!desktop.unsubscribeAgentSessionStream) {
        return {
          backendSessionID: input.backendSessionID,
          removed: false,
        }
      }

      const result = await desktop.unsubscribeAgentSessionStream({
        sessionID: input.backendSessionID,
      })
      return {
        backendSessionID: result.sessionID,
        removed: result.removed,
      }
    },
    loadPermissionRequests: ({ backendSessionID }) =>
      desktop.getSessionPermissionRequests
        ? desktop.getSessionPermissionRequests({ sessionID: backendSessionID })
        : Promise.resolve([]),
    respondPermissionRequest: (input) => {
      if (!desktop.respondPermissionRequest) {
        return Promise.reject(new Error("Desktop preload does not expose a permission response method"))
      }
      return desktop.respondPermissionRequest(input)
    },
    onEvent(listener) {
      const unsubscribers = [
        desktop.onAgentStreamEvent?.((event) => {
          listener({
            kind: "stream",
            source: "request",
            backendSessionID: readBackendSessionIDFromStreamData(event.data),
            clientTurnID: event.streamID,
            id: event.id,
            event: event.event,
            data: event.data,
            receivedAt: Date.now(),
          })
        }),
        desktop.onAgentSessionStreamEvent?.((event) => {
          listener({
            kind: "stream",
            source: "subscription",
            backendSessionID: event.sessionID,
            id: event.id,
            event: event.event,
            data: event.data,
            receivedAt: Date.now(),
          })
        }),
      ].filter((unsubscribe): unsubscribe is () => void => Boolean(unsubscribe))

      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      }
    },
  }
}

export function getAgentSessionBridge(): AgentSessionBridge | null {
  const desktop = window.desktop
  if (!desktop) return null
  return createModernAgentSessionBridge(desktop) ?? createLegacyAgentSessionBridge(desktop)
}
