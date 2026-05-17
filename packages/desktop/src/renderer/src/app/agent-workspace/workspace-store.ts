import { type SetStateAction, useRef, useSyncExternalStore } from "react"
import type { SerializedDockview } from "dockview-react"
import { createStore, type StoreApi } from "zustand/vanilla"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import { initialConversations, initialSelection, seedWorkspaces } from "../seed-data"
import type {
  ComposerAttachment,
  ComposerDraftState,
  CreateSessionTab,
  LeftSidebarView,
  PermissionRequest,
  RightSidebarView,
  SessionContextUsage,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspaceGroup,
  WorkspacePreviewState,
} from "../types"
import {
  createDockviewActiveStateFromLayout,
  dockviewActiveStatesAreEqual,
  normalizeDockviewActiveState,
  type WorkbenchDockviewActiveState,
} from "../workbench/dockview-state"
import { sortWorkspaceGroups } from "../workspace"
import {
  DEFAULT_WORKSPACE_FILE_REVIEW_STATE
} from "./review-preview-state"
import {
  conversationActivityMapsAreEqual,
  createConversationStore,
  type ConversationActivityMap,
  type ConversationMap,
  type ConversationStoreApi,
} from "./conversation-store"

export const seedWorkspaceIDs = new Set(seedWorkspaces.map((workspace) => workspace.id))
const PINNED_WORKSPACE_IDS_STORAGE_KEY = "desktop.workspace.pinnedWorkspaceIDs.v1"

export type WorkspaceStateUpdater<T> = SetStateAction<T>

export function ensureExpandedFolderID(current: string[], folderID: string | null | undefined) {
  if (!folderID || current.includes(folderID)) return current
  return [...current, folderID]
}

export function removeExpandedFolderID(current: string[], folderID: string | null | undefined) {
  if (!folderID || !current.includes(folderID)) return current
  return current.filter((item) => item !== folderID)
}

export function filterExpandedFolderIDs(current: string[], validFolderIDs: Set<string>) {
  const next = current.filter((folderID) => validFolderIDs.has(folderID))
  return next.length === current.length ? current : next
}

function readPinnedWorkspaceIDs() {
  if (typeof window === "undefined") return []

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_WORKSPACE_IDS_STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  } catch {
    return []
  }
}

function writePinnedWorkspaceIDs(workspaceIDs: string[]) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(PINNED_WORKSPACE_IDS_STORAGE_KEY, JSON.stringify(workspaceIDs))
  } catch {
    // Ignore storage failures; the in-memory ordering still works for the current window.
  }
}

export interface WorkbenchSliceState {
  dockviewActiveState: WorkbenchDockviewActiveState
  dockviewLayout: SerializedDockview | null
}

export interface SessionsSliceState {
  activeSideChatSessionIDByParentSessionID: Record<string, string>
  canLoadSessionHistory: boolean
  createSessionTabs: CreateSessionTab[]
  deletingSessionID: string | null
  expandedFolderIDs: string[]
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isInitialWorkspaceLoadPending: boolean
  leftSidebarView: LeftSidebarView
  pinnedWorkspaceIDs: string[]
  rightSidebarView: RightSidebarView
  selectedFolderID: string | null
  sessionCanvasUnreadBySession: Record<string, boolean>
  workspaces: WorkspaceGroup[]
}

export interface ComposerSliceState {
  composerAttachmentsByTabKey: Record<string, ComposerAttachment[]>
  composerDraftStateByTabKey: Record<string, ComposerDraftState>
  composerRefreshVersion: number
  isCreatingSessionByTabKey: Record<string, boolean>
  isSendingByTabKey: Record<string, boolean>
}

export interface AgentStreamSliceState {
  agentSessions: Record<string, string>
  cancellingSessionIDs: Record<string, boolean>
  conversationActivityBySession: ConversationActivityMap
  conversationStore: ConversationStoreApi
  contextUsageBySession: Record<string, SessionContextUsage>
  conversations: ConversationMap
  pendingPermissionRequestsBySession: Record<string, PermissionRequest[]>
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  sessionDirectoryBySession: Record<string, string>
}

export interface ReviewSliceState {
  previewByWorkspaceID: Record<string, WorkspacePreviewState>
  selectedDiffFileBySession: Record<string, string | null>
  sessionDiffBySession: Record<string, SessionDiffSummary>
  sessionDiffStateBySession: Record<string, SessionDiffState>
  sessionRuntimeDebugBySession: Record<string, SessionRuntimeDebugSnapshot>
  sessionRuntimeDebugStateBySession: Record<string, SessionRuntimeDebugState>
  workspaceFileCommentsByTarget: Record<string, WorkspaceFileComment[]>
  workspaceFileReviewState: WorkspaceFileReviewState
}

export interface WorkbenchSliceActions {
  setDockviewActiveState: (update: WorkspaceStateUpdater<WorkbenchDockviewActiveState>) => void
  setDockviewLayout: (update: WorkspaceStateUpdater<SerializedDockview | null>) => void
}

export interface SessionsSliceActions {
  setActiveSideChatSessionIDByParentSessionID: (
    update: WorkspaceStateUpdater<Record<string, string>>,
  ) => void
  setCanLoadSessionHistory: (update: WorkspaceStateUpdater<boolean>) => void
  setCreateSessionTabs: (update: WorkspaceStateUpdater<CreateSessionTab[]>) => void
  setDeletingSessionID: (update: WorkspaceStateUpdater<string | null>) => void
  setExpandedFolderIDs: (update: WorkspaceStateUpdater<string[]>) => void
  setHoveredFolderID: (update: WorkspaceStateUpdater<string | null>) => void
  setIsCreatingProject: (update: WorkspaceStateUpdater<boolean>) => void
  setIsInitialWorkspaceLoadPending: (update: WorkspaceStateUpdater<boolean>) => void
  setLeftSidebarView: (update: WorkspaceStateUpdater<LeftSidebarView>) => void
  setPinnedWorkspaceIDs: (update: WorkspaceStateUpdater<string[]>) => void
  setRightSidebarView: (update: WorkspaceStateUpdater<RightSidebarView>) => void
  setSelectedFolderID: (update: WorkspaceStateUpdater<string | null>) => void
  setSessionCanvasUnreadBySession: (
    update: WorkspaceStateUpdater<Record<string, boolean>>,
  ) => void
  setWorkspaces: (update: WorkspaceStateUpdater<WorkspaceGroup[]>) => void
}

export interface ComposerSliceActions {
  setComposerAttachmentsByTabKey: (
    update: WorkspaceStateUpdater<Record<string, ComposerAttachment[]>>,
  ) => void
  setComposerDraftStateByTabKey: (
    update: WorkspaceStateUpdater<Record<string, ComposerDraftState>>,
  ) => void
  setComposerRefreshVersion: (update: WorkspaceStateUpdater<number>) => void
  setIsCreatingSessionByTabKey: (update: WorkspaceStateUpdater<Record<string, boolean>>) => void
  setIsSendingByTabKey: (update: WorkspaceStateUpdater<Record<string, boolean>>) => void
}

export interface AgentStreamSliceActions {
  setAgentSessions: (update: WorkspaceStateUpdater<Record<string, string>>) => void
  setCancellingSessionIDs: (update: WorkspaceStateUpdater<Record<string, boolean>>) => void
  setContextUsageBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionContextUsage>>,
  ) => void
  setConversations: (update: WorkspaceStateUpdater<ConversationMap>) => void
  setPendingPermissionRequestsBySession: (
    update: WorkspaceStateUpdater<Record<string, PermissionRequest[]>>,
  ) => void
  setPermissionRequestActionError: (update: WorkspaceStateUpdater<string | null>) => void
  setPermissionRequestActionRequestID: (update: WorkspaceStateUpdater<string | null>) => void
  setSessionDirectoryBySession: (update: WorkspaceStateUpdater<Record<string, string>>) => void
}

export interface ReviewSliceActions {
  setPreviewByWorkspaceID: (update: WorkspaceStateUpdater<Record<string, WorkspacePreviewState>>) => void
  setSelectedDiffFileBySession: (update: WorkspaceStateUpdater<Record<string, string | null>>) => void
  setSessionDiffBySession: (update: WorkspaceStateUpdater<Record<string, SessionDiffSummary>>) => void
  setSessionDiffStateBySession: (update: WorkspaceStateUpdater<Record<string, SessionDiffState>>) => void
  setSessionRuntimeDebugBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionRuntimeDebugSnapshot>>,
  ) => void
  setSessionRuntimeDebugStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionRuntimeDebugState>>,
  ) => void
  setWorkspaceFileCommentsByTarget: (
    update: WorkspaceStateUpdater<Record<string, WorkspaceFileComment[]>>,
  ) => void
  setWorkspaceFileReviewState: (update: WorkspaceStateUpdater<WorkspaceFileReviewState>) => void
}

export interface WorkspaceStoreState {
  agentStream: AgentStreamSliceState
  composer: ComposerSliceState
  review: ReviewSliceState
  sessions: SessionsSliceState
  workbench: WorkbenchSliceState
}

export interface WorkspaceStoreActions {
  agentStreamActions: AgentStreamSliceActions
  composerActions: ComposerSliceActions
  reviewActions: ReviewSliceActions
  sessionsActions: SessionsSliceActions
  workbenchActions: WorkbenchSliceActions
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions
export type WorkspaceStoreApi = StoreApi<WorkspaceStore>

interface CreateWorkspaceStoreOptions {
  hasFolderWorkspaceLoader: boolean
  initialCreateSessionTab: CreateSessionTab | null
  initialComposerTabKey: string | null
  initialDockviewLayout: SerializedDockview | null
}

function resolveStateUpdate<T>(current: T, update: WorkspaceStateUpdater<T>): T {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update
}

function stringArraysAreEqual(left: string[], right: string[]) {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

export function createWorkspaceStore({
  hasFolderWorkspaceLoader,
  initialComposerTabKey,
  initialCreateSessionTab,
  initialDockviewLayout,
}: CreateWorkspaceStoreOptions) {
  const shouldUseSeedData = !hasFolderWorkspaceLoader
  const initialWorkspace = shouldUseSeedData ? initialSelection.workspace : null
  const initialPinnedWorkspaceIDs = readPinnedWorkspaceIDs()
  const initialDockviewActiveState = createDockviewActiveStateFromLayout(initialDockviewLayout)
  const conversationStore = createConversationStore(shouldUseSeedData ? initialConversations : {})

  return createStore<WorkspaceStore>((set) => ({
    workbench: {
      dockviewActiveState: initialDockviewActiveState,
      dockviewLayout: initialDockviewLayout,
    },
    sessions: {
      activeSideChatSessionIDByParentSessionID: {},
      canLoadSessionHistory: false,
      createSessionTabs: initialCreateSessionTab ? [initialCreateSessionTab] : [],
      deletingSessionID: null,
      expandedFolderIDs: initialWorkspace ? [initialWorkspace.id] : [],
      hoveredFolderID: null,
      isCreatingProject: false,
      isInitialWorkspaceLoadPending: hasFolderWorkspaceLoader,
      leftSidebarView: "workspace",
      pinnedWorkspaceIDs: initialPinnedWorkspaceIDs,
      rightSidebarView: "changes",
      selectedFolderID: initialWorkspace?.id ?? null,
      sessionCanvasUnreadBySession: {},
      workspaces: shouldUseSeedData ? sortWorkspaceGroups(seedWorkspaces, initialPinnedWorkspaceIDs) : [],
    },
    composer: {
      composerAttachmentsByTabKey: {},
      composerDraftStateByTabKey: initialComposerTabKey
        ? {
            [initialComposerTabKey]: createComposerDraftStateFromPlainText(
              "Help me align the desktop sidebar with the Pencil design.",
            ),
          }
        : {},
      composerRefreshVersion: 0,
      isCreatingSessionByTabKey: {},
      isSendingByTabKey: {},
    },
    agentStream: {
      agentSessions: {},
      cancellingSessionIDs: {},
      conversationActivityBySession: conversationStore.getActivityBySession(),
      conversationStore,
      contextUsageBySession: {},
      conversations: conversationStore.getConversations(),
      pendingPermissionRequestsBySession: {},
      permissionRequestActionError: null,
      permissionRequestActionRequestID: null,
      sessionDirectoryBySession: {},
    },
    review: {
      previewByWorkspaceID: {},
      selectedDiffFileBySession: {},
      sessionDiffBySession: {},
      sessionDiffStateBySession: {},
      sessionRuntimeDebugBySession: {},
      sessionRuntimeDebugStateBySession: {},
      workspaceFileCommentsByTarget: {},
      workspaceFileReviewState: DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
    },
    workbenchActions: {
      setDockviewActiveState: (update) =>
        set((state) => {
          const dockviewActiveState = resolveStateUpdate(state.workbench.dockviewActiveState, update)
          if (dockviewActiveStatesAreEqual(state.workbench.dockviewActiveState, dockviewActiveState)) {
            return state
          }
          return {
            workbench: {
              ...state.workbench,
              dockviewActiveState,
            },
          }
        }),
      setDockviewLayout: (update) =>
        set((state) => {
          const dockviewLayout = resolveStateUpdate(state.workbench.dockviewLayout, update)
          const dockviewActiveState = normalizeDockviewActiveState(
            dockviewLayout,
            state.workbench.dockviewActiveState,
          )
          return {
            workbench: {
              ...state.workbench,
              dockviewActiveState,
              dockviewLayout,
            },
          }
        }),
    },
    sessionsActions: {
      setActiveSideChatSessionIDByParentSessionID: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            activeSideChatSessionIDByParentSessionID: resolveStateUpdate(
              state.sessions.activeSideChatSessionIDByParentSessionID,
              update,
            ),
          },
        })),
      setCanLoadSessionHistory: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            canLoadSessionHistory: resolveStateUpdate(state.sessions.canLoadSessionHistory, update),
          },
        })),
      setCreateSessionTabs: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            createSessionTabs: resolveStateUpdate(state.sessions.createSessionTabs, update),
          },
        })),
      setDeletingSessionID: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            deletingSessionID: resolveStateUpdate(state.sessions.deletingSessionID, update),
          },
        })),
      setExpandedFolderIDs: (update) =>
        set((state) => {
          const expandedFolderIDs = resolveStateUpdate(state.sessions.expandedFolderIDs, update)
          if (stringArraysAreEqual(state.sessions.expandedFolderIDs, expandedFolderIDs)) {
            return state
          }
          return {
            sessions: {
              ...state.sessions,
              expandedFolderIDs,
            },
          }
        }),
      setHoveredFolderID: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            hoveredFolderID: resolveStateUpdate(state.sessions.hoveredFolderID, update),
          },
        })),
      setIsCreatingProject: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            isCreatingProject: resolveStateUpdate(state.sessions.isCreatingProject, update),
          },
        })),
      setIsInitialWorkspaceLoadPending: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            isInitialWorkspaceLoadPending: resolveStateUpdate(state.sessions.isInitialWorkspaceLoadPending, update),
          },
        })),
      setLeftSidebarView: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            leftSidebarView: resolveStateUpdate(state.sessions.leftSidebarView, update),
          },
        })),
      setPinnedWorkspaceIDs: (update) =>
        set((state) => {
          const pinnedWorkspaceIDs = [...new Set(resolveStateUpdate(state.sessions.pinnedWorkspaceIDs, update))]
          writePinnedWorkspaceIDs(pinnedWorkspaceIDs)

          return {
            sessions: {
              ...state.sessions,
              pinnedWorkspaceIDs,
              workspaces: sortWorkspaceGroups(state.sessions.workspaces, pinnedWorkspaceIDs),
            },
          }
        }),
      setRightSidebarView: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            rightSidebarView: resolveStateUpdate(state.sessions.rightSidebarView, update),
          },
        })),
      setSelectedFolderID: (update) =>
        set((state) => {
          const selectedFolderID = resolveStateUpdate(state.sessions.selectedFolderID, update)
          if (state.sessions.selectedFolderID === selectedFolderID) {
            return state
          }
          return {
            sessions: {
              ...state.sessions,
              selectedFolderID,
            },
          }
        }),
      setSessionCanvasUnreadBySession: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            sessionCanvasUnreadBySession: resolveStateUpdate(
              state.sessions.sessionCanvasUnreadBySession,
              update,
            ),
          },
        })),
      setWorkspaces: (update) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            workspaces: sortWorkspaceGroups(
              resolveStateUpdate(state.sessions.workspaces, update),
              state.sessions.pinnedWorkspaceIDs,
            ),
          },
        })),
    },
    composerActions: {
      setComposerAttachmentsByTabKey: (update) =>
        set((state) => ({
          composer: {
            ...state.composer,
            composerAttachmentsByTabKey: resolveStateUpdate(state.composer.composerAttachmentsByTabKey, update),
          },
        })),
      setComposerDraftStateByTabKey: (update) =>
        set((state) => ({
          composer: {
            ...state.composer,
            composerDraftStateByTabKey: resolveStateUpdate(state.composer.composerDraftStateByTabKey, update),
          },
        })),
      setComposerRefreshVersion: (update) =>
        set((state) => ({
          composer: {
            ...state.composer,
            composerRefreshVersion: resolveStateUpdate(state.composer.composerRefreshVersion, update),
          },
        })),
      setIsCreatingSessionByTabKey: (update) =>
        set((state) => ({
          composer: {
            ...state.composer,
            isCreatingSessionByTabKey: resolveStateUpdate(state.composer.isCreatingSessionByTabKey, update),
          },
        })),
      setIsSendingByTabKey: (update) =>
        set((state) => ({
          composer: {
            ...state.composer,
            isSendingByTabKey: resolveStateUpdate(state.composer.isSendingByTabKey, update),
          },
        })),
    },
    agentStreamActions: {
      setAgentSessions: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            agentSessions: resolveStateUpdate(state.agentStream.agentSessions, update),
          },
        })),
      setCancellingSessionIDs: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            cancellingSessionIDs: resolveStateUpdate(state.agentStream.cancellingSessionIDs, update),
          },
        })),
      setContextUsageBySession: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            contextUsageBySession: resolveStateUpdate(state.agentStream.contextUsageBySession, update),
          },
        })),
      setConversations: (update) =>
        set((state) => {
          const previousActivityBySession = state.agentStream.conversationStore.getActivityBySession()
          const didUpdate = state.agentStream.conversationStore.updateConversations(update)
          if (!didUpdate) return state

          const conversationActivityBySession = state.agentStream.conversationStore.getActivityBySession()
          if (conversationActivityMapsAreEqual(previousActivityBySession, conversationActivityBySession)) {
            return state
          }

          return {
            agentStream: {
              ...state.agentStream,
              conversationActivityBySession,
              conversations: state.agentStream.conversationStore.getConversations(),
            },
          }
        }),
      setPendingPermissionRequestsBySession: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            pendingPermissionRequestsBySession: resolveStateUpdate(
              state.agentStream.pendingPermissionRequestsBySession,
              update,
            ),
          },
        })),
      setPermissionRequestActionError: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            permissionRequestActionError: resolveStateUpdate(state.agentStream.permissionRequestActionError, update),
          },
        })),
      setPermissionRequestActionRequestID: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            permissionRequestActionRequestID: resolveStateUpdate(
              state.agentStream.permissionRequestActionRequestID,
              update,
            ),
          },
        })),
      setSessionDirectoryBySession: (update) =>
        set((state) => ({
          agentStream: {
            ...state.agentStream,
            sessionDirectoryBySession: resolveStateUpdate(state.agentStream.sessionDirectoryBySession, update),
          },
        })),
    },
    reviewActions: {
      setPreviewByWorkspaceID: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            previewByWorkspaceID: resolveStateUpdate(state.review.previewByWorkspaceID, update),
          },
        })),
      setSelectedDiffFileBySession: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            selectedDiffFileBySession: resolveStateUpdate(state.review.selectedDiffFileBySession, update),
          },
        })),
      setSessionDiffBySession: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            sessionDiffBySession: resolveStateUpdate(state.review.sessionDiffBySession, update),
          },
        })),
      setSessionDiffStateBySession: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            sessionDiffStateBySession: resolveStateUpdate(state.review.sessionDiffStateBySession, update),
          },
        })),
      setSessionRuntimeDebugBySession: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            sessionRuntimeDebugBySession: resolveStateUpdate(state.review.sessionRuntimeDebugBySession, update),
          },
        })),
      setSessionRuntimeDebugStateBySession: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            sessionRuntimeDebugStateBySession: resolveStateUpdate(state.review.sessionRuntimeDebugStateBySession, update),
          },
        })),
      setWorkspaceFileCommentsByTarget: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            workspaceFileCommentsByTarget: resolveStateUpdate(state.review.workspaceFileCommentsByTarget, update),
          },
        })),
      setWorkspaceFileReviewState: (update) =>
        set((state) => ({
          review: {
            ...state.review,
            workspaceFileReviewState: resolveStateUpdate(state.review.workspaceFileReviewState, update),
          },
        })),
    },
  }))
}

export function useWorkspaceStoreSelector<T>(
  store: WorkspaceStoreApi,
  selector: (state: WorkspaceStore) => T,
  equalityFn?: (left: T, right: T) => boolean,
) {
  const storeRef = useRef(store)
  const latestSelectorRef = useRef(selector)
  const latestEqualityRef = useRef(equalityFn ?? Object.is)
  const latestSelectionRef = useRef<T | null>(null)
  const hasSelectionRef = useRef(false)

  if (storeRef.current !== store) {
    storeRef.current = store
    latestSelectionRef.current = null
    hasSelectionRef.current = false
  }

  latestSelectorRef.current = selector
  latestEqualityRef.current = equalityFn ?? Object.is

  const getSnapshot = () => {
    const nextSelection = latestSelectorRef.current(storeRef.current.getState())
    if (
      hasSelectionRef.current &&
      latestEqualityRef.current(latestSelectionRef.current as T, nextSelection)
    ) {
      return latestSelectionRef.current as T
    }

    hasSelectionRef.current = true
    latestSelectionRef.current = nextSelection
    return nextSelection
  }

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

export function shallowEqualObjects<T extends Record<string, unknown>>(left: T, right: T) {
  if (Object.is(left, right)) return true
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Object.is(left[key], right[key]))
}

export function shallowEqualArrays<T>(left: readonly T[], right: readonly T[]) {
  if (Object.is(left, right)) return true
  if (left.length !== right.length) return false
  return left.every((item, index) => Object.is(item, right[index]))
}

export const workspaceStoreSelectors = {
  activeSessionReviewState: (state: WorkspaceStore) => ({
    previewByWorkspaceID: state.review.previewByWorkspaceID,
    selectedDiffFileBySession: state.review.selectedDiffFileBySession,
    sessionDiffBySession: state.review.sessionDiffBySession,
    sessionDiffStateBySession: state.review.sessionDiffStateBySession,
    sessionRuntimeDebugBySession: state.review.sessionRuntimeDebugBySession,
    sessionRuntimeDebugStateBySession: state.review.sessionRuntimeDebugStateBySession,
  }),
  composerStateForTab:
    (tabKey: string | null) =>
    (state: WorkspaceStore) => ({
      attachments: tabKey ? state.composer.composerAttachmentsByTabKey[tabKey] ?? [] : [],
      draftState: tabKey ? state.composer.composerDraftStateByTabKey[tabKey] : undefined,
      isCreatingSession: tabKey ? Boolean(state.composer.isCreatingSessionByTabKey[tabKey]) : false,
      isSending: tabKey ? Boolean(state.composer.isSendingByTabKey[tabKey]) : false,
    }),
  dockviewLayout: (state: WorkspaceStore) => state.workbench.dockviewLayout,
}
