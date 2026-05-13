import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { DiffPreview, type DiffViewMode } from "../diff/DiffPreview"
import { ResetIcon } from "../icons"
import type { SessionDiffState, SessionDiffSummary, SessionSummary } from "../types"

const CHANGES_IDLE_STATE: SessionDiffState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

export interface ChangesPanelProps {
  activeSession: SessionSummary | null
  activeSessionDiff: SessionDiffSummary | null
  activeSessionDiffState?: SessionDiffState
  selectedDiffFile: string | null
  onDiffFileSelect: (file: string | null) => void
  onDiffFileRestore: (file: string) => void | Promise<void>
}

export function ChangesPanel({
  activeSession,
  activeSessionDiff,
  activeSessionDiffState,
  selectedDiffFile,
  onDiffFileSelect,
  onDiffFileRestore,
}: ChangesPanelProps) {
  const [isSelectedDiffFullHeight, setIsSelectedDiffFullHeight] = useState(false)
  const [restoringFile, setRestoringFile] = useState<string | null>(null)
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null)
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("unified")

  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const diffState = activeSessionDiffState ?? CHANGES_IDLE_STATE
  const diffs = activeSessionDiff?.diffs ?? []
  const hasWorkspaceChanges = Boolean(activeSessionDiff && activeSessionDiff.diffs.length > 0)

  useEffect(() => {
    setRestoringFile(null)
    setRestoreErrorMessage(null)
  }, [activeSession?.id])

  useEffect(() => {
    setIsSelectedDiffFullHeight(false)
  }, [selectedDiffFile])

  useEffect(() => {
    if (!selectedDiffFile || !activeSessionDiff?.diffs.some((diff) => diff.file === selectedDiffFile)) {
      if (selectedDiffFile !== null) {
        onDiffFileSelect(null)
      }
    }
  }, [activeSessionDiff, onDiffFileSelect, selectedDiffFile])

  function focusRowAtIndex(index: number) {
    if (diffs.length === 0) return
    const clamped = Math.max(0, Math.min(diffs.length - 1, index))
    const target = diffs[clamped]
    if (!target) return
    const node = rowRefs.current.get(target.file)
    node?.focus()
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        focusRowAtIndex(index + 1)
        return
      case "ArrowUp":
        event.preventDefault()
        focusRowAtIndex(index - 1)
        return
      case "Home":
        event.preventDefault()
        focusRowAtIndex(0)
        return
      case "End":
        event.preventDefault()
        focusRowAtIndex(diffs.length - 1)
        return
      default:
        return
    }
  }

  function handleSectionKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && selectedDiffFile) {
      event.preventDefault()
      onDiffFileSelect(null)
    }
  }

  async function handleRestoreClick(event: MouseEvent<HTMLButtonElement>, file: string) {
    event.preventDefault()
    event.stopPropagation()

    setRestoringFile(file)
    setRestoreErrorMessage(null)
    try {
      await onDiffFileRestore(file)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRestoreErrorMessage(message)
    } finally {
      setRestoringFile((current) => current === file ? null : current)
    }
  }

  function registerRowRef(file: string) {
    return (node: HTMLButtonElement | null) => {
      if (node) {
        rowRefs.current.set(file, node)
      } else {
        rowRefs.current.delete(file)
      }
    }
  }

  return (
    <section className="right-sidebar-section right-sidebar-changes-panel" onKeyDown={handleSectionKeyDown}>
      <div className="right-sidebar-changes-menu" role="toolbar" aria-label="Diff display options">
        <div className="right-sidebar-diff-view-toggle" role="group" aria-label="Diff view mode">
          <button
            type="button"
            className={diffViewMode === "unified" ? "right-sidebar-diff-view-button is-active" : "right-sidebar-diff-view-button"}
            aria-pressed={diffViewMode === "unified"}
            onClick={() => setDiffViewMode("unified")}
          >
            Unified
          </button>
          <button
            type="button"
            className={diffViewMode === "split" ? "right-sidebar-diff-view-button is-active" : "right-sidebar-diff-view-button"}
            aria-pressed={diffViewMode === "split"}
            onClick={() => setDiffViewMode("split")}
          >
            Split
          </button>
        </div>
      </div>

      {diffState.errorMessage ? (
        <p className="right-sidebar-status-error" role="alert">{diffState.errorMessage}</p>
      ) : null}
      {restoreErrorMessage ? (
        <p className="right-sidebar-status-error" role="alert">{restoreErrorMessage}</p>
      ) : null}

      {activeSession ? (
        <>
          {hasWorkspaceChanges ? (
            <div className="right-sidebar-change-list" role="list">
              {diffs.map((diff, index) => {
                const isExpanded = selectedDiffFile === diff.file
                const isRestoring = restoringFile === diff.file

                return (
                  <div
                    key={diff.file}
                    className={isExpanded ? "right-sidebar-change-row is-expanded" : "right-sidebar-change-row"}
                    role="listitem"
                  >
                    <div className="right-sidebar-change-line">
                      <button
                        ref={registerRowRef(diff.file)}
                        type="button"
                        className="right-sidebar-change-toggle"
                        aria-expanded={isExpanded}
                        aria-label={diff.file}
                        onClick={() => onDiffFileSelect(isExpanded ? null : diff.file)}
                        onKeyDown={(event) => handleRowKeyDown(event, index)}
                      >
                        <span className="right-sidebar-change-summary">
                          <strong className="right-sidebar-change-file">{diff.file}</strong>
                          <span className="right-sidebar-change-stats" aria-label={`${diff.additions} additions, ${diff.deletions} deletions`}>
                            <span className="right-sidebar-change-stat is-add">+{diff.additions}</span>
                            <span className="right-sidebar-change-stat is-remove">-{diff.deletions}</span>
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="right-sidebar-change-restore-button"
                        aria-label={`Restore ${diff.file}`}
                        disabled={isRestoring}
                        title="Restore file"
                        onClick={(event) => void handleRestoreClick(event, diff.file)}
                      >
                        <ResetIcon />
                      </button>
                    </div>
                    {isExpanded ? (
                      <DiffPreview
                        file={diff.file}
                        patch={diff.patch}
                        isFullHeight={isSelectedDiffFullHeight}
                        onToggleFullHeight={() => setIsSelectedDiffFullHeight((current) => !current)}
                        viewMode={diffViewMode}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : diffState.status === "loading" ? (
            <div className="right-sidebar-empty">
              <p>Loading workspace diff.</p>
            </div>
          ) : diffState.status === "error" ? (
            <div className="right-sidebar-empty">
              <p>Couldn't load workspace diff.</p>
            </div>
          ) : (
            <div className="right-sidebar-empty">
              <p>No changes in this session.</p>
            </div>
          )}
        </>
      ) : (
        <div className="right-sidebar-empty">
          <p>Select a session to inspect changes.</p>
        </div>
      )}
    </section>
  )
}
