import { startTransition, type MutableRefObject } from "react"
import { getAgentSessionBridge } from "../agent-session/client"
import { buildFailureTurn, buildStreamingAssistantTurn } from "../stream"
import type {
  AssistantTurn,
  PendingAgentStream,
  PermissionDecision,
  PermissionRequest,
  Turn,
} from "../types"
import { createID } from "../utils"
import type { WorkspaceStateUpdater } from "./workspace-store"

interface LoadPendingPermissionRequestsInput {
  backendSessionID: string
  permissionRequestsRequestRef: MutableRefObject<Record<string, number>>
  sessionID: string
  setPendingPermissionRequestsBySession: (
    update: WorkspaceStateUpdater<Record<string, PermissionRequest[]>>,
  ) => void
}

export async function loadPendingPermissionRequestsForSession({
  backendSessionID,
  permissionRequestsRequestRef,
  sessionID,
  setPendingPermissionRequestsBySession,
}: LoadPendingPermissionRequestsInput) {
  const agentSession = getAgentSessionBridge()
  if (!agentSession) return

  const requestID = (permissionRequestsRequestRef.current[sessionID] ?? 0) + 1
  permissionRequestsRequestRef.current[sessionID] = requestID

  try {
    const nextRequests = await agentSession.loadPermissionRequests({ backendSessionID })
    if (permissionRequestsRequestRef.current[sessionID] !== requestID) return

    setPendingPermissionRequestsBySession((prev) => ({
      ...prev,
      [sessionID]: nextRequests.filter((request) => request.status === "pending"),
    }))
  } catch (error) {
    if (permissionRequestsRequestRef.current[sessionID] !== requestID) return
    console.error("[desktop] agentSession.loadPermissionRequests failed:", error)
  }
}

interface RespondPermissionRequestInput {
  appendConversationTurns: (sessionID: string, nextTurns: Turn[]) => void
  input: {
    sessionID: string
    request: PermissionRequest
    decision: PermissionDecision
    note?: string
  }
  loadPendingPermissionRequestsForSession: (sessionID: string, backendSessionID: string) => Promise<void>
  loadSessionDiffForSession: (sessionID: string, backendSessionID: string) => Promise<void>
  loadSessionRuntimeDebugForSession: (sessionID: string, backendSessionID: string) => Promise<void>
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  permissionRequestActionRequestID: string | null
  permissionRequestsRequestRef: MutableRefObject<Record<string, number>>
  refreshWorkspaceForSession: (sessionID: string) => void
  reloadSessionHistoryForSession: (sessionID: string, backendSessionID: string) => Promise<void>
  setPendingPermissionRequestsBySession: (
    update: WorkspaceStateUpdater<Record<string, PermissionRequest[]>>,
  ) => void
  setPermissionRequestActionError: (update: string | null) => void
  setPermissionRequestActionRequestID: (update: string | null) => void
  updateAssistantConversationTurn: (
    sessionID: string,
    turnID: string,
    updater: (turn: AssistantTurn) => AssistantTurn,
  ) => void
}

export async function respondPermissionRequest({
  appendConversationTurns,
  input,
  loadPendingPermissionRequestsForSession,
  loadSessionDiffForSession,
  loadSessionRuntimeDebugForSession,
  pendingStreamsRef,
  permissionRequestActionRequestID,
  permissionRequestsRequestRef,
  refreshWorkspaceForSession,
  reloadSessionHistoryForSession,
  setPendingPermissionRequestsBySession,
  setPermissionRequestActionError,
  setPermissionRequestActionRequestID,
  updateAssistantConversationTurn,
}: RespondPermissionRequestInput) {
  const agentSession = getAgentSessionBridge()
  if (!agentSession || permissionRequestActionRequestID) return

  permissionRequestsRequestRef.current[input.sessionID] = (permissionRequestsRequestRef.current[input.sessionID] ?? 0) + 1
  const removedRequest = input.request
  const canStreamResume = agentSession.canResumeStream
  let requestResolved = false
  setPermissionRequestActionRequestID(input.request.id)
  setPermissionRequestActionError(null)
  setPendingPermissionRequestsBySession((prev) => {
    const current = prev[input.sessionID] ?? []
    return {
      ...prev,
      [input.sessionID]: current.filter((request) => request.id !== input.request.id),
    }
  })

  try {
    await agentSession.respondPermissionRequest({
      requestID: input.request.id,
      decision: input.decision,
      note: input.note?.trim() || undefined,
      resume: !canStreamResume,
    })
    requestResolved = true

    await reloadSessionHistoryForSession(input.sessionID, input.request.sessionID).catch((error) => {
      console.error("[desktop] permission history refresh failed:", error)
    })
    await loadSessionDiffForSession(input.sessionID, input.request.sessionID).catch((error) => {
      console.error("[desktop] permission diff refresh failed:", error)
    })
    await loadSessionRuntimeDebugForSession(input.sessionID, input.request.sessionID).catch((error) => {
      console.error("[desktop] permission runtime refresh failed:", error)
    })
    await loadPendingPermissionRequestsForSession(input.sessionID, input.request.sessionID).catch((error) => {
      console.error("[desktop] permission request refresh failed:", error)
    })
    refreshWorkspaceForSession(input.sessionID)

    if (canStreamResume) {
      const streamID = createID("stream")
      const streamingTurn = buildStreamingAssistantTurn(input.decision === "deny" ? "Continue after denial" : "Continue after approval")
      pendingStreamsRef.current[streamID] = {
        sessionID: input.sessionID,
        backendSessionID: input.request.sessionID,
        assistantTurnID: streamingTurn.id,
      }

      appendConversationTurns(input.sessionID, [streamingTurn])

      try {
        await agentSession.resumeTurn({
          clientTurnID: streamID,
          backendSessionID: input.request.sessionID,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        delete pendingStreamsRef.current[streamID]
        startTransition(() => {
          updateAssistantConversationTurn(input.sessionID, streamingTurn.id, (current) =>
            buildFailureTurn(message, current),
          )
        })
        throw error
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[desktop] respondPermissionRequest failed:", error)

    if (!requestResolved) {
      setPermissionRequestActionError(message)
      setPendingPermissionRequestsBySession((prev) => {
        const current = prev[input.sessionID] ?? []
        if (current.some((request) => request.id === removedRequest.id)) {
          return prev
        }

        return {
          ...prev,
          [input.sessionID]: [removedRequest, ...current],
        }
      })
    }
  } finally {
    setPermissionRequestActionRequestID(null)
  }
}
