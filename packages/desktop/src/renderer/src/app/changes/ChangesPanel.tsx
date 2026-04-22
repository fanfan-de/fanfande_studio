import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "../icons"
import type { SessionDiffState, SessionDiffSummary, SessionSummary } from "../types"
import { formatTime } from "../utils"

type DiffPreviewLineTone = "add" | "remove" | "context"
type DiffFilterKey = "all" | "added" | "modified" | "deleted" | "renamed"

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

const DIFF_FILTER_OPTIONS: Array<{ key: DiffFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "added", label: "Added" },
  { key: "modified", label: "Modified" },
  { key: "deleted", label: "Deleted" },
  { key: "renamed", label: "Renamed" },
]

function getDiffChangeType(diff: SessionDiffSummary["diffs"][number]): Exclude<DiffFilterKey, "all"> {
  const patch = diff.patch ?? ""

  if (/^rename from /m.test(patch) || /^rename to /m.test(patch)) return "renamed"
  if (/^new file mode /m.test(patch)) return "added"
  if (/^deleted file mode /m.test(patch)) return "deleted"
  if (diff.additions > 0 && diff.deletions === 0) return "added"
  if (diff.deletions > 0 && diff.additions === 0) return "deleted"
  return "modified"
}

function formatDiffChangeTypeLabel(type: Exclude<DiffFilterKey, "all">) {
  switch (type) {
    case "added":
      return "Added"
    case "deleted":
      return "Deleted"
    case "renamed":
      return "Renamed"
    default:
      return "Modified"
  }
}

function formatDiffStateLabel(status: SessionDiffState["status"]) {
  switch (status) {
    case "loading":
      return "Loading"
    case "refreshing":
      return "Refreshing"
    case "ready":
      return "Up to date"
    case "empty":
      return "Clean"
    case "error":
      return "Refresh failed"
    default:
      return "Idle"
  }
}

function buildDiffStatusDescription(input: {
  activeSession: SessionSummary | null
  diffState: SessionDiffState
  diffSummary: SessionDiffSummary | null
}) {
  if (!input.activeSession) {
    return "Select a session to inspect its current workspace diff."
  }

  if (input.diffState.status === "loading") {
    return "Loading the current workspace diff for this session."
  }

  if (input.diffState.status === "refreshing") {
    return input.diffState.updatedAt
      ? `Refreshing the workspace diff. Last synced at ${formatTime(input.diffState.updatedAt)}.`
      : "Refreshing the workspace diff."
  }

  if (input.diffState.status === "error") {
    return input.diffState.updatedAt
      ? `The latest refresh failed. Showing the most recent snapshot from ${formatTime(input.diffState.updatedAt)}.`
      : "The workspace diff could not be loaded."
  }

  if (input.diffState.updatedAt) {
    return `Last synced at ${formatTime(input.diffState.updatedAt)}.`
  }

  if (input.diffSummary?.body) {
    return input.diffSummary.body
  }

  return "Inspect the current workspace snapshot for this session."
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
        ? `${formatDiffRange(oldStart, oldCount)} -> ${formatDiffRange(newStart, newCount)} 路 ${context}`
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
        <p>No line-by-line diff preview is available for {file}.</p>
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
  activeSessionDirectory: string | null
  activeSessionDiff: SessionDiffSummary | null
  activeSessionDiffState?: SessionDiffState
  selectedDiffFile: string | null
  onDiffFileSelect: (file: string | null) => void
  onDiffRefresh: () => void | Promise<void>
}

export function ChangesPanel({
  activeSession,
  activeSessionDirectory,
  activeSessionDiff,
  activeSessionDiffState,
  selectedDiffFile,
  onDiffFileSelect,
  onDiffRefresh,
}: ChangesPanelProps) {
  const [diffFilter, setDiffFilter] = useState<DiffFilterKey>("all")
  const [diffQuery, setDiffQuery] = useState("")
  const [isSelectedDiffFullHeight, setIsSelectedDiffFullHeight] = useState(false)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const diffState = activeSessionDiffState ?? CHANGES_IDLE_STATE
  const changedFilesCount = activeSessionDiff?.stats?.files ?? activeSessionDiff?.diffs.length ?? 0
  const additionsCount = activeSessionDiff?.stats?.additions ?? 0
  const deletionsCount = activeSessionDiff?.stats?.deletions ?? 0
  const hasWorkspaceChanges = Boolean(activeSessionDiff && activeSessionDiff.diffs.length > 0)

  const normalizedQuery = diffQuery.trim().toLowerCase()
  const filteredDiffs = useMemo(() => {
    return (activeSessionDiff?.diffs ?? []).filter((diff) => {
      const diffType = getDiffChangeType(diff)
      if (diffFilter !== "all" && diffType !== diffFilter) return false
      if (!normalizedQuery) return true
      return diff.file.toLowerCase().includes(normalizedQuery)
    })
  }, [activeSessionDiff, diffFilter, normalizedQuery])

  useEffect(() => {
    setDiffFilter("all")
    setDiffQuery("")
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

  const statusDescription = buildDiffStatusDescription({
    activeSession,
    diffState,
    diffSummary: activeSessionDiff,
  })

  function focusRowAtIndex(index: number) {
    if (filteredDiffs.length === 0) return
    const clamped = Math.max(0, Math.min(filteredDiffs.length - 1, index))
    const target = filteredDiffs[clamped]
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
        focusRowAtIndex(filteredDiffs.length - 1)
        return
      default:
        return
    }
  }

  function handleSectionKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    const activeTag = target?.tagName
    const isTypingInField =
      activeTag === "INPUT" || activeTag === "TEXTAREA" || (target?.isContentEditable ?? false)

    if (event.key === "/" && !isTypingInField) {
      if (!hasWorkspaceChanges) return
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
      return
    }

    if (event.key === "Escape") {
      if (isTypingInField && target === searchInputRef.current) {
        if (diffQuery.length > 0) {
          event.preventDefault()
          setDiffQuery("")
          return
        }
        event.preventDefault()
        searchInputRef.current?.blur()
        focusRowAtIndex(0)
        return
      }
      if (selectedDiffFile) {
        event.preventDefault()
        onDiffFileSelect(null)
        return
      }
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
    <section className="right-sidebar-section" onKeyDown={handleSectionKeyDown}>
      <div className="right-sidebar-panel-header">
        <div className="right-sidebar-panel-copy">
          <span className="label">Workspace Diff</span>
          <h3>Current session snapshot</h3>
          {activeSessionDirectory ? (
            <p className="right-sidebar-scope">
              Scope:
              {" "}
              <code>{activeSessionDirectory}</code>
            </p>
          ) : null}
        </div>
        <div className="right-sidebar-panel-actions">
          <button
            type="button"
            className="secondary-button right-sidebar-refresh-button"
            aria-label="Refresh workspace diff"
            disabled={!activeSession || diffState.status === "loading" || diffState.status === "refreshing"}
            onClick={() => void onDiffRefresh()}
          >
            {diffState.status === "loading" || diffState.status === "refreshing" ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="right-sidebar-status-row">
        <span className={`settings-badge right-sidebar-status-badge is-${diffState.status}`}>{formatDiffStateLabel(diffState.status)}</span>
        {activeSession ? <span className="settings-badge">{String(changedFilesCount)} files</span> : null}
        {diffState.isStale ? <span className="settings-badge">Stale</span> : null}
      </div>

      <p className="right-sidebar-status-copy">{statusDescription}</p>
      {activeSessionDiff?.title && activeSessionDiff.title !== activeSessionDiff.body ? (
        <p className="right-sidebar-status-summary">{activeSessionDiff.title}</p>
      ) : null}
      {diffState.errorMessage ? (
        <p className="right-sidebar-status-error" role="alert">{diffState.errorMessage}</p>
      ) : null}

      {activeSession ? (
        <>
          <div className="right-sidebar-meta-grid">
            <div className="right-sidebar-metric">
              <span className="right-sidebar-metric-label">Files</span>
              <strong>{String(changedFilesCount)}</strong>
            </div>
            <div className="right-sidebar-metric">
              <span className="right-sidebar-metric-label">Net</span>
              <strong>+{additionsCount} -{deletionsCount}</strong>
            </div>
          </div>

          {hasWorkspaceChanges ? (
            <>
              <div className="right-sidebar-toolbar">
                <div className="right-sidebar-filter-group" role="group" aria-label="Workspace diff filters">
                  {DIFF_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={diffFilter === option.key ? "right-sidebar-filter-chip is-active" : "right-sidebar-filter-chip"}
                      aria-pressed={diffFilter === option.key}
                      onClick={() => setDiffFilter(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <label className="right-sidebar-search-field">
                  <span className="label">Search</span>
                  <input
                    ref={searchInputRef}
                    aria-label="Search workspace diff files"
                    type="search"
                    value={diffQuery}
                    placeholder="Filter files (press / to focus)"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setDiffQuery(event.target.value)}
                  />
                </label>
              </div>

              {filteredDiffs.length > 0 ? (
                <div className="right-sidebar-change-list" role="list">
                  {filteredDiffs.map((diff, index) => {
                    const diffType = getDiffChangeType(diff)
                    const isExpanded = selectedDiffFile === diff.file

                    return (
                      <div key={diff.file} className="right-sidebar-change-row" role="listitem">
                        <button
                          ref={registerRowRef(diff.file)}
                          type="button"
                          className="right-sidebar-change-toggle"
                          aria-expanded={isExpanded}
                          aria-label={`Toggle diff for ${diff.file}`}
                          onClick={() => onDiffFileSelect(isExpanded ? null : diff.file)}
                          onKeyDown={(event) => handleRowKeyDown(event, index)}
                        >
                          <span className="right-sidebar-change-icon" aria-hidden="true">
                            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                          </span>
                          <div className="right-sidebar-change-copy">
                            <strong>{diff.file}</strong>
                            <span className="right-sidebar-change-meta">
                              <span className={`right-sidebar-change-type is-${diffType}`}>{formatDiffChangeTypeLabel(diffType)}</span>
                              <span className="right-sidebar-change-action">
                                {isExpanded ? "Hide diff" : "Show diff"}
                              </span>
                            </span>
                          </div>
                          <span className="right-sidebar-change-stat">
                            +{diff.additions} -{diff.deletions}
                          </span>
                        </button>
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
              ) : (
                <div className="right-sidebar-empty">
                  <p>No files match the current diff filters.</p>
                </div>
              )}
            </>
          ) : diffState.status === "loading" ? (
            <div className="right-sidebar-empty">
              <p>Loading workspace diff for this session.</p>
            </div>
          ) : diffState.status === "error" ? (
            <div className="right-sidebar-empty">
              <p>Couldn't refresh the current workspace diff.</p>
            </div>
          ) : (
            <div className="right-sidebar-empty">
              <p>No workspace changes were detected for this session.</p>
            </div>
          )}
        </>
      ) : (
        <div className="right-sidebar-empty">
          <p>Select a session to inspect its workspace diff.</p>
        </div>
      )}
    </section>
  )
}
