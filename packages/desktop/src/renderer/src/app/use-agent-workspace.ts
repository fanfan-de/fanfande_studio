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
  AppMode,
  AgentStreamIPCEvent,
  ComposerAttachment,
  ComposerModelOption,
  PermissionApprovalScope,
  PermissionRequest,
  PendingAgentStream,
  ProviderModel,
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

const REVIEW_MODE_SYSTEM_PROMPT =
  "Operate in review mode. Prioritize bugs, regressions, risky assumptions, and missing tests. Present findings first and keep the review concise."

function normalizeModelSelection(selection?: { model?: string; small_model?: string }) {
  return {
    model: selection?.model ?? null,
    smallModel: selection?.small_model ?? null,
  }
}

function getComposerAttachmentName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function buildComposerAttachment(path: string): ComposerAttachment {
  return {
    path,
    name: getComposerAttachmentName(path),
  }
}

function toComposerModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toComposerModelLabel(model: ProviderModel) {
  return model.name
}

function resolveComposerModelLabel(selectedModel: string | null, models: ProviderModel[], isLoading: boolean) {
  if (isLoading && models.length === 0) return "Loading..."
  if (!selectedModel) return "Server default"
  return models.find((model) => toComposerModelValue(model) === selectedModel)?.name ?? selectedModel
}

function buildPromptWithAttachments(prompt: string, attachments: ComposerAttachment[]) {
  if (attachments.length === 0) return prompt

  const attachmentLines = attachments.map((attachment) => `- ${attachment.name}: ${attachment.path}`)
  return `${prompt}\n\nAttached files:\n${attachmentLines.join("\n")}`
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
  const permissionRequestsRequestRef = useRef<Record<string, number>>({})
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
  const [pendingPermissionRequestsBySession, setPendingPermissionRequestsBySession] = useState<
    Record<string, PermissionRequest[]>
  >({})
  const [permissionRequestActionRequestID, setPermissionRequestActionRequestID] = useState<string | null>(null)
  const [permissionRequestActionError, setPermissionRequestActionError] = useState<string | null>(null)
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([])
  const [composerAgentMode, setComposerAgentMode] = useState<AppMode>("Autopilot")
  const [composerModels, setComposerModels] = useState<ProviderModel[]>([])
  const [composerSelectedModel, setComposerSelectedModel] = useState<string | null>(null)
  const [composerSmallModel, setComposerSmallModel] = useState<string | null>(null)
  const [isLoadingComposerModels, setIsLoadingComposerModels] = useState(false)
  const composerModelsRequestRef = useRef(0)
  const pendingModelSelectionRef = useRef<Promise<void> | null>(null)

  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const selectedWorkspace = findWorkspaceByID(workspaces, selectedFolderID) ?? activeWorkspace ?? workspaces[0] ?? null
  const activeTurns = activeSession ? conversations[activeSession.id] ?? [] : []
  const activePendingPermissionRequests = activeSession ? pendingPermissionRequestsBySession[activeSession.id] ?? [] : []
  const composerModelOptions: ComposerModelOption[] = composerModels
    .filter((model) => model.available)
    .map((model) => ({
      value: toComposerModelValue(model),
      label: toComposerModelLabel(model),
    }))
  const composerSelectedModelLabel = resolveComposerModelLabel(composerSelectedModel, composerModels, isLoadingComposerModels)

  function bumpConversationVersion(sessionID: string) {
    conversationVersionRef.current[sessionID] = (conversationVersionRef.current[sessionID] ?? 0) + 1
  }

  function resolveBackendSessionID(sessionID: string) {
    return agentSessions[sessionID] ?? sessionID
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

  async function reloadSessionHistoryForSession(sessionID: string, backendSessionID = resolveBackendSessionID(sessionID)) {
    const getSessionHistory = window.desktop?.getSessionHistory
    if (!getSessionHistory) return

    const messages = await getSessionHistory({ sessionID: backendSessionID })
    startTransition(() => {
      replaceConversationTurns(sessionID, buildTurnsFromHistory(messages))
    })
  }

  async function loadPendingPermissionRequestsForSession(
    sessionID: string,
    backendSessionID = resolveBackendSessionID(sessionID),
  ) {
    const getSessionPermissionRequests = window.desktop?.getSessionPermissionRequests
    if (!getSessionPermissionRequests) return

    const requestID = (permissionRequestsRequestRef.current[sessionID] ?? 0) + 1
    permissionRequestsRequestRef.current[sessionID] = requestID

    try {
      const nextRequests = await getSessionPermissionRequests({ sessionID: backendSessionID })
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return

      setPendingPermissionRequestsBySession((prev) => ({
        ...prev,
        [sessionID]: nextRequests.filter((request) => request.status === "pending"),
      }))
    } catch (error) {
      if (permissionRequestsRequestRef.current[sessionID] !== requestID) return
      console.error("[desktop] getSessionPermissionRequests failed:", error)
    }
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

        if (canLoadSessionHistory) {
          void reloadSessionHistoryForSession(target.sessionID).catch((error) => {
            console.error("[desktop] stream history refresh failed:", error)
          })
          void loadPendingPermissionRequestsForSession(target.sessionID).catch((error) => {
            console.error("[desktop] stream permission refresh failed:", error)
          })
        }
      }
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
    }
  }, [canLoadSessionHistory])

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
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadPendingPermissionRequestsForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    const projectID = selectedWorkspace?.project.id
    const getProjectModels = window.desktop?.getProjectModels

    if (!projectID || !getProjectModels) {
      setComposerModels([])
      setComposerSelectedModel(null)
      setComposerSmallModel(null)
      return
    }

    let cancelled = false
    const requestID = ++composerModelsRequestRef.current
    setIsLoadingComposerModels(true)

    getProjectModels({ projectID })
      .then((payload) => {
        if (cancelled || composerModelsRequestRef.current !== requestID) return
        const nextSelection = normalizeModelSelection(payload.selection)
        setComposerModels(payload.items)
        setComposerSelectedModel(nextSelection.model)
        setComposerSmallModel(nextSelection.smallModel)
      })
      .catch((error) => {
        if (cancelled || composerModelsRequestRef.current !== requestID) return
        console.error("[desktop] getProjectModels failed:", error)
        setComposerModels([])
        setComposerSelectedModel(null)
        setComposerSmallModel(null)
      })
      .finally(() => {
        if (!cancelled && composerModelsRequestRef.current === requestID) {
          setIsLoadingComposerModels(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedWorkspace?.project.id])

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

    setPendingPermissionRequestsBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    for (const sessionID of sessionIDs) {
      delete conversationVersionRef.current[sessionID]
      delete permissionRequestsRequestRef.current[sessionID]
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
      setPendingPermissionRequestsBySession((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      delete conversationVersionRef.current[session.id]
      delete permissionRequestsRequestRef.current[session.id]
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
    if (!text || isSending || activePendingPermissionRequests.length > 0) return
    if (pendingModelSelectionRef.current) {
      await pendingModelSelectionRef.current.catch(() => undefined)
    }
    const uiSessionID = activeSession.id
    const canStream = Boolean(window.desktop?.streamAgentMessage && window.desktop?.onAgentStreamEvent)
    const attachments = composerAttachments
    const submissionText = buildPromptWithAttachments(text, attachments)
    const system = composerAgentMode === "Review" ? REVIEW_MODE_SYSTEM_PROMPT : undefined

    const userTurn: Turn = {
      id: createID("user"),
      kind: "user",
      text,
      timestamp: Date.now(),
    }

    setDraft("")
    setComposerAttachments([])

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
          text: submissionText,
          system,
        })

        return
      }

      const result = await window.desktop.sendAgentMessage?.({
        sessionID: backendSessionID,
        text: submissionText,
        system,
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

  async function handlePermissionRequestResponse(input: {
    sessionID: string
    request: PermissionRequest
    approved: boolean
    scope: PermissionApprovalScope
    reason?: string
  }) {
    const respondPermissionRequest = window.desktop?.respondPermissionRequest
    if (!respondPermissionRequest || permissionRequestActionRequestID) return

    setPermissionRequestActionRequestID(input.request.id)
    setPermissionRequestActionError(null)

    try {
      await respondPermissionRequest({
        requestID: input.request.id,
        approved: input.approved,
        scope: input.scope,
        reason: input.reason?.trim() || undefined,
        resume: true,
      })

      await reloadSessionHistoryForSession(input.sessionID, input.request.sessionID)
      await loadPendingPermissionRequestsForSession(input.sessionID, input.request.sessionID)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[desktop] respondPermissionRequest failed:", error)
      setPermissionRequestActionError(message)
    } finally {
      setPermissionRequestActionRequestID(null)
    }
  }

  async function handlePickComposerAttachments() {
    if (!window.desktop?.pickComposerAttachments) return

    try {
      const pickedPaths = await window.desktop.pickComposerAttachments()
      if (!pickedPaths || pickedPaths.length === 0) return

      setComposerAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.path))
        const nextAttachments = [...current]

        for (const path of pickedPaths) {
          if (seen.has(path)) continue
          seen.add(path)
          nextAttachments.push(buildComposerAttachment(path))
        }

        return nextAttachments
      })
    } catch (error) {
      console.error("[desktop] pickComposerAttachments failed:", error)
    }
  }

  function handleRemoveComposerAttachment(path: string) {
    setComposerAttachments((current) => current.filter((attachment) => attachment.path !== path))
  }

  async function handleComposerModelChange(value: string | null) {
    const projectID = selectedWorkspace?.project.id
    const updateProjectModelSelection = window.desktop?.updateProjectModelSelection
    const previousSelection = composerSelectedModel
    setComposerSelectedModel(value)

    if (!projectID || !updateProjectModelSelection) {
      return
    }

    const saveTask = (async () => {
      try {
        const result = await updateProjectModelSelection({
          projectID,
          model: value,
          small_model: composerSmallModel,
        })
        setComposerSelectedModel(result.model ?? null)
        setComposerSmallModel(result.small_model ?? composerSmallModel)
      } catch (error) {
        console.error("[desktop] updateProjectModelSelection failed:", error)
        setComposerSelectedModel(previousSelection)
        throw error
      }
    })()

    const trackedTask = saveTask.finally(() => {
      if (pendingModelSelectionRef.current === trackedTask) {
        pendingModelSelectionRef.current = null
      }
    })
    pendingModelSelectionRef.current = trackedTask

    await trackedTask
  }

  return {
    activeSession,
    activePendingPermissionRequests,
    activeTurns,
    composerAgentMode,
    composerAttachments,
    composerModelOptions,
    composerSelectedModel,
    composerSelectedModelLabel,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleComposerModelChange,
    handleComposerModeChange: setComposerAgentMode,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isCreatingSession,
    isResolvingPermissionRequest: permissionRequestActionRequestID !== null,
    isSending,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    projectRowRefs,
    selectedWorkspace,
    selectedFolderID,
    setDraft,
    setHoveredFolderID,
    threadColumnRef,
    workspaces,
  }
}
