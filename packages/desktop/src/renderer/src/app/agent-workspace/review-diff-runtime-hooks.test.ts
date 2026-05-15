import { afterEach, describe, expect, it, vi } from "vitest"
import type { SessionDiffState, SessionDiffSummary, SessionRuntimeDebugSnapshot } from "../types"
import {
  loadSessionDiffForSession,
  sessionDiffSummariesAreEquivalent,
  sessionRuntimeDebugSnapshotsAreEquivalent,
} from "./review-diff-runtime-hooks"

function createRuntimeSnapshot(overrides: Partial<SessionRuntimeDebugSnapshot> = {}): SessionRuntimeDebugSnapshot {
  return {
    activeTurnID: "turn-1",
    diagnostics: {
      activeToolCount: 0,
      blockedOnApproval: false,
      failedToolCount: 0,
      llmFailureCount: 0,
    },
    generatedAt: 1,
    latestTurn: null,
    logging: {},
    recentEvents: [],
    running: {
      activeForMs: 0,
      reason: "idle",
      sessionID: "session-1",
      startedAt: null,
    },
    session: {
      id: "session-1",
      missing: false,
    },
    status: {
      type: "idle",
    },
    turns: [],
    ...overrides,
  }
}

describe("review data signatures", () => {
  const originalDesktop = window.desktop

  afterEach(() => {
    window.desktop = originalDesktop
  })

  it("compares session diffs by semantic content", () => {
    const diff: SessionDiffSummary = {
      body: "Changes",
      diffs: [
        {
          additions: 1,
          deletions: 0,
          file: "src/App.tsx",
          patch: "+hello",
        },
      ],
      stats: {
        additions: 1,
        deletions: 0,
        files: 1,
      },
      title: "Summary",
    }

    expect(sessionDiffSummariesAreEquivalent(diff, { ...diff, diffs: [...diff.diffs] })).toBe(true)
    expect(sessionDiffSummariesAreEquivalent(diff, {
      ...diff,
      diffs: [{ ...diff.diffs[0]!, additions: 2 }],
    })).toBe(false)
  })

  it("ignores runtime debug generatedAt when the visible runtime state is unchanged", () => {
    const first = createRuntimeSnapshot({ generatedAt: 1 })
    const second = createRuntimeSnapshot({ generatedAt: 2 })

    expect(sessionRuntimeDebugSnapshotsAreEquivalent(first, second)).toBe(true)
    expect(sessionRuntimeDebugSnapshotsAreEquivalent(first, createRuntimeSnapshot({
      activeTurnID: "turn-2",
      generatedAt: 3,
    }))).toBe(false)
  })

  it("keeps silent diff refreshes as no-ops when the diff is unchanged", async () => {
    const diff: SessionDiffSummary = {
      diffs: [
        {
          additions: 1,
          deletions: 0,
          file: "src/App.tsx",
          patch: "+hello",
        },
      ],
    }
    const sessionDiffBySession: Record<string, SessionDiffSummary> = {
      "session-1": diff,
    }
    const sessionDiffStateBySession: Record<string, SessionDiffState> = {
      "session-1": {
        errorMessage: null,
        isStale: false,
        status: "ready" as const,
        updatedAt: 10,
      },
    }
    let currentDiffBySession = sessionDiffBySession
    let currentDiffStateBySession = sessionDiffStateBySession

    window.desktop = {
      ...originalDesktop,
      getSessionDiff: vi.fn(async () => ({ ...diff, diffs: [...diff.diffs] })),
    } as typeof window.desktop

    await loadSessionDiffForSession({
      backendSessionID: "backend-1",
      options: {
        mode: "silent",
      },
      sessionDiffBySession,
      sessionDiffRefreshTimerRef: { current: {} },
      sessionDiffRequestRef: { current: {} },
      sessionID: "session-1",
      setSessionDiffBySession: (update) => {
        currentDiffBySession = typeof update === "function" ? update(currentDiffBySession) : update
      },
      setSessionDiffStateBySession: (update) => {
        currentDiffStateBySession = typeof update === "function" ? update(currentDiffStateBySession) : update
      },
    })

    expect(currentDiffBySession).toBe(sessionDiffBySession)
    expect(currentDiffStateBySession).toBe(sessionDiffStateBySession)
  })
})
