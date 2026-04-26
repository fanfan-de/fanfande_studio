import { describe, expect, it, vi } from "vitest"
import { createAgentSessionStore, initialAgentSessionState, reduceAgentSessionState } from "./store"

describe("agent session store", () => {
  it("records subscription state by backend session", () => {
    const state = reduceAgentSessionState(initialAgentSessionState, {
      type: "subscription.state",
      event: {
        kind: "subscription-state",
        backendSessionID: "backend-1",
        uiSessionID: "ui-1",
        state: "connected",
        lastEventID: "cursor-1",
        receivedAt: 100,
      },
    })

    expect(state.subscriptions["backend-1"]).toMatchObject({
      backendSessionID: "backend-1",
      uiSessionID: "ui-1",
      state: "connected",
      lastEventID: "cursor-1",
      updatedAt: 100,
    })
  })

  it("cleans up subscriptions by either ui or backend session id", () => {
    const state = reduceAgentSessionState({
      subscriptions: {
        "backend-1": {
          backendSessionID: "backend-1",
          uiSessionID: "ui-1",
          state: "connected",
          updatedAt: 1,
        },
        "backend-2": {
          backendSessionID: "backend-2",
          uiSessionID: "ui-2",
          state: "connected",
          updatedAt: 2,
        },
      },
    }, {
      type: "session.cleanup",
      sessionID: "ui-1",
    })

    expect(Object.keys(state.subscriptions)).toEqual(["backend-2"])
  })

  it("notifies subscribers only when reducer state changes", () => {
    const store = createAgentSessionStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.dispatch({
      type: "subscription.remove",
      backendSessionID: "missing",
    })
    expect(listener).not.toHaveBeenCalled()

    store.dispatch({
      type: "subscription.state",
      event: {
        kind: "subscription-state",
        backendSessionID: "backend-1",
        state: "connecting",
        receivedAt: 1,
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
