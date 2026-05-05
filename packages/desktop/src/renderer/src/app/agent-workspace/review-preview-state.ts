import { useRef } from "react"
import type {
  SessionDiffState,
  SessionRuntimeDebugState,
  WorkspaceFileReviewState,
  WorkspacePreviewState
} from "../types"
import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

const PREVIEW_FALLBACK_SCOPE_ID = "__preview_global__"

export const DEFAULT_SESSION_DIFF_STATE: SessionDiffState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

export const DEFAULT_SESSION_RUNTIME_DEBUG_STATE: SessionRuntimeDebugState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

export const DEFAULT_WORKSPACE_PREVIEW_STATE: WorkspacePreviewState = {
  draftUrl: "http://localhost:3000",
  committedUrl: null,
  mode: "browse",
  reloadToken: 0,
  errorKind: null,
  errorMessage: null,
  navigationHistory: [],
  navigationIndex: -1,
  comments: [],
}

export const DEFAULT_WORKSPACE_FILE_REVIEW_STATE: WorkspaceFileReviewState = {
  scopeDirectory: null,
  query: "",
  results: [],
  selectedFilePath: null,
  selectedFileContent: null,
  selectedFileKind: null,
  selectedFileExtension: null,
  status: "idle",
  errorMessage: null,
  comments: [],
  pendingComment: null,
}

export function resolvePreviewScopeID(workspaceID: string | null | undefined) {
  return workspaceID ?? PREVIEW_FALLBACK_SCOPE_ID
}

function normalizeWorkspacePath(value: string, platform: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
  return platform === "win32" ? normalized.toLowerCase() : normalized
}

export function getWorkspaceFileCommentKey(
  directory: string | null | undefined,
  filePath: string | null | undefined,
  platform: string,
) {
  if (!directory || !filePath) return null
  return `${normalizeWorkspacePath(directory, platform)}::${filePath.replace(/\\/g, "/")}`
}

export function resolveWorkspaceFileReviewStatus(
  state: Pick<
    WorkspaceFileReviewState,
    "errorMessage" | "query" | "results" | "selectedFileContent" | "selectedFileKind" | "selectedFilePath"
  >,
): WorkspaceFileReviewState["status"] {
  if (state.errorMessage) return "error"
  if (state.selectedFileKind === "unsupported") return "unsupported"
  if (state.selectedFilePath && state.selectedFileKind === "text" && state.selectedFileContent !== null) return "ready"
  if (state.query.trim() && state.results.length === 0) return "empty"
  return "idle"
}

export function useReviewPreviewState(store: WorkspaceStoreApi) {
  const sessionDiffRequestRef = useRef<Record<string, number>>({})
  const sessionDiffRefreshTimerRef = useRef<Record<string, number>>({})
  const runtimeDebugRequestRef = useRef<Record<string, number>>({})
  const runtimeDebugRefreshTimerRef = useRef<Record<string, number>>({})
  const workspaceFileSearchRequestRef = useRef(0)
  const workspaceFileReadRequestRef = useRef(0)

  const previewByWorkspaceID = useWorkspaceStoreSelector(store, (state) => state.review.previewByWorkspaceID)
  const selectedDiffFileBySession = useWorkspaceStoreSelector(store, (state) => state.review.selectedDiffFileBySession)
  const sessionDiffBySession = useWorkspaceStoreSelector(store, (state) => state.review.sessionDiffBySession)
  const sessionDiffStateBySession = useWorkspaceStoreSelector(store, (state) => state.review.sessionDiffStateBySession)
  const sessionRuntimeDebugBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.review.sessionRuntimeDebugBySession,
  )
  const sessionRuntimeDebugStateBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.review.sessionRuntimeDebugStateBySession,
  )
  const workspaceFileCommentsByTarget = useWorkspaceStoreSelector(
    store,
    (state) => state.review.workspaceFileCommentsByTarget,
  )
  const workspaceFileReviewState = useWorkspaceStoreSelector(store, (state) => state.review.workspaceFileReviewState)
  const setPreviewByWorkspaceID = useWorkspaceStoreSelector(store, (state) => state.reviewActions.setPreviewByWorkspaceID)
  const setSelectedDiffFileBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setSelectedDiffFileBySession,
  )
  const setSessionDiffBySession = useWorkspaceStoreSelector(store, (state) => state.reviewActions.setSessionDiffBySession)
  const setSessionDiffStateBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setSessionDiffStateBySession,
  )
  const setSessionRuntimeDebugBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setSessionRuntimeDebugBySession,
  )
  const setSessionRuntimeDebugStateBySession = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setSessionRuntimeDebugStateBySession,
  )
  const setWorkspaceFileCommentsByTarget = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setWorkspaceFileCommentsByTarget,
  )
  const setWorkspaceFileReviewState = useWorkspaceStoreSelector(
    store,
    (state) => state.reviewActions.setWorkspaceFileReviewState,
  )

  return {
    previewByWorkspaceID,
    runtimeDebugRefreshTimerRef,
    runtimeDebugRequestRef,
    selectedDiffFileBySession,
    sessionDiffBySession,
    sessionDiffRefreshTimerRef,
    sessionDiffRequestRef,
    sessionDiffStateBySession,
    sessionRuntimeDebugBySession,
    sessionRuntimeDebugStateBySession,
    setPreviewByWorkspaceID,
    setSelectedDiffFileBySession,
    setSessionDiffBySession,
    setSessionDiffStateBySession,
    setSessionRuntimeDebugBySession,
    setSessionRuntimeDebugStateBySession,
    setWorkspaceFileCommentsByTarget,
    setWorkspaceFileReviewState,
    workspaceFileCommentsByTarget,
    workspaceFileReadRequestRef,
    workspaceFileReviewState,
    workspaceFileSearchRequestRef,
  }
}
