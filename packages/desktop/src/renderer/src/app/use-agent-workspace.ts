import { startTransition, useEffect, useRef, useState, type MouseEvent } from "react"
import {
  appendConversationTurns as appendConversationTurnsToMap,
  ensureAgentSessions,
  ensureConversationSessions,
  removeAgentSession,
  removeConversationSession,
  updateAssistantTurn as updateAssistantTurnInMap,
} from "./conversation-state"
import { initialConversations, initialSelection, seedWorkspaces } from "./seed-data"
import {
  applyAgentStreamEventToTurn,
  buildAgentTurn,
  buildAgentTurnFromEvents,
  buildTurnsFromHistory,
  buildFailureTurn,
  buildStreamingAssistantTurn,
} from "./stream"
import type {
  AgentStreamIPCEvent,
  PendingAgentStream,
  SessionSummary,
  SidebarActionKey,
  Turn,
  WorkspaceGroup,
} from "./types"
import { createID } from "./utils"
import {
  findFirstSession,
  findSession,
  findWorkspaceByID,
  mapLoadedSession,
  mapLoadedWorkspace,
  mapLoadedWorkspaces,
  selectAfterSessionDelete,
  sortWorkspaceGroups,
  upsertSessionInWorkspace,
  upsertWorkspaceGroup,
} from "./workspace"

interface UseAgentWorkspaceOptions {
  agentConnected: boolean
  agentDefaultDirectory: string
  platform: string
}

export function useAgentWorkspace({
  agentConnected,
  agentDefaultDirectory,
  platform,
}: UseAgentWorkspaceOptions) {
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const historyRequestRef = useRef(0)
  const conversationVersionRef = useRef<Record<string, number>>({})
  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [activeSessionID, setActiveSessionID] = useState<string | null>(initialSelection.session?.id ?? null)
  const [expandedFolderID, setExpandedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [hoveredFolderID, setHoveredFolderID] = useState<string | null>(null)
  const [draft, setDraft] = useState("Help me align the desktop sidebar with the Pencil design.")
  const [conversations, setConversations] = useState(initialConversations)
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({})
  const [isSending, setIsSending] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)
  const [canLoadSessionHistory, setCanLoadSessionHistory] = useState(false)

  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const selectedWorkspace = findWorkspaceByID(workspaces, selectedFolderID) ?? activeWorkspace ?? workspaces[0] ?? null
  const activeTurns = activeSession ? conversations[activeSession.id] ?? [] : []

  function bumpConversationVersion(sessionID: string) {
    conversationVersionRef.current[sessionID] = (conversationVersionRef.current[sessionID] ?? 0) + 1
  }

  function replaceConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => ({
      ...prev,
      [sessionID]: nextTurns,
    }))
  }

  function appendConversationTurns(sessionID: string, nextTurns: Turn[]) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => appendConversationTurnsToMap(prev, sessionID, nextTurns))
  }

  function updateAssistantConversationTurn(
    sessionID: string,
    turnID: string,
    updater: Parameters<typeof updateAssistantTurnInMap>[3],
  ) {
    bumpConversationVersion(sessionID)
    setConversations((prev) => updateAssistantTurnInMap(prev, sessionID, turnID, updater))
  }

  useEffect(() => {
    const unsubscribe = window.desktop?.onAgentStreamEvent?.((streamEvent: AgentStreamIPCEvent) => {
      const target = pendingStreamsRef.current[streamEvent.streamID]
      if (!target) return

      startTransition(() => {
        updateAssistantConversationTurn(target.sessionID, target.assistantTurnID, (turn) => applyAgentStreamEventToTurn(turn, streamEvent))
      })

      if (streamEvent.event === "done" || streamEvent.event === "error") {
        delete pendingStreamsRef.current[streamEvent.streamID]
      }
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const listFolderWorkspaces = window.desktop?.listFolderWorkspaces
    if (!listFolderWorkspaces) {
      return () => {
        mounted = false
      }
    }

    listFolderWorkspaces()
      .then((loadedWorkspaces) => {
        if (!mounted) return

        const nextWorkspaces = mapLoadedWorkspaces(loadedWorkspaces)
        const loadedSessionIDs = loadedWorkspaces.flatMap((workspace) => workspace.sessions.map((session) => session.id))
        setWorkspaces(nextWorkspaces)
        setConversations((prev) => ensureConversationSessions(prev, loadedSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, loadedSessionIDs))
        setCanLoadSessionHistory(true)

        const nextSelection = findFirstSession(nextWorkspaces)
        const nextFolderID = nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
        setSelectedFolderID(nextFolderID)
        setExpandedFolderID(nextFolderID)
        setActiveSessionID(nextSelection.session?.id ?? null)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const getSessionHistory = window.desktop?.getSessionHistory
    if (!canLoadSessionHistory || !activeSessionID || !getSessionHistory) return

    let cancelled = false
    const sessionID = activeSessionID
    const requestID = ++historyRequestRef.current
    const baselineVersion = conversationVersionRef.current[sessionID] ?? 0

    getSessionHistory({ sessionID })
      .then((messages) => {
        if (cancelled || historyRequestRef.current !== requestID) return
        if ((conversationVersionRef.current[sessionID] ?? 0) !== baselineVersion) return

        startTransition(() => {
          replaceConversationTurns(sessionID, buildTurnsFromHistory(messages))
        })
      })
      .catch((error) => {
        console.error("[desktop] getSessionHistory failed:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeSessionID, canLoadSessionHistory])

  useEffect(() => {
    if (!selectedFolderID) return

    const projectRow = projectRowRefs.current[selectedFolderID]
    projectRow?.scrollIntoView?.({
      block: "nearest",
    })
  }, [selectedFolderID, workspaces])

  useEffect(() => {
    const threadColumn = threadColumnRef.current
    if (!threadColumn) return

    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [activeSessionID, activeTurns])

  function removeWorkspaceSessionState(workspace: WorkspaceGroup) {
    const sessionIDs = new Set(workspace.sessions.map((session) => session.id))

    setConversations((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setAgentSessions((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    for (const sessionID of sessionIDs) {
      delete conversationVersionRef.current[sessionID]
    }

    for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
      if (sessionIDs.has(target.sessionID)) {
        delete pendingStreamsRef.current[streamID]
      }
    }
  }

  async function createSessionForWorkspace(workspace: WorkspaceGroup) {
    if (isCreatingSession || !window.desktop?.createFolderSession) return

    setIsCreatingSession(true)
    try {
      const created = await window.desktop.createFolderSession({
        projectID: workspace.project.id,
        directory: workspace.directory,
      })
      const nextSession = mapLoadedSession(created.session, workspace.sessions.length)
      setWorkspaces((prev) => upsertSessionInWorkspace(prev, workspace.id, nextSession))
      setConversations((prev) => ({
        ...prev,
        [created.session.id]: prev[created.session.id] ?? [],
      }))
      setAgentSessions((prev) => ({
        ...prev,
        [created.session.id]: created.session.id,
      }))
      setCanLoadSessionHistory(true)
      setSelectedFolderID(workspace.id)
      setActiveSessionID(created.session.id)
      setExpandedFolderID(workspace.id)
    } catch (error) {
      console.error("[desktop] createFolderSession failed:", error)
    } finally {
      setIsCreatingSession(false)
    }
  }

  async function handleSidebarAction(action: SidebarActionKey) {
    if (action === "project") {
      if (isCreatingProject || !window.desktop?.pickProjectDirectory || !window.desktop?.openFolderWorkspace) {
        return
      }

      setIsCreatingProject(true)
      try {
        const directory = await window.desktop.pickProjectDirectory()
        if (!directory) return

        const createdWorkspace = await window.desktop.openFolderWorkspace({ directory })
        const nextWorkspace = mapLoadedWorkspace(createdWorkspace)
        const createdSessionIDs = createdWorkspace.sessions.map((session) => session.id)
        setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
        setConversations((prev) => ensureConversationSessions(prev, createdSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, createdSessionIDs))
        setCanLoadSessionHistory(true)
        setExpandedFolderID(createdWorkspace.id)
        setSelectedFolderID(createdWorkspace.id)
        setActiveSessionID(createdWorkspace.sessions[0]?.id ?? null)
      } catch (error) {
        console.error("[desktop] openFolderWorkspace failed:", error)
      } finally {
        setIsCreatingProject(false)
      }
      return
    }

    if (action === "sort") {
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: [...workspace.sessions].sort((left, right) => right.updated - left.updated),
        })),
      )
      return
    }

    if (!selectedWorkspace) return

    await createSessionForWorkspace(selectedWorkspace)
  }

  function handleProjectClick(workspace: WorkspaceGroup) {
    const isSelected = selectedFolderID === workspace.id
    const isExpanded = expandedFolderID === workspace.id
    setSelectedFolderID(workspace.id)

    if (isSelected && isExpanded) {
      setExpandedFolderID(null)
      if (!workspace.sessions.some((session) => session.id === activeSessionID)) {
        setActiveSessionID(workspace.sessions[0]?.id ?? null)
      }
      return
    }

    setExpandedFolderID(workspace.id)
    const currentSessionInWorkspace = workspace.sessions.some((session) => session.id === activeSessionID)
    setActiveSessionID(currentSessionInWorkspace ? activeSessionID : workspace.sessions[0]?.id ?? null)
  }

  function handleSessionSelect(workspaceID: string, sessionID: string) {
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
    setActiveSessionID(sessionID)
  }

  async function handleProjectCreateSession(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    await createSessionForWorkspace(workspace)
  }

  function handleProjectRemove(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    const nextWorkspaces = workspaces.filter((item) => item.id !== workspace.id)
    const removedSessionIDs = new Set(workspace.sessions.map((session) => session.id))
    const activeSessionRemoved = Boolean(activeSessionID && removedSessionIDs.has(activeSessionID))
    const nextActiveSelection =
      activeSessionRemoved || !activeSessionID
        ? findFirstSession(nextWorkspaces)
        : findSession(nextWorkspaces, activeSessionID)
    const nextSelectedWorkspace =
      !activeSessionRemoved && selectedFolderID && selectedFolderID !== workspace.id
        ? findWorkspaceByID(nextWorkspaces, selectedFolderID)
        : nextActiveSelection.workspace
    const nextSelectedFolderID = nextSelectedWorkspace?.id ?? nextActiveSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
    const nextExpandedWorkspace =
      expandedFolderID && expandedFolderID !== workspace.id ? findWorkspaceByID(nextWorkspaces, expandedFolderID) : null
    const nextExpandedFolderID = nextExpandedWorkspace?.id ?? nextSelectedFolderID

    setWorkspaces(nextWorkspaces)
    removeWorkspaceSessionState(workspace)
    setSelectedFolderID(nextSelectedFolderID)
    setExpandedFolderID(nextExpandedFolderID)
    setActiveSessionID(nextActiveSelection.session?.id ?? null)
    setHoveredFolderID((current) => (current === workspace.id ? null : current))
  }

  async function handleSessionDelete(workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (deletingSessionID || !window.desktop?.deleteAgentSession) return

    setDeletingSessionID(session.id)
    try {
      await window.desktop.deleteAgentSession({ sessionID: session.id })
      const nextWorkspaces = sortWorkspaceGroups(
        workspaces.map((item) =>
          item.id === workspace.id
            ? {
                ...item,
                sessions: item.sessions.filter((existing) => existing.id !== session.id),
              }
            : item,
        ),
      )
      const nextSelection = selectAfterSessionDelete(nextWorkspaces, workspace.id, session.id, activeSessionID)

      setWorkspaces(nextWorkspaces)
      setSelectedFolderID(nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null)
      setConversations((prev) => removeConversationSession(prev, session.id))
      setAgentSessions((prev) => removeAgentSession(prev, session.id))
      delete conversationVersionRef.current[session.id]
      for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
        if (target.sessionID === session.id) {
          delete pendingStreamsRef.current[streamID]
        }
      }
      setExpandedFolderID(nextSelection.workspace?.id ?? null)
      setActiveSessionID(nextSelection.session?.id ?? null)
    } catch (error) {
      console.error("[desktop] deleteAgentSession failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  async function handleSend() {
    if (!activeSession || !activeWorkspace) return

    const text = draft.trim()
    if (!text || isSending) return
    const uiSessionID = activeSession.id
    const canStream = Boolean(window.desktop?.streamAgentMessage && window.desktop?.onAgentStreamEvent)

    const userTurn: Turn = {
      id: createID("user"),
      kind: "user",
      text,
      timestamp: Date.now(),
    }

    setDraft("")

    startTransition(() => {
      appendConversationTurns(uiSessionID, [userTurn])
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: workspace.sessions.map((session) =>
            session.id === uiSessionID
              ? {
                  ...session,
                  status: "Live",
                  summary: text,
                  updated: Date.now(),
                }
              : session,
          ),
        })),
      )
    })

    if (!agentConnected || !window.desktop?.createAgentSession || (!canStream && !window.desktop?.sendAgentMessage)) {
      const fallback = buildAgentTurn(text, activeSession, activeWorkspace.name, platform)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [fallback])
      })
      return
    }

    setIsSending(true)
    let streamingTurnID: string | null = null
    let streamID: string | null = null

    try {
      let backendSessionID = agentSessions[uiSessionID]
      if (!backendSessionID) {
        const created = await window.desktop.createAgentSession({
          directory: agentDefaultDirectory || undefined,
        })
        backendSessionID = created.session.id
        setAgentSessions((prev) => ({
          ...prev,
          [uiSessionID]: backendSessionID!,
        }))
      }

      if (!backendSessionID) {
        throw new Error("Backend session id is missing")
      }

      if (canStream && window.desktop?.streamAgentMessage) {
        const streamingTurn = buildStreamingAssistantTurn(text)
        streamingTurnID = streamingTurn.id
        streamID = createID("stream")
        pendingStreamsRef.current[streamID] = {
          sessionID: uiSessionID,
          assistantTurnID: streamingTurn.id,
        }

        startTransition(() => {
          appendConversationTurns(uiSessionID, [streamingTurn])
        })

        await window.desktop.streamAgentMessage({
          streamID,
          sessionID: backendSessionID,
          text,
        })

        return
      }

      const result = await window.desktop.sendAgentMessage?.({
        sessionID: backendSessionID,
        text,
      })

      if (!result) {
        throw new Error("Desktop preload does not expose an agent send method")
      }

      const backendTurn = buildAgentTurnFromEvents(result.events, text)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [backendTurn])
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (streamID) {
        delete pendingStreamsRef.current[streamID]
      }

      startTransition(() => {
        if (streamingTurnID) {
          const failedTurnID = streamingTurnID
          updateAssistantConversationTurn(uiSessionID, failedTurnID, (current) => buildFailureTurn(message, current))
          return
        }

        appendConversationTurns(uiSessionID, [buildFailureTurn(message)])
      })
    } finally {
      setIsSending(false)
    }
  }

  return {
    activeSession,
    activeTurns,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isCreatingSession,
    isSending,
    projectRowRefs,
    selectedWorkspace,
    selectedFolderID,
    setDraft,
    setHoveredFolderID,
    threadColumnRef,
    workspaces,
  }
}
