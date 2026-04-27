import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { ChevronDownIcon, ChevronRightIcon, ResetIcon } from "../icons"
import type { SessionDiffState, SessionDiffSummary, SessionSummary } from "../types"

type DiffPreviewLineTone = "add" | "remove" | "context"

interface ParsedDiffRow {
  content: string
  newLineNumber: number | null
  oldLineNumber: number | null
  tone: DiffPreviewLineTone
}

interface ParsedDiffHunk {
  header: string
  rows: ParsedDiffRow[]
}

const DIFF_HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/

const CHANGES_IDLE_STATE: SessionDiffState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

function formatDiffRange(start: number, count: number) {
  if (count <= 0) return `line ${start}`
  if (count === 1) return `line ${start}`
  return `lines ${start}-${start + count - 1}`
}

function parsePatchHunks(patch?: string): ParsedDiffHunk[] {
  if (!patch?.trim()) return []

  const hunks: ParsedDiffHunk[] = []
  let activeHunk: ParsedDiffHunk | null = null
  let oldLineNumber = 0
  let newLineNumber = 0

  for (const rawLine of patch.split(/\r?\n/)) {
    const hunkMatch = rawLine.match(DIFF_HUNK_HEADER_PATTERN)
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1] ?? "0")
      const oldCount = Number(hunkMatch[2] ?? "1")
      const newStart = Number(hunkMatch[3] ?? "0")
      const newCount = Number(hunkMatch[4] ?? "1")
      const context = hunkMatch[5]?.trim()
      const header = context
        ? `${formatDiffRange(oldStart, oldCount)} -> ${formatDiffRange(newStart, newCount)} | ${context}`
        : `${formatDiffRange(oldStart, oldCount)} -> ${formatDiffRange(newStart, newCount)}`

      activeHunk = {
        header,
        rows: [],
      }
      hunks.push(activeHunk)
      oldLineNumber = oldStart
      newLineNumber = newStart
      continue
    }

    if (!activeHunk) continue
    if (!rawLine || rawLine === "\\ No newline at end of file") continue

    const prefix = rawLine[0]
    const content = rawLine.slice(1)

    if (prefix === " ") {
      activeHunk.rows.push({
        content,
        oldLineNumber,
        newLineNumber,
        tone: "context",
      })
      oldLineNumber += 1
      newLineNumber += 1
      continue
    }

    if (prefix === "-") {
      activeHunk.rows.push({
        content,
        oldLineNumber,
        newLineNumber: null,
        tone: "remove",
      })
      oldLineNumber += 1
      continue
    }

    if (prefix === "+") {
      activeHunk.rows.push({
        content,
        oldLineNumber: null,
        newLineNumber,
        tone: "add",
      })
      newLineNumber += 1
    }
  }

  return hunks.filter((hunk) => hunk.rows.length > 0)
}

interface DiffPreviewProps {
  file: string
  patch?: string
  isFullHeight: boolean
  onToggleFullHeight: () => void
}

function DiffPreview({ file, patch, isFullHeight, onToggleFullHeight }: DiffPreviewProps) {
  const hunks = useMemo(() => parsePatchHunks(patch), [patch])

  if (!patch?.trim() || hunks.length === 0) {
    return (
      <div className="right-sidebar-diff-empty">
        <p>No line-by-line preview is available.</p>
      </div>
    )
  }

  return (
    <div
      className={isFullHeight ? "right-sidebar-diff-preview is-full-height" : "right-sidebar-diff-preview"}
      role="region"
      aria-label={`Diff preview for ${file}`}
    >
      <div className="right-sidebar-diff-code">
        {hunks.map((hunk, hunkIndex) => (
          <section key={`${file}-hunk-${hunkIndex}`} className="right-sidebar-diff-hunk" aria-label={hunk.header}>
            <div className="right-sidebar-diff-hunk-header">{hunk.header}</div>
            {hunk.rows.map((row, rowIndex) => (
              <div key={`${file}-${hunkIndex}-${rowIndex}`} className={`right-sidebar-diff-row is-${row.tone}`}>
                <span className="right-sidebar-diff-line-number" aria-hidden="true">
                  {row.oldLineNumber ?? ""}
                </span>
                <span className="right-sidebar-diff-line-number" aria-hidden="true">
                  {row.newLineNumber ?? ""}
                </span>
                <span className="right-sidebar-diff-content">{row.content || " "}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="right-sidebar-diff-preview-footer">
        <button
          type="button"
          className="right-sidebar-diff-height-toggle"
          aria-pressed={isFullHeight}
          onClick={onToggleFullHeight}
        >
          {isFullHeight ? "Collapse diff" : "Expand diff"}
        </button>
      </div>
    </div>
  )
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
                        <span className="right-sidebar-change-icon" aria-hidden="true">
                          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </span>
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
