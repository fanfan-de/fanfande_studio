import { useMemo } from "react"

export type DiffPreviewLineTone = "add" | "remove" | "context"
export type DiffViewMode = "unified" | "split"
type SplitDiffCellTone = DiffPreviewLineTone | "empty"

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

export interface DiffPreviewInlineRow {
  content: string
  tone: DiffPreviewLineTone
}

export interface DiffPreviewInlineHunk {
  header: string
  rows: DiffPreviewInlineRow[]
}

interface SplitDiffRow {
  newContent: string
  newLineNumber: number | null
  newTone: SplitDiffCellTone
  oldContent: string
  oldLineNumber: number | null
  oldTone: SplitDiffCellTone
}

const DIFF_HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ")
}

function isDiffPreviewLineTone(value: unknown): value is DiffPreviewLineTone {
  return value === "add" || value === "remove" || value === "context"
}

function normalizeInlinePreviewHunks(previewHunks: unknown): DiffPreviewInlineHunk[] {
  if (!Array.isArray(previewHunks)) return []

  return previewHunks.flatMap((hunk): DiffPreviewInlineHunk[] => {
    if (!hunk || typeof hunk !== "object") return []
    const record = hunk as { header?: unknown; rows?: unknown }
    if (!Array.isArray(record.rows)) return []

    const rows = record.rows.flatMap((row): DiffPreviewInlineRow[] => {
      if (!row || typeof row !== "object") return []
      const rowRecord = row as { content?: unknown; tone?: unknown }
      if (!isDiffPreviewLineTone(rowRecord.tone)) return []
      return [{
        content: typeof rowRecord.content === "string" ? rowRecord.content : String(rowRecord.content ?? ""),
        tone: rowRecord.tone,
      }]
    })
    if (rows.length === 0) return []

    return [{
      header: typeof record.header === "string" && record.header.trim() ? record.header : "Patch hunk",
      rows,
    }]
  })
}

function formatDiffRange(start: number, count: number) {
  if (count <= 0) return `line ${start}`
  if (count === 1) return `line ${start}`
  return `lines ${start}-${start + count - 1}`
}

export function parsePatchHunks(patch?: string): ParsedDiffHunk[] {
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

function buildSplitDiffRows(rows: ParsedDiffRow[]): SplitDiffRow[] {
  const splitRows: SplitDiffRow[] = []
  let index = 0

  while (index < rows.length) {
    const row = rows[index]
    if (!row) break

    if (row.tone === "context") {
      splitRows.push({
        oldLineNumber: row.oldLineNumber,
        oldContent: row.content,
        oldTone: "context",
        newLineNumber: row.newLineNumber,
        newContent: row.content,
        newTone: "context",
      })
      index += 1
      continue
    }

    const removedRows: ParsedDiffRow[] = []
    const addedRows: ParsedDiffRow[] = []

    while (rows[index]?.tone === "remove") {
      removedRows.push(rows[index])
      index += 1
    }

    while (rows[index]?.tone === "add") {
      addedRows.push(rows[index])
      index += 1
    }

    const pairedRowCount = Math.max(removedRows.length, addedRows.length)
    for (let pairIndex = 0; pairIndex < pairedRowCount; pairIndex += 1) {
      const removedRow = removedRows[pairIndex]
      const addedRow = addedRows[pairIndex]
      splitRows.push({
        oldLineNumber: removedRow?.oldLineNumber ?? null,
        oldContent: removedRow?.content ?? "",
        oldTone: removedRow ? "remove" : "empty",
        newLineNumber: addedRow?.newLineNumber ?? null,
        newContent: addedRow?.content ?? "",
        newTone: addedRow ? "add" : "empty",
      })
    }
  }

  return splitRows
}

export interface DiffPreviewProps {
  className?: string
  emptyClassName?: string
  emptyMessage?: string
  file: string
  isFullHeight?: boolean
  onToggleFullHeight?: () => void
  patch?: string
  previewHunks?: DiffPreviewInlineHunk[]
  viewMode?: DiffViewMode
}

export function DiffPreview({
  className,
  emptyClassName,
  emptyMessage = "No line-by-line preview is available.",
  file,
  isFullHeight = false,
  onToggleFullHeight,
  patch,
  previewHunks,
  viewMode = "unified",
}: DiffPreviewProps) {
  const hunks = useMemo(() => parsePatchHunks(patch), [patch])
  const inlinePreviewHunks = useMemo(
    () => normalizeInlinePreviewHunks(previewHunks),
    [previewHunks],
  )
  const hasPatchPreview = Boolean(patch?.trim() && hunks.length > 0)
  const usesInlinePreview = !hasPatchPreview && inlinePreviewHunks.length > 0
  const splitHunks = useMemo(
    () => hunks.map((hunk) => ({
      header: hunk.header,
      rows: buildSplitDiffRows(hunk.rows),
    })),
    [hunks],
  )

  if (!hasPatchPreview && !usesInlinePreview) {
    return (
      <div className={joinClassNames("right-sidebar-diff-empty", emptyClassName)}>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div
      className={joinClassNames(
        "right-sidebar-diff-preview",
        isFullHeight && "is-full-height",
        className,
      )}
      role="region"
      aria-label={`Diff preview for ${file}`}
    >
      <div
        className={joinClassNames(
          "right-sidebar-diff-code",
          viewMode === "split" && !usesInlinePreview && "is-split",
          usesInlinePreview && "is-inline-preview",
        )}
      >
        {usesInlinePreview ? inlinePreviewHunks.map((hunk, hunkIndex) => (
          <section key={`${file}-preview-hunk-${hunkIndex}`} className="right-sidebar-diff-hunk" aria-label={hunk.header}>
            <div className="right-sidebar-diff-hunk-header">{hunk.header}</div>
            {hunk.rows.map((row, rowIndex) => (
              <div
                key={`${file}-${hunkIndex}-preview-${rowIndex}`}
                className={`right-sidebar-diff-row is-${row.tone} is-inline-preview`}
              >
                <span className="right-sidebar-diff-content">{row.content || " "}</span>
              </div>
            ))}
          </section>
        )) : hunks.map((hunk, hunkIndex) => (
          <section key={`${file}-hunk-${hunkIndex}`} className="right-sidebar-diff-hunk" aria-label={hunk.header}>
            <div className="right-sidebar-diff-hunk-header">{hunk.header}</div>
            {viewMode === "split"
              ? splitHunks[hunkIndex]?.rows.map((row, rowIndex) => (
                <div
                  key={`${file}-${hunkIndex}-split-${rowIndex}`}
                  className={`right-sidebar-split-diff-row is-old-${row.oldTone} is-new-${row.newTone}`}
                >
                  <span className="right-sidebar-diff-line-number" aria-hidden="true">
                    {row.oldLineNumber ?? ""}
                  </span>
                  <span className={`right-sidebar-split-diff-content is-${row.oldTone}`}>
                    {row.oldContent || " "}
                  </span>
                  <span className="right-sidebar-diff-line-number" aria-hidden="true">
                    {row.newLineNumber ?? ""}
                  </span>
                  <span className={`right-sidebar-split-diff-content is-${row.newTone}`}>
                    {row.newContent || " "}
                  </span>
                </div>
              ))
              : hunk.rows.map((row, rowIndex) => (
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
      {onToggleFullHeight ? (
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
      ) : null}
    </div>
  )
}
