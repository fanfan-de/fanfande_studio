import type { AgentSessionBridgeEvent } from "./client"

export interface AgentSessionSubscriptionSnapshot {
  backendSessionID: string
  uiSessionID?: string
  state: "connecting" | "connected" | "reconnecting" | "closed" | "error"
  message?: string
  lastEventID?: string
  updatedAt: number
}

export interface AgentSessionState {
  subscriptions: Record<string, AgentSessionSubscriptionSnapshot>
}

export type AgentSessionAction =
  | {
      type: "subscription.state"
      event: Extract<AgentSessionBridgeEvent, { kind: "subscription-state" }>
    }
  | {
      type: "subscription.remove"
      backendSessionID: string
    }
  | {
      type: "session.cleanup"
      sessionID: string
    }

export const initialAgentSessionState: AgentSessionState = {
  subscriptions: {},
}

export function reduceAgentSessionState(
  state: AgentSessionState,
  action: AgentSessionAction,
): AgentSessionState {
  if (action.type === "subscription.state") {
    const event = action.event
    const current = state.subscriptions[event.backendSessionID]
    const nextSubscription: AgentSessionSubscriptionSnapshot = {
      backendSessionID: event.backendSessionID,
      uiSessionID: event.uiSessionID,
      state: event.state,
      message: event.message,
      lastEventID: event.lastEventID,
      updatedAt: event.receivedAt,
    }

    if (
      current &&
      current.uiSessionID === nextSubscription.uiSessionID &&
      current.state === nextSubscription.state &&
      current.message === nextSubscription.message &&
      current.lastEventID === nextSubscription.lastEventID &&
      current.updatedAt === nextSubscription.updatedAt
    ) {
      return state
    }

    return {
      ...state,
      subscriptions: {
        ...state.subscriptions,
        [event.backendSessionID]: nextSubscription,
      },
    }
  }

  if (action.type === "subscription.remove") {
    if (!state.subscriptions[action.backendSessionID]) return state
    const nextSubscriptions = { ...state.subscriptions }
    delete nextSubscriptions[action.backendSessionID]
    return {
      ...state,
      subscriptions: nextSubscriptions,
    }
  }

  const nextSubscriptions = Object.fromEntries(
    Object.entries(state.subscriptions).filter(
      ([backendSessionID, subscription]) =>
        backendSessionID !== action.sessionID && subscription.uiSessionID !== action.sessionID,
    ),
  )

  if (Object.keys(nextSubscriptions).length === Object.keys(state.subscriptions).length) {
    return state
  }

  return {
    ...state,
    subscriptions: nextSubscriptions,
  }
}

export function createAgentSessionStore(initialState: AgentSessionState = initialAgentSessionState) {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getSnapshot() {
      return state
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispatch(action: AgentSessionAction) {
      const nextState = reduceAgentSessionState(state, action)
      if (nextState === state) return
      state = nextState
      for (const listener of listeners) {
        listener()
      }
    },
  }
}
