import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { DiffPreview, type DiffViewMode } from "../diff/DiffPreview"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, MinimizeIcon, OpenInEditorIcon, PlusIcon, ResetIcon } from "../icons"
import type { SessionDiffScope, SessionDiffScopeOption, SessionDiffState, SessionDiffSummary, SessionSummary } from "../types"

const CHANGES_IDLE_STATE: SessionDiffState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

const SESSION_DIFF_SCOPE_ORDER: SessionDiffScope[] = [
  "git:unstaged",
  "git:staged",
  "git:commit",
  "git:branch",
  "session:last-turn",
]

const SESSION_DIFF_SCOPE_LABELS: Record<SessionDiffScope, string> = {
  "git:unstaged": "未暂存",
  "git:staged": "已暂存",
  "git:commit": "提交",
  "git:branch": "分支",
  "session:last-turn": "上轮对话",
}

type FileAction = "open-editor" | "restore" | "stage" | "unstage"

export interface ChangesPanelProps {
  activeSession: SessionSummary | null
  activeSessionDirectory: string | null
  activeSessionDiff: SessionDiffSummary | null
  activeSessionDiffState?: SessionDiffState
  selectedDiffFile: string | null
  onDiffFileSelect: (file: string | null) => void
  onDiffFileRestore: (file: string) => void | Promise<void>
  onDiffScopeLoad?: (scope: SessionDiffScope) => Promise<SessionDiffSummary>
}

function joinWorkspaceFilePath(directory: string, file: string) {
  const separator = directory.includes("\\") ? "\\" : "/"
  const root = directory.replace(/[\\/]+$/, "")
  const relativeFile = file.replace(/^[\\/]+/, "").replace(/[\\/]+/g, separator)
  return `${root}${separator}${relativeFile}`
}

function getDiffFileStageAction(scope: SessionDiffScope | null, diff: SessionDiffSummary["diffs"][number]) {
  if (scope === "git:unstaged") return "stage"
  if (scope === "git:staged") return "unstage"
  if (scope !== "session:last-turn") return null

  switch (diff.gitState) {
    case "mixed":
    case "unstaged":
    case "untracked":
      return "stage"
    case "staged":
      return "unstage"
    default:
      return null
  }
}

function formatPatchRestoreFailure(result: {
  restored: Array<{ file: string }>
  failed: Array<{ file: string; message: string }>
}) {
  const failedDetails = result.failed
    .map((failure) => `${failure.file}: ${failure.message}`)
    .join("; ")
  return `Restored ${result.restored.length} file(s); ${result.failed.length} file(s) could not be restored: ${failedDetails}`
}

function buildScopeOptions(
  displayDiff: SessionDiffSummary | null,
  activeSessionDiff: SessionDiffSummary | null,
  effectiveScope: SessionDiffScope | null,
): SessionDiffScopeOption[] {
  const sourceOptions = displayDiff?.availableScopes ?? activeSessionDiff?.availableScopes ?? []
  const sourceByScope = new Map(sourceOptions.map((option) => [option.scope, option]))

  return SESSION_DIFF_SCOPE_ORDER.map((scope) => {
    const source = sourceByScope.get(scope)
    if (source) return source

    return {
      scope,
      label: SESSION_DIFF_SCOPE_LABELS[scope],
      enabled: scope === "session:last-turn" || scope === effectiveScope || sourceOptions.length === 0,
      ...(scope === effectiveScope && displayDiff?.stats ? { count: displayDiff.stats.files } : {}),
      ...(scope === "git:commit" ? { hasChildren: true } : {}),
    }
  })
}

export function ChangesPanel({
  activeSession,
  activeSessionDirectory,
  activeSessionDiff,
  activeSessionDiffState,
  selectedDiffFile,
  onDiffFileSelect,
  onDiffFileRestore,
  onDiffScopeLoad,
}: ChangesPanelProps) {
  const [isSelectedDiffFullHeight, setIsSelectedDiffFullHeight] = useState(false)
  const [restoringFile, setRestoringFile] = useState<string | null>(null)
  const [pendingFileAction, setPendingFileAction] = useState<{ action: FileAction; file: string } | null>(null)
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null)
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("unified")
  const [selectedScope, setSelectedScope] = useState<SessionDiffScope | null>(null)
  const [scopedDiffByScope, setScopedDiffByScope] = useState<Partial<Record<SessionDiffScope, SessionDiffSummary>>>({})
  const [scopedDiffState, setScopedDiffState] = useState<SessionDiffState>(CHANGES_IDLE_STATE)
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false)

  const scopeButtonRef = useRef<HTMLButtonElement | null>(null)
  const scopeMenuRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const scopeRequestRef = useRef(0)
  const lastSessionIDRef = useRef<string | null>(null)

  const activeScope = activeSessionDiff?.scope ?? null
  const effectiveScope = selectedScope ?? activeScope
  const isUsingActiveDiff = !effectiveScope || activeScope === effectiveScope
  const scopedDiff = effectiveScope ? scopedDiffByScope[effectiveScope] ?? null : null
  const displayDiff = scopedDiff ?? (isUsingActiveDiff ? activeSessionDiff : null)
  const diffState = scopedDiff ? scopedDiffState : isUsingActiveDiff ? activeSessionDiffState ?? CHANGES_IDLE_STATE : scopedDiffState
  const diffs = displayDiff?.diffs ?? []
  const hasWorkspaceChanges = Boolean(displayDiff && displayDiff.diffs.length > 0)
  const restoreMode = displayDiff?.restoreMode ?? "git-file"
  const canRestoreFiles = restoreMode === "git-file" || restoreMode === "patch"
  const canOpenFilesInEditor = Boolean(activeSessionDirectory)
  const scopeOptions = buildScopeOptions(displayDiff, activeSessionDiff, effectiveScope)
  const selectedScopeOption = scopeOptions.find((option) => option.scope === effectiveScope)
  const selectedScopeLabel = selectedScopeOption?.label ?? (effectiveScope ? SESSION_DIFF_SCOPE_LABELS[effectiveScope] : "Changes")
  const selectedScopeCount = selectedScopeOption?.count ?? displayDiff?.stats?.files

  useEffect(() => {
    setRestoringFile(null)
    setRestoreErrorMessage(null)
    setScopedDiffByScope({})
    setScopedDiffState(CHANGES_IDLE_STATE)
    setIsScopeMenuOpen(false)
    setSelectedScope(activeSessionDiff?.scope ?? null)
    scopeRequestRef.current += 1
  }, [activeSession?.id])

  useEffect(() => {
    const sessionID = activeSession?.id ?? null
    if (lastSessionIDRef.current !== sessionID) {
      lastSessionIDRef.current = sessionID
      return
    }
    if (!selectedScope && activeSessionDiff?.scope) {
      setSelectedScope(activeSessionDiff.scope)
    }
  }, [activeSession?.id, activeSessionDiff?.scope, selectedScope])

  useEffect(() => {
    setIsSelectedDiffFullHeight(false)
  }, [selectedDiffFile])

  useEffect(() => {
    if (!selectedDiffFile || !displayDiff?.diffs.some((diff) => diff.file === selectedDiffFile)) {
      if (selectedDiffFile !== null) {
        onDiffFileSelect(null)
      }
    }
  }, [displayDiff, onDiffFileSelect, selectedDiffFile])

  useEffect(() => {
    if (!isScopeMenuOpen) return

    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (scopeMenuRef.current?.contains(target) || scopeButtonRef.current?.contains(target)) return
      setIsScopeMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsScopeMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isScopeMenuOpen])

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

  async function handleScopeSelect(scope: SessionDiffScope) {
    const option = scopeOptions.find((item) => item.scope === scope)
    if (option && !option.enabled) return

    setIsScopeMenuOpen(false)
    if (scope === effectiveScope) return

    setSelectedScope(scope)
    onDiffFileSelect(null)
    setRestoreErrorMessage(null)

    if (activeSessionDiff?.scope === scope || scopedDiffByScope[scope]) {
      return
    }

    if (!onDiffScopeLoad) {
      setScopedDiffState({
        status: "error",
        errorMessage: "Diff scope loader is unavailable.",
        updatedAt: null,
        isStale: false,
      })
      return
    }

    const requestID = scopeRequestRef.current + 1
    scopeRequestRef.current = requestID
    setScopedDiffState({
      status: "loading",
      errorMessage: null,
      updatedAt: null,
      isStale: false,
    })

    try {
      const nextDiff = await onDiffScopeLoad(scope)
      if (scopeRequestRef.current !== requestID) return
      setScopedDiffByScope((current) => ({
        ...current,
        [scope]: nextDiff,
      }))
      setScopedDiffState({
        status: nextDiff.diffs.length > 0 ? "ready" : "empty",
        errorMessage: null,
        updatedAt: Date.now(),
        isStale: false,
      })
    } catch (error) {
      if (scopeRequestRef.current !== requestID) return
      setScopedDiffState({
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: null,
        isStale: false,
      })
    }
  }

  async function refreshCurrentScope() {
    if (!effectiveScope || !onDiffScopeLoad) return

    const nextDiff = await onDiffScopeLoad(effectiveScope)
    setScopedDiffByScope((current) => ({
      ...current,
      [effectiveScope]: nextDiff,
    }))
    setScopedDiffState({
      status: nextDiff.diffs.length > 0 ? "ready" : "empty",
      errorMessage: null,
      updatedAt: Date.now(),
      isStale: false,
    })
  }

  async function handleRestoreClick(event: MouseEvent<HTMLButtonElement>, file: string) {
    event.preventDefault()
    event.stopPropagation()

    setRestoringFile(file)
    setRestoreErrorMessage(null)
    try {
      if (restoreMode === "patch") {
        const directory = activeSessionDirectory?.trim()
        if (!directory) {
          throw new Error("Select a session before restoring a file.")
        }

        const diff = diffs.find((item) => item.file === file)
        if (!diff) {
          throw new Error("The selected file is no longer available in this diff.")
        }

        const reverseApplyWorkspaceDiffPatches = window.desktop?.reverseApplyWorkspaceDiffPatches
        if (!reverseApplyWorkspaceDiffPatches) {
          throw new Error("Workspace diff reverse-apply bridge is unavailable.")
        }

        const result = await reverseApplyWorkspaceDiffPatches({
          directory,
          diffs: [
            {
              file: diff.file,
              ...(diff.patch?.trim() ? { patch: diff.patch } : {}),
            },
          ],
        })
        await refreshCurrentScope()
        if (selectedDiffFile === file) {
          onDiffFileSelect(null)
        }
        if (result.failed.length > 0) {
          throw new Error(formatPatchRestoreFailure(result))
        }
      } else {
        await onDiffFileRestore(file)
        await refreshCurrentScope()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRestoreErrorMessage(message)
    } finally {
      setRestoringFile((current) => current === file ? null : current)
    }
  }

  async function handleStageToggleClick(event: MouseEvent<HTMLButtonElement>, file: string, action: "stage" | "unstage") {
    event.preventDefault()
    event.stopPropagation()

    const directory = activeSessionDirectory?.trim()
    if (!directory) {
      setRestoreErrorMessage("Select a session before updating Git state.")
      return
    }

    const bridge = action === "stage" ? window.desktop?.stageWorkspaceDiffFile : window.desktop?.unstageWorkspaceDiffFile
    if (!bridge) {
      setRestoreErrorMessage("Workspace diff Git action bridge is unavailable.")
      return
    }

    setPendingFileAction({ action, file })
    setRestoreErrorMessage(null)
    try {
      await bridge({
        directory,
        file,
      })
      await refreshCurrentScope()
      if (selectedDiffFile === file) {
        onDiffFileSelect(null)
      }
    } catch (error) {
      setRestoreErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingFileAction((current) => current?.file === file && current.action === action ? null : current)
    }
  }

  async function handleOpenInEditorClick(event: MouseEvent<HTMLButtonElement>, file: string) {
    event.preventDefault()
    event.stopPropagation()

    const directory = activeSessionDirectory?.trim()
    if (!directory) {
      setRestoreErrorMessage("Select a session before opening a file.")
      return
    }
    const openInExternalEditor = window.desktop?.openInExternalEditor
    if (!openInExternalEditor) {
      setRestoreErrorMessage("External editor bridge is unavailable.")
      return
    }

    setPendingFileAction({ action: "open-editor", file })
    setRestoreErrorMessage(null)
    try {
      await openInExternalEditor({
        targetPath: joinWorkspaceFilePath(directory, file),
      })
    } catch (error) {
      setRestoreErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingFileAction((current) => current?.file === file && current.action === "open-editor" ? null : current)
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
        <div className="right-sidebar-diff-scope">
          <button
            ref={scopeButtonRef}
            type="button"
            className="right-sidebar-diff-scope-button"
            aria-haspopup="menu"
            aria-expanded={isScopeMenuOpen}
            onClick={() => setIsScopeMenuOpen((current) => !current)}
          >
            <span className="right-sidebar-diff-scope-label">{selectedScopeLabel}</span>
            {typeof selectedScopeCount === "number" ? (
              <span className="right-sidebar-diff-scope-count">{selectedScopeCount}</span>
            ) : null}
            <ChevronDownIcon />
          </button>
          {isScopeMenuOpen ? (
            <div
              ref={scopeMenuRef}
              className="right-sidebar-diff-scope-menu"
              role="menu"
              aria-label="Diff scope"
            >
              {scopeOptions.map((option, index) => {
                const isSelected = option.scope === effectiveScope
                const isSessionScope = option.scope === "session:last-turn"
                return (
                  <div key={option.scope}>
                    {isSessionScope && index > 0 ? <div className="right-sidebar-diff-scope-divider" role="separator" /> : null}
                    <button
                      type="button"
                      className={isSelected ? "right-sidebar-diff-scope-option is-selected" : "right-sidebar-diff-scope-option"}
                      role="menuitem"
                      disabled={!option.enabled}
                      title={option.reason}
                      onClick={() => void handleScopeSelect(option.scope)}
                    >
                      <span className="right-sidebar-diff-scope-option-copy">
                        <span className="right-sidebar-diff-scope-option-label">{option.label}</span>
                        {typeof option.count === "number" ? (
                          <span className="right-sidebar-diff-scope-option-count">{option.count}</span>
                        ) : null}
                      </span>
                      <span className="right-sidebar-diff-scope-option-mark">
                        {isSelected ? <CheckIcon /> : option.hasChildren ? <ChevronRightIcon /> : null}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
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
                const stageAction = getDiffFileStageAction(effectiveScope, diff)
                const isStagePending = pendingFileAction?.file === diff.file && pendingFileAction.action === "stage"
                const isUnstagePending = pendingFileAction?.file === diff.file && pendingFileAction.action === "unstage"
                const isOpenEditorPending = pendingFileAction?.file === diff.file && pendingFileAction.action === "open-editor"

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
                      <div className="right-sidebar-change-actions" aria-label={`Actions for ${diff.file}`}>
                        {canRestoreFiles ? (
                          <button
                            type="button"
                            className="right-sidebar-change-action-button"
                            aria-label={`Restore ${diff.file}`}
                            disabled={isRestoring}
                            title="Restore file"
                            onClick={(event) => void handleRestoreClick(event, diff.file)}
                          >
                            <ResetIcon />
                          </button>
                        ) : null}
                        {stageAction === "stage" ? (
                          <button
                            type="button"
                            className="right-sidebar-change-action-button"
                            aria-label={`Stage ${diff.file}`}
                            disabled={isStagePending}
                            title="Stage file"
                            onClick={(event) => void handleStageToggleClick(event, diff.file, "stage")}
                          >
                            <PlusIcon />
                          </button>
                        ) : null}
                        {stageAction === "unstage" ? (
                          <button
                            type="button"
                            className="right-sidebar-change-action-button"
                            aria-label={`Unstage ${diff.file}`}
                            disabled={isUnstagePending}
                            title="Unstage file"
                            onClick={(event) => void handleStageToggleClick(event, diff.file, "unstage")}
                          >
                            <MinimizeIcon />
                          </button>
                        ) : null}
                        {canOpenFilesInEditor ? (
                          <button
                            type="button"
                            className="right-sidebar-change-action-button"
                            aria-label={`Open ${diff.file} in editor`}
                            disabled={isOpenEditorPending}
                            title="Open in editor"
                            onClick={(event) => void handleOpenInEditorClick(event, diff.file)}
                          >
                            <OpenInEditorIcon />
                          </button>
                        ) : null}
                      </div>
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
