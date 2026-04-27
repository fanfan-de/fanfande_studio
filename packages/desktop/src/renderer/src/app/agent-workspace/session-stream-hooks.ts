import { useEffect, type MutableRefObject } from "react"
import { getAgentSessionBridge, type AgentSessionBridgeEvent } from "../agent-session/client"
import type { PendingAgentStream } from "../types"

interface UseAgentSessionStreamEffectsOptions {
  agentConnected: boolean
  agentSessions: Record<string, string>
  canLoadSessionHistory: boolean
  openCanvasSessionIDs: string[]
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  resolveBackendSessionID: (sessionID: string) => string
  subscribedSessionStreamsRef: MutableRefObject<Record<string, string>>
  onSessionEvent: (event: AgentSessionBridgeEvent) => void
}

export function useAgentSessionStreamEffects({
  agentConnected,
  agentSessions,
  canLoadSessionHistory,
  openCanvasSessionIDs,
  pendingStreamsRef,
  resolveBackendSessionID,
  subscribedSessionStreamsRef,
  onSessionEvent,
}: UseAgentSessionStreamEffectsOptions) {
  useEffect(() => {
    const unsubscribe = getAgentSessionBridge()?.onEvent((sessionEvent) => {
      onSessionEvent(sessionEvent)
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const agentSession = getAgentSessionBridge()

    if (!agentConnected || !canLoadSessionHistory || !agentSession) {
      if (agentSession) {
        for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
          void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
        }
      }
      subscribedSessionStreamsRef.current = {}
      return
    }

    const nextSubscriptions = Object.fromEntries(
      openCanvasSessionIDs
        .map((uiSessionID) => [uiSessionID, resolveBackendSessionID(uiSessionID)] as const)
        .filter(([, backendSessionID]) => Boolean(backendSessionID)),
    )

    for (const [uiSessionID, backendSessionID] of Object.entries(subscribedSessionStreamsRef.current)) {
      if (nextSubscriptions[uiSessionID] === backendSessionID) continue
      void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
      delete subscribedSessionStreamsRef.current[uiSessionID]
    }

    for (const [uiSessionID, backendSessionID] of Object.entries(nextSubscriptions)) {
      if (subscribedSessionStreamsRef.current[uiSessionID] === backendSessionID) continue
      subscribedSessionStreamsRef.current[uiSessionID] = backendSessionID
      void agentSession.subscribe({ uiSessionID, backendSessionID }).catch((error) => {
        console.error("[desktop] agentSession.subscribe failed:", error)
      })
    }
  }, [agentConnected, canLoadSessionHistory, openCanvasSessionIDs, agentSessions])

  useEffect(() => {
    return () => {
      const agentSession = getAgentSessionBridge()
      if (!agentSession) return

      for (const backendSessionID of Object.values(subscribedSessionStreamsRef.current)) {
        void agentSession.unsubscribe({ backendSessionID }).catch(() => undefined)
      }
      subscribedSessionStreamsRef.current = {}
    }
  }, [])
}
