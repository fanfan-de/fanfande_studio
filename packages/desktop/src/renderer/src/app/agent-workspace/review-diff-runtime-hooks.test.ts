import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionTaskListView,
  SessionTaskSummary,
} from "../types"
import {
  loadSessionDiffForSession,
  loadSessionTasksForSession,
  sessionDiffSummariesAreEquivalent,
  sessionRuntimeDebugSnapshotsAreEquivalent,
  sessionTaskListsAreEquivalent,
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

function createTask(overrides: Partial<SessionTaskSummary> = {}): SessionTaskSummary {
  return {
    id: "task-1",
    sessionID: "session-1",
    subject: "Run checks",
    description: "",
    activeForm: "Running checks",
    owner: "codex",
    status: "in_progress",
    sortIndex: 1,
    blocks: [],
    blockedBy: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 2,
    startedAt: 2,
    isBlocked: false,
    blockingTasks: [],
    blockedTasks: [],
    ...overrides,
  }
}

function createTaskList(overrides: Partial<SessionTaskListView> = {}): SessionTaskListView {
  const task = createTask()

  return {
    sessionID: "session-1",
    generatedAt: 1,
    tasks: [task],
    current: [task],
    next: [],
    blocked: [],
    owners: [
      {
        owner: "codex",
        current: task,
      },
    ],
    teammateActivity: [],
    summary: {
      total: 1,
      completed: 0,
      pending: 0,
      inProgress: 1,
      blocked: 0,
    },
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

  it("ignores task list generatedAt when the visible task state is unchanged", () => {
    const first = createTaskList({ generatedAt: 1 })
    const second = createTaskList({ generatedAt: 2 })
    const completedTask = createTask({
      activeForm: "",
      completedAt: 3,
      status: "completed",
    })

    expect(sessionTaskListsAreEquivalent(first, second)).toBe(true)
    expect(sessionTaskListsAreEquivalent(first, createTaskList({
      current: [],
      generatedAt: 3,
      owners: [
        {
          owner: "codex",
        },
      ],
      summary: {
        total: 1,
        completed: 1,
        pending: 0,
        inProgress: 0,
        blocked: 0,
      },
      tasks: [completedTask],
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

  it("keeps task refreshes as no-ops when the task snapshot is unchanged", async () => {
    const tasks = createTaskList({ generatedAt: 1 })
    const sessionTasksBySession: Record<string, SessionTaskListView> = {
      "session-1": tasks,
    }
    let currentTasksBySession = sessionTasksBySession

    window.desktop = {
      ...originalDesktop,
      getSessionTasks: vi.fn(async () => createTaskList({ generatedAt: 2 })),
    } as typeof window.desktop

    await loadSessionTasksForSession({
      backendSessionID: "backend-1",
      sessionID: "session-1",
      setSessionTasksBySession: (update) => {
        currentTasksBySession = typeof update === "function" ? update(currentTasksBySession) : update
      },
    })

    expect(window.desktop?.getSessionTasks).toHaveBeenCalledWith({ sessionID: "backend-1" })
    expect(currentTasksBySession).toBe(sessionTasksBySession)
  })
})
