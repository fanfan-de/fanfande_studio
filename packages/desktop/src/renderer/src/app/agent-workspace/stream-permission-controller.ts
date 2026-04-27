import { useRef } from "react"
import { createAgentSessionEventRouter } from "../agent-session/event-router"
import { createAgentSessionStore } from "../agent-session/store"
import type {
  PendingAgentStream,
  PermissionRequest,
  SessionContextUsage,
} from "../types"
import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface StreamPermissionControllerOptions {
  initialSessionID: string | null
  store: WorkspaceStoreApi
}

export function useStreamPermissionController({ initialSessionID, store }: StreamPermissionControllerOptions) {
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const historyRequestRef = useRef(0)
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
  const conversationVersionRef = useRef<Record<string, number>>({})
  const skipNextHistoryLoadRef = useRef<Record<string, boolean>>({})
  const subscribedSessionStreamsRef = useRef<Record<string, string>>({})
  const sessionEventRouterRef = useRef(createAgentSessionEventRouter())
  const agentSessionStoreRef = useRef(createAgentSessionStore())
  const lastFocusedSessionIDRef = useRef<string | null>(initialSessionID)

  const agentSessions = useWorkspaceStoreSelector(store, (state) => state.agentStream.agentSessions)
  const contextUsageBySession = useWorkspaceStoreSelector(store, (state) => state.agentStream.contextUsageBySession)
  const conversations = useWorkspaceStoreSelector(store, (state) => state.agentStream.conversations)
  const pendingPermissionRequestsBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStream.pendingPermissionRequestsBySession as Record<string, PermissionRequest[]>,
  )
  const permissionRequestActionError = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStream.permissionRequestActionError,
  )
  const permissionRequestActionRequestID = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStream.permissionRequestActionRequestID,
  )
  const sessionDirectoryBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStream.sessionDirectoryBySession,
  )
  const setAgentSessions = useWorkspaceStoreSelector(store, (state) => state.agentStreamActions.setAgentSessions)
  const setContextUsageBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStreamActions.setContextUsageBySession,
  )
  const setConversations = useWorkspaceStoreSelector(store, (state) => state.agentStreamActions.setConversations)
  const setPendingPermissionRequestsBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStreamActions.setPendingPermissionRequestsBySession,
  )
  const setPermissionRequestActionError = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStreamActions.setPermissionRequestActionError,
  )
  const setPermissionRequestActionRequestID = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStreamActions.setPermissionRequestActionRequestID,
  )
  const setSessionDirectoryBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.agentStreamActions.setSessionDirectoryBySession,
  )

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
