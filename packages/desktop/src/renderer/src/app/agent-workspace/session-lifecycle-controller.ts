import type { MouseEvent, MutableRefObject } from "react"
import type { SerializedDockview } from "dockview-react"
import { getAgentSessionBridge } from "../agent-session/client"
import {
  ensureAgentSessions,
  ensureConversationSessions,
  removeAgentSession,
  removeConversationSession,
} from "../conversation-state"
import type {
  CreateSessionTab,
  ComposerAttachment,
  ComposerDraftState,
  PendingAgentStream,
  PermissionRequest,
  SessionContextUsage,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  SidebarActionKey,
  Turn,
  WorkspaceGroup,
} from "../types"
import {
  getActiveDockviewPanelReference,
  normalizeDockviewLayout,
  type WorkbenchDockviewCommands,
} from "../workbench/dockview-state"
import {
  findSession,
  findWorkspaceByID,
  getPrimaryWorkspaceSessions,
  isSideChatSession,
  isWorkspaceAvailable,
  mapLoadedSession,
  mapLoadedWorkspace,
  sortWorkspaceGroups,
  upsertSessionInWorkspace,
  upsertWorkspaceGroup,
} from "../workspace"
import { openExternalEditor } from "../external-editor/client"
import {
  createCreateSessionWorkbenchTab,
  createSessionWorkbenchTab,
  collectSideChatSessionsByAnchorMessageID,
  findLatestSideChatForAnchor,
  getWorkbenchTabKey,
  resolveCreateSessionWorkspaceID,
} from "./workspace-derived-state"
import { collectSessionDirectoryMap } from "./workspace-loading-hooks"
import {
  buildDockviewPanelTitles,
  buildValidDockviewReferences,
  resolveWorkspaceIDForDockviewReference,
} from "./dockview-workspace"
import {
  ensureExpandedFolderID,
  removeExpandedFolderID,
  type WorkspaceStateUpdater,
} from "./workspace-store"

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

export function filterSideChatMappingForCleanup(
  mapping: Record<string, string>,
  sessionIDs: Set<string>,
) {
  const next = Object.fromEntries(
    Object.entries(mapping).filter(([parentSessionID, sideChatSessionID]) =>
      !sessionIDs.has(parentSessionID) && !sessionIDs.has(sideChatSessionID)
    ),
  )
  return Object.keys(next).length === Object.keys(mapping).length ? mapping : next
}

export function removePendingStreamsForSessions(
  pendingStreams: Record<string, PendingAgentStream>,
  sessionIDs: Set<string>,
) {
  for (const [streamID, target] of Object.entries(pendingStreams)) {
    if (sessionIDs.has(target.sessionID)) {
      delete pendingStreams[streamID]
    }
  }
}

export function removeSubscribedSessionStreamsForCleanup(
  subscribedSessionStreams: Record<string, string>,
  sessionIDs: Set<string>,
) {
  const backendSessionIDs = new Set<string>()

  for (const [uiSessionID, backendSessionID] of Object.entries(subscribedSessionStreams)) {
    if (!sessionIDs.has(uiSessionID) && !sessionIDs.has(backendSessionID)) continue
    if (backendSessionID.trim()) {
      backendSessionIDs.add(backendSessionID)
    }
    delete subscribedSessionStreams[uiSessionID]
  }

  return backendSessionIDs
}

interface UseSessionLifecycleControllerOptions {
  activeCreateSessionTab: CreateSessionTab | null
  activeCreateSessionTabID: string | null
  activeSessionID: string | null
  activeWorkspace: WorkspaceGroup | null
  activeSideChatSessionIDByParentSessionID: Record<string, string>
  agentSessionStoreRef: MutableRefObject<{
    dispatch(action: { type: "session.cleanup"; sessionID: string }): void
  }>
  canLoadSessionHistory: boolean
  createSessionTabs: CreateSessionTab[]
  createSessionWorkspaceID: string | null
  deletingSessionID: string | null
  dockviewLayout: SerializedDockview | null
  expandedFolderIDs: string[]
  focusExistingCreateSessionTabAcrossPanes: (preferredWorkspaceID?: string | null) => boolean
  focusSession: (workspaceID: string, sessionID: string, paneID?: string) => void
  focusedPane: { id: string } | null
  focusedPaneID: string | null
  initialFolderWorkspacesLoadedRef: MutableRefObject<boolean>
  isCreateSessionTabActive: boolean
  isCreatingProject: boolean
  isCreatingSessionByTabKey: Record<string, boolean>
  lastFocusedSessionIDRef: MutableRefObject<string | null>
  loadPendingPermissionRequestsForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  openCreateSessionTab: (preferredWorkspaceID?: string | null, paneID?: string, workspaceScope?: WorkspaceGroup[]) => void
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  permissionRequestsRequestRef: MutableRefObject<Record<string, number>>
  preserveLocalWorkspaceStateOnInitialLoadRef: MutableRefObject<boolean>
  reloadSessionHistoryForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  runtimeDebugRequestRef: MutableRefObject<Record<string, number>>
  sessionDiffRequestRef: MutableRefObject<Record<string, number>>
  sessionEventRouterRef: MutableRefObject<{
    cleanupUISession(sessionID: string): void
  }>
  setActiveSideChatSessionIDByParentSessionID: StateSetter<Record<string, string>>
  setAgentSessions: StateSetter<Record<string, string>>
  setCanLoadSessionHistory: StateSetter<boolean>
  setComposerAttachmentsByTabKey: StateSetter<Record<string, ComposerAttachment[]>>
  setComposerDraftStateByTabKey: StateSetter<Record<string, ComposerDraftState>>
  setConversations: StateSetter<Record<string, Turn[]>>
  setContextUsageBySession: StateSetter<Record<string, SessionContextUsage>>
  setCreateSessionTabs: StateSetter<CreateSessionTab[]>
  setDeletingSessionID: StateSetter<string | null>
  setExpandedFolderIDs: StateSetter<string[]>
  setHoveredFolderID: StateSetter<string | null>
  setIsCreatingProject: StateSetter<boolean>
  setIsCreatingSessionByTabKey: StateSetter<Record<string, boolean>>
  setIsSendingByTabKey: StateSetter<Record<string, boolean>>
  setPendingPermissionRequestsBySession: StateSetter<Record<string, PermissionRequest[]>>
  setSelectedDiffFileBySession: StateSetter<Record<string, string | null>>
  setSelectedFolderID: StateSetter<string | null>
  setSessionDiffBySession: StateSetter<Record<string, SessionDiffSummary>>
  setSessionDiffStateBySession: StateSetter<Record<string, SessionDiffState>>
  setSessionDirectoryBySession: StateSetter<Record<string, string>>
  setSessionRuntimeDebugBySession: StateSetter<Record<string, SessionRuntimeDebugSnapshot>>
  setSessionRuntimeDebugStateBySession: StateSetter<Record<string, SessionRuntimeDebugState>>
  setDockviewLayout: StateSetter<SerializedDockview | null>
  setWorkspaces: StateSetter<WorkspaceGroup[]>
  clearRuntimeDebugRefreshTimer: (sessionID: string) => void
  clearSessionDiffRefreshTimer: (sessionID: string) => void
  handleCreateSessionWorkspaceChange: (workspaceID: string, createSessionTabID?: string | null) => void
  selectedFolderID: string | null
  selectedWorkspace: WorkspaceGroup | null
  skipNextHistoryLoadRef: MutableRefObject<Record<string, boolean>>
  subscribedSessionStreamsRef: MutableRefObject<Record<string, string>>
  workbenchDockviewCommandsRef: MutableRefObject<WorkbenchDockviewCommands | null>
  workspaces: WorkspaceGroup[]
  conversationVersionRef: MutableRefObject<Record<string, number>>
}

export function useSessionLifecycleController({
  activeCreateSessionTab,
  activeCreateSessionTabID,
  activeSessionID,
  activeSideChatSessionIDByParentSessionID,
  activeWorkspace,
  agentSessionStoreRef,
  conversationVersionRef,
  createSessionTabs,
  createSessionWorkspaceID,
  deletingSessionID,
  dockviewLayout,
  expandedFolderIDs,
  focusExistingCreateSessionTabAcrossPanes,
  focusSession,
  focusedPane,
  focusedPaneID,
  handleCreateSessionWorkspaceChange,
  initialFolderWorkspacesLoadedRef,
  isCreateSessionTabActive,
  isCreatingProject,
  isCreatingSessionByTabKey,
  lastFocusedSessionIDRef,
  loadPendingPermissionRequestsForSession,
  openCreateSessionTab,
  pendingStreamsRef,
  permissionRequestsRequestRef,
  preserveLocalWorkspaceStateOnInitialLoadRef,
  reloadSessionHistoryForSession,
  runtimeDebugRequestRef,
  sessionDiffRequestRef,
  sessionEventRouterRef,
  setActiveSideChatSessionIDByParentSessionID,
  setAgentSessions,
  setCanLoadSessionHistory,
  setComposerAttachmentsByTabKey,
  setComposerDraftStateByTabKey,
  setContextUsageBySession,
  setConversations,
  setCreateSessionTabs,
  setDeletingSessionID,
  setExpandedFolderIDs,
  setHoveredFolderID,
  setIsCreatingProject,
  setIsCreatingSessionByTabKey,
  setIsSendingByTabKey,
  setPendingPermissionRequestsBySession,
  setSelectedDiffFileBySession,
  setSelectedFolderID,
  setSessionDiffBySession,
  setSessionDiffStateBySession,
  setSessionDirectoryBySession,
  setSessionRuntimeDebugBySession,
  setSessionRuntimeDebugStateBySession,
  setDockviewLayout,
  setWorkspaces,
  clearRuntimeDebugRefreshTimer,
  clearSessionDiffRefreshTimer,
  selectedFolderID,
  selectedWorkspace,
  skipNextHistoryLoadRef,
  subscribedSessionStreamsRef,
  workbenchDockviewCommandsRef,
  workspaces,
}: UseSessionLifecycleControllerOptions) {
  function cleanupSessionState(sessionIDs: Set<string>) {
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

    setSessionDiffBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionDiffStateBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionRuntimeDebugBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionRuntimeDebugStateBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSelectedDiffFileBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setSessionDirectoryBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    setContextUsageBySession((prev) => {
      const next = { ...prev }
      for (const sessionID of sessionIDs) {
        delete next[sessionID]
      }
      return next
    })

    const tabKeys = new Set([...sessionIDs].map((sessionID) => getWorkbenchTabKey(createSessionWorkbenchTab(sessionID))))

    setComposerDraftStateByTabKey((prev) => {
      const next = { ...prev }
      for (const tabKey of tabKeys) {
        delete next[tabKey]
      }
      return next
    })

    setComposerAttachmentsByTabKey((prev) => {
      const next = { ...prev }
      for (const tabKey of tabKeys) {
        delete next[tabKey]
      }
      return next
    })

    setIsSendingByTabKey((prev) => {
      const next = { ...prev }
      for (const tabKey of tabKeys) {
        delete next[tabKey]
      }
      return next
    })

    setActiveSideChatSessionIDByParentSessionID((prev) => filterSideChatMappingForCleanup(prev, sessionIDs))

    for (const sessionID of sessionIDs) {
      delete conversationVersionRef.current[sessionID]
      delete permissionRequestsRequestRef.current[sessionID]
      delete sessionDiffRequestRef.current[sessionID]
      clearSessionDiffRefreshTimer(sessionID)
      delete runtimeDebugRequestRef.current[sessionID]
      clearRuntimeDebugRefreshTimer(sessionID)
      sessionEventRouterRef.current.cleanupUISession(sessionID)
      agentSessionStoreRef.current.dispatch({
        type: "session.cleanup",
        sessionID,
      })
    }

    const agentSession = getAgentSessionBridge()
    const backendSessionIDs = removeSubscribedSessionStreamsForCleanup(subscribedSessionStreamsRef.current, sessionIDs)
    if (agentSession) {
      for (const backendSessionID of backendSessionIDs) {
        void agentSession.unsubscribe({ backendSessionID }).catch((error) => {
          console.error("[desktop] agentSession.unsubscribe failed during session cleanup:", error)
        })
      }
    }

    removePendingStreamsForSessions(pendingStreamsRef.current, sessionIDs)
  }

  async function createSessionForWorkspace(
    workspace: WorkspaceGroup,
    options?: {
      createSessionTabID?: string | null
      closeCreateTab?: boolean
      paneID?: string | null
      skipInitialHistoryLoad?: boolean
      title?: string
    },
  ) {
    const createTabKey = options?.createSessionTabID ? `create-session:${options.createSessionTabID}` : null
    if ((createTabKey && isCreatingSessionByTabKey[createTabKey]) || !window.desktop?.createFolderSession) return null

    if (createTabKey) {
      setIsCreatingSessionByTabKey((current) => ({
        ...current,
        [createTabKey]: true,
      }))
    }
    try {
      const nextTitle = options?.title?.trim()
      const created = await window.desktop.createFolderSession({
        projectID: workspace.project.id,
        directory: workspace.directory,
        title: nextTitle || undefined,
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
      setSessionDirectoryBySession((prev) => ({
        ...prev,
        [created.session.id]: created.session.directory,
      }))
      setCanLoadSessionHistory(true)
      if (options?.skipInitialHistoryLoad) {
        skipNextHistoryLoadRef.current[created.session.id] = true
      }

      if (options?.closeCreateTab && options.createSessionTabID) {
        setCreateSessionTabs((current) => current.filter((tab) => tab.id !== options.createSessionTabID))
        workbenchDockviewCommandsRef.current?.replacePanel(
          createCreateSessionWorkbenchTab(options.createSessionTabID),
          createSessionWorkbenchTab(created.session.id),
          { title: nextSession.title },
        )
      } else if (options?.createSessionTabID) {
        setCreateSessionTabs((current) =>
          current.map((tab) =>
            tab.id === options.createSessionTabID
              ? {
                  ...tab,
                  title: "",
                  workspaceID: workspace.id,
                }
              : tab,
          ),
        )
        workbenchDockviewCommandsRef.current?.replacePanel(
          createCreateSessionWorkbenchTab(options.createSessionTabID),
          createSessionWorkbenchTab(created.session.id),
          { title: nextSession.title },
        )
      } else if (options?.paneID) {
        workbenchDockviewCommandsRef.current?.openPanel(createSessionWorkbenchTab(created.session.id), {
          targetGroupID: options.paneID,
          title: nextSession.title,
        })
      }

      focusSession(workspace.id, created.session.id, options?.paneID ?? undefined)
      return {
        backendSessionID: created.session.id,
        session: nextSession,
        workspace,
      }
    } catch (error) {
      console.error("[desktop] createFolderSession failed:", error)
      return null
    } finally {
      if (createTabKey) {
        setIsCreatingSessionByTabKey((current) => {
          if (!(createTabKey in current)) return current
          const next = { ...current }
          delete next[createTabKey]
          return next
        })
      }
    }
  }

  async function handleCreateSessionSubmit(createSessionTabID = activeCreateSessionTabID, paneID = focusedPaneID ?? focusedPane?.id ?? null) {
    if (!createSessionTabID) return
    const currentCreateSessionTab = createSessionTabs.find((tab) => tab.id === createSessionTabID)
    if (!currentCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, currentCreateSessionTab.workspaceID)
    if (!workspace) return

    await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID,
      paneID,
    })
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
        if (!initialFolderWorkspacesLoadedRef.current) {
          preserveLocalWorkspaceStateOnInitialLoadRef.current = true
        }
        const nextWorkspace = mapLoadedWorkspace(createdWorkspace)
        const createdSessionIDs = createdWorkspace.sessions.map((session) => session.id)
        setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
        setConversations((prev) => ensureConversationSessions(prev, createdSessionIDs))
        setAgentSessions((prev) => ensureAgentSessions(prev, createdSessionIDs))
        setSessionDirectoryBySession((prev) => ({
          ...prev,
          ...collectSessionDirectoryMap([createdWorkspace]),
        }))
        setCanLoadSessionHistory(true)
        setExpandedFolderIDs((current) => ensureExpandedFolderID(current, createdWorkspace.id))
        setSelectedFolderID(createdWorkspace.id)
        const [initialWorkspaceSession] = getPrimaryWorkspaceSessions(nextWorkspace.sessions)
        if (initialWorkspaceSession) {
          focusSession(createdWorkspace.id, initialWorkspaceSession.id)
        } else if (!focusExistingCreateSessionTabAcrossPanes(createdWorkspace.id)) {
          openCreateSessionTab(createdWorkspace.id, undefined, [...workspaces, nextWorkspace])
        }
        lastFocusedSessionIDRef.current = initialWorkspaceSession?.id ?? null
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

    const preferredWorkspaceID = selectedWorkspace?.id ?? workspaces[0]?.id ?? null
    if (focusExistingCreateSessionTabAcrossPanes(preferredWorkspaceID)) return
    openCreateSessionTab(preferredWorkspaceID)
  }

  function handleProjectClick(workspace: WorkspaceGroup) {
    const isSelected = selectedFolderID === workspace.id
    const isExpanded = expandedFolderIDs.includes(workspace.id)
    setSelectedFolderID(workspace.id)

    if (isSelected && isExpanded) {
      setExpandedFolderIDs((current) => removeExpandedFolderID(current, workspace.id))
      const primarySessions = getPrimaryWorkspaceSessions(workspace.sessions)
      if (primarySessions.length === 0) {
        return
      }

      if (isCreateSessionTabActive || !workspace.sessions.some((session) => session.id === activeSessionID)) {
        focusSession(workspace.id, primarySessions[0]!.id)
      }
      return
    }

    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, workspace.id))
    const currentSessionInWorkspace = workspace.sessions.some((session) => session.id === activeSessionID)
    const primarySessions = getPrimaryWorkspaceSessions(workspace.sessions)
    if (primarySessions.length === 0) {
      return
    }

    if (currentSessionInWorkspace && !isCreateSessionTabActive && activeSessionID) {
      return
    }

    focusSession(workspace.id, primarySessions[0]!.id)
  }

  function handleSessionSelect(workspaceID: string, sessionID: string) {
    focusSession(workspaceID, sessionID, focusedPaneID ?? focusedPane?.id ?? undefined)
  }

  function handleOpenSideChatInTab(sessionID: string, paneID: string | null = focusedPaneID ?? focusedPane?.id ?? null) {
    const selection = findSession(workspaces, sessionID)
    if (!selection.workspace || !selection.session) return
    focusSession(selection.workspace.id, selection.session.id, paneID ?? undefined)
  }

  function closeActiveSideChat(parentSessionID: string) {
    setActiveSideChatSessionIDByParentSessionID((current) => {
      if (!(parentSessionID in current)) return current
      const next = { ...current }
      delete next[parentSessionID]
      return next
    })
  }

  function sortSideChatTabs(sessions: SessionSummary[]) {
    return [...sessions].sort((left, right) => {
      const createdDelta = (left.created ?? left.updated) - (right.created ?? right.updated)
      if (createdDelta !== 0) return createdDelta

      const updatedDelta = left.updated - right.updated
      if (updatedDelta !== 0) return updatedDelta

      return left.id.localeCompare(right.id)
    })
  }

  function getLocalSideChatsForAnchor(parentSessionID: string, anchorMessageID: string) {
    return collectSideChatSessionsByAnchorMessageID(workspaces, parentSessionID)[anchorMessageID] ?? []
  }

  function upsertSideChatSessions(workspaceID: string, sessions: SessionSummary[]) {
    if (sessions.length === 0) return

    const sessionIDs = sessions.map((session) => session.id)
    setWorkspaces((prev) => sessions.reduce((next, session) => upsertSessionInWorkspace(next, workspaceID, session), prev))
    setConversations((prev) => ensureConversationSessions(prev, sessionIDs))
    setAgentSessions((prev) => ({
      ...prev,
      ...Object.fromEntries(sessionIDs.map((sessionID) => [sessionID, sessionID])),
    }))
    setSessionDirectoryBySession((prev) => ({
      ...prev,
      ...Object.fromEntries(sessions.map((session) => [session.id, session.branch])),
    }))
    setCanLoadSessionHistory(true)
  }

  async function syncSideChatsForAnchor(parentSessionID: string, anchorMessageID: string, workspaceID: string) {
    const localSideChats = getLocalSideChatsForAnchor(parentSessionID, anchorMessageID)
    const listSideChats = window.desktop?.listSideChats
    if (!listSideChats) return localSideChats

    try {
      const links = await listSideChats({ parentSessionID, anchorMessageID })
      const syncedSideChats = links
        .flatMap((link, index) => {
          if (!link.session || link.archived) return []

          return [
            mapLoadedSession(
              {
                id: link.session.id,
                projectID: link.session.projectID,
                directory: link.session.directory,
                title: link.session.title,
                kind: link.session.kind,
                policy: link.session.policy,
                origin: link.session.origin,
                created: link.session.time.created,
                updated: link.session.time.updated,
                workflow: link.session.workflow,
                modelSelection: link.session.modelSelection,
              },
              localSideChats.length + index,
            ),
          ]
        })

      upsertSideChatSessions(workspaceID, syncedSideChats)

      const sideChatsByID = new Map<string, SessionSummary>()
      for (const session of localSideChats) {
        sideChatsByID.set(session.id, session)
      }
      for (const session of syncedSideChats) {
        sideChatsByID.set(session.id, session)
      }

      return sortSideChatTabs([...sideChatsByID.values()])
    } catch (error) {
      console.error("[desktop] listSideChats failed:", error)
      return localSideChats
    }
  }

  async function activateSideChatThread(parentSessionID: string, sessionID: string, workspaceID: string) {
    setSelectedFolderID(workspaceID)
    setExpandedFolderIDs((current) => ensureExpandedFolderID(current, workspaceID))
    setActiveSideChatSessionIDByParentSessionID((current) => ({
      ...current,
      [parentSessionID]: sessionID,
    }))

    await Promise.allSettled([
      reloadSessionHistoryForSession(sessionID),
      loadPendingPermissionRequestsForSession(sessionID),
    ])
  }

  async function createSideChatForAnchor(parentSessionID: string, anchorMessageID: string, parentWorkspace: WorkspaceGroup) {
    const createSideChat = window.desktop?.createSideChat
    if (!createSideChat) return null

    const created = await createSideChat({
      parentSessionID,
      anchorMessageID,
    })
    const nextSession = mapLoadedSession(created.session, parentWorkspace.sessions.length)

    upsertSideChatSessions(parentWorkspace.id, [nextSession])
    return nextSession
  }

  async function handleSelectSideChatTab(sessionID: string) {
    const selection = findSession(workspaces, sessionID)
    const session = selection.session
    if (!selection.workspace || !session || !isSideChatSession(session) || !session.origin) return

    await activateSideChatThread(session.origin.parentSessionID, session.id, selection.workspace.id)
  }

  async function handleDeleteSideChatTab(sessionID: string) {
    const selection = findSession(workspaces, sessionID)
    const session = selection.session
    if (deletingSessionID || !selection.workspace || !session || !isSideChatSession(session) || !session.origin) return
    if (!window.desktop?.archiveAgentSession) return

    const parentSessionID = session.origin.parentSessionID
    const anchorMessageID = session.origin.anchorMessageID
    const siblingSideChats = sortSideChatTabs(getLocalSideChatsForAnchor(parentSessionID, anchorMessageID))
    const deletedIndex = siblingSideChats.findIndex((sideChat) => sideChat.id === session.id)
    const activeSideChatID = activeSideChatSessionIDByParentSessionID[parentSessionID] ?? null
    const deletingActiveSideChat = activeSideChatID === session.id

    setDeletingSessionID(session.id)
    try {
      const archiveResult = await window.desktop.archiveAgentSession({ sessionID: session.id })
      const archivedSessionIDs = new Set((archiveResult.archivedSessionIDs?.filter(Boolean) ?? [session.id]) as string[])
      const remainingSideChats = siblingSideChats.filter((sideChat) => !archivedSessionIDs.has(sideChat.id))
      const nextActiveSideChat =
        deletingActiveSideChat && remainingSideChats.length > 0
          ? remainingSideChats[Math.max(0, deletedIndex - 1)] ?? remainingSideChats[0] ?? null
          : null

      applyArchivedSessions(archivedSessionIDs, selection.workspace.id)

      if (deletingActiveSideChat && nextActiveSideChat) {
        setActiveSideChatSessionIDByParentSessionID((current) => ({
          ...current,
          [parentSessionID]: nextActiveSideChat.id,
        }))

        await Promise.allSettled([
          reloadSessionHistoryForSession(nextActiveSideChat.id),
          loadPendingPermissionRequestsForSession(nextActiveSideChat.id),
        ])
      }
    } catch (error) {
      console.error("[desktop] archive side chat failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  async function handleCreateSideChatTab(anchorMessageID: string, input?: { parentSessionID?: string | null; paneID?: string | null }) {
    const parentSessionID = input?.parentSessionID ?? activeSessionID
    if (!parentSessionID) return

    const parentSelection = findSession(workspaces, parentSessionID)
    if (!parentSelection.workspace || !parentSelection.session || isSideChatSession(parentSelection.session)) {
      return
    }

    try {
      const nextSession = await createSideChatForAnchor(parentSessionID, anchorMessageID, parentSelection.workspace)
      if (!nextSession) return

      await activateSideChatThread(parentSessionID, nextSession.id, parentSelection.workspace.id)
    } catch (error) {
      console.error("[desktop] createSideChat failed:", error)
    }
  }

  async function handleOpenSideChat(anchorMessageID: string, input?: { parentSessionID?: string | null; paneID?: string | null }) {
    const parentSessionID = input?.parentSessionID ?? activeSessionID
    if (!parentSessionID) return

    const parentSelection = findSession(workspaces, parentSessionID)
    if (!parentSelection.workspace || !parentSelection.session || isSideChatSession(parentSelection.session)) {
      return
    }

    const activeInlineSideChatID = activeSideChatSessionIDByParentSessionID[parentSessionID] ?? null
    const activeInlineSideChatSelection = findSession(workspaces, activeInlineSideChatID)
    if (
      activeInlineSideChatSelection.session?.origin?.parentSessionID === parentSessionID &&
      activeInlineSideChatSelection.session.origin.anchorMessageID === anchorMessageID
    ) {
      closeActiveSideChat(parentSessionID)
      return
    }

    const syncedSideChats = await syncSideChatsForAnchor(parentSessionID, anchorMessageID, parentSelection.workspace.id)
    const latestSyncedSideChat = syncedSideChats[syncedSideChats.length - 1] ?? null
    const existing = latestSyncedSideChat
      ? { workspace: parentSelection.workspace, session: latestSyncedSideChat }
      : findLatestSideChatForAnchor(workspaces, parentSessionID, anchorMessageID)
    if (existing) {
      await activateSideChatThread(parentSessionID, existing.session.id, existing.workspace.id)
      return
    }

    await handleCreateSideChatTab(anchorMessageID, input)
  }

  async function handleProjectCreateSession(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (!isWorkspaceAvailable(workspace)) return
    if (focusExistingCreateSessionTabAcrossPanes(workspace.id)) return
    openCreateSessionTab(workspace.id)
  }

  function handleProjectRemove(workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    const nextWorkspaces = workspaces.filter((item) => item.id !== workspace.id)
    const removedSessionIDs = new Set(workspace.sessions.map((session) => session.id))
    const nextCreateSessionWorkspaceID = resolveCreateSessionWorkspaceID(
      nextWorkspaces,
      activeCreateSessionTab?.workspaceID === workspace.id ? null : activeCreateSessionTab?.workspaceID ?? null,
      selectedFolderID,
    )
    const nextCreateSessionTabs = createSessionTabs.map((tab) => {
      const nextWorkspaceID =
        (tab.workspaceID && tab.workspaceID !== workspace.id ? findWorkspaceByID(nextWorkspaces, tab.workspaceID)?.id : null) ??
        nextCreateSessionWorkspaceID

      return nextWorkspaceID === tab.workspaceID
        ? tab
        : {
            ...tab,
            workspaceID: nextWorkspaceID,
          }
    })
    for (const sessionID of removedSessionIDs) {
      workbenchDockviewCommandsRef.current?.closePanel(createSessionWorkbenchTab(sessionID))
    }
    const nextDockviewLayout = normalizeDockviewLayout(
      workbenchDockviewCommandsRef.current?.getSnapshot() ?? dockviewLayout,
      buildValidDockviewReferences(nextWorkspaces, nextCreateSessionTabs),
      buildDockviewPanelTitles(nextWorkspaces, nextCreateSessionTabs),
    )
    const nextFocusedTab = getActiveDockviewPanelReference(nextDockviewLayout)
    const nextFocusedWorkspaceID = resolveWorkspaceIDForDockviewReference(
      nextFocusedTab,
      nextWorkspaces,
      nextCreateSessionTabs,
    )

    setWorkspaces(nextWorkspaces)
    setDockviewLayout(nextDockviewLayout)
    cleanupSessionState(removedSessionIDs)
    setCreateSessionTabs(nextCreateSessionTabs)
    setHoveredFolderID((current) => (current === workspace.id ? null : current))
    setSelectedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID)
    setExpandedFolderIDs((current) =>
      ensureExpandedFolderID(
        removeExpandedFolderID(current, workspace.id),
        nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID,
      ),
    )
  }

  function applyArchivedSessions(archivedSessionIDs: Set<string>, fallbackWorkspaceID: string) {
    const nextWorkspaces = sortWorkspaceGroups(
      workspaces.map((item) => ({
        ...item,
        sessions: item.sessions.filter((existing) => !archivedSessionIDs.has(existing.id)),
      })),
    )
    const nextCreateSessionWorkspaceID = resolveCreateSessionWorkspaceID(
      nextWorkspaces,
      activeCreateSessionTab?.workspaceID ?? createSessionWorkspaceID,
      fallbackWorkspaceID,
    )
    const nextCreateSessionTabs = createSessionTabs.map((tab) => {
      const nextWorkspaceID = findWorkspaceByID(nextWorkspaces, tab.workspaceID ?? "")?.id ?? nextCreateSessionWorkspaceID

      return nextWorkspaceID === tab.workspaceID
        ? tab
        : {
            ...tab,
            workspaceID: nextWorkspaceID,
          }
    })
    for (const sessionID of archivedSessionIDs) {
      workbenchDockviewCommandsRef.current?.closePanel(createSessionWorkbenchTab(sessionID))
    }
    const nextDockviewLayout = normalizeDockviewLayout(
      workbenchDockviewCommandsRef.current?.getSnapshot() ?? dockviewLayout,
      buildValidDockviewReferences(nextWorkspaces, nextCreateSessionTabs),
      buildDockviewPanelTitles(nextWorkspaces, nextCreateSessionTabs),
    )
    const nextFocusedTab = getActiveDockviewPanelReference(nextDockviewLayout)
    const nextFocusedWorkspaceID = resolveWorkspaceIDForDockviewReference(
      nextFocusedTab,
      nextWorkspaces,
      nextCreateSessionTabs,
    )

    setWorkspaces(nextWorkspaces)
    setDockviewLayout(nextDockviewLayout)
    setCreateSessionTabs(nextCreateSessionTabs)
    setConversations((prev) => {
      let next = prev
      for (const archivedSessionID of archivedSessionIDs) {
        next = removeConversationSession(next, archivedSessionID)
      }
      return next
    })
    setAgentSessions((prev) => {
      let next = prev
      for (const archivedSessionID of archivedSessionIDs) {
        next = removeAgentSession(next, archivedSessionID)
      }
      return next
    })
    cleanupSessionState(archivedSessionIDs)
    setSelectedFolderID(nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID ?? nextWorkspaces[0]?.id ?? null)
    setExpandedFolderIDs((current) =>
      ensureExpandedFolderID(current, nextFocusedWorkspaceID ?? nextCreateSessionWorkspaceID ?? null),
    )
  }

  async function handleProjectOpenInExplorer(workspace: WorkspaceGroup) {
    if (!isWorkspaceAvailable(workspace)) return

    try {
      await openExternalEditor({
        editorID: "explorer",
        targetPath: workspace.directory,
      })
    } catch (error) {
      if (!window.desktop?.openPath) {
        console.error("[desktop] open project in explorer failed:", error)
        return
      }

      try {
        await window.desktop.openPath({
          targetPath: workspace.directory,
        })
      } catch (fallbackError) {
        console.error("[desktop] open project path failed:", fallbackError)
      }
    }
  }

  async function handleProjectArchiveSessions(workspace: WorkspaceGroup) {
    if (deletingSessionID || !window.desktop?.archiveAgentSession) return

    const targetSessions = workspace.sessions
    if (targetSessions.length === 0) return

    setDeletingSessionID(targetSessions[0]?.id ?? workspace.id)
    try {
      const archivedSessionIDs = new Set<string>()
      for (const session of targetSessions) {
        if (archivedSessionIDs.has(session.id)) continue
        const archiveResult = await window.desktop.archiveAgentSession({ sessionID: session.id })
        const resultSessionIDs = archiveResult.archivedSessionIDs?.filter(Boolean) ?? [archiveResult.sessionID || session.id]
        for (const sessionID of resultSessionIDs) {
          archivedSessionIDs.add(sessionID)
        }
      }

      if (archivedSessionIDs.size > 0) {
        applyArchivedSessions(archivedSessionIDs, workspace.id)
      }
    } catch (error) {
      console.error("[desktop] archive workspace sessions failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  async function handleSessionDelete(workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (deletingSessionID || !window.desktop?.archiveAgentSession) return

    setDeletingSessionID(session.id)
    try {
      const archiveResult = await window.desktop.archiveAgentSession({ sessionID: session.id })
      const archivedSessionIDs = new Set((archiveResult.archivedSessionIDs?.filter(Boolean) ?? [session.id]) as string[])
      applyArchivedSessions(archivedSessionIDs, workspace.id)
    } catch (error) {
      console.error("[desktop] archiveAgentSession failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  return {
    cleanupSessionState,
    createSessionForWorkspace,
    handleCreateSessionSubmit,
    handleCreateSideChatTab,
    handleDeleteSideChatTab,
    handleOpenSideChat,
    handleOpenSideChatInTab,
    handleProjectClick,
    handleProjectArchiveSessions,
    handleProjectCreateSession,
    handleProjectOpenInExplorer,
    handleProjectRemove,
    handleSessionDelete,
    handleSessionSelect,
    handleSelectSideChatTab,
    handleSidebarAction,
  }
}
