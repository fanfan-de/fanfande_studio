import { act, renderHook } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type {
  ComposerAttachment,
  ComposerDraftState,
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

function applyUpdate<T>(setValue: (value: T) => void, current: T, update: T | ((value: T) => T)) {
  setValue(typeof update === "function" ? (update as (value: T) => T)(current) : update)
}

function useComposerHarness(input?: {
  activeCreateSessionTabID?: string | null
  activeSessionID?: string | null
  activeTabKey?: string | null
}) {
  const session = createSession("session-1")
  const workspace = createWorkspace(session)
  const [agentSessions, setAgentSessionsState] = useState<Record<string, string>>({})
  const [attachmentsByTabKey, setAttachmentsByTabKeyState] = useState<Record<string, ComposerAttachment[]>>({})
  const [draftsByTabKey, setDraftsByTabKeyState] = useState<Record<string, ComposerDraftState>>({
    "session:session-1": createComposerDraftStateFromPlainText("Existing prompt"),
    "create-session:create-1": createComposerDraftStateFromPlainText("New prompt"),
  })
  const [isSendingByTabKey, setIsSendingByTabKeyState] = useState<Record<string, boolean>>({})
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySessionState] = useState<Record<string, PermissionRequest[]>>({})
  const [sessionDirectoryBySession, setSessionDirectoryBySessionState] = useState<Record<string, string>>({})
  const [workspaces, setWorkspacesState] = useState<WorkspaceGroup[]>([workspace])
  const turnsRef = useRef<Record<string, Turn[]>>({})
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
  const createdSession = createSession("created-session-1")
  const createSessionForWorkspace = useRef(vi.fn(async (targetWorkspace: WorkspaceGroup) => ({
    backendSessionID: createdSession.id,
    session: createdSession,
    workspace: {
      ...targetWorkspace,
      sessions: [...targetWorkspace.sessions, createdSession],
    },
  }))).current

  const controller = useComposerController({
    activeCreateSessionTabID: input && "activeCreateSessionTabID" in input ? input.activeCreateSessionTabID ?? null : null,
    activeSessionID: input && "activeSessionID" in input ? input.activeSessionID ?? null : session.id,
    activeTabKey: input && "activeTabKey" in input ? input.activeTabKey ?? null : "session:session-1",
    agentConnected: false,
    agentDefaultDirectory: "C:/work",
    agentSessions,
    appendConversationTurns: (sessionID, nextTurns) => {
      turnsRef.current[sessionID] = [...(turnsRef.current[sessionID] ?? []), ...nextTurns]
    },
    composerAttachmentsByTabKey: attachmentsByTabKey,
    composerDraftStateByTabKey: draftsByTabKey,
    createSessionForWorkspace,
    createSessionTabs: [
      {
        id: "create-1",
        workspaceID: workspace.id,
        title: "",
      },
    ],
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
    setComposerAttachmentsByTabKey: (update) => applyUpdate(setAttachmentsByTabKeyState, attachmentsByTabKey, update),
    setComposerDraftStateByTabKey: (update) => applyUpdate(setDraftsByTabKeyState, draftsByTabKey, update),
    setIsSendingByTabKey: (update) => applyUpdate(setIsSendingByTabKeyState, isSendingByTabKey, update),
    setPendingPermissionRequestsBySession: (update) =>
      applyUpdate(setPendingPermissionRequestsBySessionState, pendingPermissionRequestsBySession, update),
    setPermissionRequestActionError: vi.fn(),
    setPermissionRequestActionRequestID: vi.fn(),
    setSessionDirectoryBySession: (update) => applyUpdate(setSessionDirectoryBySessionState, sessionDirectoryBySession, update),
    setWorkspaces: (update) => applyUpdate(setWorkspacesState, workspaces, update),
    updateAssistantConversationTurn: vi.fn(),
    workspaces,
  })

  return {
    controller,
    createSessionForWorkspace,
    pendingStreamsRef,
    turnsRef,
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
})
