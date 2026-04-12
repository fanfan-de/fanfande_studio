import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type FocusEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject, type SetStateAction } from "react"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, sidebarActions } from "./constants"
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DeleteIcon,
  DisconnectedStatusIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  LayoutSidebarRightIcon,
  LeftSidebarCollapseIcon,
  LeftSidebarExpandIcon,
  MaximizeIcon,
  MinimizeIcon,
  NewItemIcon,
  PaperclipIcon,
  RestoreIcon,
  RightSidebarCollapseIcon,
  RightSidebarExpandIcon,
  SettingsIcon,
  SortIcon,
} from "./icons"
import type {
  AssistantTraceItem,
  ComposerAttachment,
  ComposerModelOption,
  ComposerSkillOption,
  CreateSessionTab,
  LeftSidebarView,
  McpServerDraftState,
  McpServerSummary,
  PermissionDecision,
  PermissionRequest,
  ProjectModelSelection,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel,
  RightSidebarView,
  SessionDiffSummary,
  SessionSummary,
  SidebarActionKey,
  Turn,
  WindowAction,
  WorkspaceGroup,
} from "./types"
import { formatTime } from "./utils"

interface WindowChromeProps {
  controlsRef: RefObject<HTMLDivElement | null>
  isWindowMaximized: boolean
  onWindowAction: (action: WindowAction) => void
}

function WindowControlsSpacer({ variant }: { variant: "canvas" | "right-sidebar" }) {
  return <div className={`panel-toolbar-window-controls-spacer is-${variant}`} aria-hidden="true" />
}

export function WindowChrome({ controlsRef, isWindowMaximized, onWindowAction }: WindowChromeProps) {
  return (
    <div ref={controlsRef} className="window-controls-floating" role="group" aria-label="Window controls">
      <button className="window-control" aria-label="Minimize window" type="button" onClick={() => onWindowAction("minimize")}>
        <MinimizeIcon />
      </button>
      <button
        className="window-control"
        aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
        type="button"
        onClick={() => onWindowAction("toggle-maximize")}
      >
        {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button className="window-control is-close" aria-label="Close window" type="button" onClick={() => onWindowAction("close")}>
        <CloseIcon />
      </button>
    </div>
  )
}

type SidebarSide = "left" | "right"
type SidebarToggleButtonVariant = "rail" | "sidebar" | "top-menu"

interface SidebarToggleButtonProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  side: SidebarSide
  variant: SidebarToggleButtonVariant
}

function getSidebarToggleLabel(isSidebarCollapsed: boolean, side: SidebarSide) {
  const sideLabel = side === "left" ? "left" : "right"
  return isSidebarCollapsed ? `Expand ${sideLabel} sidebar` : `Collapse ${sideLabel} sidebar`
}

function getSidebarToggleIcon(isSidebarCollapsed: boolean, side: SidebarSide) {
  if (side === "left") {
    return isSidebarCollapsed ? LeftSidebarExpandIcon : LeftSidebarCollapseIcon
  }

  return isSidebarCollapsed ? RightSidebarExpandIcon : RightSidebarCollapseIcon
}

export function SidebarToggleButton({ isSidebarCollapsed, onToggleSidebar, side, variant }: SidebarToggleButtonProps) {
  const label = getSidebarToggleLabel(isSidebarCollapsed, side)
  const Icon = getSidebarToggleIcon(isSidebarCollapsed, side)
  const buttonClassName = [
    "sidebar-toggle-button",
    `is-${variant}`,
    `is-${side}`,
    !isSidebarCollapsed ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button
      className={buttonClassName}
      aria-label={label}
      aria-pressed={!isSidebarCollapsed}
      title={label}
      type="button"
      onClick={onToggleSidebar}
    >
      <Icon />
    </button>
  )
}

interface ActivityRailProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  side: SidebarSide
}

export function ActivityRail({ isSidebarCollapsed, onToggleSidebar, side }: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"

  return (
    <aside className={railClassName} aria-label={side === "left" ? "Primary navigation rail" : "Inspector rail"}>
      <SidebarToggleButton
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        side={side}
        variant="rail"
      />
    </aside>
  )
}

interface SidebarProps {
  activeSessionID: string | null
  activeView: LeftSidebarView
  deletingSessionID: string | null
  expandedFolderID: string | null
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isCreatingSession: boolean
  isSettingsOpen: boolean
  showSidebarToggleButton: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  workspaces: WorkspaceGroup[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onOpenSettings: () => void
  onProjectClick: (workspace: WorkspaceGroup) => void
  onProjectCreateSession: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
  onToggleSidebar: () => void
  onViewChange: (view: LeftSidebarView) => void
}

function TopMenuViewButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={active ? "top-menu-view-button is-active" : "top-menu-view-button"}
      aria-label={label}
      aria-pressed={active}
      title={label}
      type="button"
      onClick={onClick}
    >
      <span className="top-menu-view-button-icon" aria-hidden="true">
        {children}
      </span>
    </button>
  )
}

interface LeftSidebarTopMenuProps {
  activeView: LeftSidebarView
  showSidebarToggleButton: boolean
  onToggleSidebar: () => void
  onViewChange: (view: LeftSidebarView) => void
}

function LeftSidebarTopMenu({
  activeView,
  showSidebarToggleButton,
  onToggleSidebar,
  onViewChange,
}: LeftSidebarTopMenuProps) {
  return (
    <header className="left-sidebar-top-menu panel-toolbar" aria-label="Left sidebar top menu">
      <div className="left-sidebar-top-menu-tabs">
        <TopMenuViewButton active={activeView === "workspace"} label="Workspace" onClick={() => onViewChange("workspace")}>
          <LayoutSidebarLeftIcon />
        </TopMenuViewButton>
      </div>
      <div className="left-sidebar-top-menu-actions">
        {showSidebarToggleButton ? (
          <SidebarToggleButton isSidebarCollapsed={false} onToggleSidebar={onToggleSidebar} side="left" variant="top-menu" />
        ) : null}
      </div>
    </header>
  )
}

interface FolderWorkspaceViewProps {
  activeSessionID: string | null
  deletingSessionID: string | null
  expandedFolderID: string | null
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isCreatingSession: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  workspaces: WorkspaceGroup[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onProjectClick: (workspace: WorkspaceGroup) => void
  onProjectCreateSession: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
}

function FolderWorkspaceView({
  activeSessionID,
  deletingSessionID,
  expandedFolderID,
  hoveredFolderID,
  isCreatingProject,
  isCreatingSession,
  projectRowRefs,
  selectedFolderID,
  workspaces,
  onHoveredFolderChange,
  onProjectClick,
  onProjectCreateSession,
  onProjectRemove,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
}: FolderWorkspaceViewProps) {
  return (
    <section className="sidebar-view sidebar-view-workspace" aria-label="Workspace sidebar view">
      <div className="sidebar-actions view-toolbar" aria-label="Workspace view actions">
        <div className="panel-toolbar-actions sidebar-actions-buttons">
          {sidebarActions.map((action) => (
            <button
              key={action.key}
              className="sidebar-action"
              aria-label={action.label}
              title={action.label}
              disabled={action.key === "project" ? isCreatingProject : false}
              onClick={() => void onSidebarAction(action.key)}
            >
              {action.key === "project" ? <FolderIcon /> : null}
              {action.key === "sort" ? <SortIcon /> : null}
              {action.key === "new" ? <NewItemIcon /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-projects">
        {workspaces.map((workspace) => {
          const isActiveWorkspace = workspace.id === selectedFolderID
          const isExpanded = workspace.id === expandedFolderID
          const showStateIcon = workspace.id === hoveredFolderID
          const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"
          const removeLabel = "\u79FB\u9664"
          const removeFolderLabel = `${removeLabel} ${workspace.name}`
          const createSessionLabel = `Create session for ${workspace.name}`

          function handleProjectBlur(event: FocusEvent<HTMLDivElement>) {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            onHoveredFolderChange((current) => (current === workspace.id ? null : current))
          }

          return (
            <section key={workspace.id} className="project-block">
              <div className="project-row-shell">
                <div
                  className={isActiveWorkspace ? "project-row is-active" : "project-row"}
                  onMouseEnter={() => onHoveredFolderChange(workspace.id)}
                  onMouseLeave={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                  onFocus={() => onHoveredFolderChange(workspace.id)}
                  onBlur={handleProjectBlur}
                >
                  <button
                    ref={(node) => {
                      projectRowRefs.current[workspace.id] = node
                    }}
                    className="project-row-trigger"
                    aria-label={workspace.name}
                    aria-expanded={isExpanded}
                    data-folder-id={workspace.id}
                    onClick={() => onProjectClick(workspace)}
                  >
                    <span className="project-row-leading" data-icon={leadingIcon} data-testid={`project-leading-${workspace.id}`} aria-hidden="true">
                      {showStateIcon ? isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon /> : <FolderIcon />}
                    </span>
                    <span className="project-row-text">
                      <span className="project-row-label">{workspace.name}</span>
                      <span className="project-row-meta">{workspace.project.name}</span>
                    </span>
                  </button>
                  <div className="project-row-actions" aria-label={`${workspace.name} actions`}>
                    <button
                      className="row-action project-row-action"
                      aria-label={removeFolderLabel}
                      title={removeFolderLabel}
                      onClick={(event) => onProjectRemove(workspace, event)}
                    >
                      <DeleteIcon />
                    </button>
                    <button
                      className="row-action project-row-action"
                      aria-label={createSessionLabel}
                      title={createSessionLabel}
                      disabled={isCreatingSession}
                      onClick={(event) => void onProjectCreateSession(workspace, event)}
                    >
                      <NewItemIcon />
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded ? (
                <div className="session-tree">
                  {workspace.sessions.map((session) => {
                    const active = session.id === activeSessionID

                    return (
                      <div key={session.id} className="session-row-shell">
                        <button
                          className={active ? "session-row is-active" : "session-row"}
                          onClick={() => onSessionSelect(workspace.id, session.id)}
                        >
                          <span className="session-row-label">{session.title}</span>
                        </button>
                        <button
                          className="row-action"
                          aria-label={`Delete session ${session.title}`}
                          title={`Delete session ${session.title}`}
                          disabled={deletingSessionID === session.id}
                          onClick={(event) => onSessionDelete(workspace, session, event)}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </section>
  )
}

export function Sidebar({
  activeSessionID,
  activeView,
  deletingSessionID,
  expandedFolderID,
  hoveredFolderID,
  isCreatingProject,
  isCreatingSession,
  isSettingsOpen,
  showSidebarToggleButton,
  projectRowRefs,
  selectedFolderID,
  workspaces,
  onHoveredFolderChange,
  onOpenSettings,
  onProjectClick,
  onProjectCreateSession,
  onProjectRemove,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
  onToggleSidebar,
  onViewChange,
}: SidebarProps) {
  return (
    <aside id="app-sidebar" className="sidebar" aria-label="Primary sidebar">
      <LeftSidebarTopMenu
        activeView={activeView}
        showSidebarToggleButton={showSidebarToggleButton}
        onToggleSidebar={onToggleSidebar}
        onViewChange={onViewChange}
      />

      <div className="sidebar-view-host">
        {activeView === "workspace" ? (
          <FolderWorkspaceView
            activeSessionID={activeSessionID}
            deletingSessionID={deletingSessionID}
            expandedFolderID={expandedFolderID}
            hoveredFolderID={hoveredFolderID}
            isCreatingProject={isCreatingProject}
            isCreatingSession={isCreatingSession}
            projectRowRefs={projectRowRefs}
            selectedFolderID={selectedFolderID}
            workspaces={workspaces}
            onHoveredFolderChange={onHoveredFolderChange}
            onProjectClick={onProjectClick}
            onProjectCreateSession={onProjectCreateSession}
            onProjectRemove={onProjectRemove}
            onSessionDelete={onSessionDelete}
            onSessionSelect={onSessionSelect}
            onSidebarAction={onSidebarAction}
          />
        ) : null}
      </div>

      <button
        className={isSettingsOpen ? "sidebar-settings is-active" : "sidebar-settings"}
        aria-label="Open settings"
        aria-pressed={isSettingsOpen}
        title="Open settings"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
    </aside>
  )
}

interface RightSidebarProps {
  activeSession: SessionSummary | null
  activeSessionDiff: SessionDiffSummary | null
  activeView: RightSidebarView
  onViewChange: (view: RightSidebarView) => void
}

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

function DiffPreview({ file, patch }: { file: string; patch?: string }) {
  if (!patch?.trim()) {
    return (
      <div className="right-sidebar-diff-empty">
        <p>No line-by-line diff preview is available for {file}.</p>
      </div>
    )
  }

  const hunks = parsePatchHunks(patch)

  if (hunks.length === 0) {
    return (
      <div className="right-sidebar-diff-empty">
        <p>No line-by-line diff preview is available for {file}.</p>
      </div>
    )
  }

  return (
    <div className="right-sidebar-diff-preview" role="region" aria-label={`Diff preview for ${file}`}>
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
    </div>
  )
}

export function RightSidebar({
  activeSession,
  activeSessionDiff,
  activeView,
  onViewChange,
}: RightSidebarProps) {
  const [expandedDiffFile, setExpandedDiffFile] = useState<string | null>(null)
  const changedFilesCount = activeSessionDiff?.stats?.files ?? activeSessionDiff?.diffs.length ?? 0

  useEffect(() => {
    setExpandedDiffFile(null)
  }, [activeSession?.id, activeSessionDiff?.title])

  return (
    <aside id="app-sidebar-right" className="sidebar is-right" aria-label="Inspector sidebar">
      <header className="right-sidebar-top-menu panel-toolbar" aria-label="Right sidebar top menu">
        <div className="right-sidebar-top-menu-tabs">
          <TopMenuViewButton active={activeView === "changes"} label="Changes" onClick={() => onViewChange("changes")}>
            <LayoutSidebarRightIcon />
          </TopMenuViewButton>
        </div>
        <WindowControlsSpacer variant="right-sidebar" />
      </header>

      <div className="right-sidebar-view-host">
        {activeView === "changes" ? (
          <section className="right-sidebar-section">
            <div className="right-sidebar-section-header">
              <span className="label">Changed Files</span>
              {activeSession ? <span className="settings-badge">{String(changedFilesCount)} files</span> : null}
            </div>
            {activeSession ? (
              activeSessionDiff && activeSessionDiff.diffs.length > 0 ? (
                <div className="right-sidebar-stack">
                  {activeSessionDiff.title ? <p>{activeSessionDiff.title}</p> : null}
                  <div className="right-sidebar-change-list">
                    {activeSessionDiff.diffs.map((diff) => (
                      <div key={diff.file} className="right-sidebar-change-row">
                        <button
                          type="button"
                          className="right-sidebar-change-toggle"
                          aria-expanded={expandedDiffFile === diff.file}
                          aria-label={`Toggle diff for ${diff.file}`}
                          onClick={() => setExpandedDiffFile((current) => (current === diff.file ? null : diff.file))}
                        >
                          <span className="right-sidebar-change-icon" aria-hidden="true">
                            {expandedDiffFile === diff.file ? <ChevronDownIcon /> : <ChevronRightIcon />}
                          </span>
                          <div className="right-sidebar-change-copy">
                            <strong>{diff.file}</strong>
                            <span className="right-sidebar-change-action">
                              {expandedDiffFile === diff.file ? "Hide diff" : "Show diff"}
                            </span>
                          </div>
                          <span className="right-sidebar-change-stat">
                            +{diff.additions} -{diff.deletions}
                          </span>
                        </button>
                        {expandedDiffFile === diff.file ? <DiffPreview file={diff.file} patch={diff.patch} /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="right-sidebar-empty">
                  <p>No tracked workspace changes for this session yet.</p>
                </div>
              )
            ) : (
              <div className="right-sidebar-empty">
                <p>Select a session to inspect its file changes.</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  )
}

interface SidebarResizerProps {
  isSidebarResizing: boolean
  side: SidebarSide
  sidebarWidth: number
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
}

export function SidebarResizer({ isSidebarResizing, side, sidebarWidth, onKeyDown, onPointerDown }: SidebarResizerProps) {
  const resizerClassName = side === "right"
    ? isSidebarResizing ? "sidebar-resizer is-right is-active" : "sidebar-resizer is-right"
    : isSidebarResizing ? "sidebar-resizer is-active" : "sidebar-resizer"
  const ariaLabel = side === "right" ? "Resize right sidebar" : "Resize left sidebar"
  const controlsID = side === "right" ? "app-sidebar-right" : "app-sidebar"
  const testID = side === "right" ? "right-sidebar-resizer" : "sidebar-resizer"

  return (
    <div
      className={resizerClassName}
      role="separator"
      aria-label={ariaLabel}
      aria-controls={controlsID}
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={sidebarWidth}
      data-testid={testID}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  )
}

interface CanvasRegionTopMenuProps {
  activeSessionID: string | null
  activeCreateSessionTabID: string | null
  createSessionTabs: CreateSessionTab[]
  sessions: SessionSummary[]
  showLeftSidebarToggleButton: boolean
  isRightSidebarCollapsed: boolean
  onAddCreateSessionTab: () => void
  onCloseCreateSessionTab: (tabID: string) => void
  onSelectCreateSessionTab: (tabID: string) => void
  onSessionClose: (sessionID: string) => void
  onSessionSelect: (sessionID: string) => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

function getCreateSessionTabTitle(tab: CreateSessionTab, _index: number) {
  const trimmedTitle = tab.title.trim()
  if (trimmedTitle) return trimmedTitle
  return "Create session"
}

function getCreateSessionTabSwitchLabel(tab: CreateSessionTab, index: number) {
  return tab.title.trim() ? `Switch to create session draft ${tab.title.trim()}` : index === 0 ? "Switch to create session tab" : `Switch to create session tab ${index + 1}`
}

function getCreateSessionTabCloseLabel(tab: CreateSessionTab, index: number) {
  return tab.title.trim() ? `Close create session draft ${tab.title.trim()}` : index === 0 ? "Close create session tab" : `Close create session tab ${index + 1}`
}

function GitQuickMenuButton({ gitDirectory }: { gitDirectory: string | null }) {
  const menuRef = useRef<HTMLFormElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [pendingAction, setPendingAction] = useState<"commit" | "push" | null>(null)
  const [status, setStatus] = useState<{
    tone: "neutral" | "success" | "error"
    text: string
  }>({
    tone: "neutral",
    text: "",
  })

  const gitCommit = window.desktop?.gitCommit
  const gitPush = window.desktop?.gitPush
  const isCommitReady = Boolean(gitDirectory && gitCommit)
  const isPushReady = Boolean(gitDirectory && gitPush)

  useEffect(() => {
    if (!isMenuOpen) return

    inputRef.current?.focus()

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  useEffect(() => {
    setIsMenuOpen(false)
    setCommitMessage("")
    setStatus({
      tone: "neutral",
      text: "",
    })
  }, [gitDirectory])

  async function handleCommit() {
    const message = commitMessage.trim()

    if (!message) {
      setStatus({
        tone: "error",
        text: "Enter a commit message.",
      })
      return
    }

    if (!gitDirectory || !gitCommit) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("commit")
    setStatus({
      tone: "neutral",
      text: "Committing changes...",
    })

    try {
      const result = await gitCommit({
        directory: gitDirectory,
        message,
      })
      setCommitMessage("")
      setStatus({
        tone: "success",
        text: result.summary,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handlePush() {
    if (!gitDirectory || !gitPush) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("push")
    setStatus({
      tone: "neutral",
      text: "Pushing branch...",
    })

    try {
      const result = await gitPush({
        directory: gitDirectory,
      })
      setStatus({
        tone: "success",
        text: result.summary,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="canvas-top-menu-quick-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-git-trigger is-active" : "canvas-top-menu-button canvas-top-menu-git-trigger"}
        aria-controls="canvas-top-menu-git-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        title="Git actions"
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        Git
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <form
          ref={menuRef}
          id="canvas-top-menu-git-menu"
          className="canvas-top-menu-quick-panel"
          role="dialog"
          aria-label="Git quick menu"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCommit()
          }}
        >
          <label className="canvas-top-menu-quick-field">
            <span>Commit message</span>
            <input
              ref={inputRef}
              type="text"
              value={commitMessage}
              placeholder="Enter commit message"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCommitMessage(event.target.value)}
            />
          </label>

          <div className="canvas-top-menu-quick-actions">
            <button type="submit" className="primary-button" disabled={!isCommitReady || pendingAction !== null}>
              {pendingAction === "commit" ? "Committing..." : "Commit"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!isPushReady || pendingAction !== null}
              onClick={() => {
                void handlePush()
              }}
            >
              {pendingAction === "push" ? "Pushing..." : "Push"}
            </button>
          </div>

          <p
            className={[
              "canvas-top-menu-quick-status",
              status.tone === "success" ? "is-success" : "",
              status.tone === "error" ? "is-error" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
          >
            {status.text ||
              (!gitDirectory
                ? "The current workspace does not have an available Git worktree."
                : "Commit stages workspace changes with git add -A before creating the commit.")}
          </p>
        </form>
      ) : null}
    </div>
  )
}

export function CanvasRegionTopMenu({
  activeSessionID,
  activeCreateSessionTabID,
  createSessionTabs,
  sessions,
  onAddCreateSessionTab,
  showLeftSidebarToggleButton,
  isRightSidebarCollapsed,
  onCloseCreateSessionTab,
  onSelectCreateSessionTab,
  onSessionClose,
  onSessionSelect,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}: CanvasRegionTopMenuProps) {
  const canCloseCreateSessionTab = sessions.length > 0 || createSessionTabs.length > 1

  return (
    <nav className="canvas-region-top-menu panel-toolbar" aria-label="Canvas region top menu">
      <div className="canvas-region-top-menu-leading">
        {showLeftSidebarToggleButton ? (
          <SidebarToggleButton isSidebarCollapsed={true} onToggleSidebar={onToggleLeftSidebar} side="left" variant="top-menu" />
        ) : null}
      </div>
      <div className="canvas-region-top-menu-tabs-shell">
        <div className="canvas-region-top-menu-tabs" aria-label="Session tabs">
          {sessions.map((session) => {
            const isActive = activeCreateSessionTabID === null && session.id === activeSessionID

            return (
              <div key={session.id} className={isActive ? "session-tab is-active" : "session-tab"}>
                <button
                  className="session-tab-trigger"
                  aria-label={`Switch to session ${session.title}`}
                  aria-pressed={isActive}
                  title={`Switch to session ${session.title}`}
                  type="button"
                  onClick={() => onSessionSelect(session.id)}
                >
                  <span className="session-tab-title">{session.title}</span>
                </button>
                <button
                  className="session-tab-close"
                  aria-label={`Close session tab ${session.title}`}
                  title={`Close session tab ${session.title}`}
                  type="button"
                  onClick={() => onSessionClose(session.id)}
                >
                  <CloseIcon />
                </button>
              </div>
            )
          })}

          {createSessionTabs.map((tab, index) => {
            const isActive = activeCreateSessionTabID === tab.id
            const switchLabel = getCreateSessionTabSwitchLabel(tab, index)
            const closeLabel = getCreateSessionTabCloseLabel(tab, index)

            return (
              <div key={tab.id} className={isActive ? "session-tab is-active is-create-tab" : "session-tab is-create-tab"}>
                <button
                  className="session-tab-trigger"
                  aria-label={switchLabel}
                  aria-pressed={isActive}
                  title={switchLabel}
                  type="button"
                  onClick={() => onSelectCreateSessionTab(tab.id)}
                >
                  <span className="session-tab-title">{getCreateSessionTabTitle(tab, index)}</span>
                </button>
                {canCloseCreateSessionTab ? (
                  <button
                    className="session-tab-close"
                    aria-label={closeLabel}
                    title={closeLabel}
                    type="button"
                    onClick={() => onCloseCreateSessionTab(tab.id)}
                  >
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <button className="canvas-region-top-menu-add-button" aria-label="Add session tab" title="Add session tab" type="button" onClick={onAddCreateSessionTab}>
          <span className="canvas-region-top-menu-add-glyph" aria-hidden="true">
            +
          </span>
        </button>
      </div>
      <div className={isRightSidebarCollapsed ? "canvas-region-top-menu-trailing is-right-sidebar-collapsed" : "canvas-region-top-menu-trailing is-right-sidebar-expanded"}>
        <SidebarToggleButton isSidebarCollapsed={isRightSidebarCollapsed} onToggleSidebar={onToggleRightSidebar} side="right" variant="top-menu" />
      </div>
      <WindowControlsSpacer variant="canvas" />
    </nav>
  )
}

interface SessionCanvasTopMenuProps {
  activeSession: SessionSummary | null
  gitDirectory: string | null
}

export function SessionCanvasTopMenu({ activeSession, gitDirectory }: SessionCanvasTopMenuProps) {
  return (
    <div className="session-canvas-top-menu panel-toolbar" aria-label="Session canvas top menu">
      <div className="session-canvas-top-menu-copy">
        <span className="label">Session</span>
        <strong>{activeSession?.title ?? "No session selected"}</strong>
      </div>
      <div className="session-canvas-top-menu-actions">
        <GitQuickMenuButton gitDirectory={gitDirectory} />
      </div>
      <WindowControlsSpacer variant="canvas" />
    </div>
  )
}

interface CreateSessionCanvasProps {
  isCreatingSession: boolean
  selectedWorkspaceID: string | null
  title: string
  workspaces: WorkspaceGroup[]
  onCreateSession: () => void | Promise<void>
  onTitleChange: (value: string) => void
  onWorkspaceChange: (workspaceID: string) => void
}

export function CreateSessionCanvas({
  isCreatingSession,
  selectedWorkspaceID,
  title,
  workspaces,
  onCreateSession,
  onTitleChange,
  onWorkspaceChange,
}: CreateSessionCanvasProps) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceID) ?? null

  if (workspaces.length === 0) {
    return (
      <section className="thread-shell create-session-shell">
        <article className="create-session-card">
          <header className="assistant-header create-session-header">
            <div>
              <span className="label">Create Session</span>
              <h3>No folder workspace available</h3>
            </div>
          </header>
          <p className="create-session-copy">Open a folder workspace from the left sidebar first, then create the session here.</p>
        </article>
      </section>
    )
  }

  return (
    <section className="thread-shell create-session-shell">
      <form
        className="create-session-card"
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateSession()
        }}
      >
        <header className="assistant-header create-session-header">
          <div>
            <span className="label">Create Session</span>
            <h3>Open a new session tab</h3>
          </div>
        </header>

        <p className="create-session-copy">Choose a folder workspace, optionally name the session, then create it into the canvas.</p>

        <div className="create-session-fields">
          <label className="create-session-field">
            <span className="label">Folder Workspace</span>
            <select
              aria-label="Session folder workspace"
              value={selectedWorkspaceID ?? ""}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onWorkspaceChange(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.project.name} / {workspace.name}
                </option>
              ))}
            </select>
          </label>

          <label className="create-session-field">
            <span className="label">Session Title</span>
            <input
              aria-label="Session title"
              placeholder="Optional session title"
              type="text"
              value={title}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value)}
            />
          </label>
        </div>

        {selectedWorkspace ? (
          <article className="create-session-workspace-card">
            <span className="label">Target Folder</span>
            <strong>
              {selectedWorkspace.project.name} / {selectedWorkspace.name}
            </strong>
            <p>{selectedWorkspace.directory}</p>
          </article>
        ) : null}

        <div className="create-session-actions">
          <button
            className="secondary-button"
            disabled={isCreatingSession || title.trim().length === 0}
            type="button"
            onClick={() => onTitleChange("")}
          >
            Reset title
          </button>
          <button className="primary-button" disabled={isCreatingSession || !selectedWorkspaceID} type="submit">
            {isCreatingSession ? "Creating session..." : "Create session"}
          </button>
        </div>
      </form>
    </section>
  )
}

function formatContextWindow(value: number) {
  if (value >= 1000) {
    const formatted = value >= 100000 ? Math.round(value / 1000) : Number((value / 1000).toFixed(1))
    return `${String(formatted).replace(/\.0$/, "")}k`
  }

  return String(value)
}

function providerSourceLabel(provider: ProviderCatalogItem) {
  if (provider.source === "config") return "Saved config"
  if (provider.source === "env") return "Environment"
  if (provider.source === "custom") return "Custom"
  return "Catalog"
}

function buildModelTags(model: ProviderModel) {
  const tags = [`${formatContextWindow(model.limit.context)} ctx`]

  if (model.capabilities.reasoning) tags.push("Reasoning")
  if (model.capabilities.toolcall) tags.push("Tools")
  if (model.capabilities.input.image || model.capabilities.attachment) tags.push("Vision")

  return tags
}

function toModelOptionLabel(model: ProviderModel, providers: ProviderCatalogItem[]) {
  const providerName = providers.find((item) => item.id === model.providerID)?.name ?? model.providerID
  return `${providerName} / ${model.name}`
}

function getProviderConnectionLabel(provider: ProviderCatalogItem) {
  if (provider.available) return "Connected"
  if (provider.apiKeyConfigured) return "Configured"
  return "Not connected"
}

function getProviderKeyPlaceholder(provider: ProviderCatalogItem) {
  if (provider.apiKeyConfigured) {
    return "Stored key detected. Leave blank to keep it."
  }

  if (provider.env.length > 0) {
    return `Or rely on ${provider.env.join(", ")}`
  }

  return "Enter API key"
}

function matchesProviderSearch(provider: ProviderCatalogItem, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  const haystack = [
    provider.id,
    provider.name,
    provider.baseURL ?? "",
    provider.env.join(" "),
    providerSourceLabel(provider),
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

function getVisibleProvidersForSettings(catalog: ProviderCatalogItem[], rawQuery: string) {
  return catalog
    .map((provider, index) => ({ index, provider }))
    .filter(({ provider }) => matchesProviderSearch(provider, rawQuery))
    .sort((left, right) => {
      if (left.provider.available !== right.provider.available) {
        return left.provider.available ? -1 : 1
      }

      return left.index - right.index
    })
    .map(({ provider }) => provider)
}

interface ModelListViewProps {
  catalog: ProviderCatalogItem[]
  models: ProviderModel[]
  selectionDraft: ProjectModelSelection
}

function ModelListView({ catalog, models, selectionDraft }: ModelListViewProps) {
  return (
    <div className="model-list">
      {models.map((model) => {
        const providerName = catalog.find((item) => item.id === model.providerID)?.name ?? model.providerID
        const modelValue = `${model.providerID}/${model.id}`

        return (
          <article key={modelValue} className="model-row">
            <div className="model-row-main">
              <div className="model-row-heading">
                <div>
                  <h4>{model.name}</h4>
                  <p className="model-row-copy">
                    <strong>{providerName}</strong>
                    {model.family ? ` / ${model.family}` : ""}
                  </p>
                </div>

                <div className="model-row-statuses">
                  <span className="settings-badge">{model.status}</span>
                  <span className="settings-badge">{model.available ? "Visible" : "Catalog"}</span>
                  {selectionDraft.model === modelValue ? <span className="settings-badge is-highlight">Primary</span> : null}
                  {selectionDraft.smallModel === modelValue ? <span className="settings-badge is-highlight">Small</span> : null}
                </div>
              </div>

              <div className="model-row-tags">
                {buildModelTags(model).map((tag) => (
                  <span key={`${modelValue}-${tag}`} className="settings-badge">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

interface SettingsPageProps {
  activeMcpServerID: string | null
  catalog: ProviderCatalogItem[]
  deletingMcpServerID: string | null
  deletingProviderID: string | null
  isActivityRailVisible: boolean
  isLoading: boolean
  isOpen: boolean
  isSavingSelection: boolean
  loadError: string | null
  mcpServerDraft: McpServerDraftState
  mcpServers: McpServerSummary[]
  message: {
    tone: "success" | "error"
    text: string
  } | null
  models: ProviderModel[]
  projectID: string | null
  projectName: string | null
  projectWorktree: string | null
  providerDrafts: Record<string, ProviderDraftState>
  savedSelection: ProjectModelSelection
  savingMcpServerID: string | null
  savingProviderID: string | null
  selectionDraft: ProjectModelSelection
  onActivityRailVisibilityChange: (value: boolean) => void
  onClose: () => void
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDeleteProvider: (providerID: string) => void | Promise<void>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onMcpServerSelect: (serverID: string) => void
  onProviderDraftChange: (providerID: string, field: keyof ProviderDraftState, value: string) => void
  onSaveMcpServer: () => boolean | Promise<boolean>
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSaveSelection: () => void | Promise<void>
  onSelectionChange: (field: keyof ProjectModelSelection, value: string | null) => void
  onStartNewMcpServer: () => void
}

export function SettingsPage({
  activeMcpServerID,
  catalog,
  deletingMcpServerID,
  deletingProviderID,
  isActivityRailVisible,
  isLoading,
  isOpen,
  isSavingSelection,
  loadError,
  mcpServerDraft,
  mcpServers,
  message,
  models,
  projectID,
  projectName,
  projectWorktree,
  providerDrafts,
  savedSelection,
  savingMcpServerID,
  savingProviderID,
  selectionDraft,
  onActivityRailVisibilityChange,
  onClose,
  onDeleteMcpServer,
  onDeleteProvider,
  onMcpServerDraftChange,
  onMcpServerSelect,
  onProviderDraftChange,
  onSaveMcpServer,
  onSaveProvider,
  onSaveSelection,
  onSelectionChange,
  onStartNewMcpServer,
}: SettingsPageProps) {
  {
    const [activeSection, setActiveSection] = useState<"services" | "defaults" | "mcp" | "appearance">("services")
    const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
    const [providerSearch, setProviderSearch] = useState("")
    const serviceDetailPanelRef = useRef<HTMLDivElement | null>(null)

    const modelGroups = models.reduce<Record<string, ProviderModel[]>>((result, model) => {
      result[model.providerID] = [...(result[model.providerID] ?? []), model]
      return result
    }, {})
    const connectedProviderIDs = new Set(catalog.filter((item) => item.available).map((item) => item.id))
    const visibleModels = models.filter((model) => model.available && connectedProviderIDs.has(model.providerID))
    const filteredCatalog = getVisibleProvidersForSettings(catalog, providerSearch)
    const activeProvider = selectedProviderID ? catalog.find((item) => item.id === selectedProviderID) ?? null : null
    const activeProviderDraft = activeProvider
      ? (providerDrafts[activeProvider.id] ?? {
          apiKey: "",
          baseURL: activeProvider.baseURL ?? "",
        })
      : null
    const activeProviderModels = activeProvider ? modelGroups[activeProvider.id] ?? [] : []
    const activeProviderBusy = activeProvider ? savingProviderID === activeProvider.id || deletingProviderID === activeProvider.id : false
    const activeProviderDirty = activeProvider
      ? (activeProviderDraft?.apiKey.trim().length ?? 0) > 0 || (activeProviderDraft?.baseURL.trim() ?? "") !== (activeProvider.baseURL ?? "")
      : false
    const activeProviderCanReset = activeProvider?.source === "config"
    const selectionUnchanged =
      savedSelection.model === selectionDraft.model && savedSelection.smallModel === selectionDraft.smallModel
    const activeMcpServer = activeMcpServerID ? mcpServers.find((server) => server.id === activeMcpServerID) ?? null : null
    const mcpSaveLabel = activeMcpServer ? "Save server" : "Create server"
    const mcpServerBusyID = activeMcpServerID ?? mcpServerDraft.id.trim() ?? null
    const mcpServerBusy = Boolean(
      (mcpServerBusyID && savingMcpServerID === mcpServerBusyID) ||
      (mcpServerBusyID && deletingMcpServerID === mcpServerBusyID),
    )
    const showLoadedState = !isLoading && !loadError
    useEffect(() => {
      if (!isOpen) {
        setActiveSection("services")
        setSelectedProviderID(null)
        setProviderSearch("")
      }
    }, [isOpen])

    useEffect(() => {
      if (activeSection !== "services") return

      const visibleProviders = getVisibleProvidersForSettings(catalog, providerSearch)
      if (visibleProviders.length === 0) {
        if (selectedProviderID !== null) {
          setSelectedProviderID(null)
        }
        return
      }

      if (!selectedProviderID || !visibleProviders.some((provider) => provider.id === selectedProviderID)) {
        setSelectedProviderID(visibleProviders[0].id)
      }
    }, [activeSection, catalog, providerSearch, selectedProviderID])

    useEffect(() => {
      if (activeSection !== "services") return
      if (!serviceDetailPanelRef.current) return

      if (typeof serviceDetailPanelRef.current.scrollTo === "function") {
        serviceDetailPanelRef.current.scrollTo({ top: 0 })
      } else {
        serviceDetailPanelRef.current.scrollTop = 0
      }
    }, [activeSection, selectedProviderID])

    useEffect(() => {
      if (!isOpen) return

      function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
        if (event.key !== "Escape") return

        event.preventDefault()
        onClose()
      }

      window.addEventListener("keydown", handleWindowKeyDown)
      return () => window.removeEventListener("keydown", handleWindowKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    function handleSettingsOverlayClick(event: MouseEvent<HTMLElement>) {
      if (event.target !== event.currentTarget) return
      onClose()
    }

    const primarySections = [
      { key: "services" as const, label: "Provider", meta: `${catalog.length} providers`, Icon: SettingsIcon },
      { key: "defaults" as const, label: "Models", meta: `${visibleModels.length} available`, Icon: ConnectedStatusIcon },
      {
        key: "mcp" as const,
        label: "MCP",
        meta: projectID ? `${mcpServers.length} servers` : "Select a project",
        Icon: FolderIcon,
      },
      { key: "appearance" as const, label: "Appearance", meta: "1 option", Icon: LayoutSidebarLeftIcon },
    ]

    return (
      <section className="settings-page-overlay" role="presentation" onClick={handleSettingsOverlayClick}>
        <div className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
          <header className="settings-page-header">
            <button className="settings-page-close-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
              <CloseIcon />
            </button>
          </header>

          <div className="settings-page-shell">
            <aside className="settings-page-primary-nav" aria-label="Settings sections">
              {primarySections.map((section) => {
                const isActive = activeSection === section.key
                const Icon = section.Icon

                return (
                  <button
                    key={section.key}
                    className={isActive ? "settings-primary-nav-item is-active" : "settings-primary-nav-item"}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setActiveSection(section.key)}
                  >
                    <span className="settings-primary-nav-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="settings-primary-nav-copy">
                      <span className="settings-primary-nav-label">{section.label}</span>
                      <small>{section.meta}</small>
                    </span>
                  </button>
                )
              })}
            </aside>

            <div className={activeSection === "services" ? "settings-page-main is-services" : "settings-page-main"}>
              {message ? (
                <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>{message.text}</div>
              ) : null}

              {loadError && activeSection !== "appearance" ? <div className="settings-banner is-error">{loadError}</div> : null}

              {isLoading && activeSection !== "appearance" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {activeSection === "appearance" ? (
                <div className="settings-appearance-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Shell</span>
                        <h3>Layout Visibility</h3>
                      </div>
                      <p>Control whether the narrow navigation rail is shown on the left edge of the desktop shell.</p>
                    </div>

                    <button
                      className={isActivityRailVisible ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isActivityRailVisible}
                      aria-label="Show left rail"
                      type="button"
                      onClick={() => onActivityRailVisibilityChange(!isActivityRailVisible)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <LayoutSidebarLeftIcon />
                          </span>
                          <span>Show left rail</span>
                        </strong>
                        <small>Display the narrow rail and keep the sidebar toggle inside it.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      When the left rail is hidden, its toggle moves into the left sidebar header or the left side of the canvas top menu. The right inspector has no rail, so its toggle always switches between the inspector header and the right side of the canvas top menu.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Current</span>
                        <h3>Toggle Placement</h3>
                      </div>
                      <p>The left rail is optional. The right inspector always keeps its toggle on the active surface.</p>
                    </div>

                    <div className="settings-section-summary">
                      <article className="settings-summary-card">
                        <span className="label">Left</span>
                        <strong>{isActivityRailVisible ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isActivityRailVisible
                            ? "The narrow rail is visible and always contains the sidebar toggle."
                            : "The rail is hidden, and the toggle appears in the sidebar header or canvas top menu depending on the current layout."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Right</span>
                        <strong>No rail</strong>
                        <p>
                          The inspector toggle lives in the right sidebar header while the sidebar is open, and moves to the canvas top menu when the inspector is collapsed.
                        </p>
                      </article>
                    </div>
                  </section>
                </div>
              ) : showLoadedState ? (
                activeSection === "services" ? (
                  <section className="settings-services-layout" aria-label="Provider layout">
                    <div className="settings-service-list-panel">
                      <div className="settings-field settings-search-field">
                        <input
                          aria-label="Search providers"
                          type="text"
                          value={providerSearch}
                          placeholder="Search providers"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setProviderSearch(event.target.value)}
                        />
                      </div>

                      <div className="settings-service-list-body">
                        {filteredCatalog.length > 0 ? (
                          <div className="settings-service-list" role="list" aria-label="Provider list">
                            {filteredCatalog.map((provider) => {
                              const isActive = provider.id === activeProvider?.id
                              const connectionLabel = getProviderConnectionLabel(provider)
                              const sourceLabel = providerSourceLabel(provider)

                              return (
                                <button
                                  key={provider.id}
                                  className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                                  aria-label={`${provider.name} ${connectionLabel}`}
                                  aria-pressed={isActive}
                                  onClick={() => setSelectedProviderID(provider.id)}
                                >
                                  <div className="settings-service-item-header">
                                    <strong>{provider.name}</strong>
                                    <span
                                      className={
                                        provider.available
                                          ? "settings-status-indicator is-connected"
                                          : "settings-status-indicator is-disconnected"
                                      }
                                      aria-hidden="true"
                                      title={connectionLabel}
                                    >
                                      {provider.available ? <ConnectedStatusIcon /> : <DisconnectedStatusIcon />}
                                    </span>
                                  </div>
                                  {sourceLabel !== "Catalog" ? <span className="settings-service-item-copy">{sourceLabel}</span> : null}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Match</span>
                            <h3>No provider matches this search</h3>
                            <p>Try a provider name, ID, endpoint, or environment variable.</p>
                          </article>
                        )}
                      </div>
                    </div>

                    <div ref={serviceDetailPanelRef} className="settings-service-detail-panel">
                      {activeProvider && activeProviderDraft ? (
                        <>
                          <div className="settings-detail-hero">
                            <div>
                              <h3>{activeProvider.name}</h3>
                            </div>

                            <div className="provider-row-statuses">
                              <span className="settings-badge">{getProviderConnectionLabel(activeProvider)}</span>
                              {activeProvider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                              <span className="settings-badge">{activeProvider.modelCount} models</span>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Connection</span>
                                <h3>Provider Configuration</h3>
                              </div>
                            </div>

                            <div className="settings-field-grid">
                              <label className="settings-field">
                                <span className="settings-field-label">API key</span>
                                <input
                                  aria-label={`API key for ${activeProvider.name}`}
                                  type="password"
                                  value={activeProviderDraft.apiKey}
                                  placeholder={getProviderKeyPlaceholder(activeProvider)}
                                  onChange={(event) => onProviderDraftChange(activeProvider.id, "apiKey", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Base URL</span>
                                <input
                                  aria-label={`Base URL for ${activeProvider.name}`}
                                  type="text"
                                  value={activeProviderDraft.baseURL}
                                  placeholder={activeProvider.baseURL ?? "Optional custom endpoint"}
                                  onChange={(event) => onProviderDraftChange(activeProvider.id, "baseURL", event.target.value)}
                                />
                              </label>
                            </div>

                            <div className="settings-actions-row">
                              <div className="settings-inline-actions">
                                {activeProviderCanReset ? (
                                  <button
                                    className="secondary-button"
                                    aria-label={`Reset ${activeProvider.name} settings`}
                                    disabled={activeProviderBusy}
                                    onClick={() => void onDeleteProvider(activeProvider.id)}
                                  >
                                    {deletingProviderID === activeProvider.id ? "Resetting..." : "Reset"}
                                  </button>
                                ) : null}
                                <button
                                  className="primary-button"
                                  aria-label={`Save ${activeProvider.name} settings`}
                                  disabled={activeProviderBusy || !activeProviderDirty}
                                  onClick={() => void onSaveProvider(activeProvider.id)}
                                >
                                  {savingProviderID === activeProvider.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Models</span>
                                <h3>Provider Models</h3>
                              </div>
                              <p>Models below come from the selected provider and show how they map into the current app defaults.</p>
                            </div>

                            {activeProviderModels.length > 0 ? (
                              <ModelListView catalog={catalog} models={activeProviderModels} selectionDraft={selectionDraft} />
                            ) : (
                              <article className="settings-empty-state">
                                <span className="label">No Models</span>
                                <h3>No models are visible for this provider yet</h3>
                                <p>Save the provider configuration, then refresh the catalog to populate its models.</p>
                              </article>
                            )}
                          </div>
                        </>
                      ) : (
                        <article className="settings-empty-state settings-detail-empty-state">
                          <span className="label">No Provider</span>
                          <h3>Select a provider from the list</h3>
                          <p>The right side will show credentials, endpoint overrides, and provider models for the current selection.</p>
                        </article>
                      )}
                    </div>
                  </section>
                ) : activeSection === "mcp" ? (
                  <section className="settings-services-layout" aria-label="MCP server layout">
                    <div className="settings-service-list-panel">
                      <div className="settings-panel">
                        <div className="settings-section-header">
                          <div>
                            <span className="label">Project</span>
                            <h3>MCP Servers</h3>
                          </div>
                          <p>
                            {projectID
                              ? "Configure stdio MCP servers for the currently selected project."
                              : "Select a project from the workspace sidebar to configure MCP servers."}
                          </p>
                        </div>

                        {projectID ? (
                          <>
                            <div className="settings-project-chip">
                              <strong>{projectName ?? "Current project"}</strong>
                              <span>{projectWorktree ?? projectID}</span>
                            </div>

                            <div className="settings-actions-row">
                              <span className="settings-helper-text">
                                Each argument and environment variable entry is stored on the project and exposed to the agent as trusted MCP configuration.
                              </span>
                              <button className="secondary-button" onClick={onStartNewMcpServer} type="button">
                                New server
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="settings-service-list-body">
                        {!projectID ? (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Project</span>
                            <h3>Pick a project first</h3>
                            <p>The MCP section is project-scoped, so it only appears when a workspace project is active.</p>
                          </article>
                        ) : mcpServers.length > 0 ? (
                          <div className="settings-service-list" role="list" aria-label="MCP servers">
                            {mcpServers.map((server) => {
                              const isActive = server.id === activeMcpServerID

                              return (
                                <button
                                  key={server.id}
                                  className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                                  aria-label={`${server.name ?? server.id} ${server.enabled ? "enabled" : "disabled"}`}
                                  aria-pressed={isActive}
                                  onClick={() => onMcpServerSelect(server.id)}
                                >
                                  <div className="settings-service-item-header">
                                    <strong>{server.name ?? server.id}</strong>
                                    <span className={server.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                                      {server.enabled ? "Enabled" : "Disabled"}
                                    </span>
                                  </div>
                                  <span className="settings-service-item-copy">{server.command}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Servers</span>
                            <h3>No MCP servers configured yet</h3>
                            <p>Create a stdio server here, then the agent can resolve its tools on the next turn.</p>
                          </article>
                        )}
                      </div>
                    </div>

                    <div className="settings-service-detail-panel">
                      {projectID ? (
                        <>
                          <div className="settings-detail-hero">
                            <div>
                              <h3>{activeMcpServer ? activeMcpServer.name ?? activeMcpServer.id : "Create MCP server"}</h3>
                              <p className="settings-page-copy">
                                {activeMcpServer
                                  ? "Edit the selected MCP server definition for this project."
                                  : "Define a new stdio MCP server and expose its tools to the agent."}
                              </p>
                            </div>

                            <div className="provider-row-statuses">
                              <span className="settings-badge">{activeMcpServer ? "Editing" : "New"}</span>
                              <span className={mcpServerDraft.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                                {mcpServerDraft.enabled ? "Enabled" : "Disabled"}
                              </span>
                              <span className="settings-badge">stdio</span>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Definition</span>
                                <h3>Server Configuration</h3>
                              </div>
                              <p>Use one argument per line and one environment variable per line in KEY=value format.</p>
                            </div>

                            <div className="settings-field-grid">
                              <label className="settings-field">
                                <span className="settings-field-label">Server ID</span>
                                <input
                                  aria-label="MCP server id"
                                  type="text"
                                  value={mcpServerDraft.id}
                                  placeholder="filesystem"
                                  onChange={(event) => onMcpServerDraftChange("id", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Name</span>
                                <input
                                  aria-label="MCP server name"
                                  type="text"
                                  value={mcpServerDraft.name}
                                  placeholder="Filesystem"
                                  onChange={(event) => onMcpServerDraftChange("name", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Command</span>
                                <input
                                  aria-label="MCP server command"
                                  type="text"
                                  value={mcpServerDraft.command}
                                  placeholder="npx"
                                  onChange={(event) => onMcpServerDraftChange("command", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Working directory</span>
                                <input
                                  aria-label="MCP server working directory"
                                  type="text"
                                  value={mcpServerDraft.cwd}
                                  placeholder="Optional, relative to the project root"
                                  onChange={(event) => onMcpServerDraftChange("cwd", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Timeout (ms)</span>
                                <input
                                  aria-label="MCP server timeout"
                                  type="text"
                                  value={mcpServerDraft.timeoutMs}
                                  placeholder="Optional"
                                  onChange={(event) => onMcpServerDraftChange("timeoutMs", event.target.value)}
                                />
                              </label>

                              <label className="settings-field settings-checkbox-field">
                                <span className="settings-field-label">Enabled</span>
                                <input
                                  aria-label="Enable MCP server"
                                  checked={mcpServerDraft.enabled}
                                  type="checkbox"
                                  onChange={(event) => onMcpServerDraftChange("enabled", event.target.checked)}
                                />
                              </label>
                            </div>

                            <div className="settings-field-grid">
                              <label className="settings-field">
                                <span className="settings-field-label">Arguments</span>
                                <textarea
                                  aria-label="MCP server arguments"
                                  rows={5}
                                  value={mcpServerDraft.args}
                                  placeholder="one argument per line"
                                  onChange={(event) => onMcpServerDraftChange("args", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Environment</span>
                                <textarea
                                  aria-label="MCP server environment"
                                  rows={5}
                                  value={mcpServerDraft.env}
                                  placeholder="KEY=value"
                                  onChange={(event) => onMcpServerDraftChange("env", event.target.value)}
                                />
                              </label>
                            </div>

                            <div className="settings-actions-row">
                              <span className="settings-helper-text">
                                Servers start lazily when the agent resolves tools for this project. Tool approval still flows through the existing permission system.
                              </span>
                              <div className="settings-inline-actions">
                                {activeMcpServer ? (
                                  <button
                                    className="secondary-button"
                                    disabled={mcpServerBusy}
                                    onClick={() => void onDeleteMcpServer(activeMcpServer.id)}
                                    type="button"
                                  >
                                    {deletingMcpServerID === activeMcpServer.id ? "Removing..." : "Remove"}
                                  </button>
                                ) : null}
                                <button
                                  className="primary-button"
                                  disabled={mcpServerBusy || !mcpServerDraft.id.trim() || !mcpServerDraft.command.trim()}
                                  onClick={() => void onSaveMcpServer()}
                                  type="button"
                                >
                                  {savingMcpServerID === (activeMcpServerID ?? mcpServerDraft.id.trim()) ? "Saving..." : mcpSaveLabel}
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <article className="settings-empty-state settings-detail-empty-state">
                          <span className="label">No Project</span>
                          <h3>Select a project from the sidebar</h3>
                          <p>The MCP server definitions are stored in the project config, so there is nothing to edit until a project is active.</p>
                        </article>
                      )}
                    </div>
                  </section>
                ) : (
                  <div className="settings-default-layout">
                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Routing</span>
                          <h3>Models</h3>
                        </div>
                        <p>Choose the preferred primary and small models from the providers already connected in the app.</p>
                      </div>

                      <div className="settings-field-grid">
                        <label className="settings-field">
                          <span className="settings-field-label">Primary model</span>
                          <select
                            aria-label="Primary model"
                            value={selectionDraft.model ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("model", event.target.value ? event.target.value : null)
                            }
                          >
                            <option value="">Use server default</option>
                            {visibleModels.map((model) => (
                              <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                                {toModelOptionLabel(model, catalog)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="settings-field">
                          <span className="settings-field-label">Small model</span>
                          <select
                            aria-label="Small model"
                            value={selectionDraft.smallModel ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("smallModel", event.target.value ? event.target.value : null)
                            }
                          >
                            <option value="">Use server default</option>
                            {visibleModels.map((model) => (
                              <option key={`small-${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                                {toModelOptionLabel(model, catalog)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="settings-actions-row">
                        <span className="settings-helper-text">Use the small model for lightweight tasks such as naming, titling, or utility generations.</span>
                        <button
                          className="primary-button"
                          aria-label="Save model selection"
                          disabled={isSavingSelection || selectionUnchanged}
                          onClick={() => void onSaveSelection()}
                        >
                          {isSavingSelection ? "Saving..." : "Save model selection"}
                        </button>
                      </div>
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Available</span>
                          <h3>Connected Models</h3>
                        </div>
                        <p>Every row below comes from a provider that is already configured and available in the app.</p>
                      </div>

                      {visibleModels.length > 0 ? (
                        <ModelListView catalog={catalog} models={visibleModels} selectionDraft={selectionDraft} />
                      ) : (
                        <article className="settings-empty-state">
                          <span className="label">No Models</span>
                          <h3>No connected provider is exposing models yet</h3>
                          <p>Open the Provider page, configure a provider, then come back here to review the unlocked models.</p>
                        </article>
                      )}
                    </section>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      </section>
    )
  }
}

/*
  const [activeTab, setActiveTab] = useState<"provider" | "model">("provider")
  const [connectProviderID, setConnectProviderID] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("provider")
      setConnectProviderID(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (activeTab !== "provider") {
      setConnectProviderID(null)
    }
  }, [activeTab])

  useEffect(() => {
    if (connectProviderID && !catalog.some((item) => item.id === connectProviderID)) {
      setConnectProviderID(null)
    }
  }, [catalog, connectProviderID])

  useEffect(() => {
    if (!isOpen) return

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return

      event.preventDefault()

      if (connectProviderID) {
        setConnectProviderID(null)
        return
      }

      onClose()
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [connectProviderID, isOpen, onClose])

  if (!isOpen) return null

  const modelGroups = models.reduce<Record<string, ProviderModel[]>>((result, model) => {
    result[model.providerID] = [...(result[model.providerID] ?? []), model]
    return result
  }, {})
  const connectedProviderIDs = new Set(catalog.filter((item) => item.available).map((item) => item.id))
  const visibleModels = models.filter((model) => model.available && connectedProviderIDs.has(model.providerID))
  const activeProvider = connectProviderID ? catalog.find((item) => item.id === connectProviderID) ?? null : null
  const activeProviderDraft = activeProvider
    ? (providerDrafts[activeProvider.id] ?? {
        apiKey: "",
        baseURL: activeProvider.baseURL ?? "",
      })
    : null
  const selectionUnchanged =
    savedSelection.model === selectionDraft.model && savedSelection.smallModel === selectionDraft.smallModel
  const showEmptyState = !project
  const showLoadedState = !showEmptyState && !isLoading && !loadError

  async function handleProviderSubmit() {
    if (!activeProvider) return

    const didSave = await onSaveProvider(activeProvider.id)

    if (didSave) {
      setConnectProviderID(null)
    }
  }

  function handleSettingsOverlayClick(event: MouseEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || connectProviderID) return
    onClose()
  }

  function handleProviderOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    setConnectProviderID(null)
  }

  return (
    <section className="settings-page-overlay" role="presentation" onClick={handleSettingsOverlayClick}>
      <div className="settings-page" role="dialog" aria-modal="true" aria-labelledby="settings-page-title">
        <header className="settings-page-header">
          <div>
            <span className="label">Settings</span>
            <h2 id="settings-page-title">Provider &amp; Model</h2>
            <p className="settings-page-copy">Connect providers for this project, then review the models that become available.</p>
          </div>

          <div className="settings-page-actions">
            {project ? (
              <div className="settings-project-chip">
                <strong>{project.name}</strong>
                <span>{project.worktree}</span>
              </div>
            ) : null}
            <button className="secondary-button" aria-label="Close settings" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="settings-page-body">
          <aside className="settings-page-nav" aria-label="Settings sections">
            <button
              className={activeTab === "provider" ? "settings-nav-item is-active" : "settings-nav-item"}
              aria-current={activeTab === "provider" ? "page" : undefined}
              onClick={() => setActiveTab("provider")}
            >
              <span>Provider</span>
              <small>{catalog.length} entries</small>
            </button>
            <button
              className={activeTab === "model" ? "settings-nav-item is-active" : "settings-nav-item"}
              aria-current={activeTab === "model" ? "page" : undefined}
              onClick={() => setActiveTab("model")}
            >
              <span>Model</span>
              <small>{visibleModels.length} available</small>
            </button>
          </aside>

          <div className="settings-page-content">
            {message ? (
              <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>{message.text}</div>
            ) : null}

            {loadError ? <div className="settings-banner is-error">{loadError}</div> : null}

            {showEmptyState ? (
              <article className="settings-empty-state">
                <span className="label">No Project</span>
                <h3>Select a workspace first</h3>
                <p>Provider settings are stored per project. Pick a folder workspace from the sidebar, then reopen settings.</p>
              </article>
            ) : null}

            {isLoading ? (
              <article className="settings-empty-state">
                <span className="label">Loading</span>
                <h3>Fetching provider catalog</h3>
                <p>Reading provider availability, model visibility, and saved project selection.</p>
              </article>
            ) : null}

            {showLoadedState ? (
              <>
                {activeTab === "provider" ? (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Catalog</span>
                        <h3>Provider Connections</h3>
                      </div>
                      <p>Select a provider and open a dedicated connect window to submit the API key for this project.</p>
                    </div>

                    <div className="settings-section-summary">
                      <div className="settings-summary-card">
                        <span className="label">Connected</span>
                        <strong>{catalog.filter((provider) => provider.available).length}</strong>
                        <p>Providers already unlocked for this workspace.</p>
                      </div>
                      <div className="settings-summary-card">
                        <span className="label">Potential</span>
                        <strong>{catalog.length}</strong>
                        <p>All providers discovered from the catalog, environment, and project config.</p>
                      </div>
                    </div>

                    <div className="provider-list">
                      {catalog.map((provider) => {
                        const providerModels = modelGroups[provider.id] ?? []
                        const providerBusy = savingProviderID === provider.id || deletingProviderID === provider.id
                        const canResetProvider = provider.source === "config"

                        return (
                          <article key={provider.id} className={provider.available ? "provider-row" : "provider-row is-muted"}>
                            <div className="provider-row-main">
                              <div className="provider-row-heading">
                                <div>
                                  <span className="label">{providerSourceLabel(provider)}</span>
                                  <h4>{provider.name}</h4>
                                </div>

                                <div className="provider-row-statuses">
                                  <span className="settings-badge">{provider.available ? "Connected" : "Not connected"}</span>
                                  {provider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                                  <span className="settings-badge">{provider.modelCount} models</span>
                                </div>
                              </div>

                              <p className="provider-row-copy">
                                <strong>{provider.id}</strong>
                                {provider.env.length > 0 ? ` / Env ${provider.env.join(", ")}` : " / No env key fallback"}
                                {provider.baseURL ? ` / ${provider.baseURL}` : ""}
                              </p>

                              <div className="provider-row-models">
                                {providerModels.length > 0 ? (
                                  providerModels.slice(0, 3).map((model) => (
                                    <div key={`${model.providerID}/${model.id}`} className="provider-model-chip">
                                      <strong>{model.name}</strong>
                                      <span>{buildModelTags(model).join(" / ")}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="provider-model-empty">No project-visible models yet.</span>
                                )}
                              </div>
                            </div>

                            <div className="provider-row-actions">
                              {canResetProvider ? (
                                <button
                                  className="secondary-button"
                                  aria-label={`Reset ${provider.name} settings`}
                                  disabled={providerBusy}
                                  onClick={() => void onDeleteProvider(provider.id)}
                                >
                                  {deletingProviderID === provider.id ? "Resetting..." : "Reset"}
                                </button>
                              ) : null}
                              <button
                                className="primary-button"
                                aria-label={`Connect ${provider.name}`}
                                disabled={providerBusy}
                                onClick={() => setConnectProviderID(provider.id)}
                              >
                                Connect
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ) : (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Routing</span>
                        <h3>Default Model Selection</h3>
                      </div>
                      <p>Choose the preferred primary and small models from the providers already connected to this project.</p>
                    </div>

                    <div className="settings-field-grid">
                      <label className="settings-field">
                        <span className="settings-field-label">Primary model</span>
                        <select
                          aria-label="Primary model"
                          value={selectionDraft.model ?? ""}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            onSelectionChange("model", event.target.value ? event.target.value : null)
                          }
                        >
                          <option value="">Use server default</option>
                          {visibleModels.map((model) => (
                            <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                              {toModelOptionLabel(model, catalog)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="settings-field">
                        <span className="settings-field-label">Small model</span>
                        <select
                          aria-label="Small model"
                          value={selectionDraft.smallModel ?? ""}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            onSelectionChange("smallModel", event.target.value ? event.target.value : null)
                          }
                        >
                          <option value="">Use server default</option>
                          {visibleModels.map((model) => (
                            <option key={`small-${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                              {toModelOptionLabel(model, catalog)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="settings-actions-row">
                      <span className="settings-helper-text">Use the small model for lightweight tasks such as naming, titling, or utility generations.</span>
                      <button
                        className="primary-button"
                        aria-label="Save model selection"
                        disabled={isSavingSelection || selectionUnchanged}
                        onClick={() => void onSaveSelection()}
                      >
                        {isSavingSelection ? "Saving..." : "Save model selection"}
                      </button>
                    </div>
                  </section>
                )}

                {activeTab === "model" ? (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Available</span>
                        <h3>Connected Models</h3>
                      </div>
                      <p>Every row below comes from a provider that is already configured and available in this project.</p>
                    </div>

                  {visibleModels.length > 0 ? (
                    <div className="model-list">
                      {visibleModels.map((model) => {
                        const providerName = catalog.find((item) => item.id === model.providerID)?.name ?? model.providerID
                        const modelValue = `${model.providerID}/${model.id}`

                        return (
                          <article key={modelValue} className="model-row">
                            <div className="model-row-main">
                              <div className="model-row-heading">
                                <div>
                                  <h4>{model.name}</h4>
                                  <p className="model-row-copy">
                                    <strong>{providerName}</strong>
                                    {model.family ? ` / ${model.family}` : ""}
                                  </p>
                                </div>

                                <div className="model-row-statuses">
                                  <span className="settings-badge">{model.status}</span>
                                  {selectionDraft.model === modelValue ? <span className="settings-badge is-highlight">Primary</span> : null}
                                  {selectionDraft.smallModel === modelValue ? <span className="settings-badge is-highlight">Small</span> : null}
                                </div>
                              </div>

                              <div className="model-row-tags">
                                {buildModelTags(model).map((tag) => (
                                  <span key={`${modelValue}-${tag}`} className="settings-badge">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <article className="settings-empty-state">
                      <span className="label">No Models</span>
                      <h3>No connected provider is exposing models yet</h3>
                      <p>Open the Provider tab, connect a provider with an API key, then come back here to review the unlocked models.</p>
                    </article>
                  )}

                  {false ? (
                    <div className="provider-grid">
                    {catalog.map((provider) => {
                      const draft = providerDrafts[provider.id] ?? {
                        apiKey: "",
                        baseURL: provider.baseURL ?? "",
                      }
                      const providerModels = modelGroups[provider.id] ?? []
                      const providerBusy = savingProviderID === provider.id || deletingProviderID === provider.id
                      const providerDirty = draft.apiKey.trim().length > 0 || draft.baseURL.trim() !== (provider.baseURL ?? "")
                      const canResetProvider = provider.source === "config"

                      return (
                        <article key={provider.id} className={provider.available ? "provider-card" : "provider-card is-muted"}>
                          <div className="provider-card-header">
                            <div>
                              <span className="label">{providerSourceLabel(provider)}</span>
                              <h4>{provider.name}</h4>
                            </div>

                            <div className="provider-card-statuses">
                              <span className="settings-badge">{provider.available ? "Available" : "Needs key"}</span>
                              {provider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                              <span className="settings-badge">{provider.modelCount} models</span>
                            </div>
                          </div>

                          <p className="provider-card-copy">
                            <strong>{provider.id}</strong>
                            {provider.env.length > 0 ? ` 路 Env ${provider.env.join(", ")}` : " 路 No env key required"}
                          </p>

                          <div className="provider-model-strip">
                            {providerModels.length > 0 ? (
                              providerModels.slice(0, 3).map((model) => (
                                <div key={`${model.providerID}/${model.id}`} className="provider-model-chip">
                                  <strong>{model.name}</strong>
                                  <span>{buildModelTags(model).join(" 路 ")}</span>
                                </div>
                              ))
                            ) : (
                              <span className="provider-model-empty">No project-visible models yet.</span>
                            )}
                          </div>

                          <div className="settings-field-grid">
                            <label className="settings-field">
                              <span className="settings-field-label">API key</span>
                              <input
                                aria-label={`API key for ${provider.name}`}
                                type="password"
                                value={draft.apiKey}
                                placeholder={
                                  provider.apiKeyConfigured
                                    ? "Stored key detected. Leave blank to keep it."
                                    : provider.env.length > 0
                                      ? `Or rely on ${provider.env.join(", ")}`
                                      : "Enter API key"
                                }
                                onChange={(event) => onProviderDraftChange(provider.id, "apiKey", event.target.value)}
                              />
                            </label>

                            <label className="settings-field">
                              <span className="settings-field-label">Base URL</span>
                              <input
                                aria-label={`Base URL for ${provider.name}`}
                                type="text"
                                value={draft.baseURL}
                                placeholder={provider.baseURL ?? "Optional custom endpoint"}
                                onChange={(event) => onProviderDraftChange(provider.id, "baseURL", event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="settings-actions-row">
                            <span className="settings-helper-text">
                              {canResetProvider
                                ? "Reset removes the project override and falls back to environment or catalog defaults."
                                : provider.source === "env"
                                  ? "This provider is currently active because the environment already exposes its key."
                                  : "Save a project override to make this provider selectable here."}
                            </span>

                            <div className="settings-inline-actions">
                              <button
                                className="secondary-button"
                                aria-label={`Reset ${provider.name} settings`}
                                disabled={!canResetProvider || providerBusy}
                                onClick={() => void onDeleteProvider(provider.id)}
                              >
                                {deletingProviderID === provider.id ? "Resetting..." : "Reset"}
                              </button>
                              <button
                                className="primary-button"
                                aria-label={`Save ${provider.name} settings`}
                                disabled={providerBusy || !providerDirty}
                                onClick={() => void onSaveProvider(provider.id)}
                              >
                                {savingProviderID === provider.id ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    </div>
                  ) : null}
                </section>
                ) : null}
              </>
            ) : null}

            {activeProvider && activeProviderDraft ? (
              <div className="provider-connect-overlay" role="presentation" onClick={handleProviderOverlayClick}>
                <article className="provider-connect-modal" role="dialog" aria-modal="true" aria-labelledby="provider-connect-title">
                  <header className="provider-connect-header">
                    <div>
                      <span className="label">{providerSourceLabel(activeProvider)}</span>
                      <h3 id="provider-connect-title">Connect {activeProvider.name}</h3>
                      <p>
                        Enter the API key below, then submit to enable this provider for {project?.name ?? "the current project"}.
                      </p>
                    </div>

                    <button className="secondary-button" aria-label="Close provider connect dialog" onClick={() => setConnectProviderID(null)}>
                      Close
                    </button>
                  </header>

                  <div className="provider-connect-body">
                    <label className="settings-field">
                      <span className="settings-field-label">API key</span>
                      <input
                        aria-label={`API key for ${activeProvider.name}`}
                        autoFocus
                        type="password"
                        value={activeProviderDraft.apiKey}
                        placeholder={
                          activeProvider.apiKeyConfigured
                            ? "Stored key detected. Leave blank to keep it."
                            : activeProvider.env.length > 0
                              ? `Or rely on ${activeProvider.env.join(", ")}`
                              : "Enter API key"
                        }
                        onChange={(event) => onProviderDraftChange(activeProvider.id, "apiKey", event.target.value)}
                      />
                    </label>

                    <label className="settings-field">
                      <span className="settings-field-label">Base URL</span>
                      <input
                        aria-label={`Base URL for ${activeProvider.name}`}
                        type="text"
                        value={activeProviderDraft.baseURL}
                        placeholder={activeProvider.baseURL ?? "Optional custom endpoint"}
                        onChange={(event) => onProviderDraftChange(activeProvider.id, "baseURL", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="settings-actions-row">
                    <div className="settings-inline-actions">
                      <button className="secondary-button" onClick={() => setConnectProviderID(null)}>
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        aria-label={`Submit ${activeProvider.name} provider settings`}
                        disabled={
                          savingProviderID === activeProvider.id ||
                          (activeProviderDraft.apiKey.trim().length === 0 && activeProviderDraft.baseURL.trim() === (activeProvider.baseURL ?? ""))
                        }
                        onClick={() => void handleProviderSubmit()}
                      >
                        {savingProviderID === activeProvider.id ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
*/

interface ThreadViewProps {
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  isResolvingPermissionRequest: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  threadColumnRef: RefObject<HTMLDivElement | null>
  onPermissionRequestResponse: PermissionRequestResponseHandler
}

type PermissionRequestResponseHandler = (input: {
  sessionID: string
  request: PermissionRequest
  decision: PermissionDecision
  note?: string
}) => void | Promise<void>

const primaryPermissionDecisions: PermissionDecision[] = ["deny", "allow-once"]

function formatPermissionRiskLabel(risk: PermissionRequest["prompt"]["risk"]) {
  return `${risk} risk`
}

function formatPermissionDecisionLabel(decision: PermissionDecision) {
  switch (decision) {
    case "allow-once":
      return "Allow once"
    case "allow-session":
      return "Allow this session"
    case "allow-project":
      return "Allow this project"
    case "allow-forever":
      return "Allow always"
    case "deny":
      return "Deny"
  }
}

function isPersistentAllowDecision(decision: PermissionDecision) {
  return decision === "allow-session" || decision === "allow-project" || decision === "allow-forever"
}

type AssistantTraceSectionKey = "reasoning" | "tools" | "response" | "file-change"

function isResponseTraceItem(item: AssistantTraceItem) {
  return item.kind === "text"
}

function isToolTraceItem(item: AssistantTraceItem) {
  return item.kind === "tool"
}

function isFileChangeTraceItem(item: AssistantTraceItem) {
  return item.kind === "patch" || item.kind === "file" || item.kind === "image"
}

function traceSectionKeyForItem(item: AssistantTraceItem): AssistantTraceSectionKey {
  if (isResponseTraceItem(item)) return "response"
  if (isFileChangeTraceItem(item)) return "file-change"
  if (isToolTraceItem(item)) return "tools"
  return "reasoning"
}

function traceSectionTitle(sectionKey: AssistantTraceSectionKey) {
  switch (sectionKey) {
    case "tools":
      return "Tools"
    case "response":
      return "Response"
    case "file-change":
      return "File Changes"
    default:
      return "Reasoning"
  }
}

function buildAssistantTraceBlocks(items: AssistantTraceItem[]) {
  return items.reduce<
    {
      sectionKey: AssistantTraceSectionKey
      title: string
      items: AssistantTraceItem[]
    }[]
  >(
    (blocks, item) => {
      const sectionKey = traceSectionKeyForItem(item)
      if (sectionKey === "file-change") {
        const fileChangeBlock = blocks.find((block) => block.sectionKey === "file-change")
        if (fileChangeBlock) {
          fileChangeBlock.items.push(item)
          return blocks
        }

        blocks.push({
          sectionKey,
          title: traceSectionTitle(sectionKey),
          items: [item],
        })
        return blocks
      }

      const fileChangeBlockIndex = blocks.findIndex((block) => block.sectionKey === "file-change")
      const insertIndex = fileChangeBlockIndex === -1 ? blocks.length : fileChangeBlockIndex
      const previousBlock = blocks[insertIndex - 1]

      if (previousBlock && previousBlock.sectionKey === sectionKey) {
        previousBlock.items.push(item)
        return blocks
      }

      blocks.splice(insertIndex, 0, {
        sectionKey,
        title: traceSectionTitle(sectionKey),
        items: [item],
      })
      return blocks
    },
    [],
  )
}

function filterRenderedAssistantTraceItems(items: AssistantTraceItem[], showFileChanges: boolean) {
  if (showFileChanges) return items

  return items.filter((item) => traceSectionKeyForItem(item) !== "file-change")
}

function summarizeFileChangeItems(items: AssistantTraceItem[]) {
  const latestPatch = [...items].reverse().find((item) => item.kind === "patch")
  if (latestPatch) return [latestPatch]

  const latestItem = items[items.length - 1]
  return latestItem ? [latestItem] : []
}

function AssistantTraceSection({
  children,
  sectionKey,
  title,
}: {
  children: ReactNode
  sectionKey: AssistantTraceSectionKey
  title: string
}) {
  return (
    <section className={`assistant-section is-${sectionKey}`} role="region" aria-label={title}>
      <div className="assistant-section-body">{children}</div>
    </section>
  )
}

function AssistantTurnSections({
  items,
  showFileChanges,
  turnID,
}: {
  items: AssistantTraceItem[]
  showFileChanges: boolean
  turnID: string
}) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, showFileChanges))

  return (
    <>
      {blocks.map((block, index) => {
        const renderedItems = block.sectionKey === "file-change" ? summarizeFileChangeItems(block.items) : block.items

        return (
          <AssistantTraceSection
            key={`${turnID}-${block.sectionKey}-${index}`}
            sectionKey={block.sectionKey}
            title={block.title}
          >
            <div
              className={
                block.sectionKey === "response"
                  ? "assistant-response-stack"
                  : block.sectionKey === "file-change"
                    ? "assistant-file-change-stack"
                    : "assistant-section-list"
              }
            >
              {renderedItems.map((item) => (
                <TraceItemView key={item.id} item={item} />
              ))}
            </div>
          </AssistantTraceSection>
        )
      })}
    </>
  )
}

function formatTraceStatusText(status?: AssistantTraceItem["status"]) {
  switch (status) {
    case "waiting-approval":
      return "waiting approval"
    case "completed":
      return "completed"
    case "running":
      return "running"
    case "pending":
      return "pending"
    case "error":
      return "error"
    case "denied":
      return "denied"
    default:
      return null
  }
}

function TraceItemView({ item }: { item: AssistantTraceItem }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const className = [
    "trace-item",
    `trace-kind-${item.kind}`,
    item.kind === "reasoning" || item.kind === "tool" ? "is-plain" : "",
    item.isStreaming ? "is-streaming" : "",
    item.status ? `is-${item.status}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  if (item.kind === "reasoning") {
    return (
      <article className={className} data-kind={item.kind}>
        {item.text ? <p className="trace-item-text trace-item-plain-text">{item.text}</p> : null}
        {item.detail ? <p className="trace-item-detail trace-item-plain-detail">{item.detail}</p> : null}
      </article>
    )
  }

  if (item.kind === "tool") {
    const statusText = formatTraceStatusText(item.status)
    const summaryTitle = item.title || item.label
    const hasDisclosureContent = Boolean(item.text || item.detail)
    const disclosureID = `trace-item-disclosure-${item.id}`

    return (
      <article className={className} data-kind={item.kind}>
        {hasDisclosureContent ? (
          <button
            className="trace-item-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-controls={disclosureID}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <span className="trace-item-toggle-summary">
              <span className="trace-item-toggle-icon" aria-hidden="true">
                {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </span>
              <span className="trace-item-toggle-line">
                <span className="trace-item-inline-title">{summaryTitle}</span>
                {statusText ? <span className="trace-item-inline-status">{" \u00b7 "}{statusText}</span> : null}
              </span>
            </span>
          </button>
        ) : (
          <p className="trace-item-toggle-line">
            <span className="trace-item-inline-title">{summaryTitle}</span>
            {statusText ? <span className="trace-item-inline-status">{" \u00b7 "}{statusText}</span> : null}
          </p>
        )}

        {hasDisclosureContent && isExpanded ? (
          <div id={disclosureID} className="trace-item-disclosure">
            {item.text ? <p className="trace-item-text">{item.text}</p> : null}
            {item.detail ? <p className="trace-item-detail">{item.detail}</p> : null}
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <article className={className} data-kind={item.kind}>
      <div className="trace-item-header">
        <span className="trace-item-label">{item.label}</span>
        {item.title ? <strong className="trace-item-title">{item.title}</strong> : null}
        {item.status ? <span className={`trace-item-status is-${item.status}`}>{item.status}</span> : null}
      </div>
      {item.text ? <p className="trace-item-text">{item.text}</p> : null}
      {item.detail ? <p className="trace-item-detail">{item.detail}</p> : null}
    </article>
  )
}

function PermissionRequestCard({
  actionError,
  activeSession,
  isResolving,
  request,
  onRespond,
}: {
  actionError: string | null
  activeSession: SessionSummary
  isResolving: boolean
  request: PermissionRequest
  onRespond: PermissionRequestResponseHandler
}) {
  const title = request.prompt.title.trim()
  const rememberDecisions = request.prompt.allowedDecisions.filter((decision) => isPersistentAllowDecision(decision))
  const detailLines = [
    request.prompt.details?.workdir ? { label: "Workdir", value: request.prompt.details.workdir } : null,
    request.prompt.details?.command ? { label: "Command", value: request.prompt.details.command } : null,
    request.prompt.details?.paths && request.prompt.details.paths.length > 0
      ? { label: "Paths", value: request.prompt.details.paths.join(", ") }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  function handleRespond(decision: PermissionDecision) {
    void onRespond({
      sessionID: activeSession.id,
      request,
      decision,
    })
  }

  return (
    <article className="permission-request-card">
      <header className="permission-request-header">
        <div>
          <span className="label">Approval Required</span>
          <h3>{title}</h3>
          <p className="permission-request-subtitle">{request.prompt.summary}</p>
          <p className="permission-request-rationale">{request.prompt.rationale}</p>
        </div>
        <div className="permission-request-badges">
          <span className={`permission-risk-chip is-${request.prompt.risk}`}>{formatPermissionRiskLabel(request.prompt.risk)}</span>
        </div>
      </header>

      <div className="permission-request-controls">
        <div className="settings-inline-actions permission-request-actions">
          {primaryPermissionDecisions.map((decision) => (
            <button
              key={decision}
              className={decision === "allow-once" ? "primary-button" : "secondary-button"}
              aria-label={`${formatPermissionDecisionLabel(decision)} ${title}`}
              disabled={isResolving}
              onClick={() => handleRespond(decision)}
              type="button"
            >
              {isResolving ? "Applying..." : formatPermissionDecisionLabel(decision)}
            </button>
          ))}
        </div>
      </div>

      {rememberDecisions.length > 0 ? (
        <details className="permission-request-disclosure">
          <summary>Remember this decision</summary>
          <div className="permission-request-memory-actions">
            {rememberDecisions.map((decision) => (
              <button
                key={decision}
                className="secondary-button"
                aria-label={`${formatPermissionDecisionLabel(decision)} ${title}`}
                disabled={isResolving}
                onClick={() => handleRespond(decision)}
                type="button"
              >
                {formatPermissionDecisionLabel(decision)}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {request.prompt.detailsAvailable && detailLines.length > 0 ? (
        <details className="permission-request-disclosure">
          <summary>View details</summary>
          <div className="permission-request-grid permission-request-grid-compact">
            <div className="permission-request-meta">
              <span className="permission-request-meta-label">Requested</span>
              <strong>{formatTime(request.createdAt)}</strong>
            </div>
            {detailLines.map((item) => (
              <div
                key={item.label}
                className={item.label === "Paths" || item.label === "Command" ? "permission-request-meta permission-request-meta-wide" : "permission-request-meta"}
              >
                <span className="permission-request-meta-label">{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="permission-request-footer">
        <p className="permission-request-note">The session resumes after this decision is recorded.</p>
      </div>

      {actionError ? <p className="permission-request-error">{actionError}</p> : null}
    </article>
  )
}

interface PermissionRequestInlinePromptProps {
  activeSession: SessionSummary | null
  isResolvingPermissionRequest: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  onPermissionRequestResponse: PermissionRequestResponseHandler
}

function PermissionRequestInlinePrompt({
  activeSession,
  isResolvingPermissionRequest,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  onPermissionRequestResponse,
}: PermissionRequestInlinePromptProps) {
  if (!activeSession || isResolvingPermissionRequest || pendingPermissionRequests.length === 0) return null

  const [request] = pendingPermissionRequests
  const remainingCount = pendingPermissionRequests.length - 1

  return (
    <article className="turn assistant-turn permission-request-turn">
      <section className="permission-request-inline" role="region" aria-labelledby="permission-request-title">
        <header className="permission-request-inline-header">
          <div>
            <span className="label">Tool Approval</span>
            <h3 id="permission-request-title">Tool approval request</h3>
            <p className="permission-request-inline-copy">Confirm or deny this tool call directly in the thread shell.</p>
          </div>
          {remainingCount > 0 ? (
            <span className="settings-badge permission-request-count">
              {remainingCount + 1} requests waiting
            </span>
          ) : null}
        </header>

        <PermissionRequestCard
          actionError={
            permissionRequestActionError &&
            (!permissionRequestActionRequestID || permissionRequestActionRequestID === request.id)
              ? permissionRequestActionError
              : null
          }
          activeSession={activeSession}
          isResolving={false}
          request={request}
          onRespond={onPermissionRequestResponse}
        />
      </section>
    </article>
  )
}

function findAssistantCycleBounds(turns: Turn[], assistantTurnIndex: number) {
  let startIndex = assistantTurnIndex
  while (startIndex > 0 && turns[startIndex - 1]?.kind === "assistant") {
    startIndex -= 1
  }

  let endIndex = assistantTurnIndex
  while (endIndex + 1 < turns.length && turns[endIndex + 1]?.kind === "assistant") {
    endIndex += 1
  }

  return { startIndex, endIndex }
}

function collectAssistantCycleFileChangeItems(turns: Turn[], startIndex: number, endIndex: number) {
  const items: AssistantTraceItem[] = []

  for (let index = startIndex; index <= endIndex; index += 1) {
    const turn = turns[index]
    if (!turn || turn.kind !== "assistant") continue

    items.push(...turn.items.filter((item) => item.kind !== "system" && isFileChangeTraceItem(item)))
  }

  return items
}

export function ThreadView({
  activeSession,
  activeTurns,
  isResolvingPermissionRequest,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  threadColumnRef,
  onPermissionRequestResponse,
}: ThreadViewProps) {
  return (
    <section className="thread-shell">
      <div ref={threadColumnRef} className="thread-column">
        {!activeSession ? (
          <article className="turn assistant-turn">
            <div className="assistant-shell">
              <header className="assistant-header">
                <div>
                  <span className="label">Agent Turn</span>
                  <h3>No session selected</h3>
                </div>
              </header>

              <div className="assistant-trace-list">
                <TraceItemView
                  item={{
                    id: "empty-no-session",
                    kind: "system",
                    timestamp: Date.now(),
                    label: "System",
                    title: "No session selected",
                    detail: "Load a folder from the sidebar or create a new session to begin.",
                    status: "completed",
                  }}
                />
              </div>
            </div>
          </article>
        ) : (
          <>
            {activeTurns.map((turn, turnIndex) => {
              if (turn.kind === "user") {
                return (
                  <article key={turn.id} className="turn user-turn">
                    <div className="turn-meta">
                      <span>You</span>
                      <time>{formatTime(turn.timestamp)}</time>
                    </div>
                    <div className="user-bubble">{turn.text}</div>
                  </article>
                )
              }

              const { startIndex, endIndex } = findAssistantCycleBounds(activeTurns, turnIndex)
              const isCycleFinalTurn = turnIndex === endIndex
              const cycleFileChangeItems = isCycleFinalTurn
                ? collectAssistantCycleFileChangeItems(activeTurns, startIndex, endIndex)
                : []
              const visibleItems = [
                ...turn.items.filter((item) => item.kind !== "system" && !isFileChangeTraceItem(item)),
                ...cycleFileChangeItems,
              ]
              if (visibleItems.length === 0) return null

              return (
                <article key={turn.id} className="turn assistant-turn">
                  <div className={turn.isStreaming ? "assistant-shell is-sectioned is-streaming" : "assistant-shell is-sectioned"}>
                    <AssistantTurnSections
                      turnID={turn.id}
                      items={visibleItems}
                      showFileChanges={isCycleFinalTurn && !turn.isStreaming}
                    />
                  </div>
                </article>
              )
            })}

            <PermissionRequestInlinePrompt
              activeSession={activeSession}
              isResolvingPermissionRequest={isResolvingPermissionRequest}
              pendingPermissionRequests={pendingPermissionRequests}
              permissionRequestActionError={permissionRequestActionError}
              permissionRequestActionRequestID={permissionRequestActionRequestID}
              onPermissionRequestResponse={onPermissionRequestResponse}
            />
          </>
        )}
      </div>
    </section>
  )
}

interface ComposerProps {
  attachments: ComposerAttachment[]
  draft: string
  hasActiveSession: boolean
  hasPendingPermissionRequests: boolean
  isSending: boolean
  modelOptions: ComposerModelOption[]
  skillOptions: ComposerSkillOption[]
  selectedModel: string | null
  selectedModelLabel: string
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onDraftChange: (value: string) => void
  onModelChange: (value: string | null) => void | Promise<void>
  onSkillToggle: (value: string) => void
  onPickAttachments: () => void | Promise<void>
  onRemoveAttachment: (path: string) => void
  onSend: () => void | Promise<void>
}

type ComposerMenuKey = "model" | "skill" | null

export function Composer({
  attachments,
  draft,
  hasActiveSession,
  hasPendingPermissionRequests,
  isSending,
  modelOptions,
  skillOptions,
  selectedModel,
  selectedModelLabel,
  selectedSkillIDs,
  selectedSkillLabel,
  onDraftChange,
  onModelChange,
  onSkillToggle,
  onPickAttachments,
  onRemoveAttachment,
  onSend,
}: ComposerProps) {
  const [openMenu, setOpenMenu] = useState<ComposerMenuKey>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openMenu) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [openMenu])

  function toggleMenu(menu: Exclude<ComposerMenuKey, null>) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function handleModelSelect(value: string | null) {
    setOpenMenu(null)
    void onModelChange(value)
  }

  function handleSkillToggle(value: string) {
    void onSkillToggle(value)
  }

  const sendButtonLabel = isSending ? "Sending task" : hasPendingPermissionRequests ? "Resolve approval first" : "Send task"

  return (
    <footer className="composer prompt-input-shell">
      <textarea
        aria-label="Task draft"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the UI, implementation task, or review target for the agent."
        rows={3}
      />

      {attachments.length > 0 ? (
        <div className="composer-attachment-strip" aria-label="Selected attachments">
          {attachments.map((attachment) => (
            <div key={attachment.path} className="composer-attachment-chip">
              <span className="composer-attachment-name" title={attachment.path}>
                {attachment.name}
              </span>
              <button
                aria-label={`Remove ${attachment.name}`}
                className="composer-attachment-remove"
                onClick={() => onRemoveAttachment(attachment.path)}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div ref={toolbarRef} className="composer-toolbar">
        <div className="composer-selectors" aria-label="Composer options">
          <button
            aria-label="Add image or file"
            className="composer-selector-button is-icon-only"
            onClick={() => void onPickAttachments()}
            title="Add image or file"
            type="button"
          >
            <PaperclipIcon />
          </button>

          <div className="composer-menu-anchor">
            <button
              aria-expanded={openMenu === "model"}
              aria-haspopup="dialog"
              aria-label={`Select model: ${selectedModelLabel}`}
              className="composer-selector-button"
              onClick={() => toggleMenu("model")}
              type="button"
            >
              <span>{selectedModelLabel}</span>
              <ChevronDownIcon />
            </button>

            {openMenu === "model" ? (
              <div className="composer-menu-panel" role="dialog" aria-label="Model selection">
                <button
                  className={selectedModel === null ? "composer-menu-option is-selected" : "composer-menu-option"}
                  onClick={() => handleModelSelect(null)}
                  type="button"
                >
                  <span>Use server default</span>
                </button>
                {modelOptions.length > 0 ? (
                  modelOptions.map((option) => (
                    <button
                      key={option.value}
                      className={selectedModel === option.value ? "composer-menu-option is-selected" : "composer-menu-option"}
                      onClick={() => handleModelSelect(option.value)}
                      type="button"
                    >
                      <span>{option.label}</span>
                    </button>
                  ))
                ) : (
                  <p className="composer-menu-empty">No visible models are available for this project yet.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="composer-menu-anchor">
            <button
              aria-expanded={openMenu === "skill"}
              aria-haspopup="dialog"
              aria-label={`Select skills: ${selectedSkillLabel}`}
              className="composer-selector-button"
              onClick={() => toggleMenu("skill")}
              type="button"
            >
              <span>{selectedSkillLabel}</span>
              <ChevronDownIcon />
            </button>

            {openMenu === "skill" ? (
              <div className="composer-menu-panel" role="dialog" aria-label="Skill selection">
                {skillOptions.length > 0 ? (
                  skillOptions.map((option) => {
                    const isSelected = selectedSkillIDs.includes(option.value)

                    return (
                      <button
                        key={option.value}
                        className={isSelected ? "composer-menu-option is-selected" : "composer-menu-option"}
                        onClick={() => handleSkillToggle(option.value)}
                        type="button"
                      >
                        <span className="composer-menu-option-copy">
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        <span className="composer-menu-option-check">{isSelected ? "Selected" : "Add"}</span>
                      </button>
                    )
                  })
                ) : (
                  <p className="composer-menu-empty">No Codex-style skills are available for this project.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="composer-actions">
          <button
            aria-label={sendButtonLabel}
            className="primary-button is-icon-only"
            disabled={isSending || !hasActiveSession || hasPendingPermissionRequests}
            onClick={() => void onSend()}
            title={sendButtonLabel}
            type="button"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </footer>
  )
}

