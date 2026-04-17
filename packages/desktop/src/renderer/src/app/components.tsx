import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject, type SetStateAction } from "react"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, sidebarActions } from "./constants"
import { isMatchingGitStateChangedDetail, notifyGitStateChanged, subscribeToGitStateChanged } from "./git-events"
import {
  ArchiveIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DeleteIcon,
  DisconnectedStatusIcon,
  FileTextIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  LayoutSidebarRightIcon,
  LeftSidebarCollapseIcon,
  LeftSidebarExpandIcon,
  MaximizeIcon,
  MinimizeIcon,
  NewItemIcon,
  OpenInEditorIcon,
  PaletteIcon,
  PaperclipIcon,
  RestoreIcon,
  RightSidebarCollapseIcon,
  RightSidebarExpandIcon,
  SettingsIcon,
  SortIcon,
} from "./icons"
import type {
  AssistantTurn,
  AssistantTraceItem,
  ComposerAttachment,
  ComposerMcpOption,
  ComposerModelOption,
  ComposerSkillOption,
  CreateSessionTab,
  GlobalSkillTreeNode,
  LeftSidebarView,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  PermissionDecision,
  PermissionRequest,
  ProjectModelSelection,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel,
  RightSidebarView,
  ArchivedSessionSummary,
  SessionDiffState,
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

function joinClassNames(...tokens: Array<string | null | undefined | false>) {
  return tokens.filter(Boolean).join(" ")
}

interface ShellTopMenuProps {
  ariaLabel: string
  as?: "div" | "header" | "nav"
  className?: string
  content: ReactNode
  contentClassName?: string
  controlsSpacerVariant?: "canvas" | "right-sidebar"
  dragRegion?: boolean
  layout?: "split" | "three-column"
  leading?: ReactNode
  leadingClassName?: string
  trailing?: ReactNode
  trailingClassName?: string
}

function ShellTopMenu({
  ariaLabel,
  as = "div",
  className,
  content,
  contentClassName,
  controlsSpacerVariant,
  dragRegion = false,
  layout = "split",
  leading,
  leadingClassName,
  trailing,
  trailingClassName,
}: ShellTopMenuProps) {
  const Component = as

  return (
    <Component
      className={joinClassNames(
        "shell-top-menu",
        layout === "three-column" ? "is-three-column" : null,
        "panel-toolbar",
        dragRegion ? "window-drag-region" : null,
        className,
      )}
      aria-label={ariaLabel}
    >
      {leading !== undefined ? (
        <div className={joinClassNames("shell-top-menu-leading", leadingClassName)}>
          {leading}
        </div>
      ) : null}
      <div className={joinClassNames("shell-top-menu-content", contentClassName)}>
        {content}
      </div>
      {trailing !== undefined ? (
        <div className={joinClassNames("shell-top-menu-trailing", trailingClassName)}>
          {trailing}
        </div>
      ) : null}
      {controlsSpacerVariant ? <WindowControlsSpacer variant={controlsSpacerVariant} /> : null}
    </Component>
  )
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
  bottomSlotRef?: (node: HTMLDivElement | null) => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  side: SidebarSide
}

export function ActivityRail({ bottomSlotRef, isSidebarCollapsed, onToggleSidebar, side }: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"

  return (
    <aside className={railClassName} aria-label={side === "left" ? "Primary navigation rail" : "Inspector rail"}>
      <div className="activity-rail-primary">
        <SidebarToggleButton
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          side={side}
          variant="rail"
        />
      </div>
      {bottomSlotRef ? <div ref={bottomSlotRef} className="activity-rail-bottom" /> : null}
    </aside>
  )
}

interface SidebarProps {
  activeSessionID: string | null
  activeView: LeftSidebarView
  deletingGlobalSkillDirectory: string | null
  deletingSessionID: string | null
  expandedFolderID: string | null
  expandedSkillPaths: string[]
  creatingGlobalSkillName: string
  globalSkillsRoot: string
  globalSkillsTree: GlobalSkillTreeNode[]
  hoveredFolderID: string | null
  isCreateGlobalSkillDraftVisible: boolean
  isCreatingGlobalSkill: boolean
  isCreatingProject: boolean
  isCreatingSession: boolean
  isLoadingSkillsTree: boolean
  isSettingsOpen: boolean
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedGlobalSkillFilePath: string | null
  showSidebarToggleButton: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  workspaces: WorkspaceGroup[]
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
    <ShellTopMenu
      as="header"
      ariaLabel="Left sidebar top menu"
      className="left-sidebar-top-menu"
      contentClassName="left-sidebar-top-menu-tabs"
      content={(
        <>
          <TopMenuViewButton active={activeView === "workspace"} label="Workspace" onClick={() => onViewChange("workspace")}>
            <LayoutSidebarLeftIcon />
          </TopMenuViewButton>
          <TopMenuViewButton active={activeView === "skills"} label="Skills" onClick={() => onViewChange("skills")}>
            <FileTextIcon />
          </TopMenuViewButton>
        </>
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
          const isMissingWorkspace = workspace.exists === false
          const showStateIcon = workspace.id === hoveredFolderID
          const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"
          const removeLabel = "\u79FB\u9664"
          const removeFolderLabel = `${removeLabel} ${workspace.name}`
          const createSessionLabel = `Create session for ${workspace.name}`
          const createSessionTitle = isMissingWorkspace
            ? `${workspace.name} has been deleted and cannot create new sessions.`
            : createSessionLabel

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
                      <span className="project-row-meta">
                        <span className="project-row-meta-label">{workspace.project.name}</span>
                        {isMissingWorkspace ? (
                          <span className="project-row-status is-missing">{"\u5df2\u5220\u9664"}</span>
                        ) : null}
                      </span>
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
                      title={createSessionTitle}
                      disabled={isCreatingSession || isMissingWorkspace}
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
                          aria-label={`Archive session ${session.title}`}
                          title={`Archive session ${session.title}`}
                          disabled={deletingSessionID === session.id}
                          onClick={(event) => onSessionDelete(workspace, session, event)}
                        >
                          <ArchiveIcon />
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
            className="skill-tree-row"
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

function SkillsSidebarView({
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
  deletingGlobalSkillDirectory,
  deletingSessionID,
  expandedFolderID,
  expandedSkillPaths,
  creatingGlobalSkillName,
  globalSkillsRoot,
  globalSkillsTree,
  hoveredFolderID,
  isCreateGlobalSkillDraftVisible,
  isCreatingGlobalSkill,
  isCreatingProject,
  isCreatingSession,
  isLoadingSkillsTree,
  isSettingsOpen,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedGlobalSkillFilePath,
  showSidebarToggleButton,
  projectRowRefs,
  selectedFolderID,
  workspaces,
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
        {activeView === "skills" ? (
          <SkillsSidebarView
            deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
            expandedSkillPaths={expandedSkillPaths}
            creatingGlobalSkillName={creatingGlobalSkillName}
            globalSkillsRoot={globalSkillsRoot}
            globalSkillsTree={globalSkillsTree}
            isCreateGlobalSkillDraftVisible={isCreateGlobalSkillDraftVisible}
            isCreatingGlobalSkill={isCreatingGlobalSkill}
            isLoadingSkillsTree={isLoadingSkillsTree}
            renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
            renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
            renamingGlobalSkillName={renamingGlobalSkillName}
            selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
            onCreateGlobalSkill={onCreateGlobalSkill}
            onCreateGlobalSkillDraftCancel={onCreateGlobalSkillDraftCancel}
            onCreateGlobalSkillDraftChange={onCreateGlobalSkillDraftChange}
            onCreateGlobalSkillDraftStart={onCreateGlobalSkillDraftStart}
            onDeleteGlobalSkill={onDeleteGlobalSkill}
            onGlobalSkillDirectoryToggle={onGlobalSkillDirectoryToggle}
            onGlobalSkillFileSelect={onGlobalSkillFileSelect}
            onRenameGlobalSkill={onRenameGlobalSkill}
            onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
            onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
            onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
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
  activeSessionDirectory: string | null
  activeSession: SessionSummary | null
  activeSessionDiff: SessionDiffSummary | null
  activeSessionDiffState?: SessionDiffState
  selectedDiffFile: string | null
  activeView: RightSidebarView
  onDiffFileSelect: (file: string | null) => void
  onRefresh: () => void | Promise<void>
  onViewChange: (view: RightSidebarView) => void
}

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
const RIGHT_SIDEBAR_IDLE_STATE: SessionDiffState = {
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
  activeSessionDirectory,
  activeSession,
  activeSessionDiff,
  activeSessionDiffState,
  selectedDiffFile,
  activeView,
  onDiffFileSelect,
  onRefresh,
  onViewChange,
}: RightSidebarProps) {
  const [diffFilter, setDiffFilter] = useState<DiffFilterKey>("all")
  const [diffQuery, setDiffQuery] = useState("")
  const diffState = activeSessionDiffState ?? RIGHT_SIDEBAR_IDLE_STATE
  const changedFilesCount = activeSessionDiff?.stats?.files ?? activeSessionDiff?.diffs.length ?? 0
  const additionsCount = activeSessionDiff?.stats?.additions ?? 0
  const deletionsCount = activeSessionDiff?.stats?.deletions ?? 0
  const hasWorkspaceChanges = Boolean(activeSessionDiff && activeSessionDiff.diffs.length > 0)
  const normalizedQuery = diffQuery.trim().toLowerCase()
  const filteredDiffs = (activeSessionDiff?.diffs ?? []).filter((diff) => {
    const diffType = getDiffChangeType(diff)
    if (diffFilter !== "all" && diffType !== diffFilter) return false
    if (!normalizedQuery) return true
    return diff.file.toLowerCase().includes(normalizedQuery)
  })

  useEffect(() => {
    setDiffFilter("all")
    setDiffQuery("")
  }, [activeSession?.id])

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

  return (
    <aside id="app-sidebar-right" className="sidebar is-right" aria-label="Inspector sidebar">
      <ShellTopMenu
        as="header"
        ariaLabel="Right sidebar top menu"
        className="right-sidebar-top-menu"
        contentClassName="right-sidebar-top-menu-tabs"
        content={(
          <TopMenuViewButton active={activeView === "changes"} label="Changes" onClick={() => onViewChange("changes")}>
            <LayoutSidebarRightIcon />
          </TopMenuViewButton>
        )}
        controlsSpacerVariant="right-sidebar"
        dragRegion
      />

      <div className="right-sidebar-view-host">
        {activeView === "changes" ? (
          <section className="right-sidebar-section">
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
                  onClick={() => void onRefresh()}
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
                          aria-label="Search workspace diff files"
                          type="search"
                          value={diffQuery}
                          placeholder="Filter files"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setDiffQuery(event.target.value)}
                        />
                      </label>
                    </div>

                    {filteredDiffs.length > 0 ? (
                      <div className="right-sidebar-change-list">
                        {filteredDiffs.map((diff) => {
                          const diffType = getDiffChangeType(diff)
                          const isExpanded = selectedDiffFile === diff.file

                          return (
                            <div key={diff.file} className="right-sidebar-change-row">
                              <button
                                type="button"
                                className="right-sidebar-change-toggle"
                                aria-expanded={isExpanded}
                                aria-label={`Toggle diff for ${diff.file}`}
                                onClick={() => onDiffFileSelect(isExpanded ? null : diff.file)}
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
                              {isExpanded ? <DiffPreview file={diff.file} patch={diff.patch} /> : null}
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
  workspaces: WorkspaceGroup[]
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

function getCreateSessionWorkspaceLabel(tab: CreateSessionTab, workspaces: WorkspaceGroup[]) {
  const workspace = workspaces.find((item) => item.id === tab.workspaceID)
  return workspace ? workspace.name : null
}

function getCreateSessionTabTitle(tab: CreateSessionTab, index: number, workspaces: WorkspaceGroup[]) {
  const workspaceLabel = getCreateSessionWorkspaceLabel(tab, workspaces)
  if (workspaceLabel) {
    return index === 0 ? `Create · ${workspaceLabel}` : `Create ${index + 1} · ${workspaceLabel}`
  }

  return index === 0 ? "Create session" : `Create session ${index + 1}`
}

function getCreateSessionTabSwitchLabel(tab: CreateSessionTab, index: number) {
  return index === 0 ? "Switch to create session tab" : `Switch to create session tab ${index + 1}`
}

function getCreateSessionTabCloseLabel(tab: CreateSessionTab, index: number) {
  return index === 0 ? "Close create session tab" : `Close create session tab ${index + 1}`
}

type GitCapabilityState = {
  enabled: boolean
  reason?: string
}

type GitCapabilitiesState = {
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: GitCapabilityState
  canStageAllCommit: GitCapabilityState
  canPush: GitCapabilityState
  canCreatePullRequest: GitCapabilityState
  canCreateBranch: GitCapabilityState
}

const GIT_QUICK_MENU_REFRESH_INTERVAL_MS = 2000

function GitQuickMenuButton({ projectID, directory }: { projectID: string | null; directory: string | null }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const commitInputRef = useRef<HTMLInputElement | null>(null)
  const branchInputRef = useRef<HTMLInputElement | null>(null)
  const loadRequestRef = useRef(0)
  const visibleLoadRequestRef = useRef(0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeForm, setActiveForm] = useState<"commit" | "branch" | null>(null)
  const [commitMessage, setCommitMessage] = useState("")
  const [branchName, setBranchName] = useState("")
  const [capabilities, setCapabilities] = useState<GitCapabilitiesState | null>(null)
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false)
  const [pendingAction, setPendingAction] = useState<"commit" | "stage-all-commit" | "push" | "pull-request" | "branch" | null>(null)
  const [status, setStatus] = useState<{
    tone: "neutral" | "success" | "error"
    text: string
  }>({
    tone: "neutral",
    text: "",
  })

  const gitGetCapabilities = window.desktop?.gitGetCapabilities
  const gitCommit = window.desktop?.gitCommit
  const gitPush = window.desktop?.gitPush
  const gitCreateBranch = window.desktop?.gitCreateBranch
  const gitCreatePullRequest = window.desktop?.gitCreatePullRequest

  const handleGitStateChanged = useEffectEvent((detail: { directory: string }) => {
    if (!isMatchingGitStateChangedDetail(detail, directory)) return
    void refreshCapabilities()
  })

  async function refreshCapabilities({
    reportError = false,
    silent = false,
  }: {
    reportError?: boolean
    silent?: boolean
  } = {}) {
    if (!projectID || !directory || !gitGetCapabilities) {
      setCapabilities(null)
      setIsLoadingCapabilities(false)
      return null
    }

    const requestID = loadRequestRef.current + 1
    loadRequestRef.current = requestID
    const visibleRequestID = silent ? null : visibleLoadRequestRef.current + 1
    if (visibleRequestID !== null) {
      visibleLoadRequestRef.current = visibleRequestID
      setIsLoadingCapabilities(true)
    }

    try {
      const nextCapabilities = await gitGetCapabilities({
        projectID,
        directory,
      })

      if (loadRequestRef.current !== requestID) {
        return null
      }

      setCapabilities(nextCapabilities)
      return nextCapabilities
    } catch (error) {
      if (loadRequestRef.current !== requestID) {
        return null
      }

      setCapabilities(null)
      if (reportError) {
        setStatus({
          tone: "error",
          text: error instanceof Error ? error.message : String(error),
        })
      }
      return null
    } finally {
      if (visibleRequestID !== null && visibleLoadRequestRef.current === visibleRequestID) {
        setIsLoadingCapabilities(false)
      }
    }
  }

  const refreshCapabilitiesSilently = useEffectEvent((reportError = false) => {
    void refreshCapabilities({
      reportError,
      silent: true,
    })
  })

  useEffect(() => {
    setIsMenuOpen(false)
    setActiveForm(null)
    setCommitMessage("")
    setBranchName("")
    setStatus({
      tone: "neutral",
      text: "",
    })
    void refreshCapabilities()
  }, [projectID, directory])

  useEffect(() => subscribeToGitStateChanged(handleGitStateChanged), [handleGitStateChanged])

  useEffect(() => {
    if (!isMenuOpen) return

    refreshCapabilitiesSilently(true)

    const refreshVisibleCapabilities = () => {
      refreshCapabilitiesSilently()
    }

    const intervalID = window.setInterval(refreshVisibleCapabilities, GIT_QUICK_MENU_REFRESH_INTERVAL_MS)
    const handleWindowFocus = () => {
      refreshVisibleCapabilities()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      refreshVisibleCapabilities()
    }

    window.addEventListener("focus", handleWindowFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalID)
      window.removeEventListener("focus", handleWindowFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isMenuOpen, refreshCapabilitiesSilently])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
      setActiveForm(null)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
        setActiveForm(null)
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
    if (!isMenuOpen) return

    if (activeForm === "commit") {
      commitInputRef.current?.focus()
      return
    }

    if (activeForm === "branch") {
      branchInputRef.current?.focus()
    }
  }, [activeForm, isMenuOpen])

  async function handleCommit(options?: { stageAll?: boolean }) {
    const message = commitMessage.trim()
    const stageAll = options?.stageAll === true

    if (!message) {
      setStatus({
        tone: "error",
        text: "Enter a commit message.",
      })
      return
    }

    if (!projectID || !directory || !gitCommit) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction(stageAll ? "stage-all-commit" : "commit")
    setStatus({
      tone: "neutral",
      text: stageAll ? "Staging all changes and committing..." : "Committing staged changes...",
    })

    try {
      const result = await gitCommit({
        projectID,
        directory,
        message,
        ...(stageAll ? { stageAll: true } : {}),
      })
      setCommitMessage("")
      setActiveForm(null)
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
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
    if (!projectID || !directory || !gitPush) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("push")
    setActiveForm(null)
    setStatus({
      tone: "neutral",
      text: "Pushing branch...",
    })

    try {
      const result = await gitPush({
        projectID,
        directory,
      })
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
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

  async function handleCreateBranch() {
    const name = branchName.trim()

    if (!capabilities?.canCreateBranch.enabled) {
      setStatus({
        tone: "error",
        text: capabilities?.canCreateBranch.reason ?? "A branch cannot be created right now.",
      })
      return
    }

    if (!name) {
      setStatus({
        tone: "error",
        text: "Enter a branch name.",
      })
      return
    }

    if (!projectID || !directory || !gitCreateBranch) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("branch")
    setStatus({
      tone: "neutral",
      text: "Creating branch...",
    })

    try {
      const result = await gitCreateBranch({
        projectID,
        directory,
        name,
      })
      setBranchName("")
      setActiveForm(null)
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
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

  async function handleCreatePullRequest() {
    if (!projectID || !directory || !gitCreatePullRequest) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("pull-request")
    setActiveForm(null)
    setStatus({
      tone: "neutral",
      text: "Creating pull request...",
    })

    try {
      const result = await gitCreatePullRequest({
        projectID,
        directory,
      })
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
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

  if (!projectID || !directory || !gitGetCapabilities || !capabilities?.isGitRepo) {
    return null
  }

  const isBusy = pendingAction !== null || isLoadingCapabilities
  const defaultStatusText = capabilities.branch
    ? `Current branch: ${capabilities.branch}`
    : "The current worktree is on a detached HEAD."

  const canOpenCommitForm = capabilities.canCommit.enabled || capabilities.canStageAllCommit.enabled
  const commitRowTitle = capabilities.canCommit.enabled
    ? "Commit the staged changes."
    : capabilities.canStageAllCommit.enabled
      ? "Stage all local changes and commit them."
      : capabilities.canStageAllCommit.reason ?? capabilities.canCommit.reason
  const commitRowDescription = capabilities.canCommit.enabled
    ? "Create a commit from the staged changes, or stage everything first."
    : capabilities.canStageAllCommit.enabled
      ? "No staged changes yet. Stage all local changes and commit them."
      : capabilities.canStageAllCommit.reason ?? capabilities.canCommit.reason

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
        <div ref={menuRef} id="canvas-top-menu-git-menu" className="canvas-top-menu-quick-panel git-quick-menu-panel" role="dialog" aria-label="Git quick menu">
          <div className="git-quick-menu-options" role="group" aria-label="Git actions">
            <button
              type="button"
              className={activeForm === "commit" ? "composer-menu-option git-quick-menu-option is-selected" : "composer-menu-option git-quick-menu-option"}
              disabled={!canOpenCommitForm || isBusy}
              title={commitRowTitle}
              onClick={() => {
                setActiveForm((current) => current === "commit" ? null : "commit")
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Commit changes</strong>
                <small>{commitRowDescription}</small>
              </span>
              <span className="composer-menu-option-check">
                {pendingAction === "commit" || pendingAction === "stage-all-commit" ? "Working..." : "Open"}
              </span>
            </button>

            <button
              type="button"
              className="composer-menu-option git-quick-menu-option"
              disabled={!capabilities.canPush.enabled || isBusy}
              title={capabilities.canPush.enabled ? "Push the current branch." : capabilities.canPush.reason}
              onClick={() => {
                void handlePush()
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Push branch</strong>
                <small>{capabilities.canPush.enabled ? "Push the current branch to its tracked remote." : capabilities.canPush.reason}</small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "push" ? "Working..." : "Run"}</span>
            </button>

            <button
              type="button"
              className="composer-menu-option git-quick-menu-option"
              disabled={!capabilities.canCreatePullRequest.enabled || isBusy}
              title={capabilities.canCreatePullRequest.enabled ? "Create a pull request for the current branch." : capabilities.canCreatePullRequest.reason}
              onClick={() => {
                void handleCreatePullRequest()
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Create pull request</strong>
                <small>
                  {capabilities.canCreatePullRequest.enabled
                    ? "Create a pull request from the current branch."
                    : capabilities.canCreatePullRequest.reason}
                </small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "pull-request" ? "Working..." : "Run"}</span>
            </button>

            <button
              type="button"
              className={activeForm === "branch" ? "composer-menu-option git-quick-menu-option is-selected" : "composer-menu-option git-quick-menu-option"}
              disabled={!capabilities.canCreateBranch.enabled || isBusy}
              title={capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}
              onClick={() => {
                setActiveForm((current) => current === "branch" ? null : "branch")
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Create branch</strong>
                <small>{capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}</small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "branch" ? "Working..." : "Open"}</span>
            </button>
          </div>

          {activeForm === "commit" ? (
            <div className="git-quick-menu-form">
              <label className="canvas-top-menu-quick-field">
                <span>Commit message</span>
                <input
                  ref={commitInputRef}
                  type="text"
                  value={commitMessage}
                  placeholder="Enter commit message"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setCommitMessage(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCommit()
                    }
                  }}
                />
              </label>

              <div className="canvas-top-menu-quick-actions">
                <button className="secondary-button" type="button" onClick={() => setActiveForm(null)} disabled={isBusy}>
                  Cancel
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleCommit({ stageAll: true })}
                  disabled={!capabilities.canStageAllCommit.enabled || isBusy}
                  title={capabilities.canStageAllCommit.enabled ? "Stage all local changes and commit them." : capabilities.canStageAllCommit.reason}
                >
                  {pendingAction === "stage-all-commit" ? "Staging + committing..." : "Stage all + commit"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={!capabilities.canCommit.enabled || isBusy}
                  title={capabilities.canCommit.enabled ? "Commit only the staged changes." : capabilities.canCommit.reason}
                >
                  {pendingAction === "commit" ? "Committing..." : "Run commit"}
                </button>
              </div>
            </div>
          ) : null}

          {activeForm === "branch" ? (
            <div className="git-quick-menu-form">
              <label className="canvas-top-menu-quick-field">
                <span>Branch name</span>
                <input
                  ref={branchInputRef}
                  type="text"
                  value={branchName}
                  placeholder="feature/new-branch"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setBranchName(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCreateBranch()
                    }
                  }}
                />
              </label>

              <div className="canvas-top-menu-quick-actions">
                <button className="secondary-button" type="button" onClick={() => setActiveForm(null)} disabled={isBusy}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleCreateBranch()}
                  disabled={!capabilities.canCreateBranch.enabled || isBusy}
                  title={capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}
                >
                  {pendingAction === "branch" ? "Creating..." : "Create branch"}
                </button>
              </div>
            </div>
          ) : null}

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
            {status.text || (isLoadingCapabilities ? "Checking Git status..." : defaultStatusText)}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function CanvasRegionTopMenu({
  activeSessionID,
  activeCreateSessionTabID,
  createSessionTabs,
  sessions,
  workspaces,
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
    <ShellTopMenu
      as="nav"
      ariaLabel="Canvas region top menu"
      className="canvas-region-top-menu"
      contentClassName="canvas-region-top-menu-tabs-shell"
      content={(
        <>
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
                    <span className="session-tab-title">{getCreateSessionTabTitle(tab, index, workspaces)}</span>
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
        </>
      )}
      controlsSpacerVariant="canvas"
      dragRegion
      layout="three-column"
      leading={showLeftSidebarToggleButton ? (
        <SidebarToggleButton isSidebarCollapsed={true} onToggleSidebar={onToggleLeftSidebar} side="left" variant="top-menu" />
      ) : null}
      leadingClassName="canvas-region-top-menu-leading"
      trailing={(
        <SidebarToggleButton isSidebarCollapsed={isRightSidebarCollapsed} onToggleSidebar={onToggleRightSidebar} side="right" variant="top-menu" />
      )}
      trailingClassName={joinClassNames(
        "canvas-region-top-menu-trailing",
        isRightSidebarCollapsed ? "is-right-sidebar-collapsed" : "is-right-sidebar-expanded",
      )}
    />
  )
}

interface PaneTabBarProps {
  activeTabKey: string | null
  draggedTabKey: string | null
  hasMergePreview: boolean
  isFocused: boolean
  isTopRow: boolean
  leadingAccessory?: ReactNode
  tabs: Array<
    | {
        key: string
        kind: "session"
        sessionID: string
        title: string
      }
    | {
        key: string
        kind: "create-session"
        createSessionTabID: string
        title: string
      }
  >
  onCloseCreateSessionTab: (createSessionTabID: string) => void
  onCloseSessionTab: (sessionID: string) => void
  onFocus: () => void
  onOpenCreateSessionTab: () => void
  onSelectCreateSessionTab: (createSessionTabID: string) => void
  onSelectSessionTab: (sessionID: string) => void
  onTabDragEnd: () => void
  onTabDragStart: (tabKey: string) => void
  onTabPointerDragMove: (clientX: number, clientY: number) => void
  onTabPointerDrop: (clientX: number, clientY: number) => void
  trailingAccessory?: ReactNode
}

export function PaneTabBar({
  activeTabKey,
  draggedTabKey,
  hasMergePreview,
  isFocused,
  isTopRow,
  leadingAccessory,
  tabs,
  onCloseCreateSessionTab,
  onCloseSessionTab,
  onFocus,
  onOpenCreateSessionTab,
  onSelectCreateSessionTab,
  onSelectSessionTab,
  onTabDragEnd,
  onTabDragStart,
  onTabPointerDragMove,
  onTabPointerDrop,
  trailingAccessory,
}: PaneTabBarProps) {
  const hasWindowControlsClearance = Boolean(trailingAccessory)
  const pointerDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    started: boolean
    tabKey: string
  } | null>(null)
  const suppressClickTabKeyRef = useRef<string | null>(null)

  function handleTabDragStart(event: ReactDragEvent<HTMLElement>, tabKey: string) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(".session-tab-close")) {
      event.preventDefault()
      return
    }

    try {
      event.dataTransfer?.setData("text/plain", tabKey)
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
      }
    } catch {
      // JSDOM and some browser paths can throw when dataTransfer is absent.
    }
    onFocus()
    onTabDragStart(tabKey)
  }

  function handleTabPointerDown(event: PointerEvent<HTMLElement>, tabKey: string) {
    if (event.button !== 0) return

    const target = event.target
    if (target instanceof HTMLElement && target.closest(".session-tab-close")) {
      return
    }

    pointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      tabKey,
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const state = pointerDragRef.current
      if (!state || moveEvent.pointerId !== state.pointerId) return

      if (!state.started) {
        const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY)
        if (distance < 4) return

        state.started = true
        pointerDragRef.current = state
        onFocus()
        onTabDragStart(state.tabKey)
      }

      onTabPointerDragMove(moveEvent.clientX, moveEvent.clientY)
      moveEvent.preventDefault()
    }

    const stopPointerDrag = (nextEvent: globalThis.PointerEvent, shouldDrop: boolean) => {
      const state = pointerDragRef.current
      if (!state || nextEvent.pointerId !== state.pointerId) return

      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      pointerDragRef.current = null

      if (!state.started) return

      suppressClickTabKeyRef.current = state.tabKey
      if (shouldDrop) {
        onTabPointerDrop(nextEvent.clientX, nextEvent.clientY)
        return
      }

      onTabDragEnd()
    }

    const handlePointerUp = (upEvent: globalThis.PointerEvent) => {
      stopPointerDrag(upEvent, true)
    }

    const handlePointerCancel = (cancelEvent: globalThis.PointerEvent) => {
      stopPointerDrag(cancelEvent, false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
  }

  useEffect(() => {
    return () => {
      pointerDragRef.current = null
    }
  }, [])

  const className = [
    "pane-tab-bar",
    "panel-toolbar",
    isFocused ? "is-focused" : null,
    hasWindowControlsClearance ? "has-window-controls-clearance" : null,
    isTopRow && draggedTabKey === null ? "window-drag-region" : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <nav
      className={className}
      aria-label="Pane tabs"
      onPointerDown={() => onFocus()}
    >
      {leadingAccessory ? <div className="pane-tab-bar-leading">{leadingAccessory}</div> : null}
      <div className="pane-tab-bar-tabs" aria-label="Pane tab list">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTabKey
          const createTabIndex =
            tab.kind === "create-session"
              ? tabs.slice(0, tabs.indexOf(tab) + 1).filter((item) => item.kind === "create-session").length - 1
              : -1
          const tabClassName = tab.kind === "create-session"
            ? isActive
              ? "session-tab is-active is-create-tab"
              : "session-tab is-create-tab"
            : isActive
              ? "session-tab is-active"
              : "session-tab"
          const switchLabel =
            tab.kind === "session"
              ? `Switch to session ${tab.title}`
              : createTabIndex === 0
                ? "Switch to create session tab"
                : `Switch to create session tab ${createTabIndex + 1}`
          const closeLabel =
            tab.kind === "session"
              ? `Close session tab ${tab.title}`
              : createTabIndex === 0
                ? "Close create session tab"
                : `Close create session tab ${createTabIndex + 1}`

          return (
            <div
              key={tab.key}
              className={draggedTabKey === tab.key ? `${tabClassName} is-dragging` : tabClassName}
              onDragEnd={onTabDragEnd}
              onDragStart={(event) => handleTabDragStart(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
            >
              <button
                className="session-tab-trigger"
                aria-label={switchLabel}
                aria-pressed={isActive}
                title={switchLabel}
                type="button"
                onDragEnd={onTabDragEnd}
                onDragStart={(event) => handleTabDragStart(event, tab.key)}
                onClick={() => {
                  if (suppressClickTabKeyRef.current === tab.key) {
                    suppressClickTabKeyRef.current = null
                    return
                  }
                  onFocus()
                  if (tab.kind === "session") {
                    onSelectSessionTab(tab.sessionID)
                    return
                  }
                  onSelectCreateSessionTab(tab.createSessionTabID)
                }}
              >
                <span className="session-tab-title">{tab.title}</span>
              </button>
              <button
                className="session-tab-close"
                aria-label={closeLabel}
                draggable={false}
                title={closeLabel}
                type="button"
                onDragStart={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => {
                  onFocus()
                  if (tab.kind === "session") {
                    onCloseSessionTab(tab.sessionID)
                    return
                  }
                  onCloseCreateSessionTab(tab.createSessionTabID)
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
        {hasMergePreview ? <span className="pane-tab-merge-preview" aria-hidden="true" /> : null}
        <button className="canvas-region-top-menu-add-button" aria-label="Add session tab" title="Add session tab" type="button" onClick={onOpenCreateSessionTab}>
          <span className="canvas-region-top-menu-add-glyph" aria-hidden="true">
            +
          </span>
        </button>
      </div>
      <div className="pane-tab-bar-actions">
        {trailingAccessory ? <div className="pane-tab-bar-trailing">{trailingAccessory}</div> : null}
        {hasWindowControlsClearance ? <WindowControlsSpacer variant="canvas" /> : null}
      </div>
    </nav>
  )
}

export function CanvasRegionUtilityMenu({
  isRightSidebarCollapsed,
  label,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  showLeftSidebarToggleButton,
}: {
  isRightSidebarCollapsed: boolean
  label: string
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  showLeftSidebarToggleButton: boolean
}) {
  return (
    <ShellTopMenu
      as="nav"
      ariaLabel={`${label} top menu`}
      className="canvas-region-top-menu"
      contentClassName="canvas-region-top-menu-tabs-shell"
      content={<div className="canvas-region-top-menu-empty">{label}</div>}
      controlsSpacerVariant="canvas"
      dragRegion
      layout="three-column"
      leading={showLeftSidebarToggleButton ? (
        <SidebarToggleButton isSidebarCollapsed={true} onToggleSidebar={onToggleLeftSidebar} side="left" variant="top-menu" />
      ) : null}
      leadingClassName="canvas-region-top-menu-leading"
      trailing={(
        <SidebarToggleButton isSidebarCollapsed={isRightSidebarCollapsed} onToggleSidebar={onToggleRightSidebar} side="right" variant="top-menu" />
      )}
      trailingClassName={joinClassNames(
        "canvas-region-top-menu-trailing",
        isRightSidebarCollapsed ? "is-right-sidebar-collapsed" : "is-right-sidebar-expanded",
      )}
    />
  )
}

interface SessionCanvasTopMenuProps {
  contextLabel: string
  contextTitle: string
  gitProjectID: string | null
  gitDirectory: string | null
  mcpOptions: ComposerMcpOption[]
  selectedMcpServerIDs: string[]
  selectedMcpServerLabel: string
  onMcpServerToggle: (value: string) => void | Promise<void>
  skillOptions: ComposerSkillOption[]
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onSkillToggle: (value: string) => void
}

function ProjectMcpMenuButton({
  mcpOptions,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
}: {
  mcpOptions: ComposerMcpOption[]
  selectedMcpServerIDs: string[]
  selectedMcpServerLabel: string
  onMcpServerToggle: (value: string) => void | Promise<void>
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return

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

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-mcp-trigger is-active" : "canvas-top-menu-button canvas-top-menu-mcp-trigger"}
        aria-controls="canvas-top-menu-mcp-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        aria-label={`Select project MCP servers: ${selectedMcpServerLabel}`}
        title={`Project MCP servers: ${selectedMcpServerLabel}`}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedMcpServerLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-mcp-menu"
          className="canvas-top-menu-selector-panel"
          role="dialog"
          aria-label="Project MCP server selection"
        >
          {mcpOptions.length > 0 ? (
            mcpOptions.map((option) => {
              const isSelected = selectedMcpServerIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option is-selected" : "composer-menu-option"}
                  onClick={() => void onMcpServerToggle(option.value)}
                  type="button"
                >
                  <span className="composer-menu-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="composer-menu-option-check">{isSelected ? "Enabled" : "Enable"}</span>
                </button>
              )
            })
          ) : (
            <p className="composer-menu-empty">No global MCP servers are available yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProjectSkillsMenuButton({
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: {
  skillOptions: ComposerSkillOption[]
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onSkillToggle: (value: string) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return

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

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-skill-trigger is-active" : "canvas-top-menu-button canvas-top-menu-skill-trigger"}
        aria-controls="canvas-top-menu-skill-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        aria-label={`Select project skills: ${selectedSkillLabel}`}
        title={`Project skills: ${selectedSkillLabel}`}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedSkillLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-skill-menu"
          className="canvas-top-menu-selector-panel"
          role="dialog"
          aria-label="Project skill selection"
        >
          {skillOptions.length > 0 ? (
            skillOptions.map((option) => {
              const isSelected = selectedSkillIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option is-selected" : "composer-menu-option"}
                  onClick={() => onSkillToggle(option.value)}
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
            <p className="composer-menu-empty">No project skills are available yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ExternalEditorMenuButton({ directory }: { directory: string | null }) {
  const showExternalEditorMenu = window.desktop?.showExternalEditorMenu
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  if (!directory || !showExternalEditorMenu) {
    return null
  }

  const targetPath = directory
  const openExternalEditorMenu = showExternalEditorMenu

  function handleClick() {
    const bounds = buttonRef.current?.getBoundingClientRect()

    void openExternalEditorMenu({
      targetPath,
      anchor: bounds
        ? {
            x: Math.round(bounds.left),
            y: Math.round(bounds.bottom),
          }
        : undefined,
    }).catch((error) => {
      console.error("[desktop] showExternalEditorMenu failed:", error)
    })
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="canvas-top-menu-button canvas-top-menu-editor-trigger"
      aria-label="Editor"
      title="Open current project"
      onClick={handleClick}
    >
      <OpenInEditorIcon />
      <span>Editor</span>
      <ChevronDownIcon />
    </button>
  )
}

export function SessionCanvasTopMenu({
  contextLabel,
  contextTitle,
  gitProjectID,
  gitDirectory,
  mcpOptions,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: SessionCanvasTopMenuProps) {
  return (
    <ShellTopMenu
      ariaLabel="Session canvas top menu"
      as="div"
      className="session-canvas-top-menu"
      contentClassName="panel-toolbar-copy session-canvas-top-menu-copy"
      content={(
        <>
          <span className="label">{contextLabel}</span>
          <strong>{contextTitle}</strong>
        </>
      )}
      controlsSpacerVariant="canvas"
      trailing={(
        <>
          <ExternalEditorMenuButton directory={gitDirectory} />
          <ProjectMcpMenuButton
            mcpOptions={mcpOptions}
            selectedMcpServerIDs={selectedMcpServerIDs}
            selectedMcpServerLabel={selectedMcpServerLabel}
            onMcpServerToggle={onMcpServerToggle}
          />
          <ProjectSkillsMenuButton
            skillOptions={skillOptions}
            selectedSkillIDs={selectedSkillIDs}
            selectedSkillLabel={selectedSkillLabel}
            onSkillToggle={onSkillToggle}
          />
          <GitQuickMenuButton projectID={gitProjectID} directory={gitDirectory} />
        </>
      )}
      trailingClassName="session-canvas-top-menu-actions"
    />
  )
}

interface GlobalSkillsCanvasProps {
  deletingGlobalSkillDirectory: string | null
  globalSkillsMessage: {
    tone: "success" | "error"
    text: string
  } | null
  globalSkillsRoot: string
  isDirty: boolean
  isLoadingFile: boolean
  isSavingFile: boolean
  selectedFileContent: string
  selectedFilePath: string | null
  selectedSkillDirectoryName: string | null
  onChange: (value: string) => void
  onDelete: () => void | Promise<void>
  onSave: () => void | Promise<void>
}

export function GlobalSkillsCanvas({
  deletingGlobalSkillDirectory,
  globalSkillsMessage,
  globalSkillsRoot,
  isDirty,
  isLoadingFile,
  isSavingFile,
  selectedFileContent,
  selectedFilePath,
  selectedSkillDirectoryName,
  onChange,
  onDelete,
  onSave,
}: GlobalSkillsCanvasProps) {
  if (!selectedFilePath) {
    return (
      <section className="global-skills-canvas">
        <div className="global-skills-editor-shell">
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Global Skills</span>
            <h3>No skill file selected</h3>
            <p>{globalSkillsRoot ? `Open a file from ${globalSkillsRoot} or create a new skill from the left sidebar.` : "Loading the global skills root..."}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="global-skills-canvas">
      <div className="global-skills-toolbar">
        {globalSkillsMessage ? (
          <div
            className={
              globalSkillsMessage.tone === "success"
                ? "settings-banner is-success global-skills-toolbar-message"
                : "settings-banner is-error global-skills-toolbar-message"
            }
          >
            {globalSkillsMessage.text}
          </div>
        ) : (
          <div className="global-skills-toolbar-spacer" aria-hidden="true" />
        )}
        <div className="global-skills-toolbar-actions">
          <button className="secondary-button" disabled={!selectedSkillDirectoryName || deletingGlobalSkillDirectory !== null} type="button" onClick={() => void onDelete()}>
            {deletingGlobalSkillDirectory ? "Deleting..." : "Delete"}
          </button>
          <button className="primary-button" disabled={!isDirty || isSavingFile} type="button" onClick={() => void onSave()}>
            {isSavingFile ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="global-skills-editor-shell">
        {isLoadingFile ? (
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Loading</span>
            <h3>Opening skill file</h3>
            <p>Reading the current file from the global skills directory.</p>
          </div>
        ) : (
          <textarea
            aria-label="Global skill editor"
            className="global-skills-editor"
            spellCheck={false}
            value={selectedFileContent}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
    </section>
  )
}

interface CreateSessionCanvasProps {
  isCreatingSession: boolean
  selectedWorkspaceID: string | null
  workspaces: WorkspaceGroup[]
  onWorkspaceChange: (workspaceID: string) => void
}

export function CreateSessionCanvas({
  isCreatingSession,
  selectedWorkspaceID,
  workspaces,
  onWorkspaceChange,
}: CreateSessionCanvasProps) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceID) ?? null

  if (workspaces.length === 0) {
    return (
      <section className="thread-shell create-session-shell">
        <article className="create-session-card">
          <img className="create-session-logo" src="/create-session-logo.svg" alt="Fanfande Studio logo" />
          <select className="create-session-native-select" aria-label="Session project" disabled value="">
            <option value="">No project available</option>
          </select>
        </article>
      </section>
    )
  }

  return (
    <section className="thread-shell create-session-shell">
      <article className="create-session-card">
        <img className="create-session-logo" src="/create-session-logo.svg" alt="Fanfande Studio logo" />
        <select
          className="create-session-native-select"
          aria-label="Session project"
          disabled={isCreatingSession}
          value={selectedWorkspaceID ?? selectedWorkspace?.id ?? ""}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onWorkspaceChange(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.project.name} / {workspace.name}
            </option>
          ))}
        </select>
      </article>
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
  if (model.capabilities.input.image) tags.push("Vision")
  if (model.capabilities.attachment && model.capabilities.input.pdf) tags.push("PDF")

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

function getMcpServerSummaryLine(server: McpServerSummary) {
  if (server.transport === "stdio") {
    return server.command
  }

  return server.serverUrl ?? server.connectorId ?? "Remote HTTP MCP"
}

function getMcpTransportLabel(transport: McpServerSummary["transport"] | McpServerDraftState["transport"]) {
  return transport === "remote" ? "http" : "stdio"
}

interface SettingsPageProps {
  activeMcpServerID: string | null
  activeMcpServerDiagnostic: McpServerDiagnostic | null
  archivedSessions: ArchivedSessionSummary[]
  archivedSessionsError: string | null
  catalog: ProviderCatalogItem[]
  deletingArchivedSessionID: string | null
  deletingMcpServerID: string | null
  deletingProviderID: string | null
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isDebugLineColorsEnabled: boolean
  isDebugUiRegionsEnabled: boolean
  isLoading: boolean
  isLoadingArchivedSessions: boolean
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
  restoringArchivedSessionID: string | null
  savedSelection: ProjectModelSelection
  savingMcpServerID: string | null
  savingProviderID: string | null
  selectionDraft: ProjectModelSelection
  onActivityRailVisibilityChange: (value: boolean) => void
  onAgentDebugTraceChange: (value: boolean) => void
  onDebugLineColorsChange: (value: boolean) => void
  onDebugUiRegionsChange: (value: boolean) => void
  onClose: () => void
  onDeleteArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDeleteProvider: (providerID: string) => void | Promise<void>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onMcpServerSelect: (serverID: string) => void
  onProviderDraftChange: (providerID: string, field: keyof ProviderDraftState, value: string) => void
  onRestoreArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onSaveMcpServer: () => boolean | Promise<boolean>
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSaveSelection: () => void | Promise<void>
  onSelectionChange: (field: keyof ProjectModelSelection, value: string | null) => void
  onStartNewMcpServer: () => void
}

export function SettingsPage({
  activeMcpServerID,
  activeMcpServerDiagnostic,
  archivedSessions,
  archivedSessionsError,
  catalog,
  deletingArchivedSessionID,
  deletingMcpServerID,
  deletingProviderID,
  isActivityRailVisible,
  isAgentDebugTraceEnabled,
  isDebugLineColorsEnabled,
  isDebugUiRegionsEnabled,
  isLoading,
  isLoadingArchivedSessions,
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
  restoringArchivedSessionID,
  savedSelection,
  savingMcpServerID,
  savingProviderID,
  selectionDraft,
  onActivityRailVisibilityChange,
  onAgentDebugTraceChange,
  onDebugLineColorsChange,
  onDebugUiRegionsChange,
  onClose,
  onDeleteArchivedSession,
  onDeleteMcpServer,
  onDeleteProvider,
  onMcpServerDraftChange,
  onMcpServerSelect,
  onProviderDraftChange,
  onRestoreArchivedSession,
  onSaveMcpServer,
  onSaveProvider,
  onSaveSelection,
  onSelectionChange,
  onStartNewMcpServer,
}: SettingsPageProps) {
  {
    const [activeSection, setActiveSection] = useState<"services" | "defaults" | "mcp" | "appearance" | "archive">("services")
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
    const mcpServerValidationError = !mcpServerDraft.id.trim()
      ? "MCP servers require an id."
      : mcpServerDraft.transport === "stdio"
        ? !mcpServerDraft.command.trim()
          ? "Local MCP servers require a command."
          : null
        : !mcpServerDraft.serverUrl.trim()
          ? "Remote MCP servers require a server URL."
          : (mcpServerDraft.allowedToolsMode === "names" || mcpServerDraft.allowedToolsMode === "read-only-names") &&
              !mcpServerDraft.allowedToolNames.trim()
            ? "Named tool filters require at least one tool name."
            : null
    const mcpServerCanSave = !mcpServerValidationError
    const showLoadedState = !isLoading && !loadError
    const showProviderSections = activeSection === "services" || activeSection === "defaults" || activeSection === "mcp"
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
        meta: `${mcpServers.length} servers`,
        Icon: FolderIcon,
      },
      {
        key: "archive" as const,
        label: "Archived Sessions",
        meta: `${archivedSessions.length} sessions`,
        Icon: ArchiveIcon,
      },
      { key: "appearance" as const, label: "Appearance", meta: "4 options", Icon: LayoutSidebarLeftIcon },
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

              {loadError && showProviderSections ? <div className="settings-banner is-error">{loadError}</div> : null}

              {archivedSessionsError && activeSection === "archive" ? (
                <div className="settings-banner is-error">{archivedSessionsError}</div>
              ) : null}

              {isLoading && showProviderSections ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {isLoadingArchivedSessions && activeSection === "archive" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching archived sessions</h3>
                  <p>Reading archived session snapshots so you can restore or permanently delete them.</p>
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
                        <span className="label">Development</span>
                        <h3>Debug Region Colors</h3>
                      </div>
                      <p>Toggle the temporary region background colors used during UI structure discussions and layout iteration.</p>
                    </div>

                    <button
                      className={isDebugUiRegionsEnabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isDebugUiRegionsEnabled}
                      aria-label="Show debug region colors"
                      type="button"
                      onClick={() => onDebugUiRegionsChange(!isDebugUiRegionsEnabled)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <PaletteIcon />
                          </span>
                          <span>Show debug region colors</span>
                        </strong>
                        <small>Fill major UI regions with temporary colors so layout discussions can refer to them directly.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      This development overlay follows the color mapping documented in the desktop UI structure guide and can be disabled once the layout is agreed.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Development</span>
                        <h3>Debug Line Colors</h3>
                      </div>
                      <p>Color the remaining top-region dividers differently so it is obvious which line comes from the shell edge and which comes from the pane tabs.</p>
                    </div>

                    <button
                      className={isDebugLineColorsEnabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isDebugLineColorsEnabled}
                      aria-label="Show line debug colors"
                      type="button"
                      onClick={() => onDebugLineColorsChange(!isDebugLineColorsEnabled)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <MinimizeIcon />
                          </span>
                          <span>Show line debug colors</span>
                        </strong>
                        <small>Use separate highlight colors for the shell top border and the pane tab divider.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      This keeps the normal theme untouched until you need to inspect which remaining thin line is actually being painted in the top region.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Development</span>
                        <h3>Agent Debug Trace</h3>
                      </div>
                      <p>Reveal the extra backend runtime metadata that is normally hidden from the thread so agent flow testing is easier to inspect.</p>
                    </div>

                    <button
                      className={isAgentDebugTraceEnabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isAgentDebugTraceEnabled}
                      aria-label="Show agent debug trace"
                      type="button"
                      onClick={() => onAgentDebugTraceChange(!isAgentDebugTraceEnabled)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <FileTextIcon />
                          </span>
                          <span>Show agent debug trace</span>
                        </strong>
                        <small>Expose backend trace metadata, hidden system events, and runtime identifiers directly inside the thread.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      Use this when validating stream order, permission lifecycle, tool payloads, token accounting, or other backend-only details without changing the normal conversation presentation.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Current</span>
                        <h3>Appearance State</h3>
                      </div>
                      <p>The left rail is optional. Region, line, and agent trace debug modes are development-only overlays. The right inspector always keeps its toggle on the active surface.</p>
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
                        <span className="label">Debug Regions</span>
                        <strong>{isDebugUiRegionsEnabled ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isDebugUiRegionsEnabled
                            ? "Major interface regions use temporary background colors to make layout discussions faster."
                            : "Region debug colors are disabled, so the interface shows only the current visual theme."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Line Colors</span>
                        <strong>{isDebugLineColorsEnabled ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isDebugLineColorsEnabled
                            ? "The remaining top-region dividers use separate colors so the shell border and pane divider can be distinguished immediately."
                            : "Top divider lines use the current theme colors, so they blend back into the regular interface."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Agent Trace</span>
                        <strong>{isAgentDebugTraceEnabled ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isAgentDebugTraceEnabled
                            ? "Thread turns reveal backend runtime metadata, hidden system events, and per-part trace identifiers for debugging."
                            : "Thread turns keep backend-only metadata hidden so the conversation stays focused on user-visible output."}
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
              ) : activeSection === "archive" ? (
                isLoadingArchivedSessions ? null : (
                <div className="settings-archive-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Archive</span>
                        <h3>Archived Sessions</h3>
                      </div>
                      <p>Archived sessions stay out of normal startup loading until you restore them.</p>
                    </div>

                    {archivedSessions.length === 0 ? (
                      <article className="settings-empty-state">
                        <span className="label">Empty</span>
                        <h3>No archived sessions</h3>
                        <p>Archive a session from the workspace sidebar to manage it here.</p>
                      </article>
                    ) : (
                      <div className="settings-archive-list" role="list" aria-label="Archived sessions">
                        {archivedSessions.map((session) => {
                          const isRestoring = restoringArchivedSessionID === session.id
                          const isDeleting = deletingArchivedSessionID === session.id
                          const projectLabel = session.projectName ?? session.projectID

                          return (
                            <article key={session.id} className="settings-archive-item" role="listitem">
                              <div className="settings-archive-copy">
                                <div className="settings-archive-heading">
                                  <strong>{session.title}</strong>
                                  {session.projectMissing ? (
                                    <span className="settings-badge settings-archive-badge is-warning">Project missing</span>
                                  ) : null}
                                </div>
                                <div className="settings-archive-meta">
                                  <span>{projectLabel}</span>
                                  <span>{session.directory}</span>
                                  <span>Updated {formatTime(session.updated)}</span>
                                  <span>Archived {formatTime(session.archivedAt)}</span>
                                  <span>{session.messageCount} messages</span>
                                  <span>{session.eventCount} events</span>
                                </div>
                              </div>

                              <div className="settings-inline-actions settings-archive-actions">
                                <button
                                  className="secondary-button"
                                  disabled={isRestoring || isDeleting}
                                  type="button"
                                  onClick={() => void onRestoreArchivedSession(session.id)}
                                >
                                  {isRestoring ? "Restoring..." : "Restore"}
                                </button>
                                <button
                                  className="secondary-button is-danger"
                                  disabled={isRestoring || isDeleting}
                                  type="button"
                                  onClick={() => void onDeleteArchivedSession(session.id)}
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                </div>
                )
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
                            <span className="label">Global</span>
                            <h3>MCP Servers</h3>
                          </div>
                          <p>Configure reusable local and remote MCP servers once, then enable them per project from the session canvas top menu.</p>
                        </div>

                        {projectID ? (
                          <div className="settings-project-chip">
                            <strong>Diagnostic context</strong>
                            <span>{projectName ?? "Current project"} · {projectWorktree ?? projectID}</span>
                          </div>
                        ) : null}

                        <div className="settings-actions-row">
                          <span className="settings-helper-text">
                            {projectID
                              ? "Global server definitions are shared across projects. Relative working directories resolve against the selected project during diagnostics."
                              : "Global server definitions are shared across projects. Select a project to run diagnostics with relative working directories."}
                          </span>
                          <button className="secondary-button" onClick={onStartNewMcpServer} type="button">
                            New server
                          </button>
                        </div>
                      </div>

                      <div className="settings-service-list-body">
                        {mcpServers.length > 0 ? (
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
                                    <div className="provider-row-statuses">
                                      <span className="settings-badge">{getMcpTransportLabel(server.transport)}</span>
                                      <span className={server.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                                        {server.enabled ? "Enabled" : "Disabled"}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="settings-service-item-copy">{getMcpServerSummaryLine(server)}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Servers</span>
                            <h3>No global MCP servers configured yet</h3>
                            <p>Create a reusable local or remote server here, then enable it from a project when needed.</p>
                          </article>
                        )}
                      </div>
                    </div>

                    <div className="settings-service-detail-panel">
                      <>
                        <div className="settings-detail-hero">
                          <div>
                            <h3>{activeMcpServer ? activeMcpServer.name ?? activeMcpServer.id : "Create MCP server"}</h3>
                            <p className="settings-page-copy">
                              {activeMcpServer
                                ? "Edit the selected global MCP server definition."
                                : "Define a reusable local or remote MCP server. Projects can enable it from the session canvas top menu."}
                            </p>
                          </div>

                          <div className="provider-row-statuses">
                            <span className="settings-badge">{activeMcpServer ? "Editing" : "New"}</span>
                            <span className={mcpServerDraft.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                              {mcpServerDraft.enabled ? "Enabled" : "Disabled"}
                            </span>
                            <span className="settings-badge">{getMcpTransportLabel(mcpServerDraft.transport)}</span>
                          </div>
                        </div>

                        <div className="settings-panel">
                          <div className="settings-section-header">
                            <div>
                              <span className="label">Definition</span>
                              <h3>Server Configuration</h3>
                            </div>
                            <p>
                              {mcpServerDraft.transport === "stdio"
                                ? "Use one argument per line and one environment variable per line in KEY=value format."
                                : "Connect a remote MCP server over HTTP. Headers are sent by the local agent, and tool approval stays in the local permission system."}
                            </p>
                          </div>

                          {activeMcpServerDiagnostic ? (
                            <div className={activeMcpServerDiagnostic.ok ? "settings-banner is-success" : "settings-banner is-error"}>
                              {activeMcpServerDiagnostic.ok
                                ? activeMcpServerDiagnostic.toolCount > 0
                                  ? `Reachable. Exposed tools: ${activeMcpServerDiagnostic.toolNames.join(", ")}`
                                  : "Reachable, but the server did not expose any tools."
                                : activeMcpServerDiagnostic.error ?? "Tool discovery failed."}
                            </div>
                          ) : null}

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
                                <span className="settings-field-label">Transport</span>
                                <select
                                  aria-label="MCP server transport"
                                  value={mcpServerDraft.transport}
                                  onChange={(event) => onMcpServerDraftChange("transport", event.target.value)}
                                >
                                  <option value="stdio">Local stdio</option>
                                  <option value="remote">Remote HTTP</option>
                                </select>
                              </label>

                              {mcpServerDraft.transport === "stdio" ? (
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
                              ) : null}

                              {mcpServerDraft.transport === "stdio" ? (
                                <label className="settings-field">
                                  <span className="settings-field-label">Working directory</span>
                                  <input
                                    aria-label="MCP server working directory"
                                    type="text"
                                    value={mcpServerDraft.cwd}
                                    placeholder="Optional, relative to the active project root"
                                    onChange={(event) => onMcpServerDraftChange("cwd", event.target.value)}
                                  />
                                </label>
                              ) : (
                                <label className="settings-field">
                                  <span className="settings-field-label">Server URL</span>
                                  <input
                                    aria-label="MCP server URL"
                                    type="text"
                                    value={mcpServerDraft.serverUrl}
                                    placeholder="https://mcp.example.com"
                                    onChange={(event) => onMcpServerDraftChange("serverUrl", event.target.value)}
                                  />
                                </label>
                              )}

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

                            {mcpServerDraft.transport === "stdio" ? (
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
                            ) : (
                              <>
                                <div className="settings-field-grid">
                                  <label className="settings-field">
                                    <span className="settings-field-label">Authorization</span>
                                    <input
                                      aria-label="MCP authorization"
                                      type="text"
                                      value={mcpServerDraft.authorization}
                                      placeholder="Optional Authorization header value"
                                      onChange={(event) => onMcpServerDraftChange("authorization", event.target.value)}
                                    />
                                  </label>

                                  <label className="settings-field">
                                    <span className="settings-field-label">Headers</span>
                                    <textarea
                                      aria-label="MCP server headers"
                                      rows={5}
                                      value={mcpServerDraft.headers}
                                      placeholder="KEY=value"
                                      onChange={(event) => onMcpServerDraftChange("headers", event.target.value)}
                                    />
                                  </label>
                                </div>

                                <div className="settings-field-grid">
                                  <label className="settings-field">
                                    <span className="settings-field-label">Allowed tools</span>
                                    <select
                                      aria-label="MCP allowed tools mode"
                                      value={mcpServerDraft.allowedToolsMode}
                                      onChange={(event) => onMcpServerDraftChange("allowedToolsMode", event.target.value)}
                                    >
                                      <option value="all">All tools</option>
                                      <option value="names">Named tools only</option>
                                      <option value="read-only">Read-only tools</option>
                                      <option value="read-only-names">Read-only named tools</option>
                                    </select>
                                  </label>

                                  {mcpServerDraft.allowedToolsMode === "names" || mcpServerDraft.allowedToolsMode === "read-only-names" ? (
                                    <label className="settings-field">
                                      <span className="settings-field-label">Allowed tool names</span>
                                      <textarea
                                        aria-label="MCP allowed tool names"
                                        rows={5}
                                        value={mcpServerDraft.allowedToolNames}
                                        placeholder="one tool name per line"
                                        onChange={(event) => onMcpServerDraftChange("allowedToolNames", event.target.value)}
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              </>
                            )}

                            <div className="settings-actions-row">
                              <span className="settings-helper-text">
                                {mcpServerValidationError
                                  ? mcpServerValidationError
                                  : mcpServerDraft.transport === "remote"
                                    ? "Remote MCP servers are connected locally over HTTP. Approval still flows through the existing permission system."
                                    : "Servers start lazily when a project enables them and the agent resolves tools. Tool approval still flows through the existing permission system."}
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
                                  disabled={mcpServerBusy || !mcpServerCanSave}
                                  onClick={() => void onSaveMcpServer()}
                                  type="button"
                                >
                                  {savingMcpServerID === (activeMcpServerID ?? mcpServerDraft.id.trim()) ? "Saving..." : mcpSaveLabel}
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
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
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  onFileChangeSelect?: (file: string) => void
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

type AssistantTraceSectionKey = "reasoning" | "tools" | "response" | "file-change" | "debug"

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
  if (item.kind === "system") return "debug"
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
    case "debug":
      return "Debug"
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

function filterRenderedAssistantTraceItems(items: AssistantTraceItem[], showFileChanges: boolean, showDebugInfo: boolean) {
  return items.filter((item) => {
    const sectionKey = traceSectionKeyForItem(item)
    if (!showFileChanges && sectionKey === "file-change") return false
    if (!showDebugInfo && sectionKey === "debug") return false
    return true
  })
}

function getAssistantEphemeralHint(turn: AssistantTurn) {
  switch (turn.runtime.phase) {
    case "requesting":
    case "waiting_first_event":
    case "reasoning":
      return "Thinking..."
    case "tool_running":
      return turn.runtime.toolName ? `Running ${turn.runtime.toolName}...` : "Running tools..."
    case "waiting_approval":
      return "Waiting for approval..."
    case "responding":
      return "Responding..."
    default:
      return null
  }
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

function AssistantTurnPlaceholder({ message }: { message: string }) {
  return (
    <section className="assistant-section assistant-ephemeral-state" aria-live="polite" aria-label="Assistant status">
      <p className="assistant-ephemeral-hint">{message}</p>
    </section>
  )
}

function AssistantTurnSections({
  items,
  onFileChangeSelect,
  showFileChanges,
  showDebugInfo,
  turnID,
}: {
  items: AssistantTraceItem[]
  onFileChangeSelect: ((file: string) => void) | undefined
  showFileChanges: boolean
  showDebugInfo: boolean
  turnID: string
}) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, showFileChanges, showDebugInfo))

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
                <TraceItemView key={item.id} item={item} onFileChangeSelect={onFileChangeSelect} showDebugInfo={showDebugInfo} />
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

function TraceItemView({
  item,
  onFileChangeSelect,
  showDebugInfo,
}: {
  item: AssistantTraceItem
  onFileChangeSelect?: (file: string) => void
  showDebugInfo: boolean
}) {
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
  const selectableFilePaths = item.kind === "patch" ? item.filePaths?.filter(Boolean) ?? [] : []
  const debugEntries = showDebugInfo ? item.debugEntries ?? [] : []
  const hasDebugEntries = debugEntries.length > 0

  function renderDebugEntries() {
    if (!hasDebugEntries) return null

    return (
      <div className="trace-item-debug">
        {debugEntries.map((entry) => (
          <div key={`${item.id}-${entry.label}`} className="trace-item-debug-row">
            <span className="trace-item-debug-label">{entry.label}</span>
            <span className="trace-item-debug-value">{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  if (item.kind === "reasoning") {
    return (
      <article className={className} data-kind={item.kind}>
        {item.text ? <p className="trace-item-text trace-item-plain-text">{item.text}</p> : null}
        {item.detail ? <p className="trace-item-detail trace-item-plain-detail">{item.detail}</p> : null}
        {renderDebugEntries()}
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
        {renderDebugEntries()}
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
      {selectableFilePaths.length > 0 && onFileChangeSelect ? (
        <div className="trace-item-file-actions">
          {selectableFilePaths.map((filePath) => (
            <button
              key={`${item.id}-${filePath}`}
              type="button"
              className="trace-item-file-chip"
              onClick={() => onFileChangeSelect(filePath)}
            >
              {filePath}
            </button>
          ))}
        </div>
      ) : null}
      {renderDebugEntries()}
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
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  onFileChangeSelect,
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
                  showDebugInfo={false}
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
                ...turn.items.filter((item) => (isAgentDebugTraceEnabled || item.kind !== "system") && !isFileChangeTraceItem(item)),
                ...cycleFileChangeItems,
              ]
              const ephemeralHint = visibleItems.length === 0 ? getAssistantEphemeralHint(turn) : null
              if (visibleItems.length === 0 && !ephemeralHint) return null

              return (
                <article key={turn.id} className="turn assistant-turn">
                  <div className={turn.isStreaming ? "assistant-shell is-sectioned is-streaming" : "assistant-shell is-sectioned"}>
                    {ephemeralHint ? (
                      <AssistantTurnPlaceholder message={ephemeralHint} />
                    ) : (
                      <AssistantTurnSections
                        turnID={turn.id}
                        items={visibleItems}
                        onFileChangeSelect={onFileChangeSelect}
                        showFileChanges={isCycleFinalTurn && !turn.isStreaming}
                        showDebugInfo={isAgentDebugTraceEnabled}
                      />
                    )}
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
  attachmentButtonTitle: string
  attachmentDisabledReason: string | null
  attachmentError: string | null
  canSend: boolean
  draft: string
  hasPendingPermissionRequests: boolean
  isSending: boolean
  modelOptions: ComposerModelOption[]
  selectedModel: string | null
  selectedModelLabel: string
  unsupportedAttachmentPaths: string[]
  onDraftChange: (value: string) => void
  onModelChange: (value: string | null) => void | Promise<void>
  onPickAttachments: () => void | Promise<void>
  onRemoveAttachment: (path: string) => void
  onSend: (draftOverride?: string) => void | Promise<void>
}

type ComposerMenuKey = "model" | null

function isComposerSubmitKeyEvent(event: KeyboardEvent<HTMLTextAreaElement>, isComposing: boolean) {
  if (event.key !== "Enter") return false
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false

  const nativeEvent = event.nativeEvent
  return !(isComposing || nativeEvent.isComposing || nativeEvent.keyCode === 229)
}

function getComposerSendButtonDescription({
  attachmentError,
  canSend,
  hasPendingPermissionRequests,
  isSending,
}: {
  attachmentError: string | null
  canSend: boolean
  hasPendingPermissionRequests: boolean
  isSending: boolean
}) {
  if (attachmentError) {
    return `${attachmentError} Press Shift+Enter for a newline.`
  }

  if (!canSend) {
    return "Choose a session or workspace before sending. Press Shift+Enter for a newline."
  }

  if (hasPendingPermissionRequests) {
    return "Enter is unavailable while approval requests are pending. Press Shift+Enter for a newline."
  }

  if (isSending) {
    return "Enter is unavailable while the current request is sending. Press Shift+Enter for a newline."
  }

  return "Press Enter to send. Press Shift+Enter for a newline."
}

export function Composer({
  attachments,
  attachmentButtonTitle,
  attachmentDisabledReason,
  attachmentError,
  canSend,
  draft,
  hasPendingPermissionRequests,
  isSending,
  modelOptions,
  selectedModel,
  selectedModelLabel,
  unsupportedAttachmentPaths,
  onDraftChange,
  onModelChange,
  onPickAttachments,
  onRemoveAttachment,
  onSend,
}: ComposerProps) {
  const [openMenu, setOpenMenu] = useState<ComposerMenuKey>(null)
  const isComposingRef = useRef(false)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const unsupportedAttachmentPathSet = new Set(unsupportedAttachmentPaths)

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

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isComposerSubmitKeyEvent(event, isComposingRef.current)) return

    event.preventDefault()
    void onSend(event.currentTarget.value)
  }

  const sendButtonLabel = isSending ? "Sending task" : hasPendingPermissionRequests ? "Resolve approval first" : "Send task"
  const sendButtonDescription = getComposerSendButtonDescription({
    attachmentError,
    canSend,
    hasPendingPermissionRequests,
    isSending,
  })
  const sendButtonTitle = `${sendButtonLabel}. ${sendButtonDescription}`
  const sendShortcut = !isSending && canSend && !hasPendingPermissionRequests ? "Enter" : undefined

  return (
    <footer className="composer prompt-input-shell">
      <textarea
        aria-label="Task draft"
        aria-description={sendButtonDescription}
        enterKeyHint="send"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onKeyDown={handleDraftKeyDown}
        placeholder="Describe the UI, implementation task, or review target for the agent."
        rows={3}
      />

      {attachments.length > 0 ? (
        <div className="composer-attachment-strip" aria-label="Selected attachments">
          {attachments.map((attachment) => (
            <div
              key={attachment.path}
              className={
                unsupportedAttachmentPathSet.has(attachment.path)
                  ? "composer-attachment-chip is-invalid"
                  : "composer-attachment-chip"
              }
            >
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

      {attachmentError ? (
        <p className="composer-attachment-note" role="alert">
          {attachmentError}
        </p>
      ) : null}

      <div ref={toolbarRef} className="composer-toolbar">
        <div className="composer-selectors" aria-label="Composer options">
          <button
            aria-label="Add attachments"
            className="composer-selector-button is-icon-only"
            disabled={attachmentDisabledReason !== null}
            onClick={() => void onPickAttachments()}
            title={attachmentButtonTitle}
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
        </div>

        <div className="composer-actions">
          <button
            aria-label={sendButtonLabel}
            aria-description={sendButtonDescription}
            aria-keyshortcuts={sendShortcut}
            className="primary-button is-icon-only"
            disabled={isSending || !canSend || hasPendingPermissionRequests || attachmentError !== null}
            onClick={() => void onSend()}
            title={sendButtonTitle}
            type="button"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </footer>
  )
}

