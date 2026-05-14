import { act, renderHook } from "@testing-library/react"
import { useRef, useState, type Dispatch, type SetStateAction } from "react"
import { describe, expect, it, vi } from "vitest"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type {
  AssistantTurn,
  ComposerAttachment,
  ComposerDraftState,
  CreateSessionTab,
  PendingAgentStream,
  PermissionRequest,
  SessionSummary,
  Turn,
  WorkspaceGroup,
} from "../types"
import { useComposerController } from "./composer-controller"

function createSession(id: string): SessionSummary {
  return {
    id,
    title: id,
    branch: "main",
    status: "Ready",
    updated: 1,
    focus: "",
    summary: "",
  }
}

function createWorkspace(session: SessionSummary): WorkspaceGroup {
  return {
    id: "workspace-1",
    name: "Workspace",
    directory: "C:/work/workspace-1",
    created: 1,
    updated: 1,
    project: {
      id: "project-1",
      name: "Project",
      worktree: "C:/work/workspace-1",
    },
    sessions: [session],
  }
}

function createStreamingAssistantTurn(id: string, toolStatus: "pending" | "running" = "running"): AssistantTurn {
  return {
    id,
    kind: "assistant",
    timestamp: 1,
    runtime: {
      phase: "tool_running",
      startedAt: 1,
      updatedAt: 1,
    },
    state: "running",
    items: [
      {
        id: `${id}-tool`,
        kind: "tool",
        timestamp: 1,
        label: "Tool",
        title: "read-file",
        status: toolStatus,
      },
    ],
    isStreaming: true,
  }
}

function applyUpdate<T>(setValue: Dispatch<SetStateAction<T>>, _current: T, update: T | ((value: T) => T)) {
  setValue((current) => (typeof update === "function" ? (update as (value: T) => T)(current) : update))
}

function useComposerHarness(input?: {
  activeCreateSessionTabID?: string | null
  activeSessionID?: string | null
  activeTabKey?: string | null
  agentConnected?: boolean
  createSessionInitialWorkflowMode?: "execution" | "planning"
  initialAgentSessions?: Record<string, string>
  initialIsSendingByTabKey?: Record<string, boolean>
  initialPendingPermissionRequestsBySession?: Record<string, PermissionRequest[]>
  sessionDraftText?: string
}) {
  const session = createSession("session-1")
  const workspace = createWorkspace(session)
  const [agentSessions, setAgentSessionsState] = useState<Record<string, string>>(input?.initialAgentSessions ?? {})
  const [cancellingSessionIDs, setCancellingSessionIDsState] = useState<Record<string, boolean>>({})
  const [attachmentsByTabKey, setAttachmentsByTabKeyState] = useState<Record<string, ComposerAttachment[]>>({})
  const [createSessionTabs, setCreateSessionTabsState] = useState<CreateSessionTab[]>([
    {
      id: "create-1",
      initialWorkflowMode: input?.createSessionInitialWorkflowMode,
      workspaceID: workspace.id,
      title: "",
    },
  ])
  const [draftsByTabKey, setDraftsByTabKeyState] = useState<Record<string, ComposerDraftState>>({
    "session:session-1": createComposerDraftStateFromPlainText(input?.sessionDraftText ?? "Existing prompt"),
    "create-session:create-1": createComposerDraftStateFromPlainText("New prompt"),
  })
  const [isSendingByTabKey, setIsSendingByTabKeyState] = useState<Record<string, boolean>>(input?.initialIsSendingByTabKey ?? {})
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySessionState] = useState<Record<string, PermissionRequest[]>>(
    input?.initialPendingPermissionRequestsBySession ?? {},
  )
  const [sessionDirectoryBySession, setSessionDirectoryBySessionState] = useState<Record<string, string>>({})
  const [workspaces, setWorkspacesState] = useState<WorkspaceGroup[]>([workspace])
  const turnsRef = useRef<Record<string, Turn[]>>({})
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
  const updateAssistantConversationTurn = useRef(vi.fn((
    sessionID: string,
    turnID: string,
    updater: (turn: AssistantTurn) => AssistantTurn,
  ) => {
    turnsRef.current[sessionID] = (turnsRef.current[sessionID] ?? []).map((turn) =>
      turn.kind === "assistant" && turn.id === turnID ? updater(turn) : turn,
    )
  })).current
  const createdSession = createSession("created-session-1")
  const createSessionForWorkspace = useRef(vi.fn(async (targetWorkspace: WorkspaceGroup) => {
    const nextWorkspace = {
      ...targetWorkspace,
      sessions: [...targetWorkspace.sessions, createdSession],
    }
    setWorkspacesState((current) =>
      current.map((currentWorkspace) => currentWorkspace.id === targetWorkspace.id ? nextWorkspace : currentWorkspace),
    )
    return {
      backendSessionID: createdSession.id,
      session: createdSession,
      workspace: nextWorkspace,
    }
  })).current

  const controller = useComposerController({
    activeCreateSessionTabID: input && "activeCreateSessionTabID" in input ? input.activeCreateSessionTabID ?? null : null,
    activeSessionID: input && "activeSessionID" in input ? input.activeSessionID ?? null : session.id,
    activeTabKey: input && "activeTabKey" in input ? input.activeTabKey ?? null : "session:session-1",
    agentConnected: input?.agentConnected ?? false,
    agentDefaultDirectory: "C:/work",
    agentSessions,
    cancellingSessionIDs,
    appendConversationTurns: (sessionID, nextTurns) => {
      turnsRef.current[sessionID] = [...(turnsRef.current[sessionID] ?? []), ...nextTurns]
    },
    composerAttachmentsByTabKey: attachmentsByTabKey,
    composerDraftStateByTabKey: draftsByTabKey,
    createSessionForWorkspace,
    createSessionTabs,
    getConversationTurns: (sessionID) => turnsRef.current[sessionID] ?? [],
    isSendingByTabKey,
    loadPendingPermissionRequestsForSession: vi.fn(async () => undefined),
    loadSessionDiffForSession: vi.fn(async () => undefined),
    loadSessionRuntimeDebugForSession: vi.fn(async () => undefined),
    pendingPermissionRequestsBySession,
    pendingStreamsRef,
    permissionRequestActionRequestID: null,
    permissionRequestsRequestRef,
    platform: "win32",
    refreshWorkspaceForSession: vi.fn(),
    refreshWorkspaceFromDirectory: vi.fn(),
    reloadSessionHistoryForSession: vi.fn(async () => undefined),
    sessionDirectoryBySession,
    setAgentSessions: (update) => applyUpdate(setAgentSessionsState, agentSessions, update),
    setCancellingSessionIDs: (update) => applyUpdate(setCancellingSessionIDsState, cancellingSessionIDs, update),
    setComposerAttachmentsByTabKey: (update) => applyUpdate(setAttachmentsByTabKeyState, attachmentsByTabKey, update),
    setComposerDraftStateByTabKey: (update) => applyUpdate(setDraftsByTabKeyState, draftsByTabKey, update),
    setCreateSessionTabs: (update) => applyUpdate(setCreateSessionTabsState, createSessionTabs, update),
    setIsSendingByTabKey: (update) => applyUpdate(setIsSendingByTabKeyState, isSendingByTabKey, update),
    setPendingPermissionRequestsBySession: (update) =>
      applyUpdate(setPendingPermissionRequestsBySessionState, pendingPermissionRequestsBySession, update),
    setPermissionRequestActionError: vi.fn(),
    setPermissionRequestActionRequestID: vi.fn(),
    setSessionDirectoryBySession: (update) => applyUpdate(setSessionDirectoryBySessionState, sessionDirectoryBySession, update),
    setWorkspaces: (update) => applyUpdate(setWorkspacesState, workspaces, update),
    updateAssistantConversationTurn,
    workspaces,
  })

  return {
    attachmentsByTabKey,
    cancellingSessionIDs,
    controller,
    createSessionForWorkspace,
    createSessionTabs,
    pendingStreamsRef,
    turnsRef,
    updateAssistantConversationTurn,
    workspaces,
  }
}

describe("composer controller", () => {
  it("sends an existing session draft through the send service", async () => {
    const { result } = renderHook(() => useComposerHarness())

    await act(async () => {
      await result.current.controller.handleSend()
    })

    expect(result.current.turnsRef.current["session-1"]).toHaveLength(2)
    expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
      kind: "user",
      text: "Existing prompt",
    })
    expect(result.current.turnsRef.current["session-1"]?.[1]).toMatchObject({
      kind: "assistant",
    })
  })

  it("sends a text draft while the current tab is already sending", async () => {
    const { result } = renderHook(() =>
      useComposerHarness({
        initialIsSendingByTabKey: {
          "session:session-1": true,
        },
      }),
    )

    await act(async () => {
      await result.current.controller.handleSend()
    })

    expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
      kind: "user",
      text: "Existing prompt",
    })
  })

  it("marks running text submissions as steer turns without interrupting the active stream", async () => {
    const previousDesktop = window.desktop
    const sendTurn = vi.fn(async (input: { clientTurnID: string }) => ({
      clientTurnID: input.clientTurnID,
    }))
    const interrupt = vi.fn()
    const cancelTurn = vi.fn()

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        createAgentSession: vi.fn(),
        agentSession: {
          sendTurn,
          interrupt,
          cancelTurn,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() =>
        useComposerHarness({
          agentConnected: true,
          initialAgentSessions: {
            "session-1": "backend-session-1",
          },
          initialIsSendingByTabKey: {
            "session:session-1": true,
          },
        }),
      )

      result.current.pendingStreamsRef.current["stream-active"] = {
        assistantTurnID: "assistant-active",
        backendSessionID: "backend-session-1",
        backendTurnID: "turn-active",
        sessionID: "session-1",
      }
      result.current.turnsRef.current["session-1"] = [createStreamingAssistantTurn("assistant-active")]

      await act(async () => {
        await result.current.controller.handleSend()
      })

      expect(sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "backend-session-1",
        text: "Existing prompt",
      }))
      expect(interrupt).not.toHaveBeenCalled()
      expect(cancelTurn).not.toHaveBeenCalled()
      expect(result.current.turnsRef.current["session-1"]).toHaveLength(2)
      expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
        kind: "assistant",
      })
      expect(result.current.turnsRef.current["session-1"]?.[1]).toMatchObject({
        kind: "user",
        submissionMode: "steer",
        streamInsertion: {
          assistantTurnID: "assistant-active",
          afterItemCount: 1,
        },
      })
      expect(Object.values(result.current.pendingStreamsRef.current)).toContainEqual(
        expect.objectContaining({
          assistantTurnID: "assistant-active",
          backendTurnID: "turn-active",
          sessionID: "session-1",
        }),
      )
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("interrupts a preparing tool input before sending new user input", async () => {
    const previousDesktop = window.desktop
    const sendTurn = vi.fn(async (input: { clientTurnID: string }) => ({
      clientTurnID: input.clientTurnID,
    }))
    const interrupt = vi.fn(async (input: { backendSessionID: string; clientTurnID?: string }) => ({
      ...input,
      localRequestsAborted: 1,
      backendCancelled: true,
      activeCancelled: true,
      queuedCancelled: 0,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        createAgentSession: vi.fn(),
        agentSession: {
          sendTurn,
          interrupt,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() =>
        useComposerHarness({
          agentConnected: true,
          initialAgentSessions: {
            "session-1": "backend-session-1",
          },
          initialIsSendingByTabKey: {
            "session:session-1": true,
          },
        }),
      )

      result.current.pendingStreamsRef.current["stream-active"] = {
        assistantTurnID: "assistant-active",
        backendSessionID: "backend-session-1",
        backendTurnID: "turn-active",
        sessionID: "session-1",
      }
      result.current.turnsRef.current["session-1"] = [createStreamingAssistantTurn("assistant-active", "pending")]

      await act(async () => {
        await result.current.controller.handleSend({
          submissionMode: "steer",
        })
      })

      expect(interrupt).toHaveBeenCalledWith({
        backendSessionID: "backend-session-1",
        clientTurnID: "stream-active",
        reason: "user-interrupt",
      })
      expect(sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "backend-session-1",
        text: "Existing prompt",
      }))
      expect(result.current.pendingStreamsRef.current["stream-active"]?.cancelRequested).toBe(true)
      expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
        kind: "assistant",
        runtime: {
          phase: "cancelled",
        },
        items: expect.arrayContaining([
          expect.objectContaining({
            kind: "tool",
            status: "cancelled",
          }),
        ]),
      })
      expect(result.current.turnsRef.current["session-1"]?.[1]).toMatchObject({
        kind: "user",
        text: "Existing prompt",
      })
      expect((result.current.turnsRef.current["session-1"]?.[1] as { streamInsertion?: unknown }).streamInsertion).toBeUndefined()
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("does not send an empty draft while the current tab is already sending", async () => {
    const { result } = renderHook(() =>
      useComposerHarness({
        initialIsSendingByTabKey: {
          "session:session-1": true,
        },
        sessionDraftText: "   ",
      }),
    )

    await act(async () => {
      await result.current.controller.handleSend()
    })

    expect(result.current.turnsRef.current["session-1"]).toBeUndefined()
  })

  it("does not send while permission requests are pending", async () => {
    const { result } = renderHook(() =>
      useComposerHarness({
        initialPendingPermissionRequestsBySession: {
          "session-1": [
            {
              id: "permission-1",
              approvalID: "approval-1",
              sessionID: "session-1",
              messageID: "message-1",
              toolCallID: "tool-1",
              projectID: "project-1",
              agent: "agent",
              status: "pending",
              createdAt: 1,
              prompt: {
                title: "Approval required",
                summary: "Pending approval",
                rationale: "",
                risk: "medium",
                detailsAvailable: false,
                allowedDecisions: ["allow", "deny"],
                recommendedDecision: "allow",
              },
            },
          ],
        },
      }),
    )

    await act(async () => {
      await result.current.controller.handleSend()
    })

    expect(result.current.turnsRef.current["session-1"]).toBeUndefined()
  })

  it("creates a session before sending from a create-session tab", async () => {
    const { result } = renderHook(() =>
      useComposerHarness({
        activeCreateSessionTabID: "create-1",
        activeSessionID: null,
        activeTabKey: "create-session:create-1",
      }),
    )

    await act(async () => {
      await result.current.controller.handleSend()
    })

    expect(result.current.createSessionForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workspace-1" }),
      expect.objectContaining({
        closeCreateTab: true,
        createSessionTabID: "create-1",
        skipInitialHistoryLoad: true,
      }),
    )
    expect(result.current.turnsRef.current["created-session-1"]).toHaveLength(2)
  })

  it("toggles plan mode for an existing session", async () => {
    const previousDesktop = window.desktop
    const updateSessionWorkflow = vi.fn(async () => ({
      requestId: "request-1",
      session: {
        ...createSession("session-1"),
        workflow: {
          mode: "planning" as const,
          plan: {
            status: "idle" as const,
            updatedAt: 10,
          },
        },
      },
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        updateSessionWorkflow,
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      await act(async () => {
        await result.current.controller.handlePlanModeToggle({ sessionID: "session-1" })
      })

      expect(updateSessionWorkflow).toHaveBeenCalledWith({
        sessionID: "session-1",
        action: "enter-plan",
      })
      expect(result.current.workspaces[0]?.sessions[0]?.workflow?.mode).toBe("planning")
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("toggles pending plan mode on a create-session tab without touching the backend", async () => {
    const previousDesktop = window.desktop
    const updateSessionWorkflow = vi.fn()

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        updateSessionWorkflow,
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() =>
        useComposerHarness({
          activeCreateSessionTabID: "create-1",
          activeSessionID: null,
          activeTabKey: "create-session:create-1",
        }),
      )

      await act(async () => {
        await result.current.controller.handlePlanModeToggle({ createSessionTabID: "create-1" })
      })

      expect(updateSessionWorkflow).not.toHaveBeenCalled()
      expect(result.current.createSessionTabs[0]?.initialWorkflowMode).toBe("planning")

      await act(async () => {
        await result.current.controller.handlePlanModeToggle({ createSessionTabID: "create-1" })
      })

      expect(result.current.createSessionTabs[0]?.initialWorkflowMode).toBe("execution")
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("enters plan mode before sending the first prompt from a pending planning create-session tab", async () => {
    const previousDesktop = window.desktop
    const updateSessionWorkflow = vi.fn(async () => ({
      requestId: "request-1",
      session: {
        ...createSession("created-session-1"),
        workflow: {
          mode: "planning" as const,
          plan: {
            status: "idle" as const,
            updatedAt: 10,
          },
        },
      },
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        updateSessionWorkflow,
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() =>
        useComposerHarness({
          activeCreateSessionTabID: "create-1",
          activeSessionID: null,
          activeTabKey: "create-session:create-1",
          createSessionInitialWorkflowMode: "planning",
        }),
      )

      await act(async () => {
        await result.current.controller.handleSend()
      })

      expect(result.current.createSessionForWorkspace).toHaveBeenCalled()
      expect(updateSessionWorkflow).toHaveBeenCalledWith({
        sessionID: "created-session-1",
        action: "enter-plan",
      })
      expect(result.current.turnsRef.current["created-session-1"]).toHaveLength(2)
      expect(result.current.workspaces[0]?.sessions.find((session) => session.id === "created-session-1")?.workflow?.mode).toBe(
        "planning",
      )
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("does not send the first create-session prompt when entering plan mode fails", async () => {
    const previousDesktop = window.desktop
    const updateSessionWorkflow = vi.fn(async () => {
      throw new Error("Cannot enter plan mode")
    })

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        updateSessionWorkflow,
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() =>
        useComposerHarness({
          activeCreateSessionTabID: "create-1",
          activeSessionID: null,
          activeTabKey: "create-session:create-1",
          createSessionInitialWorkflowMode: "planning",
        }),
      )

      await act(async () => {
        await result.current.controller.handleSend()
      })

      expect(updateSessionWorkflow).toHaveBeenCalledWith({
        sessionID: "created-session-1",
        action: "enter-plan",
      })
      expect(result.current.turnsRef.current["created-session-1"]).toHaveLength(1)
      expect(result.current.turnsRef.current["created-session-1"]?.[0]).toMatchObject({
        kind: "assistant",
        runtime: {
          errorMessage: "Cannot enter plan mode",
        },
      })
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("cancels the active pending stream for the current session", async () => {
    const previousDesktop = window.desktop
    const cancelTurn = vi.fn(async (input: { backendSessionID: string; clientTurnID: string }) => ({
      ...input,
      localRequestAborted: true,
      backendCancelled: true,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        agentSession: {
          cancelTurn,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      result.current.pendingStreamsRef.current["stream-1"] = {
        assistantTurnID: "assistant-1",
        backendSessionID: "backend-session-1",
        sessionID: "session-1",
      }

      await act(async () => {
        await result.current.controller.handleCancelSend()
      })

      expect(cancelTurn).toHaveBeenCalledWith({
        backendSessionID: "backend-session-1",
        clientTurnID: "stream-1",
      })
      expect(result.current.pendingStreamsRef.current["stream-1"]?.cancelRequested).toBe(true)
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("interrupts a running session even when there is no pending request stream", async () => {
    const previousDesktop = window.desktop
    const interrupt = vi.fn(async (input: { backendSessionID: string; clientTurnID?: string }) => ({
      ...input,
      localRequestsAborted: 0,
      backendCancelled: true,
      activeCancelled: true,
      queuedCancelled: 0,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        agentSession: {
          interrupt,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      await act(async () => {
        await result.current.controller.handleCancelSend()
      })

      expect(interrupt).toHaveBeenCalledWith({
        backendSessionID: "session-1",
        reason: "user-interrupt",
      })
      expect(result.current.cancellingSessionIDs["session-1"]).toBe(true)
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("passes the pending client turn id to session interrupt", async () => {
    const previousDesktop = window.desktop
    const interrupt = vi.fn(async (input: { backendSessionID: string; clientTurnID?: string }) => ({
      ...input,
      localRequestsAborted: 1,
      backendCancelled: true,
      activeCancelled: true,
      queuedCancelled: 0,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        agentSession: {
          interrupt,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      result.current.pendingStreamsRef.current["stream-1"] = {
        assistantTurnID: "assistant-1",
        backendSessionID: "backend-session-1",
        sessionID: "session-1",
      }

      await act(async () => {
        await result.current.controller.handleCancelSend()
      })

      expect(interrupt).toHaveBeenCalledWith({
        backendSessionID: "backend-session-1",
        clientTurnID: "stream-1",
        reason: "user-interrupt",
      })
      expect(result.current.pendingStreamsRef.current["stream-1"]?.cancelRequested).toBe(true)
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("marks the visible running tool trace as cancelled when interrupt is requested", async () => {
    const previousDesktop = window.desktop
    const interrupt = vi.fn(async (input: { backendSessionID: string; clientTurnID?: string }) => ({
      ...input,
      localRequestsAborted: 1,
      backendCancelled: true,
      activeCancelled: true,
      queuedCancelled: 0,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        agentSession: {
          interrupt,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      result.current.pendingStreamsRef.current["stream-1"] = {
        assistantTurnID: "assistant-active",
        backendSessionID: "backend-session-1",
        sessionID: "session-1",
      }
      result.current.turnsRef.current["session-1"] = [createStreamingAssistantTurn("assistant-active")]

      await act(async () => {
        await result.current.controller.handleCancelSend()
      })

      expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
        kind: "assistant",
        runtime: {
          phase: "cancelled",
        },
        isStreaming: false,
        items: expect.arrayContaining([
          expect.objectContaining({
            kind: "tool",
            status: "cancelled",
            isStreaming: false,
          }),
        ]),
      })
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("marks unfinished tool traces as cancelled even when the pending stream points at a stale turn", async () => {
    const previousDesktop = window.desktop
    const interrupt = vi.fn(async (input: { backendSessionID: string; clientTurnID?: string }) => ({
      ...input,
      localRequestsAborted: 1,
      backendCancelled: true,
      activeCancelled: true,
      queuedCancelled: 0,
    }))

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        agentSession: {
          interrupt,
        },
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      result.current.pendingStreamsRef.current["stream-1"] = {
        assistantTurnID: "assistant-stale",
        backendSessionID: "backend-session-1",
        sessionID: "session-1",
      }
      result.current.turnsRef.current["session-1"] = [createStreamingAssistantTurn("assistant-visible")]

      await act(async () => {
        await result.current.controller.handleCancelSend()
      })

      expect(interrupt).toHaveBeenCalledWith({
        backendSessionID: "backend-session-1",
        clientTurnID: "stream-1",
        reason: "user-interrupt",
      })
      expect(result.current.turnsRef.current["session-1"]?.[0]).toMatchObject({
        kind: "assistant",
        runtime: {
          phase: "cancelled",
        },
        items: expect.arrayContaining([
          expect.objectContaining({
            kind: "tool",
            status: "cancelled",
          }),
        ]),
      })
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })

  it("saves pasted images and adds the resulting files as composer attachments", async () => {
    const previousDesktop = window.desktop
    const saveComposerPastedImages = vi.fn(async () => ["C:\\Temp\\pasted-image.png"])

    Object.defineProperty(window, "desktop", {
      configurable: true,
      value: {
        saveComposerPastedImages,
      } as unknown as typeof window.desktop,
    })

    try {
      const { result } = renderHook(() => useComposerHarness())

      await act(async () => {
        await result.current.controller.handlePasteComposerImageAttachments({
          allowImage: true,
          images: [
            {
              dataUrl: "data:image/png;base64,aW1hZ2U=",
              mimeType: "image/png",
              name: "screenshot.png",
            },
          ],
        })
      })

      expect(saveComposerPastedImages).toHaveBeenCalledWith({
        images: [
          {
            dataUrl: "data:image/png;base64,aW1hZ2U=",
            mimeType: "image/png",
            name: "screenshot.png",
          },
        ],
      })
      expect(result.current.attachmentsByTabKey["session:session-1"]).toEqual([
        {
          path: "C:\\Temp\\pasted-image.png",
          name: "pasted-image.png",
        },
      ])
    } finally {
      Object.defineProperty(window, "desktop", {
        configurable: true,
        value: previousDesktop,
      })
    }
  })
})
