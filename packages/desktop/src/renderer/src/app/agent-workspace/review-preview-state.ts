import { useRef, useState } from "react"
import type {
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  WorkspaceFileComment,
  WorkspaceFileReviewState,
  WorkspacePreviewState,
} from "../types"

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
  errorMessage: null,
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

export function useReviewPreviewState() {
  const sessionDiffRequestRef = useRef<Record<string, number>>({})
  const sessionDiffRefreshTimerRef = useRef<Record<string, number>>({})
  const runtimeDebugRequestRef = useRef<Record<string, number>>({})
  const runtimeDebugRefreshTimerRef = useRef<Record<string, number>>({})
  const workspaceFileSearchRequestRef = useRef(0)
  const workspaceFileReadRequestRef = useRef(0)

  const [previewByWorkspaceID, setPreviewByWorkspaceID] = useState<Record<string, WorkspacePreviewState>>({})
  const [workspaceFileCommentsByTarget, setWorkspaceFileCommentsByTarget] = useState<
    Record<string, WorkspaceFileComment[]>
  >({})
  const [workspaceFileReviewState, setWorkspaceFileReviewState] = useState<WorkspaceFileReviewState>(
    DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
  )
  const [sessionDiffBySession, setSessionDiffBySession] = useState<Record<string, SessionDiffSummary>>({})
  const [sessionDiffStateBySession, setSessionDiffStateBySession] = useState<Record<string, SessionDiffState>>({})
  const [sessionRuntimeDebugBySession, setSessionRuntimeDebugBySession] = useState<
    Record<string, SessionRuntimeDebugSnapshot>
  >({})
  const [sessionRuntimeDebugStateBySession, setSessionRuntimeDebugStateBySession] = useState<
    Record<string, SessionRuntimeDebugState>
  >({})
  const [selectedDiffFileBySession, setSelectedDiffFileBySession] = useState<Record<string, string | null>>({})

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
