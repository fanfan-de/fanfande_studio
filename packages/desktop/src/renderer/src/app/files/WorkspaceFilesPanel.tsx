import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
} from "../icons"
import type {
  WorkspaceDirectoryEntry,
  WorkspaceFileLineRange,
  WorkspaceFileReviewState,
} from "../types"
import { formatTime } from "../utils"
import { formatWorkspaceFileLineRangeLabel, normalizeWorkspaceFileLineRange } from "./utils"

const ROOT_DIRECTORY_PATH = ""

interface WorkspaceFilesPanelProps {
  canInsertCommentsIntoDraft: boolean
  scopeDirectory: string | null
  scopeName: string | null
  state: WorkspaceFileReviewState
  onDirectoryLoad: (path: string) => void
  onDirectoryToggle: (path: string) => void
  onPendingCommentCancel: () => void
  onPendingCommentChange: (text: string) => void
  onPendingCommentConfirm: () => void
  onPendingCommentStart: (startLineNumber: number, endLineNumber?: number) => void
  onQueryChange: (value: string) => void
  onSelectFile: (path: string) => void
  onTreeInvalidate: (paths: string[]) => void
}

function normalizePathForCompare(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase()
}

function normalizeTreePath(path: string | null | undefined) {
  const normalized = path?.trim().replace(/\\/g, "/").replace(/\/+/g, "/") ?? ""
  if (!normalized || normalized === "." || normalized === "/") return ROOT_DIRECTORY_PATH
  return normalized.replace(/^\/+/, "").replace(/\/+$/, "")
}

function resolveWorkspaceRelativePath(scopeDirectory: string, changedPath: string) {
  const normalizedScope = normalizePathForCompare(scopeDirectory)
  const normalizedChangedPath = normalizePathForCompare(changedPath)
  if (normalizedChangedPath === normalizedScope) return ROOT_DIRECTORY_PATH
  if (!normalizedChangedPath.startsWith(`${normalizedScope}/`)) return null

  const normalizedOriginalScope = scopeDirectory.replace(/\\/g, "/").replace(/\/$/, "")
  const normalizedOriginalPath = changedPath.replace(/\\/g, "/")
  return normalizeTreePath(normalizedOriginalPath.slice(normalizedOriginalScope.length + 1))
}

function changedPathsIncludeSelectedFile(scopeDirectory: string, selectedFilePath: string, changedPaths: string[]) {
  const normalizedSelectedFilePath = normalizePathForCompare(selectedFilePath)
  return changedPaths.some((changedPath) => {
    const relativePath = resolveWorkspaceRelativePath(scopeDirectory, changedPath)
    if (relativePath === null) return false
    const normalizedRelativePath = normalizePathForCompare(relativePath)
    return (
      normalizedRelativePath === normalizedSelectedFilePath ||
      (normalizedRelativePath.length > 0 && normalizedSelectedFilePath.startsWith(`${normalizedRelativePath}/`))
    )
  })
}

function getReaderEmptyStateCopy(state: WorkspaceFileReviewState, scopeDirectory: string | null) {
  if (!scopeDirectory) return "Select a workspace to browse files."
  if (state.status === "reading") return "Loading file preview."
  if (state.status === "error" && state.errorMessage) return state.errorMessage
  if (state.selectedFilePath && state.status === "unsupported") {
    return state.errorMessage ?? "This file type is not supported in the Files panel yet."
  }
  return "从工作区目录树中选择文件"
}

function getCurrentPathLabel(filePath: string | null) {
  const normalizedPath = normalizeTreePath(filePath)
  if (!normalizedPath) return "/"
  const segments = normalizedPath.split("/").filter(Boolean)
  if (segments.length <= 1) return "/"
  segments.pop()
  return `/${segments.join("/")}`
}

function isLineWithinRange(range: WorkspaceFileLineRange | null, lineNumber: number) {
  if (!range) return false
  return lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber
}

function entryMatchesFilter(entry: WorkspaceDirectoryEntry, normalizedFilter: string) {
  if (!normalizedFilter) return true
  return `${entry.name} ${entry.path}`.toLowerCase().includes(normalizedFilter)
}

function getVisibleDirectoryEntries(
  directoryPath: string,
  state: WorkspaceFileReviewState,
  normalizedFilter: string,
): WorkspaceDirectoryEntry[] {
  const entries = state.treeEntriesByDirectoryPath[directoryPath] ?? []
  if (!normalizedFilter) return entries

  return entries.filter((entry) => {
    if (entryMatchesFilter(entry, normalizedFilter)) return true
    if (entry.kind !== "directory") return false
    return getVisibleDirectoryEntries(entry.path, state, normalizedFilter).length > 0
  })
}

function getFileBadgeLabel(extension: string | null) {
  switch (extension?.toLowerCase()) {
    case "ts":
      return "TS"
    case "tsx":
      return "TS"
    case "js":
    case "mjs":
    case "cjs":
      return "JS"
    case "jsx":
      return "JS"
    case "json":
      return "{}"
    case "md":
      return "M"
    case "css":
      return "#"
    case "html":
      return "<>"
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "IMG"
    default:
      return null
  }
}

function WorkspaceFileTreeIcon({ entry, isExpanded }: { entry: WorkspaceDirectoryEntry; isExpanded: boolean }) {
  if (entry.kind === "directory") {
    return isExpanded ? <FolderOpenIcon /> : <FolderIcon />
  }

  const badgeLabel = getFileBadgeLabel(entry.extension)
  if (badgeLabel) {
    return (
      <span className="workspace-files-tree-file-badge" data-extension={entry.extension ?? "file"} aria-hidden="true">
        {badgeLabel}
      </span>
    )
  }

  return <FileTextIcon />
}

interface WorkspaceFileTreeNodeProps {
  depth: number
  entry: WorkspaceDirectoryEntry
  normalizedFilter: string
  selectedFilePath: string | null
  state: WorkspaceFileReviewState
  onDirectoryLoad: (path: string) => void
  onDirectoryToggle: (path: string) => void
  onSelectFile: (path: string) => void
}

function WorkspaceFileTreeNode({
  depth,
  entry,
  normalizedFilter,
  selectedFilePath,
  state,
  onDirectoryLoad,
  onDirectoryToggle,
  onSelectFile,
}: WorkspaceFileTreeNodeProps) {
  const isDirectory = entry.kind === "directory"
  const isExpanded = isDirectory && state.treeExpandedDirectoryPaths.includes(entry.path)
  const isLoading = isDirectory && state.treeLoadingDirectoryPaths.includes(entry.path)
  const errorMessage = isDirectory ? state.treeErrorByDirectoryPath[entry.path] ?? null : null
  const hasLoadedChildren = isDirectory && Boolean(state.treeEntriesByDirectoryPath[entry.path])
  const visibleChildren = isDirectory
    ? getVisibleDirectoryEntries(entry.path, state, normalizedFilter)
    : []
  const shouldShowChildren = isDirectory && (isExpanded || Boolean(normalizedFilter))
  const isActive = entry.kind === "file" && selectedFilePath === entry.path

  useEffect(() => {
    if (!isDirectory || !isExpanded || isLoading || errorMessage || hasLoadedChildren) return
    onDirectoryLoad(entry.path)
  }, [entry.path, errorMessage, hasLoadedChildren, isDirectory, isExpanded, isLoading, onDirectoryLoad])

  return (
    <div className="workspace-files-tree-node">
      <button
        type="button"
        className={[
          "workspace-files-tree-row",
          isActive ? "is-active" : "",
          isDirectory ? "is-directory" : "is-file",
        ].filter(Boolean).join(" ")}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-pressed={entry.kind === "file" ? isActive : undefined}
        title={entry.path || entry.name}
        onClick={() => {
          if (isDirectory) {
            onDirectoryToggle(entry.path)
            return
          }
          onSelectFile(entry.path)
        }}
      >
        <span className="workspace-files-tree-chevron" aria-hidden="true">
          {isDirectory ? isExpanded || normalizedFilter ? <ChevronDownIcon /> : <ChevronRightIcon /> : null}
        </span>
        <span className="workspace-files-tree-icon" aria-hidden="true">
          <WorkspaceFileTreeIcon entry={entry} isExpanded={isExpanded || Boolean(normalizedFilter)} />
        </span>
        <span className="workspace-files-tree-name">{entry.name}</span>
      </button>

      {errorMessage ? <div className="workspace-files-tree-message">{errorMessage}</div> : null}
      {isLoading ? <div className="workspace-files-tree-message">Loading...</div> : null}
      {shouldShowChildren && visibleChildren.length > 0 ? (
        <div className="workspace-files-tree-children">
          {visibleChildren.map((child) => (
            <WorkspaceFileTreeNode
              key={`${child.kind}:${child.path}`}
              depth={depth + 1}
              entry={child}
              normalizedFilter={normalizedFilter}
              selectedFilePath={selectedFilePath}
              state={state}
              onDirectoryLoad={onDirectoryLoad}
              onDirectoryToggle={onDirectoryToggle}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceFilesPanel({
  canInsertCommentsIntoDraft,
  scopeDirectory,
  scopeName,
  state,
  onDirectoryLoad,
  onDirectoryToggle,
  onPendingCommentCancel,
  onPendingCommentChange,
  onPendingCommentConfirm,
  onPendingCommentStart,
  onQueryChange,
  onSelectFile,
  onTreeInvalidate,
}: WorkspaceFilesPanelProps) {
  const [hoveredLineNumber, setHoveredLineNumber] = useState<number | null>(null)
  const [dragSelection, setDragSelection] = useState<WorkspaceFileLineRange | null>(null)
  const dragSelectionRef = useRef<WorkspaceFileLineRange | null>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const fileLines = state.selectedFileContent?.split(/\r?\n/) ?? []
  const commentsByEndLine = new Map<number, typeof state.comments>()
  const pendingRange = state.pendingComment
    ? normalizeWorkspaceFileLineRange(state.pendingComment.startLineNumber, state.pendingComment.endLineNumber)
    : null
  const linkedRange = state.linkedLineRange
    ? normalizeWorkspaceFileLineRange(state.linkedLineRange.startLineNumber, state.linkedLineRange.endLineNumber)
    : null
  const highlightedRange = dragSelection ?? pendingRange ?? linkedRange
  const normalizedFilter = state.query.trim().toLowerCase()
  const rootEntries = getVisibleDirectoryEntries(ROOT_DIRECTORY_PATH, state, normalizedFilter)
  const isRootLoading = state.treeLoadingDirectoryPaths.includes(ROOT_DIRECTORY_PATH)
  const rootErrorMessage = state.treeErrorByDirectoryPath[ROOT_DIRECTORY_PATH] ?? null

  for (const comment of state.comments) {
    const currentComments = commentsByEndLine.get(comment.endLineNumber) ?? []
    commentsByEndLine.set(comment.endLineNumber, [...currentComments, comment])
  }

  useEffect(() => {
    if (!scopeDirectory) return
    if (state.treeEntriesByDirectoryPath[ROOT_DIRECTORY_PATH]) return
    if (state.treeLoadingDirectoryPaths.includes(ROOT_DIRECTORY_PATH)) return
    if (state.treeErrorByDirectoryPath[ROOT_DIRECTORY_PATH]) return
    onDirectoryLoad(ROOT_DIRECTORY_PATH)
  }, [
    onDirectoryLoad,
    scopeDirectory,
    state.treeEntriesByDirectoryPath,
    state.treeErrorByDirectoryPath,
    state.treeLoadingDirectoryPaths,
  ])

  useEffect(() => {
    const unsubscribe = window.desktop?.onWorkspaceFileChange?.((workspaceEvent) => {
      if (!scopeDirectory) return
      if (normalizePathForCompare(workspaceEvent.directory) !== normalizePathForCompare(scopeDirectory)) return

      onTreeInvalidate(workspaceEvent.paths)
      if (
        state.selectedFilePath &&
        changedPathsIncludeSelectedFile(scopeDirectory, state.selectedFilePath, workspaceEvent.paths)
      ) {
        onSelectFile(state.selectedFilePath)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [onSelectFile, onTreeInvalidate, scopeDirectory, state.selectedFilePath])

  useEffect(() => {
    setHoveredLineNumber(null)
    dragSelectionRef.current = null
    setDragSelection(null)
  }, [state.selectedFilePath, state.pendingComment?.startLineNumber, state.pendingComment?.endLineNumber])

  useEffect(() => {
    if (!linkedRange || state.selectedFileContent === null) return
    lineRefs.current.get(linkedRange.startLineNumber)?.scrollIntoView?.({
      block: "center",
      inline: "nearest",
    })
  }, [linkedRange?.startLineNumber, linkedRange?.endLineNumber, state.selectedFileContent, state.selectedFilePath])

  useEffect(() => {
    function finalizeDragSelection() {
      const selection = dragSelectionRef.current
      if (!selection) return

      const nextRange = normalizeWorkspaceFileLineRange(selection.startLineNumber, selection.endLineNumber)
      dragSelectionRef.current = null
      setDragSelection(null)
      if (nextRange.startLineNumber === nextRange.endLineNumber) return
      onPendingCommentStart(nextRange.startLineNumber, nextRange.endLineNumber)
    }

    window.addEventListener("mouseup", finalizeDragSelection)
    window.addEventListener("pointerup", finalizeDragSelection)
    return () => {
      window.removeEventListener("mouseup", finalizeDragSelection)
      window.removeEventListener("pointerup", finalizeDragSelection)
    }
  }, [onPendingCommentStart])

  function handleLineSelectionStart(lineNumber: number, event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const nextSelection = {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
    }
    dragSelectionRef.current = nextSelection
    setDragSelection(nextSelection)
  }

  function handleLineSelectionMove(lineNumber: number) {
    const currentSelection = dragSelectionRef.current
    if (!currentSelection) return

    const nextSelection = {
      ...currentSelection,
      endLineNumber: lineNumber,
    }
    dragSelectionRef.current = nextSelection
    setDragSelection(nextSelection)
  }

  function handleLineSelectionEnd() {
    const selection = dragSelectionRef.current
    if (!selection) return

    const nextRange = normalizeWorkspaceFileLineRange(selection.startLineNumber, selection.endLineNumber)
    dragSelectionRef.current = null
    setDragSelection(null)
    if (nextRange.startLineNumber === nextRange.endLineNumber) return
    onPendingCommentStart(nextRange.startLineNumber, nextRange.endLineNumber)
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    onQueryChange(event.target.value)
  }

  function registerLineRef(lineNumber: number) {
    return (node: HTMLDivElement | null) => {
      if (node) {
        lineRefs.current.set(lineNumber, node)
      } else {
        lineRefs.current.delete(lineNumber)
      }
    }
  }

  function renderTreeContent() {
    if (!scopeDirectory) {
      return <div className="workspace-files-tree-empty">Select a workspace to browse files.</div>
    }
    if (rootErrorMessage) {
      return <div className="workspace-files-tree-empty">{rootErrorMessage}</div>
    }
    if (isRootLoading && rootEntries.length === 0) {
      return <div className="workspace-files-tree-empty">Loading files...</div>
    }
    if (rootEntries.length === 0) {
      return (
        <div className="workspace-files-tree-empty">
          {normalizedFilter ? "No loaded files match the filter." : "No files found."}
        </div>
      )
    }

    return (
      <div className="workspace-files-tree-list" role="tree" aria-label="Workspace files">
        {rootEntries.map((entry) => (
          <WorkspaceFileTreeNode
            key={`${entry.kind}:${entry.path}`}
            depth={0}
            entry={entry}
            normalizedFilter={normalizedFilter}
            selectedFilePath={state.selectedFilePath}
            state={state}
            onDirectoryLoad={onDirectoryLoad}
            onDirectoryToggle={onDirectoryToggle}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    )
  }

  return (
    <section className="right-sidebar-section workspace-files-panel">
      <div className="workspace-files-pathbar" title={scopeDirectory ?? undefined}>
        <span className="workspace-files-pathbar-path">{getCurrentPathLabel(state.selectedFilePath)}</span>
        {scopeName ? <span className="workspace-files-pathbar-scope">{scopeName}</span> : null}
      </div>

      <div className="workspace-files-split">
        <section className="workspace-files-reader" aria-label="Workspace file reader">
          {state.selectedFilePath && state.selectedFileContent !== null && state.selectedFileKind === "text" ? (
            <>
              <div className="workspace-files-panel-header">
                <div className="workspace-files-reader-title">
                  <span className="label">Reader</span>
                  <strong>{state.selectedFilePath}</strong>
                </div>
                {state.comments.length > 0 ? <span className="settings-badge">{String(state.comments.length)} comments</span> : null}
              </div>

              <div className="workspace-files-code" role="presentation">
                {fileLines.map((line, index) => {
                  const lineNumber = index + 1
                  const isCommenting = isLineWithinRange(pendingRange, lineNumber)
                  const lineComments = commentsByEndLine.get(lineNumber) ?? []
                  const showCommentAction =
                    dragSelection === null &&
                    (hoveredLineNumber === lineNumber ||
                      (pendingRange?.startLineNumber === lineNumber && pendingRange.endLineNumber === lineNumber))
                  const lineLabel = pendingRange && isCommenting
                    ? formatWorkspaceFileLineRangeLabel(pendingRange.startLineNumber, pendingRange.endLineNumber)
                    : formatWorkspaceFileLineRangeLabel(lineNumber)
                  const commentTargetLabel = pendingRange && isCommenting
                    ? pendingRange.startLineNumber === pendingRange.endLineNumber
                      ? `对第 L${String(pendingRange.startLineNumber)} 行发表评论`
                      : `对第 L${String(pendingRange.startLineNumber)} 至第 L${String(pendingRange.endLineNumber)} 行发表评论`
                    : ""
                  const isSelectionHighlighted = isLineWithinRange(highlightedRange, lineNumber)
                  const isLinkedLine = isLineWithinRange(linkedRange, lineNumber)

                  return (
                    <div key={`${state.selectedFilePath}:${lineNumber}`} className="workspace-files-code-block">
                      <div
                        ref={registerLineRef(lineNumber)}
                        className={[
                          "workspace-files-line",
                          showCommentAction ? "is-hovered" : "",
                          isSelectionHighlighted ? "is-selected" : "",
                          isLinkedLine ? "is-linked" : "",
                        ].filter(Boolean).join(" ")}
                        data-testid={`workspace-file-line-${lineNumber}`}
                        onMouseEnter={() => setHoveredLineNumber(lineNumber)}
                        onMouseLeave={() => setHoveredLineNumber((current) => (current === lineNumber ? null : current))}
                      >
                        <div
                          className="workspace-files-line-gutter"
                          data-testid={`workspace-file-line-gutter-${lineNumber}`}
                          onMouseDown={(event) => handleLineSelectionStart(lineNumber, event)}
                          onMouseOver={() => handleLineSelectionMove(lineNumber)}
                          onMouseUp={() => handleLineSelectionEnd()}
                        >
                          <span className="workspace-files-line-number">{String(lineNumber)}</span>
                          {showCommentAction ? (
                            <button
                              type="button"
                              className="workspace-files-line-comment-button"
                              aria-label={`Add comment on line ${String(lineNumber)}`}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => onPendingCommentStart(lineNumber)}
                            >
                              <PlusIcon />
                            </button>
                          ) : null}
                        </div>
                        <pre className="workspace-files-line-content">
                          <code>{line.length > 0 ? line : " "}</code>
                        </pre>
                      </div>

                      {pendingRange?.endLineNumber === lineNumber ? (
                        <div className="workspace-files-comment-composer">
                          <div className="workspace-files-comment-editor">
                            <div className="workspace-files-comment-header">
                              <strong>本地评论</strong>
                              <span>{commentTargetLabel}</span>
                            </div>
                            <textarea
                              aria-label={`File comment on ${lineLabel.toLowerCase()}`}
                              rows={3}
                              placeholder="请求更改"
                              value={state.pendingComment?.text ?? ""}
                              onChange={(event) => onPendingCommentChange(event.target.value)}
                            />
                            <div className="workspace-files-comment-actions">
                              <button
                                type="button"
                                className="workspace-files-comment-cancel"
                                onClick={() => onPendingCommentCancel()}
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                className="workspace-files-comment-confirm"
                                disabled={!state.pendingComment?.text.trim() || !canInsertCommentsIntoDraft}
                                onClick={() => onPendingCommentConfirm()}
                              >
                                确认
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {lineComments.length > 0 ? (
                        <div className="workspace-files-line-comments">
                          {lineComments.map((comment) => (
                            <article key={comment.id} className="workspace-files-line-comment">
                              <div className="workspace-files-line-comment-meta">
                                <strong>{formatWorkspaceFileLineRangeLabel(comment.startLineNumber, comment.endLineNumber)}</strong>
                                <time>{formatTime(comment.createdAt)}</time>
                              </div>
                              <p>{comment.text}</p>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="workspace-files-open-empty">
              <FileTextIcon />
              <strong>{state.selectedFilePath ? "无法打开文件" : "打开文件"}</strong>
              <p>{getReaderEmptyStateCopy(state, scopeDirectory)}</p>
            </div>
          )}
        </section>

        <aside className="workspace-files-tree" aria-label="Workspace file tree">
          <label className="workspace-files-tree-search">
            <SearchIcon />
            <input
              aria-label="Filter workspace files"
              type="search"
              value={state.query}
              placeholder="筛选文件..."
              onChange={handleSearchChange}
            />
          </label>
          <div className="workspace-files-tree-scroll">
            {renderTreeContent()}
          </div>
        </aside>
      </div>
    </section>
  )
}
