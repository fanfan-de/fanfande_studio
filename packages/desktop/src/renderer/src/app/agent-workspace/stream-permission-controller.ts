import { useRef, useState } from "react"
import { initialConversations } from "../seed-data"
import { createAgentSessionEventRouter } from "../agent-session/event-router"
import { createAgentSessionStore } from "../agent-session/store"
import type {
  PendingAgentStream,
  PermissionRequest,
  SessionContextUsage,
} from "../types"

interface StreamPermissionControllerOptions {
  initialSessionID: string | null
}

export function useStreamPermissionController({ initialSessionID }: StreamPermissionControllerOptions) {
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const historyRequestRef = useRef(0)
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
  const conversationVersionRef = useRef<Record<string, number>>({})
  const skipNextHistoryLoadRef = useRef<Record<string, boolean>>({})
  const subscribedSessionStreamsRef = useRef<Record<string, string>>({})
  const sessionEventRouterRef = useRef(createAgentSessionEventRouter())
  const agentSessionStoreRef = useRef(createAgentSessionStore())
  const lastFocusedSessionIDRef = useRef<string | null>(initialSessionID)

  const [conversations, setConversations] = useState(initialConversations)
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({})
  const [sessionDirectoryBySession, setSessionDirectoryBySession] = useState<Record<string, string>>({})
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySession] = useState<
    Record<string, PermissionRequest[]>
  >({})
  const [contextUsageBySession, setContextUsageBySession] = useState<Record<string, SessionContextUsage>>({})
  const [permissionRequestActionRequestID, setPermissionRequestActionRequestID] = useState<string | null>(null)
  const [permissionRequestActionError, setPermissionRequestActionError] = useState<string | null>(null)

  return {
    agentSessionStoreRef,
    agentSessions,
    contextUsageBySession,
    conversationVersionRef,
    conversations,
    historyRequestRef,
    lastFocusedSessionIDRef,
    pendingPermissionRequestsBySession,
    pendingStreamsRef,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    permissionRequestsRequestRef,
    sessionDirectoryBySession,
    sessionEventRouterRef,
    setAgentSessions,
    setContextUsageBySession,
    setConversations,
    setPendingPermissionRequestsBySession,
    setPermissionRequestActionError,
    setPermissionRequestActionRequestID,
    setSessionDirectoryBySession,
    skipNextHistoryLoadRef,
    subscribedSessionStreamsRef,
  }
}
