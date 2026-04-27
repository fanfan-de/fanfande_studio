import { describe, expect, it } from "vitest"
import type { PendingAgentStream } from "../types"
import {
  filterSideChatMappingForCleanup,
  removePendingStreamsForSessions,
} from "./session-lifecycle-controller"

describe("session lifecycle cleanup helpers", () => {
  it("removes side chat mappings when either parent or side chat session is cleaned up", () => {
    const mapping = {
      "parent-1": "side-1",
      "parent-2": "side-2",
      "parent-3": "side-3",
    }

    expect(filterSideChatMappingForCleanup(mapping, new Set(["parent-1", "side-2"]))).toEqual({
      "parent-3": "side-3",
    })
  })

  it("keeps side chat mapping object identity when no entries are removed", () => {
    const mapping = {
      "parent-1": "side-1",
    }

    expect(filterSideChatMappingForCleanup(mapping, new Set(["unrelated"]))).toBe(mapping)
  })

  it("removes pending streams owned by cleaned sessions", () => {
    const pendingStreams: Record<string, PendingAgentStream> = {
      "stream-1": {
        sessionID: "session-1",
        assistantTurnID: "assistant-1",
      },
      "stream-2": {
        sessionID: "session-2",
        assistantTurnID: "assistant-2",
      },
    }

    removePendingStreamsForSessions(pendingStreams, new Set(["session-1"]))

    expect(pendingStreams).toEqual({
      "stream-2": {
        sessionID: "session-2",
        assistantTurnID: "assistant-2",
      },
    })
  })
})
