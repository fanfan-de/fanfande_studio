import { type Dispatch, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type SetStateAction } from "react"
import { sidebarActions } from "../constants"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DeleteIcon,
  FileTextIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  NewItemIcon,
  SessionRunningIcon,
  SettingsIcon,
  SortIcon
} from "../icons"
import { getSessionWorkflowBadge } from "../session-workflow"
import { SessionWorkflowBadge, ShellTopMenu, SidebarToggleButton, TopMenuViewButton } from "../shared-ui"
import type {
  GlobalSkillTreeNode,
  LeftSidebarView,
  SessionSummary,
  SidebarActionKey,
  WorkspaceGroup
} from "../types"
import { isSideChatSession } from "../workspace"

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
  runningSessionIDs: string[]
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
  runningSessionIDs: string[]
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
  runningSessionIDs,
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
  const runningSessionIDSet = new Set(runningSessionIDs)

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
              <div
                className="project-row-shell"
                onMouseEnter={() => onHoveredFolderChange(workspace.id)}
                onMouseLeave={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                onFocus={() => onHoveredFolderChange(workspace.id)}
                onBlur={handleProjectBlur}
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

              {isExpanded ? (
                <div className="session-tree">
            {workspace.sessions.filter((session) => !isSideChatSession(session)).map((session) => {
              const active = session.id === activeSessionID
              const isRunning = runningSessionIDSet.has(session.id)
              const workflowBadge = getSessionWorkflowBadge(session.workflow)

              return (
                <div key={session.id} className="session-row-shell">
                  <button
                    className={active ? "session-row is-active" : "session-row"}
                    onClick={() => onSessionSelect(workspace.id, session.id)}
                  >
                    <span
                      className={isRunning ? "session-row-status-icon is-running" : "session-row-status-icon is-complete"}
                      aria-hidden="true"
                    >
                      {isRunning ? <SessionRunningIcon /> : <span className="session-row-status-dot" />}
                    </span>
                    <span className="session-row-copy">
                      <span className="session-row-label">{session.title}</span>
                      <SessionWorkflowBadge compact workflow={workflowBadge} />
                    </span>
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
  runningSessionIDs,
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
            runningSessionIDs={runningSessionIDs}
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
