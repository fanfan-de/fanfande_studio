import { act, renderHook } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { PendingAgentStream, SessionSummary, SideChatLink, WorkspaceGroup } from "../types"
import { createSessionDataLoadCache } from "./session-data-load-cache"
import {
  filterSideChatMappingForCleanup,
  removePendingStreamsForSessions,
  removeSubscribedSessionStreamsForCleanup,
  sideChatLinkHasRealResponse,
  useSessionLifecycleController,
} from "./session-lifecycle-controller"

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

function createWorkspace(id: string, sessions: SessionSummary[]): WorkspaceGroup {
  return {
    id,
    name: id,
    directory: `C:/work/${id}`,
    created: 1,
    updated: 1,
    project: {
      id: `project-${id}`,
      name: id,
      worktree: `C:/work/${id}`,
    },
    sessions,
  }
}

function useProjectClickHarness(focusSession = vi.fn()) {
  const workspace = createWorkspace("workspace-1", [createSession("session-1")])
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(null)
  const [expandedFolderIDs, setExpandedFolderIDs] = useState<string[]>([])
  const noop = vi.fn()

  const controller = useSessionLifecycleController({
    activeCreateSessionTab: null,
    activeCreateSessionTabID: null,
    activeSessionID: "session-outside-workspace",
    activeSideChatSessionIDByParentSessionID: {},
    activeWorkspace: null,
    agentSessionStoreRef: useRef({ dispatch: vi.fn() }),
    canLoadSessionHistory: true,
    conversationVersionRef: useRef({}),
    createSessionTabs: [],
    createSessionWorkspaceID: null,
    deletingSessionID: null,
    dockviewLayout: null,
    expandedFolderIDs,
    focusExistingCreateSessionTabAcrossPanes: vi.fn(() => false),
    focusSession,
    focusedPane: null,
    focusedPaneID: null,
    handleCreateSessionWorkspaceChange: vi.fn(),
    historyRequestRef: useRef({}),
    initialFolderWorkspacesLoadedRef: useRef(true),
    isCreateSessionTabActive: false,
    isCreatingProject: false,
    isCreatingSessionByTabKey: {},
    lastFocusedSessionIDRef: useRef(null),
    ensurePendingPermissionRequestsLoaded: vi.fn(async () => {}),
    ensureSessionHistoryLoaded: vi.fn(async () => {}),
    openCreateSessionTab: vi.fn(),
    openOrFocusRightSidebarTab: vi.fn(() => "tab-1"),
    pendingStreamsRef: useRef({}),
    permissionRequestsRequestRef: useRef({}),
    preserveLocalWorkspaceStateOnInitialLoadRef: useRef(false),
    runtimeDebugRequestRef: useRef({}),
    sessionDiffRequestRef: useRef({}),
    sessionDataLoadCacheRef: useRef(createSessionDataLoadCache()),
    sessionEventRouterRef: useRef({ cleanupUISession: vi.fn() }),
    setActiveSideChatSessionIDByParentSessionID: noop,
    setAgentSessions: noop,
    setCanLoadSessionHistory: noop,
    setComposerAttachmentsByTabKey: noop,
    setComposerDraftStateByTabKey: noop,
    setComposerParentMessageIDByTabKey: noop,
    setContextUsageBySession: noop,
    setConversations: noop,
    setCreateSessionTabs: noop,
    setDeletingSessionID: noop,
    setDockviewLayout: noop,
    setExpandedFolderIDs,
    setHoveredFolderID: noop,
    setIsCreatingProject: noop,
    setIsCreatingSessionByTabKey: noop,
    setIsSendingByTabKey: noop,
    setMessageTreeBySession: noop,
    setPendingPermissionRequestsBySession: noop,
    setSelectedDiffFileBySession: noop,
    setSelectedFolderID,
    setSessionDiffBySession: noop,
    setSessionDiffStateBySession: noop,
    setSessionDirectoryBySession: noop,
    setSessionRuntimeDebugBySession: noop,
    setSessionRuntimeDebugStateBySession: noop,
    setSessionTasksBySession: noop,
    setWorkspaces: noop,
    updateRightSidebarTab: noop,
    clearRuntimeDebugRefreshTimer: noop,
    clearSessionDiffRefreshTimer: noop,
    selectedFolderID,
    skipNextHistoryLoadRef: useRef({}),
    subscribedSessionStreamsRef: useRef({}),
    workbenchDockviewCommandsRef: useRef(null),
    workspaces: [workspace],
  })

  return {
    controller,
    expandedFolderIDs,
    selectedFolderID,
    workspace,
  }
}

describe("session lifecycle cleanup helpers", () => {
  it("toggles folder expansion without focusing a session when the project row is clicked", () => {
    const focusSession = vi.fn()
    const { result } = renderHook(() => useProjectClickHarness(focusSession))

    act(() => {
      result.current.controller.handleProjectClick(result.current.workspace)
    })

    expect(result.current.selectedFolderID).toBe("workspace-1")
    expect(result.current.expandedFolderIDs).toEqual(["workspace-1"])
    expect(focusSession).not.toHaveBeenCalled()

    act(() => {
      result.current.controller.handleProjectClick(result.current.workspace)
    })

    expect(result.current.selectedFolderID).toBe("workspace-1")
    expect(result.current.expandedFolderIDs).toEqual([])
    expect(focusSession).not.toHaveBeenCalled()
  })

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

  it("collects and removes subscribed streams by UI session id", () => {
    const subscribed = {
      "ui-session-1": "backend-session-1",
      "ui-session-2": "backend-session-2",
    }

    const backendSessionIDs = removeSubscribedSessionStreamsForCleanup(subscribed, new Set(["ui-session-1"]))

    expect([...backendSessionIDs]).toEqual(["backend-session-1"])
    expect(subscribed).toEqual({
      "ui-session-2": "backend-session-2",
    })
  })

  it("collects and removes subscribed streams by backend session id without duplicates", () => {
    const subscribed = {
      "ui-session-1": "backend-session-1",
      "backend-session-1": "backend-session-1",
      "ui-session-2": "backend-session-2",
    }

    const backendSessionIDs = removeSubscribedSessionStreamsForCleanup(subscribed, new Set(["backend-session-1"]))

    expect([...backendSessionIDs]).toEqual(["backend-session-1"])
    expect(subscribed).toEqual({
      "ui-session-2": "backend-session-2",
    })
  })

  it("detects whether side chat link snapshots contain a real response", () => {
    const createLink = (assistantText: string): SideChatLink => ({
      sessionID: "side-1",
      parentSessionID: "parent-1",
      anchorMessageID: "assistant-1",
      createdAt: 1,
      anchorPreview: "Parent response",
      snapshotVersion: 1,
      snapshot: {
        assistantText,
      },
    })

    expect(sideChatLinkHasRealResponse(createLink(""))).toBe(false)
    expect(sideChatLinkHasRealResponse(createLink("   "))).toBe(false)
    expect(sideChatLinkHasRealResponse(createLink("<!-- anybox-response-format: markdown -->"))).toBe(false)
    expect(sideChatLinkHasRealResponse(createLink("<!-- anybox-response-format: markdown -->\nA real answer."))).toBe(true)
  })
})
