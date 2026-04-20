import { useEffect, useState, type ChangeEvent } from "react"
import { PlusIcon } from "../icons"
import type { WorkspaceFileReviewState } from "../types"
import { formatTime } from "../utils"

interface WorkspaceFilesPanelProps {
  scopeDirectory: string | null
  scopeName: string | null
  state: WorkspaceFileReviewState
  onPendingCommentCancel: () => void
  onPendingCommentChange: (text: string) => void
  onPendingCommentStart: (lineNumber: number) => void
  onPendingCommentSubmit: () => void
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

export function WorkspaceFilesPanel({
  scopeDirectory,
  scopeName,
  state,
  onPendingCommentCancel,
  onPendingCommentChange,
  onPendingCommentStart,
  onPendingCommentSubmit,
  onQueryChange,
  onSelectFile,
}: WorkspaceFilesPanelProps) {
  const [hoveredLineNumber, setHoveredLineNumber] = useState<number | null>(null)
  const fileLines = state.selectedFileContent?.split(/\r?\n/) ?? []
  const commentsByLine = new Map<number, typeof state.comments>()

  for (const comment of state.comments) {
    const currentComments = commentsByLine.get(comment.lineNumber) ?? []
    commentsByLine.set(comment.lineNumber, [...currentComments, comment])
  }

  useEffect(() => {
    setHoveredLineNumber(null)
  }, [state.selectedFilePath, state.pendingComment?.lineNumber])

  return (
    <section className="right-sidebar-section workspace-files-panel">
      <div className="right-sidebar-panel-header">
        <div className="right-sidebar-panel-copy">
          <span className="label">Workspace Files</span>
          <h3>Focused project browser</h3>
          {scopeDirectory ? (
            <p className="right-sidebar-scope">
              Scope:
              {" "}
              <code>{scopeDirectory}</code>
            </p>
          ) : scopeName ? (
            <p className="right-sidebar-scope">{scopeName}</p>
          ) : null}
        </div>
      </div>

      <label className="right-sidebar-search-field workspace-files-search-field">
        <span className="label">Search</span>
        <input
          aria-label="Search workspace files"
          type="search"
          value={state.query}
          placeholder="Match file names"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
        />
      </label>

      <section className="workspace-files-results-panel" aria-label="Workspace file search results">
        <div className="workspace-files-panel-header">
          <span className="label">Matches</span>
          {state.query.trim() ? <strong>{String(state.results.length)}</strong> : null}
        </div>

        {state.status === "searching" ? (
          <div className="right-sidebar-empty">
            <p>Searching file names in the focused workspace.</p>
          </div>
        ) : !scopeDirectory ? (
          <div className="right-sidebar-empty">
            <p>Select a workspace to start searching.</p>
          </div>
        ) : !state.query.trim() ? (
          <div className="right-sidebar-empty">
            <p>Type a file name to search inside the current workspace.</p>
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
                  onClick={() => onSelectFile(result.path)}
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
      </section>

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
              const isCommenting = state.pendingComment?.lineNumber === lineNumber
              const lineComments = commentsByLine.get(lineNumber) ?? []
              const showCommentAction = hoveredLineNumber === lineNumber || isCommenting

              return (
                <div key={`${state.selectedFilePath}:${lineNumber}`} className="workspace-files-code-block">
                  <div
                    className={showCommentAction ? "workspace-files-line is-hovered" : "workspace-files-line"}
                    data-testid={`workspace-file-line-${lineNumber}`}
                    onMouseEnter={() => setHoveredLineNumber(lineNumber)}
                    onMouseLeave={() => setHoveredLineNumber((current) => (current === lineNumber ? null : current))}
                  >
                    <div className="workspace-files-line-gutter">
                      <span className="workspace-files-line-number">{String(lineNumber)}</span>
                      {showCommentAction ? (
                        <button
                          type="button"
                          className="workspace-files-line-comment-button"
                          aria-label={`Add comment on line ${String(lineNumber)}`}
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

                  {isCommenting ? (
                    <div className="workspace-files-comment-composer">
                      <label className="preview-comment-label">
                        <span className="label">Comment</span>
                        <textarea
                          aria-label={`File comment on line ${String(lineNumber)}`}
                          rows={3}
                          placeholder={`Leave feedback for line ${String(lineNumber)}`}
                          value={state.pendingComment?.text ?? ""}
                          onChange={(event) => onPendingCommentChange(event.target.value)}
                        />
                      </label>
                      <div className="right-sidebar-toolbar">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={!state.pendingComment?.text.trim()}
                          onClick={() => onPendingCommentSubmit()}
                        >
                          Annotate
                        </button>
                        <button type="button" className="secondary-button" onClick={() => onPendingCommentCancel()}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {lineComments.length > 0 ? (
                    <div className="workspace-files-line-comments">
                      {lineComments.map((comment) => (
                        <article key={comment.id} className="workspace-files-line-comment">
                          <div className="workspace-files-line-comment-meta">
                            <strong>Line {String(comment.lineNumber)}</strong>
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
