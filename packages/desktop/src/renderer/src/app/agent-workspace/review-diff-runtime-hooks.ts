import { useEffect, type MutableRefObject } from "react"
import type {
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  WorkspaceFileReviewState,
} from "../types"
import { DEFAULT_SESSION_DIFF_STATE, DEFAULT_SESSION_RUNTIME_DEBUG_STATE, DEFAULT_WORKSPACE_FILE_REVIEW_STATE, resolveWorkspaceFileReviewStatus } from "./review-preview-state"
import { normalizeWorkspacePath } from "./workspace-loading-hooks"
import type { WorkspaceStateUpdater } from "./workspace-store"

const WORKSPACE_DIFF_REFRESH_DEBOUNCE_MS = 500

interface SessionDiffRequestStateInput {
  hasExistingSummary: boolean
  sessionID: string
  setSessionDiffStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionDiffState>>,
  ) => void
}

export function setSessionDiffRequestState({
  hasExistingSummary,
  sessionID,
  setSessionDiffStateBySession,
}: SessionDiffRequestStateInput) {
  setSessionDiffStateBySession((prev) => {
    const current = prev[sessionID] ?? DEFAULT_SESSION_DIFF_STATE
    return {
      ...prev,
      [sessionID]: {
        ...current,
        status: hasExistingSummary ? "refreshing" : "loading",
        errorMessage: null,
      },
    }
  })
}

export function clearSessionDiffRefreshTimer(
  sessionID: string,
  sessionDiffRefreshTimerRef: MutableRefObject<Record<string, number>>,
) {
  const timerID = sessionDiffRefreshTimerRef.current[sessionID]
  if (timerID === undefined) return
  window.clearTimeout(timerID)
  delete sessionDiffRefreshTimerRef.current[sessionID]
}

export function scheduleSessionDiffRefreshForSession({
  loadSessionDiffForSession,
  sessionDiffRefreshTimerRef,
  sessionID,
}: {
  loadSessionDiffForSession: (sessionID: string) => Promise<void>
  sessionDiffRefreshTimerRef: MutableRefObject<Record<string, number>>
  sessionID: string
}) {
  clearSessionDiffRefreshTimer(sessionID, sessionDiffRefreshTimerRef)
  sessionDiffRefreshTimerRef.current[sessionID] = window.setTimeout(() => {
    delete sessionDiffRefreshTimerRef.current[sessionID]
    void loadSessionDiffForSession(sessionID).catch((error) => {
      console.error("[desktop] workspace diff refresh failed:", error)
    })
  }, WORKSPACE_DIFF_REFRESH_DEBOUNCE_MS)
}

interface LoadSessionDiffInput {
  backendSessionID: string
  sessionDiffBySession: Record<string, SessionDiffSummary>
  sessionDiffRefreshTimerRef: MutableRefObject<Record<string, number>>
  sessionDiffRequestRef: MutableRefObject<Record<string, number>>
  sessionID: string
  setSessionDiffBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionDiffSummary>>,
  ) => void
  setSessionDiffStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionDiffState>>,
  ) => void
}

export async function loadSessionDiffForSession({
  backendSessionID,
  sessionDiffBySession,
  sessionDiffRefreshTimerRef,
  sessionDiffRequestRef,
  sessionID,
  setSessionDiffBySession,
  setSessionDiffStateBySession,
}: LoadSessionDiffInput) {
  const getSessionDiff = window.desktop?.getSessionDiff
  if (!getSessionDiff) return

  clearSessionDiffRefreshTimer(sessionID, sessionDiffRefreshTimerRef)
  const requestID = (sessionDiffRequestRef.current[sessionID] ?? 0) + 1
  sessionDiffRequestRef.current[sessionID] = requestID
  const hasExistingSummary = Boolean(sessionDiffBySession[sessionID])
  setSessionDiffRequestState({
    hasExistingSummary,
    sessionID,
    setSessionDiffStateBySession,
  })

  try {
    const nextDiff = await getSessionDiff({ sessionID: backendSessionID })
    if (sessionDiffRequestRef.current[sessionID] !== requestID) return

    setSessionDiffBySession((prev) => ({
      ...prev,
      [sessionID]: nextDiff,
    }))
    setSessionDiffStateBySession((prev) => ({
      ...prev,
      [sessionID]: {
        status: nextDiff.diffs.length > 0 ? "ready" : "empty",
        errorMessage: null,
        updatedAt: Date.now(),
        isStale: false,
      },
    }))
  } catch (error) {
    if (sessionDiffRequestRef.current[sessionID] !== requestID) return
    const message = error instanceof Error ? error.message : String(error)
    setSessionDiffStateBySession((prev) => {
      const current = prev[sessionID] ?? DEFAULT_SESSION_DIFF_STATE
      return {
        ...prev,
        [sessionID]: {
          ...current,
          status: "error",
          errorMessage: message,
          isStale: hasExistingSummary || current.isStale,
        },
      }
    })
    console.error("[desktop] getSessionDiff failed:", error)
  }
}

interface RuntimeDebugRequestStateInput {
  hasExistingSnapshot: boolean
  sessionID: string
  setSessionRuntimeDebugStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionRuntimeDebugState>>,
  ) => void
}

export function setSessionRuntimeDebugRequestState({
  hasExistingSnapshot,
  sessionID,
  setSessionRuntimeDebugStateBySession,
}: RuntimeDebugRequestStateInput) {
  setSessionRuntimeDebugStateBySession((prev) => {
    const current = prev[sessionID] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
    return {
      ...prev,
      [sessionID]: {
        ...current,
        status: hasExistingSnapshot ? "refreshing" : "loading",
        errorMessage: null,
      },
    }
  })
}

export function clearRuntimeDebugRefreshTimer(
  sessionID: string,
  runtimeDebugRefreshTimerRef: MutableRefObject<Record<string, number>>,
) {
  const timerID = runtimeDebugRefreshTimerRef.current[sessionID]
  if (timerID === undefined) return
  window.clearTimeout(timerID)
  delete runtimeDebugRefreshTimerRef.current[sessionID]
}

interface LoadSessionRuntimeDebugInput {
  backendSessionID: string
  runtimeDebugRefreshTimerRef: MutableRefObject<Record<string, number>>
  runtimeDebugRequestRef: MutableRefObject<Record<string, number>>
  sessionID: string
  sessionRuntimeDebugBySession: Record<string, SessionRuntimeDebugSnapshot>
  setSessionRuntimeDebugBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionRuntimeDebugSnapshot>>,
  ) => void
  setSessionRuntimeDebugStateBySession: (
    update: WorkspaceStateUpdater<Record<string, SessionRuntimeDebugState>>,
  ) => void
  options?: {
    limit?: number
    turns?: number
  }
}

export async function loadSessionRuntimeDebugForSession({
  backendSessionID,
  runtimeDebugRefreshTimerRef,
  runtimeDebugRequestRef,
  sessionID,
  sessionRuntimeDebugBySession,
  setSessionRuntimeDebugBySession,
  setSessionRuntimeDebugStateBySession,
  options,
}: LoadSessionRuntimeDebugInput) {
  const getSessionRuntimeDebug = window.desktop?.getSessionRuntimeDebug
  if (!getSessionRuntimeDebug) return

  clearRuntimeDebugRefreshTimer(sessionID, runtimeDebugRefreshTimerRef)

  const requestID = (runtimeDebugRequestRef.current[sessionID] ?? 0) + 1
  runtimeDebugRequestRef.current[sessionID] = requestID
  const hasExistingSnapshot = Boolean(sessionRuntimeDebugBySession[sessionID])
  setSessionRuntimeDebugRequestState({
    hasExistingSnapshot,
    sessionID,
    setSessionRuntimeDebugStateBySession,
  })

  try {
    const nextRuntimeDebug = await getSessionRuntimeDebug({
      sessionID: backendSessionID,
      limit: options?.limit,
      turns: options?.turns,
    })
    if (runtimeDebugRequestRef.current[sessionID] !== requestID) return

    setSessionRuntimeDebugBySession((prev) => ({
      ...prev,
      [sessionID]: nextRuntimeDebug,
    }))
    setSessionRuntimeDebugStateBySession((prev) => ({
      ...prev,
      [sessionID]: {
        status: "ready",
        errorMessage: null,
        updatedAt: Date.now(),
        isStale: false,
      },
    }))
  } catch (error) {
    if (runtimeDebugRequestRef.current[sessionID] !== requestID) return
    const message = error instanceof Error ? error.message : String(error)
    setSessionRuntimeDebugStateBySession((prev) => {
      const current = prev[sessionID] ?? DEFAULT_SESSION_RUNTIME_DEBUG_STATE
      return {
        ...prev,
        [sessionID]: {
          ...current,
          status: "error",
          errorMessage: message,
          isStale: hasExistingSnapshot || current.isStale,
        },
      }
    })
    console.error("[desktop] getSessionRuntimeDebug failed:", error)
  }
}

export function scheduleRuntimeDebugRefresh({
  backendSessionID,
  delayMs = 160,
  loadSessionRuntimeDebugForSession,
  runtimeDebugRefreshTimerRef,
  sessionID,
}: {
  backendSessionID: string
  delayMs?: number
  loadSessionRuntimeDebugForSession: (sessionID: string, backendSessionID: string) => Promise<void>
  runtimeDebugRefreshTimerRef: MutableRefObject<Record<string, number>>
  sessionID: string
}) {
  if (!window.desktop?.getSessionRuntimeDebug) return

  clearRuntimeDebugRefreshTimer(sessionID, runtimeDebugRefreshTimerRef)
  runtimeDebugRefreshTimerRef.current[sessionID] = window.setTimeout(() => {
    delete runtimeDebugRefreshTimerRef.current[sessionID]
    void loadSessionRuntimeDebugForSession(sessionID, backendSessionID).catch((error) => {
      console.error("[desktop] session runtime debug refresh failed:", error)
    })
  }, delayMs)
}

export function useActiveSessionReviewEffects({
  activeSessionID,
  agentSessions,
  canLoadSessionHistory,
  loadPendingPermissionRequestsForSession,
  loadSessionDiffForSession,
  loadSessionRuntimeDebugForSession,
}: {
  activeSessionID: string | null
  agentSessions: Record<string, string>
  canLoadSessionHistory: boolean
  loadPendingPermissionRequestsForSession: (sessionID: string) => Promise<void>
  loadSessionDiffForSession: (sessionID: string) => Promise<void>
  loadSessionRuntimeDebugForSession: (sessionID: string) => Promise<void>
}) {
  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadSessionDiffForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadSessionRuntimeDebugForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])

  useEffect(() => {
    if (!canLoadSessionHistory || !activeSessionID) return

    void loadPendingPermissionRequestsForSession(activeSessionID)
  }, [activeSessionID, canLoadSessionHistory, agentSessions])
}

export function useReviewRefreshCleanupEffect({
  clearRuntimeDebugRefreshTimer,
  clearSessionDiffRefreshTimer,
  runtimeDebugRefreshTimerRef,
  sessionDiffRefreshTimerRef,
}: {
  clearRuntimeDebugRefreshTimer: (sessionID: string) => void
  clearSessionDiffRefreshTimer: (sessionID: string) => void
  runtimeDebugRefreshTimerRef: MutableRefObject<Record<string, number>>
  sessionDiffRefreshTimerRef: MutableRefObject<Record<string, number>>
}) {
  useEffect(() => {
    return () => {
      for (const sessionID of Object.keys(sessionDiffRefreshTimerRef.current)) {
        clearSessionDiffRefreshTimer(sessionID)
      }
      for (const sessionID of Object.keys(runtimeDebugRefreshTimerRef.current)) {
        clearRuntimeDebugRefreshTimer(sessionID)
      }
    }
  }, [])
}

export function useWorkspaceFileReviewSearchEffects({
  activeWorkspaceFileScopeDirectory,
  deferredWorkspaceFileQuery,
  platform,
  setWorkspaceFileReviewState,
  workspaceFileReadRequestRef,
  workspaceFileReviewState,
  workspaceFileSearchRequestRef,
}: {
  activeWorkspaceFileScopeDirectory: string | null
  deferredWorkspaceFileQuery: string
  platform: string
  setWorkspaceFileReviewState: (update: WorkspaceStateUpdater<WorkspaceFileReviewState>) => void
  workspaceFileReadRequestRef: MutableRefObject<number>
  workspaceFileReviewState: WorkspaceFileReviewState
  workspaceFileSearchRequestRef: MutableRefObject<number>
}) {
  useEffect(() => {
    const nextScopeKey = activeWorkspaceFileScopeDirectory
      ? normalizeWorkspacePath(activeWorkspaceFileScopeDirectory, platform)
      : null

    setWorkspaceFileReviewState((current) => {
      const currentScopeKey = current.scopeDirectory ? normalizeWorkspacePath(current.scopeDirectory, platform) : null
      if (currentScopeKey === nextScopeKey) return current

      workspaceFileSearchRequestRef.current += 1
      workspaceFileReadRequestRef.current += 1
      return {
        ...DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
        scopeDirectory: activeWorkspaceFileScopeDirectory,
      }
    })
  }, [activeWorkspaceFileScopeDirectory, platform])

  useEffect(() => {
    const searchWorkspaceFiles = window.desktop?.searchWorkspaceFiles
    const scopeDirectory = workspaceFileReviewState.scopeDirectory
    const query = deferredWorkspaceFileQuery.trim()
    if (!searchWorkspaceFiles || !scopeDirectory) return

    if (!query) {
      setWorkspaceFileReviewState((current) => {
        const nextErrorMessage = current.selectedFileKind === "unsupported" ? current.errorMessage : null
        const nextState = {
          ...current,
          results: [],
          errorMessage: nextErrorMessage,
        }

        return {
          ...nextState,
          status: resolveWorkspaceFileReviewStatus(nextState),
        }
      })
      return
    }

    const requestID = workspaceFileSearchRequestRef.current + 1
    workspaceFileSearchRequestRef.current = requestID
    setWorkspaceFileReviewState((current) => ({
      ...current,
      errorMessage: current.selectedFileKind === "unsupported" ? current.errorMessage : null,
      status: "searching",
    }))

    searchWorkspaceFiles({
      directory: scopeDirectory,
      query,
    })
      .then((results) => {
        if (workspaceFileSearchRequestRef.current !== requestID) return

        setWorkspaceFileReviewState((current) => {
          const nextState = {
            ...current,
            results,
            errorMessage: current.selectedFileKind === "unsupported" ? current.errorMessage : null,
          }

          return {
            ...nextState,
            status: resolveWorkspaceFileReviewStatus(nextState),
          }
        })
      })
      .catch((error) => {
        if (workspaceFileSearchRequestRef.current !== requestID) return
        const message = error instanceof Error ? error.message : String(error)

        setWorkspaceFileReviewState((current) => ({
          ...current,
          results: [],
          errorMessage: message,
          status: "error",
        }))
        console.error("[desktop] searchWorkspaceFiles failed:", error)
      })
  }, [deferredWorkspaceFileQuery, platform, workspaceFileReviewState.scopeDirectory])
}
