import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type MouseEvent as ReactMouseEvent } from "react"
import { PlusIcon } from "../icons"
import type { WorkspaceFileLineRange, WorkspaceFileReviewState } from "../types"
import { formatTime } from "../utils"
import { formatWorkspaceFileLineRangeLabel, normalizeWorkspaceFileLineRange } from "./utils"

interface WorkspaceFilesPanelProps {
  canInsertCommentsIntoDraft: boolean
  scopeDirectory: string | null
  scopeName: string | null
  state: WorkspaceFileReviewState
  onPendingCommentCancel: () => void
  onPendingCommentChange: (text: string) => void
  onPendingCommentConfirm: () => void
  onPendingCommentStart: (startLineNumber: number, endLineNumber?: number) => void
  onQueryChange: (value: string) => void
  onSelectFile: (path: string) => void
}

function getReaderEmptyStateCopy(state: WorkspaceFileReviewState, scopeDirectory: string | null) {
  if (!scopeDirectory) return "Select a workspace to browse files."
  if (state.status === "reading") return "Loading file preview."
  if (state.status === "error" && state.errorMessage) return state.errorMessage
  if (state.selectedFilePath && state.status === "unsupported") {
    return state.errorMessage ?? "This file type is not supported in the Files panel yet."
  }
  return "Pick a result to preview the file here."
}

function isLineWithinRange(range: WorkspaceFileLineRange | null, lineNumber: number) {
  if (!range) return false
  return lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber
}

export function WorkspaceFilesPanel({
  canInsertCommentsIntoDraft,
  scopeDirectory,
  scopeName,
  state,
  onPendingCommentCancel,
  onPendingCommentChange,
  onPendingCommentConfirm,
  onPendingCommentStart,
  onQueryChange,
  onSelectFile,
}: WorkspaceFilesPanelProps) {
  const [isResultsDropdownOpen, setIsResultsDropdownOpen] = useState(false)
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
  const hasSearchQuery = state.query.trim().length > 0
  const canShowResultsDropdown = state.status === "searching" || hasSearchQuery
  const showResultsDropdown = isResultsDropdownOpen && canShowResultsDropdown

  for (const comment of state.comments) {
    const currentComments = commentsByEndLine.get(comment.endLineNumber) ?? []
    commentsByEndLine.set(comment.endLineNumber, [...currentComments, comment])
  }

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
    const nextQuery = event.target.value
    setIsResultsDropdownOpen(nextQuery.trim().length > 0)
    onQueryChange(nextQuery)
  }

  function handleSearchFocus() {
    if (canShowResultsDropdown) setIsResultsDropdownOpen(true)
  }

  function handleSearchBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) return
    setIsResultsDropdownOpen(false)
  }

  function handleResultSelect(path: string) {
    setIsResultsDropdownOpen(false)
    onSelectFile(path)
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

  return (
    <section className="right-sidebar-section workspace-files-panel">
      <div className="workspace-files-search-shell" onBlur={handleSearchBlur}>
        <label className="right-sidebar-search-field workspace-files-search-field">
          <input
            aria-label="Search workspace files"
            type="search"
            value={state.query}
            placeholder="Match file names"
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
          />
        </label>

        {showResultsDropdown ? (
          <div className="workspace-files-results-dropdown" aria-label="Workspace file search results">
            {state.status === "searching" ? (
              <div className="right-sidebar-empty">
                <p>Searching file names in the focused workspace.</p>
              </div>
            ) : !scopeDirectory ? (
              <div className="right-sidebar-empty">
                <p>Select a workspace to start searching.</p>
              </div>
            ) : state.results.length > 0 ? (
              <div className="workspace-files-results-list">
                {state.results.map((result) => {
                  const isSelected = state.selectedFilePath === result.path

                  return (
                    <button
                      key={result.path}
                      type="button"
                      className={isSelected ? "workspace-files-result-row is-active" : "workspace-files-result-row"}
                      aria-pressed={isSelected}
                      onClick={() => handleResultSelect(result.path)}
                    >
                      <div className="workspace-files-result-copy">
                        <strong>{result.name}</strong>
                        <span>{result.path}</span>
                      </div>
                      {result.extension ? <span className="workspace-files-result-extension">{result.extension}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="right-sidebar-empty">
                <p>No files matched the current search.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <section className="workspace-files-reader" aria-label="Workspace file reader">
        <div className="workspace-files-panel-header">
          <div className="workspace-files-reader-title">
            <span className="label">Reader</span>
            <strong>{state.selectedFilePath ?? "No file selected"}</strong>
          </div>
          {state.comments.length > 0 ? <span className="settings-badge">{String(state.comments.length)} comments</span> : null}
        </div>

        {state.selectedFilePath && state.selectedFileContent !== null && state.selectedFileKind === "text" ? (
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
        ) : (
          <div className="right-sidebar-empty workspace-files-reader-empty">
            <p>{getReaderEmptyStateCopy(state, scopeDirectory)}</p>
          </div>
        )}
      </section>
    </section>
  )
}
