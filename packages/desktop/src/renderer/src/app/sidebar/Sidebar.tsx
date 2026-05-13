import { useEffect, useRef, useState, type Dispatch, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type SetStateAction } from "react"
import { createPortal } from "react-dom"
import { sidebarActions } from "../constants"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeModeIcon,
  CoworkModeIcon,
  DeleteIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  NewItemIcon,
  PinIcon,
  SessionRunningIcon,
  SettingsIcon,
  SideChatIcon,
  SortIcon
} from "../icons"
import { McpServersSidebarView, type McpServersSidebarViewProps } from "../mcp/McpServersPage"
import { PromptPresetsSidebarView, type PromptPresetsSidebarViewProps } from "../prompts/PromptPresetsPage"
import { ShellTopMenu, SidebarToggleButton } from "../shared-ui"
import { GlobalSkillsNavigator, type GlobalSkillsNavigatorProps } from "../skills/GlobalSkillsPage"
import { BuiltinToolsSidebarView, type BuiltinToolsSidebarViewProps } from "../tools/BuiltinToolsPage"
import type {
  GlobalSkillTreeNode,
  LeftSidebarView,
  SessionSummary,
  SidebarActionKey,
  WorkspaceMode,
  WorkspaceGroup
} from "../types"
import { isSideChatSession } from "../workspace"
import { WorkspaceModeSidebarPlaceholder } from "../workspace-mode/WorkspaceModePlaceholder"

const workspaceModeOptions = [
  { mode: "chat" as const, label: "Chat", Icon: SideChatIcon },
  { mode: "cowork" as const, label: "Cowork", Icon: CoworkModeIcon },
  { mode: "code" as const, label: "Code", Icon: CodeModeIcon },
]

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function formatSessionCreatedAge(timestamp: number, now: number) {
  const age = Math.max(0, now - timestamp)
  if (age < MINUTE_MS) return "\u521a\u521a"
  if (age < HOUR_MS) return `${Math.max(1, Math.floor(age / MINUTE_MS))} \u5206`
  if (age < DAY_MS) return `${Math.max(1, Math.floor(age / HOUR_MS))} \u5c0f\u65f6`
  return `${Math.max(1, Math.floor(age / DAY_MS))} \u5929`
}

function formatSessionCreatedTitle(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

function useSessionTimeNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalID = window.setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => window.clearInterval(intervalID)
  }, [])

  return now
}

interface SidebarProps {
  activeSessionID: string | null
  activeView: LeftSidebarView
  deletingSessionID: string | null
  expandedFolderIDs: string[]
  globalSkillsNavigatorProps: GlobalSkillsNavigatorProps
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isCreatingSession: boolean
  isSettingsOpen: boolean
  mcpServersSidebarProps: McpServersSidebarViewProps
  promptPresetsSidebarProps: PromptPresetsSidebarViewProps
  showSidebarToggleButton: boolean
  builtinToolsSidebarProps: BuiltinToolsSidebarViewProps
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  runningSessionIDs: string[]
  selectedFolderID: string | null
  sessionCanvasUnreadBySession: Record<string, boolean>
  visibleCanvasSessionIDs: string[]
  workspaces: WorkspaceGroup[]
  workspaceMode: WorkspaceMode
  pinnedWorkspaceIDs: string[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onOpenSettings: () => void
  onProjectArchiveSessions: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectClick: (workspace: WorkspaceGroup) => void
  onProjectCreateSession: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onProjectOpenInExplorer: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectPin: (workspace: WorkspaceGroup) => void
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
  onToggleSidebar: () => void
  onViewChange: (view: LeftSidebarView) => void
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
}

interface LeftSidebarTopMenuProps {
  activeView: LeftSidebarView
  showSidebarToggleButton: boolean
  workspaceMode: WorkspaceMode
  onToggleSidebar: () => void
  onViewChange: (view: LeftSidebarView) => void
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
}

function containsSkillTreePath(node: GlobalSkillTreeNode, targetPath: string | null): boolean {
  if (!targetPath) return false
  if (node.path === targetPath) return true
  if (node.kind !== "directory") return false

  return (node.children ?? []).some((child) => containsSkillTreePath(child, targetPath))
}

function LeftSidebarTopMenu({
  activeView,
  showSidebarToggleButton,
  workspaceMode,
  onToggleSidebar,
  onViewChange,
  onWorkspaceModeChange,
}: LeftSidebarTopMenuProps) {
  return (
    <ShellTopMenu
      as="header"
      ariaLabel="Left sidebar top menu"
      className="left-sidebar-top-menu"
      contentClassName="left-sidebar-top-menu-tabs"
      content={(
        <div className="workspace-mode-selector" role="group" aria-label="Workspace mode">
          {workspaceModeOptions.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              className={workspaceMode === mode && activeView === "workspace" ? "workspace-mode-selector-button is-active" : "workspace-mode-selector-button"}
              aria-label={label}
              aria-pressed={workspaceMode === mode && activeView === "workspace"}
              title={label}
              type="button"
              onClick={() => {
                onWorkspaceModeChange(mode)
                onViewChange("workspace")
              }}
            >
              <Icon />
            </button>
          ))}
        </div>
      )}
      dragRegion
      trailing={showSidebarToggleButton ? (
        <SidebarToggleButton isSidebarCollapsed={false} onToggleSidebar={onToggleSidebar} side="left" variant="top-menu" />
      ) : null}
      trailingClassName="left-sidebar-top-menu-actions"
    />
  )
}

interface FolderWorkspaceViewProps {
  activeSessionID: string | null
  deletingSessionID: string | null
  expandedFolderIDs: string[]
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isCreatingSession: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  runningSessionIDs: string[]
  selectedFolderID: string | null
  sessionCanvasUnreadBySession: Record<string, boolean>
  visibleCanvasSessionIDs: string[]
  workspaces: WorkspaceGroup[]
  pinnedWorkspaceIDs: string[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onProjectArchiveSessions: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectClick: (workspace: WorkspaceGroup) => void
  onProjectCreateSession: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onProjectOpenInExplorer: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectPin: (workspace: WorkspaceGroup) => void
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
}

type ProjectContextMenuState = {
  workspace: WorkspaceGroup
  x: number
  y: number
} | null

const PROJECT_CONTEXT_MENU_WIDTH = 240
const PROJECT_CONTEXT_MENU_HEIGHT = 152

function clampProjectContextMenuPosition(x: number, y: number) {
  const margin = 8
  if (typeof window === "undefined") {
    return { x, y }
  }

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - PROJECT_CONTEXT_MENU_WIDTH - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - PROJECT_CONTEXT_MENU_HEIGHT - margin)),
  }
}

interface ProjectContextMenuProps {
  deletingSessionID: string | null
  menu: ProjectContextMenuState
  pinnedWorkspaceIDs: string[]
  onClose: () => void
  onProjectArchiveSessions: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectOpenInExplorer: (workspace: WorkspaceGroup) => void | Promise<void>
  onProjectPin: (workspace: WorkspaceGroup) => void
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
}

function ProjectContextMenu({
  deletingSessionID,
  menu,
  pinnedWorkspaceIDs,
  onClose,
  onProjectArchiveSessions,
  onProjectOpenInExplorer,
  onProjectPin,
  onProjectRemove,
}: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return

    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      onClose()
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", onClose)
    window.addEventListener("scroll", onClose, true)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", onClose)
      window.removeEventListener("scroll", onClose, true)
    }
  }, [menu, onClose])

  if (!menu) return null

  const { workspace } = menu
  const position = clampProjectContextMenuPosition(menu.x, menu.y)
  const isMissingWorkspace = workspace.exists === false
  const hasArchivableSessions = workspace.sessions.some((session) => !isSideChatSession(session)) || workspace.sessions.length > 0
  const isArchiveDisabled = deletingSessionID !== null || !hasArchivableSessions
  const isPinnedFirst = pinnedWorkspaceIDs[0] === workspace.id

  return createPortal(
    <div
      ref={menuRef}
      className="ui-context-menu project-context-menu"
      role="menu"
      aria-label={`${workspace.name} actions`}
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="ui-context-menu__item"
        role="menuitem"
        type="button"
        disabled={isPinnedFirst}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
          onProjectPin(workspace)
        }}
      >
        <span className="ui-context-menu__icon" aria-hidden="true"><PinIcon /></span>
        <span className="ui-context-menu__label">{isPinnedFirst ? "已置顶" : "置顶项目"}</span>
      </button>
      <button
        className="ui-context-menu__item"
        role="menuitem"
        type="button"
        disabled={isMissingWorkspace}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
          void onProjectOpenInExplorer(workspace)
        }}
      >
        <span className="ui-context-menu__icon" aria-hidden="true"><FolderOpenIcon /></span>
        <span className="ui-context-menu__label">在资源管理器中打开</span>
      </button>
      <button
        className="ui-context-menu__item"
        role="menuitem"
        type="button"
        disabled={isArchiveDisabled}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
          void onProjectArchiveSessions(workspace)
        }}
      >
        <span className="ui-context-menu__icon" aria-hidden="true"><ArchiveIcon /></span>
        <span className="ui-context-menu__label">归档所有对话</span>
      </button>
      <div className="ui-context-menu__divider" role="separator" />
      <button
        className="ui-context-menu__item"
        role="menuitem"
        type="button"
        data-variant="danger"
        onClick={(event) => {
          onClose()
          onProjectRemove(workspace, event)
        }}
      >
        <span className="ui-context-menu__icon" aria-hidden="true"><DeleteIcon /></span>
        <span className="ui-context-menu__label">移除</span>
      </button>
    </div>,
    document.body,
  )
}

function FolderWorkspaceView({
  activeSessionID,
  deletingSessionID,
  expandedFolderIDs,
  hoveredFolderID,
  isCreatingProject,
  isCreatingSession,
  projectRowRefs,
  runningSessionIDs,
  selectedFolderID,
  sessionCanvasUnreadBySession,
  visibleCanvasSessionIDs,
  workspaces,
  pinnedWorkspaceIDs,
  onHoveredFolderChange,
  onProjectArchiveSessions,
  onProjectClick,
  onProjectCreateSession,
  onProjectOpenInExplorer,
  onProjectPin,
  onProjectRemove,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
}: FolderWorkspaceViewProps) {
  const runningSessionIDSet = new Set(runningSessionIDs)
  const visibleSessionIDSet = new Set(visibleCanvasSessionIDs)
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState>(null)
  const sessionTimeNow = useSessionTimeNow()

  function closeProjectContextMenu() {
    setProjectContextMenu(null)
  }

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
          const isExpanded = expandedFolderIDs.includes(workspace.id)
          const isMissingWorkspace = workspace.exists === false
          const showStateIcon = workspace.id === hoveredFolderID
          const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"
          const createSessionLabel = `Create session for ${workspace.name}`
          const createSessionTitle = isMissingWorkspace
            ? `${workspace.name} has been deleted and cannot create new sessions.`
            : createSessionLabel

          function handleProjectBlur(event: FocusEvent<HTMLDivElement>) {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            onHoveredFolderChange((current) => (current === workspace.id ? null : current))
          }

          function handleProjectContextMenu(event: MouseEvent<HTMLDivElement>) {
            const target = event.target
            if (target instanceof HTMLElement) {
              const editable = target.closest("input, textarea, [contenteditable='true'], webview")
              if (editable) return
            }

            event.preventDefault()
            event.stopPropagation()
            onHoveredFolderChange(workspace.id)
            setProjectContextMenu({
              workspace,
              x: event.clientX,
              y: event.clientY,
            })
          }

          return (
            <section key={workspace.id} className="project-block">
              <div
                className="project-row-shell"
                onMouseEnter={() => onHoveredFolderChange(workspace.id)}
                onMouseLeave={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                onFocus={() => onHoveredFolderChange(workspace.id)}
                onBlur={handleProjectBlur}
                onContextMenu={handleProjectContextMenu}
              >
                <button
                  ref={(node) => {
                    projectRowRefs.current[workspace.id] = node
                  }}
                  className={isActiveWorkspace ? "project-row is-active" : "project-row"}
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
                    <span className="project-row-meta" title={workspace.project.worktree}>
                      <span className="project-row-meta-label">{workspace.project.worktree}</span>
                      {isMissingWorkspace ? (
                        <span className="project-row-status is-missing">{"\u5df2\u5220\u9664"}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <div className="project-row-actions" aria-label={`${workspace.name} actions`}>
                  <button
                    className="row-action project-row-action"
                    aria-label={createSessionLabel}
                    title={createSessionTitle}
                    disabled={isCreatingSession || isMissingWorkspace}
                    onClick={(event) => void onProjectCreateSession(workspace, event)}
                  >
                    <NewItemIcon />
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="session-tree">
                  {workspace.sessions.filter((session) => !isSideChatSession(session)).map((session) => {
                    const active = session.id === activeSessionID
                    const isRunning = runningSessionIDSet.has(session.id)
                    const hasUnreadCanvas =
                      Boolean(sessionCanvasUnreadBySession[session.id]) && !visibleSessionIDSet.has(session.id)
                    const sessionCreatedAt = session.created ?? session.updated
                    return (
                      <div key={session.id} className="session-row-shell">
                        <button
                          className={active ? "session-row is-active" : "session-row"}
                          onClick={() => onSessionSelect(workspace.id, session.id)}
                        >
                          <span
                            className={
                              isRunning
                                ? "session-row-status-icon is-running"
                                : hasUnreadCanvas
                                  ? "session-row-status-icon is-unread"
                                  : "session-row-status-icon"
                            }
                            aria-hidden="true"
                          >
                            {isRunning ? (
                              <SessionRunningIcon />
                            ) : hasUnreadCanvas ? (
                              <span className="session-row-status-dot" />
                            ) : null}
                          </span>
                          <span className="session-row-copy">
                            <span className="session-row-label">{session.title}</span>
                          </span>
                        </button>
                        <span className="session-row-trailing">
                          <time
                            className="session-row-created-at"
                            dateTime={new Date(sessionCreatedAt).toISOString()}
                            title={formatSessionCreatedTitle(sessionCreatedAt)}
                          >
                            {formatSessionCreatedAge(sessionCreatedAt, sessionTimeNow)}
                          </time>
                          <button
                            className="row-action"
                            aria-label={`Archive session ${session.title}`}
                            title={`Archive session ${session.title}`}
                            disabled={deletingSessionID === session.id}
                            onClick={(event) => onSessionDelete(workspace, session, event)}
                          >
                            <ArchiveIcon />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
      <ProjectContextMenu
        deletingSessionID={deletingSessionID}
        menu={projectContextMenu}
        pinnedWorkspaceIDs={pinnedWorkspaceIDs}
        onClose={closeProjectContextMenu}
        onProjectArchiveSessions={onProjectArchiveSessions}
        onProjectOpenInExplorer={onProjectOpenInExplorer}
        onProjectPin={onProjectPin}
        onProjectRemove={onProjectRemove}
      />
    </section>
  )
}

function SkillsTreeNodeRow({
  deletingGlobalSkillDirectory,
  depth = 0,
  expandedSkillPaths,
  node,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedGlobalSkillFilePath,
  onDeleteGlobalSkill,
  onDirectoryToggle,
  onFileSelect,
  onRenameGlobalSkill,
  onRenameGlobalSkillDraftCancel,
  onRenameGlobalSkillDraftChange,
  onRenameGlobalSkillDraftStart,
}: {
  deletingGlobalSkillDirectory: string | null
  depth?: number
  expandedSkillPaths: string[]
  node: GlobalSkillTreeNode
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedGlobalSkillFilePath: string | null
  onDeleteGlobalSkill: (directoryPath?: string) => void | Promise<void>
  onDirectoryToggle: (path: string) => void
  onFileSelect: (path: string) => void | Promise<void>
  onRenameGlobalSkill: () => void | Promise<void>
  onRenameGlobalSkillDraftCancel: () => void
  onRenameGlobalSkillDraftChange: (value: string) => void
  onRenameGlobalSkillDraftStart: (directoryPath: string) => void
}) {
  if (node.kind === "file") {
    const isActive = node.path === selectedGlobalSkillFilePath

    return (
      <div className="skill-tree-item skill-tree-item-file">
        <button
          className={isActive ? "skill-tree-row is-active" : "skill-tree-row"}
          title={node.path}
          type="button"
          onClick={() => void onFileSelect(node.path)}
        >
          <span className="skill-tree-leading" aria-hidden="true">
            <FileTextIcon />
          </span>
          <span className="skill-tree-label">{node.name}</span>
        </button>
      </div>
    )
  }

  const isExpanded = expandedSkillPaths.includes(node.path)
  const isActiveDirectory = containsSkillTreePath(node, selectedGlobalSkillFilePath)
  const showDeleteAction = depth === 0
  const isRenameDraftVisible = depth === 0 && renamingGlobalSkillDraftDirectory === node.path
  const isRenamePending = renamingGlobalSkillDirectory === node.path

  function handleDirectoryDoubleClick(event: MouseEvent<HTMLButtonElement>) {
    if (depth !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onRenameGlobalSkillDraftStart(node.path)
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onRenameGlobalSkill()
  }

  function handleRenameInputBlur(event: FocusEvent<HTMLInputElement>) {
    if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return
    onRenameGlobalSkillDraftCancel()
  }

  function handleRenameInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      void onRenameGlobalSkill()
      return
    }

    if (event.key !== "Escape") return
    event.preventDefault()
    onRenameGlobalSkillDraftCancel()
  }

  return (
    <div className="skill-tree-item">
      <div className="skill-tree-row-shell">
        {isRenameDraftVisible ? (
          <form className="skill-tree-rename-form" aria-label={`Rename skill ${node.name}`} onSubmit={handleRenameSubmit}>
            <span className="skill-tree-leading" aria-hidden="true">
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
            <input
              autoFocus
              className="skill-tree-rename-input"
              aria-label={`Rename global skill ${node.name}`}
              disabled={isRenamePending}
              type="text"
              value={renamingGlobalSkillName}
              onBlur={handleRenameInputBlur}
              onChange={(event) => onRenameGlobalSkillDraftChange(event.target.value)}
              onKeyDown={handleRenameInputKeyDown}
            />
          </form>
        ) : (
          <button
            className={isActiveDirectory ? "skill-tree-row is-active" : "skill-tree-row"}
            aria-expanded={isExpanded}
            title={depth === 0 ? `${node.path}\nDouble-click to rename` : node.path}
            type="button"
            onClick={() => onDirectoryToggle(node.path)}
            onDoubleClick={handleDirectoryDoubleClick}
          >
            <span className="skill-tree-leading" aria-hidden="true">
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
            <span className="skill-tree-label">{node.name}</span>
          </button>
        )}
        {showDeleteAction ? (
          <button
            className="row-action skill-tree-row-action"
            aria-label={`Delete skill ${node.name}`}
            disabled={deletingGlobalSkillDirectory === node.path || isRenameDraftVisible || isRenamePending}
            title={`Delete skill ${node.name}`}
            type="button"
            onClick={() => void onDeleteGlobalSkill(node.path)}
          >
            <DeleteIcon />
          </button>
        ) : null}
      </div>

      {isExpanded && node.children?.length ? (
        <div className="skill-tree-children">
          {node.children.map((child) => (
            <SkillsTreeNodeRow
              key={child.path}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              depth={depth + 1}
              expandedSkillPaths={expandedSkillPaths}
              node={child}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
              onDeleteGlobalSkill={onDeleteGlobalSkill}
              onDirectoryToggle={onDirectoryToggle}
              onFileSelect={onFileSelect}
              onRenameGlobalSkill={onRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface SkillsSidebarViewProps {
  deletingGlobalSkillDirectory: string | null
  expandedSkillPaths: string[]
  creatingGlobalSkillName: string
  globalSkillsRoot: string
  globalSkillsTree: GlobalSkillTreeNode[]
  isCreateGlobalSkillDraftVisible: boolean
  isCreatingGlobalSkill: boolean
  isLoadingSkillsTree: boolean
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedGlobalSkillFilePath: string | null
  onCreateGlobalSkill: () => void | Promise<void>
  onCreateGlobalSkillDraftCancel: () => void
  onCreateGlobalSkillDraftChange: (value: string) => void
  onCreateGlobalSkillDraftStart: () => void
  onDeleteGlobalSkill: (directoryPath?: string) => void | Promise<void>
  onGlobalSkillDirectoryToggle: (path: string) => void
  onGlobalSkillFileSelect: (path: string) => void | Promise<void>
  onRenameGlobalSkill: () => void | Promise<void>
  onRenameGlobalSkillDraftCancel: () => void
  onRenameGlobalSkillDraftChange: (value: string) => void
  onRenameGlobalSkillDraftStart: (directoryPath: string) => void
}

export function SkillsSidebarView({
  deletingGlobalSkillDirectory,
  expandedSkillPaths,
  creatingGlobalSkillName,
  globalSkillsRoot,
  globalSkillsTree,
  isCreateGlobalSkillDraftVisible,
  isCreatingGlobalSkill,
  isLoadingSkillsTree,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedGlobalSkillFilePath,
  onCreateGlobalSkill,
  onCreateGlobalSkillDraftCancel,
  onCreateGlobalSkillDraftChange,
  onCreateGlobalSkillDraftStart,
  onDeleteGlobalSkill,
  onGlobalSkillDirectoryToggle,
  onGlobalSkillFileSelect,
  onRenameGlobalSkill,
  onRenameGlobalSkillDraftCancel,
  onRenameGlobalSkillDraftChange,
  onRenameGlobalSkillDraftStart,
}: SkillsSidebarViewProps) {
  function handleCreateSkillSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onCreateGlobalSkill()
  }

  function handleCreateSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return
    event.preventDefault()
    onCreateGlobalSkillDraftCancel()
  }

  return (
    <section className="sidebar-view sidebar-view-skills" aria-label="Skills sidebar view">
      <div className="sidebar-actions view-toolbar" aria-label="Skills view actions">
        <div className="panel-toolbar-copy sidebar-path-copy">
          <span className="label">Global</span>
          <strong>Skills</strong>
          <small title={globalSkillsRoot}>{globalSkillsRoot || "Loading global skills root..."}</small>
        </div>
        <div className="panel-toolbar-actions sidebar-actions-buttons">
          <button
            className="sidebar-action"
            aria-label="Create global skill"
            disabled={isCreatingGlobalSkill || isCreateGlobalSkillDraftVisible || Boolean(renamingGlobalSkillDraftDirectory || renamingGlobalSkillDirectory)}
            title="Create global skill"
            type="button"
            onClick={onCreateGlobalSkillDraftStart}
          >
            <NewItemIcon />
          </button>
        </div>
      </div>

      {isCreateGlobalSkillDraftVisible ? (
        <form className="skills-create-form" aria-label="Create global skill form" onSubmit={handleCreateSkillSubmit}>
          <input
            autoFocus
            className="skills-create-input"
            aria-label="New global skill name"
            disabled={isCreatingGlobalSkill}
            placeholder="new-skill"
            type="text"
            value={creatingGlobalSkillName}
            onChange={(event) => onCreateGlobalSkillDraftChange(event.target.value)}
            onKeyDown={handleCreateSkillKeyDown}
          />
          <div className="skills-create-actions">
            <button disabled={isCreatingGlobalSkill} type="submit">
              Create
            </button>
            <button disabled={isCreatingGlobalSkill} type="button" onClick={onCreateGlobalSkillDraftCancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="skills-tree-root">
        {isLoadingSkillsTree && globalSkillsTree.length === 0 ? (
          <p className="skills-tree-empty">Loading global skills...</p>
        ) : globalSkillsTree.length > 0 ? (
          globalSkillsTree.map((node) => (
            <SkillsTreeNodeRow
              key={node.path}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              expandedSkillPaths={expandedSkillPaths}
              node={node}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
              onDeleteGlobalSkill={onDeleteGlobalSkill}
              onDirectoryToggle={onGlobalSkillDirectoryToggle}
              onFileSelect={onGlobalSkillFileSelect}
              onRenameGlobalSkill={onRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
            />
          ))
        ) : (
          <p className="skills-tree-empty">No global skills exist yet. Use the add button to create the first one.</p>
        )}
      </div>
    </section>
  )
}

export function Sidebar({
  activeSessionID,
  activeView,
  deletingSessionID,
  expandedFolderIDs,
  globalSkillsNavigatorProps,
  hoveredFolderID,
  isCreatingProject,
  isCreatingSession,
  isSettingsOpen,
  mcpServersSidebarProps,
  promptPresetsSidebarProps,
  showSidebarToggleButton,
  builtinToolsSidebarProps,
  projectRowRefs,
  runningSessionIDs,
  selectedFolderID,
  sessionCanvasUnreadBySession,
  visibleCanvasSessionIDs,
  workspaces,
  workspaceMode,
  pinnedWorkspaceIDs,
  onHoveredFolderChange,
  onOpenSettings,
  onProjectArchiveSessions,
  onProjectClick,
  onProjectCreateSession,
  onProjectOpenInExplorer,
  onProjectPin,
  onProjectRemove,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
  onToggleSidebar,
  onViewChange,
  onWorkspaceModeChange,
}: SidebarProps) {
  return (
    <aside id="app-sidebar" className="sidebar" aria-label="Primary sidebar">
      <LeftSidebarTopMenu
        activeView={activeView}
        showSidebarToggleButton={showSidebarToggleButton}
        workspaceMode={workspaceMode}
        onToggleSidebar={onToggleSidebar}
        onViewChange={onViewChange}
        onWorkspaceModeChange={onWorkspaceModeChange}
      />

      <div className="sidebar-view-host">
        {activeView === "workspace" ? (
          workspaceMode === "code" ? (
            <FolderWorkspaceView
              activeSessionID={activeSessionID}
              deletingSessionID={deletingSessionID}
              expandedFolderIDs={expandedFolderIDs}
              hoveredFolderID={hoveredFolderID}
              isCreatingProject={isCreatingProject}
              isCreatingSession={isCreatingSession}
              projectRowRefs={projectRowRefs}
              runningSessionIDs={runningSessionIDs}
              selectedFolderID={selectedFolderID}
              sessionCanvasUnreadBySession={sessionCanvasUnreadBySession}
              visibleCanvasSessionIDs={visibleCanvasSessionIDs}
              workspaces={workspaces}
              pinnedWorkspaceIDs={pinnedWorkspaceIDs}
              onHoveredFolderChange={onHoveredFolderChange}
              onProjectArchiveSessions={onProjectArchiveSessions}
              onProjectClick={onProjectClick}
              onProjectCreateSession={onProjectCreateSession}
              onProjectOpenInExplorer={onProjectOpenInExplorer}
              onProjectPin={onProjectPin}
              onProjectRemove={onProjectRemove}
              onSessionDelete={onSessionDelete}
              onSessionSelect={onSessionSelect}
              onSidebarAction={onSidebarAction}
            />
          ) : (
            <WorkspaceModeSidebarPlaceholder mode={workspaceMode} />
          )
        ) : null}
        {activeView === "skills" ? (
          <GlobalSkillsNavigator {...globalSkillsNavigatorProps} />
        ) : null}
        {activeView === "prompts" ? (
          <PromptPresetsSidebarView {...promptPresetsSidebarProps} />
        ) : null}
        {activeView === "mcp" ? (
          <McpServersSidebarView {...mcpServersSidebarProps} />
        ) : null}
        {activeView === "tools" ? (
          <BuiltinToolsSidebarView {...builtinToolsSidebarProps} />
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
