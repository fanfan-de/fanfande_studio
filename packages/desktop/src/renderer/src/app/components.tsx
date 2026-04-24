import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject, type SetStateAction } from "react"
import {
  APPEARANCE_TOKEN_GROUPS,
  APPEARANCE_TOKEN_METADATA,
  type AppearanceTokenMap,
  type AppearanceTokenName,
} from "../../../shared/appearance"
import { ChangesPanel } from "./changes/ChangesPanel"
import { sidebarActions } from "./constants"
import { WorkspaceFilesPanel } from "./files/WorkspaceFilesPanel"
import { isMatchingGitStateChangedDetail, notifyGitStateChanged, subscribeToGitStateChanged } from "./git-events"
import { PreviewPanel } from "./preview/PreviewPanel"
import { buildTurnsFromHistory } from "./stream"
import { ThreadRichText } from "./thread-rich-text"
import { mergeUserTurnPresentationState, readPersistedUserTurns } from "./user-turn-presentation"
import { Composer } from "./composer/Composer"
import { createComposerDraftStateFromPlainText, createEmptyComposerDraftState } from "./composer/draft-state"
import { useProjectComposer } from "./use-project-composer"
import {
  ArchiveIcon,
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
  MoonIcon,
  MonitorIcon,
  PaletteIcon,
  PaperclipIcon,
  RestoreIcon,
  SunIcon,
  RightSidebarCollapseIcon,
  RightSidebarExpandIcon,
  SettingsIcon,
  SortIcon,
  TerminalIcon,
} from "./icons"
import type {
  AssistantTraceSectionKey,
  BrandTheme,
  ColorMode,
  AssistantTurn,
  AssistantTraceItem,
  AssistantTraceVisibility,
  AssistantTraceVisibilityKey,
  ComposerAttachment,
  ComposerDraftState,
  ComposerMcpOption,
  ComposerSkillOption,
  CreateSessionTab,
  GlobalSkillTreeNode,
  LeftSidebarView,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  OpenAIReasoningEffort,
  PermissionDecision,
  PermissionRequest,
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
  PreviewComment,
  PreviewMode,
  ProjectModelSelection,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel,
  RightSidebarView,
  ArchivedSessionSummary,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  SidebarActionKey,
  Turn,
  UserTurn,
  WindowAction,
  WorkspaceFileReviewState,
  WorkspacePreviewState,
  WorkspaceGroup,
} from "./types"
import { getSessionWorkflowBadge } from "./session-workflow"
import { formatTime } from "./utils"
import { isSideChatSession } from "./workspace"

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

async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const didCopy = document.execCommand("copy")
  document.body.removeChild(textarea)

  if (!didCopy) {
    throw new Error("Clipboard copy command failed.")
  }
}

function SideChatBadge({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "side-chat-badge is-compact" : "side-chat-badge"}>Side chat</span>
}

function SessionWorkflowBadge({
  compact = false,
  workflow,
}: {
  compact?: boolean
  workflow: ReturnType<typeof getSessionWorkflowBadge>
}) {
  if (!workflow) return null

  return (
    <span
      className={compact
        ? `session-workflow-badge is-${workflow.tone} is-compact`
        : `session-workflow-badge is-${workflow.tone}`
      }
      title={workflow.description}
    >
      {compact ? workflow.shortLabel : workflow.label}
    </span>
  )
}

const assistantTraceVisibilityOptions: Array<{
  key: AssistantTraceVisibilityKey
  title: string
  description: string
}> = [
  {
    key: "response",
    title: "Response",
    description: "Show the assistant's user-facing response text inside the main trace.",
  },
  {
    key: "reasoning",
    title: "Reasoning",
    description: "Show captured reasoning text segments when the model streams them.",
  },
  {
    key: "toolCalls",
    title: "Tool calls",
    description: "Show tool lifecycle entries such as running, waiting for approval, and completed calls.",
  },
  {
    key: "toolInputs",
    title: "Tool inputs",
    description: "Reveal streamed tool arguments and structured input payloads inside tool entries.",
  },
  {
    key: "toolOutputs",
    title: "Tool outputs",
    description: "Reveal completed tool results, failure messages, and denied reasons inside tool entries.",
  },
  {
    key: "sources",
    title: "Sources",
    description: "Show cited URLs and document references that the model used during this turn.",
  },
  {
    key: "files",
    title: "Files and attachments",
    description: "Show generated files, images, and patch summaries in the main trace.",
  },
  {
    key: "approvals",
    title: "Approvals",
    description: "Show permission requests, approval pauses, and related tool approval events.",
  },
  {
    key: "workflow",
    title: "Workflow events",
    description: "Show step boundaries, completion summaries, stream lifecycle, and other execution events.",
  },
  {
    key: "debugMetadata",
    title: "Debug metadata",
    description: "Show backend identifiers, payload previews, timing, and token metadata for each trace item.",
  },
]

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
              const workflowBadge = getSessionWorkflowBadge(session.workflow)

              return (
                <div key={session.id} className="session-row-shell">
                  <button
                    className={active ? "session-row is-active" : "session-row"}
                    onClick={() => onSessionSelect(workspace.id, session.id)}
                  >
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
  activeWorkspaceFileScopeDirectory: string | null
  activeWorkspaceFileScopeName: string | null
  activeWorkspaceFileState: WorkspaceFileReviewState
  activeSessionDirectory: string | null
  activeSession: SessionSummary | null
  activeSessionDiff: SessionDiffSummary | null
  activeSessionDiffState?: SessionDiffState
  activeSessionRuntimeDebug?: SessionRuntimeDebugSnapshot | null
  activeSessionRuntimeDebugState?: SessionRuntimeDebugState
  activePreviewState: WorkspacePreviewState
  canInsertPreviewCommentsIntoDraft: boolean
  canInsertWorkspaceFileCommentsIntoDraft: boolean
  previewWorkspaceDirectory: string | null
  previewWorkspaceName: string | null
  selectedDiffFile: string | null
  activeView: RightSidebarView
  onDiffFileSelect: (file: string | null) => void
  onDiffRefresh: () => void | Promise<void>
  onPreviewAddComment: (input: { x: number; y: number; text: string; anchor?: PreviewComment["anchor"] }) => void
  onPreviewDeleteComment: (commentID: string) => void
  onPreviewDraftUrlChange: (value: string) => void
  onPreviewInsertCommentsIntoDraft: () => void
  onPreviewModeChange: (mode: PreviewMode) => void
  onPreviewOpen: () => void
  onPreviewOpenExternal: () => void | Promise<void>
  onPreviewReload: () => void
  onWorkspaceFileCommentCancel: () => void
  onWorkspaceFileCommentChange: (text: string) => void
  onWorkspaceFileCommentConfirm: () => void
  onWorkspaceFileCommentStart: (startLineNumber: number, endLineNumber?: number) => void
  onWorkspaceFileCommentSubmit: () => void
  onWorkspaceFileQueryChange: (value: string) => void
  onWorkspaceFileSelect: (path: string) => void
  onRuntimeRefresh: () => void | Promise<void>
  onViewChange: (view: RightSidebarView) => void
}

const RIGHT_SIDEBAR_RUNTIME_IDLE_STATE: SessionRuntimeDebugState = {
  status: "idle",
  errorMessage: null,
  updatedAt: null,
  isStale: false,
}

export function RightSidebar({
  activeWorkspaceFileScopeDirectory,
  activeWorkspaceFileScopeName,
  activeWorkspaceFileState,
  activeSessionDirectory,
  activeSession,
  activeSessionDiff,
  activeSessionDiffState,
  activeSessionRuntimeDebug,
  activeSessionRuntimeDebugState,
  activePreviewState,
  canInsertPreviewCommentsIntoDraft,
  canInsertWorkspaceFileCommentsIntoDraft,
  previewWorkspaceDirectory,
  previewWorkspaceName,
  selectedDiffFile,
  activeView,
  onDiffFileSelect,
  onDiffRefresh,
  onPreviewAddComment,
  onPreviewDeleteComment,
  onPreviewDraftUrlChange,
  onPreviewInsertCommentsIntoDraft,
  onPreviewModeChange,
  onPreviewOpen,
  onPreviewOpenExternal,
  onPreviewReload,
  onWorkspaceFileCommentCancel,
  onWorkspaceFileCommentChange,
  onWorkspaceFileCommentConfirm,
  onWorkspaceFileCommentStart,
  onWorkspaceFileCommentSubmit,
  onWorkspaceFileQueryChange,
  onWorkspaceFileSelect,
  onRuntimeRefresh,
  onViewChange,
}: RightSidebarProps) {
  const runtimeState = activeSessionRuntimeDebugState ?? RIGHT_SIDEBAR_RUNTIME_IDLE_STATE
  const latestRuntimeTurn = activeSessionRuntimeDebug?.latestTurn ?? null
  const latestRuntimePhase = activeSessionRuntimeDebug?.status.phase ?? latestRuntimeTurn?.phase
  const runtimeStatusDescription = buildRuntimeStatusDescription({
    activeSession,
    runtimeState,
    runtimeSnapshot: activeSessionRuntimeDebug ?? null,
  })

  return (
    <aside id="app-sidebar-right" className="sidebar is-right" aria-label="Inspector sidebar">
      <ShellTopMenu
        as="header"
        ariaLabel="Right sidebar top menu"
        className="right-sidebar-top-menu"
        contentClassName="right-sidebar-top-menu-tabs"
        content={(
          <>
            <TopMenuViewButton active={activeView === "changes"} label="Changes" onClick={() => onViewChange("changes")}>
              <LayoutSidebarRightIcon />
            </TopMenuViewButton>
            <TopMenuViewButton active={activeView === "runtime"} label="Runtime" onClick={() => onViewChange("runtime")}>
              <ConnectedStatusIcon />
            </TopMenuViewButton>
            <TopMenuViewButton active={activeView === "preview"} label="Preview" onClick={() => onViewChange("preview")}>
              <OpenInEditorIcon />
            </TopMenuViewButton>
            <TopMenuViewButton active={activeView === "files"} label="Files" onClick={() => onViewChange("files")}>
              <FileTextIcon />
            </TopMenuViewButton>
          </>
        )}
        controlsSpacerVariant="right-sidebar"
        dragRegion
      />

      <div className={activeView === "preview" ? "right-sidebar-view-host is-preview" : "right-sidebar-view-host"}>
        {activeView === "changes" ? (
          <ChangesPanel
            activeSession={activeSession}
            activeSessionDirectory={activeSessionDirectory}
            activeSessionDiff={activeSessionDiff}
            activeSessionDiffState={activeSessionDiffState}
            selectedDiffFile={selectedDiffFile}
            onDiffFileSelect={onDiffFileSelect}
            onDiffRefresh={onDiffRefresh}
          />
        ) : null}

        {activeView === "runtime" ? (
          <section className="right-sidebar-section">
            <div className="right-sidebar-panel-header">
              <div className="right-sidebar-panel-copy">
                <span className="label">Agent Runtime</span>
                <h3>Current execution state</h3>
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
                  aria-label="Refresh runtime state"
                  disabled={!activeSession || runtimeState.status === "loading" || runtimeState.status === "refreshing"}
                  onClick={() => void onRuntimeRefresh()}
                >
                  {runtimeState.status === "loading" || runtimeState.status === "refreshing" ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div className="right-sidebar-status-row">
              <span className={`settings-badge right-sidebar-status-badge is-${runtimeState.status}`}>
                {formatRuntimeLoadStateLabel(runtimeState.status)}
              </span>
              {activeSessionRuntimeDebug ? (
                <span className="settings-badge">
                  {formatRuntimeBusyStateLabel(activeSessionRuntimeDebug.status.type)}
                </span>
              ) : null}
              {latestRuntimePhase ? (
                <span className="settings-badge">{formatRuntimePhaseLabel(latestRuntimePhase)}</span>
              ) : null}
              {activeSessionRuntimeDebug?.diagnostics.blockedOnApproval ? (
                <span className="settings-badge is-warning">Approval blocked</span>
              ) : null}
            </div>

            <p className="right-sidebar-status-copy">{runtimeStatusDescription}</p>
            {runtimeState.errorMessage ? (
              <p className="right-sidebar-status-error" role="alert">{runtimeState.errorMessage}</p>
            ) : null}

            {activeSession ? (
              activeSessionRuntimeDebug ? (
                <>
                  <div className="right-sidebar-meta-grid">
                    <div className="right-sidebar-metric">
                      <span className="right-sidebar-metric-label">Turns</span>
                      <strong>{String(activeSessionRuntimeDebug.turns.length)}</strong>
                    </div>
                    <div className="right-sidebar-metric">
                      <span className="right-sidebar-metric-label">Tools</span>
                      <strong>{String(activeSessionRuntimeDebug.diagnostics.activeToolCount)}</strong>
                    </div>
                    <div className="right-sidebar-metric">
                      <span className="right-sidebar-metric-label">LLM Failures</span>
                      <strong>{String(activeSessionRuntimeDebug.diagnostics.llmFailureCount)}</strong>
                    </div>
                    <div className="right-sidebar-metric">
                      <span className="right-sidebar-metric-label">Active For</span>
                      <strong>{formatRuntimeDuration(activeSessionRuntimeDebug.running.activeForMs)}</strong>
                    </div>
                  </div>

                  {latestRuntimeTurn ? (
                    <div className="right-sidebar-runtime-stack">
                      <section className="right-sidebar-runtime-card">
                        <div className="right-sidebar-runtime-card-header">
                          <div>
                            <span className="label">Latest Turn</span>
                            <h4>{latestRuntimeTurn.turnID}</h4>
                          </div>
                          <span className={`settings-badge right-sidebar-runtime-pill is-${latestRuntimeTurn.status}`}>
                            {formatRuntimeTurnStatusLabel(latestRuntimeTurn.status)}
                          </span>
                        </div>

                        <div className="right-sidebar-runtime-card-grid">
                          <div className="right-sidebar-runtime-field">
                            <span>Phase</span>
                            <strong>{latestRuntimeTurn.phase ? formatRuntimePhaseLabel(latestRuntimeTurn.phase) : "—"}</strong>
                          </div>
                          <div className="right-sidebar-runtime-field">
                            <span>Duration</span>
                            <strong>{formatRuntimeDuration(latestRuntimeTurn.durationMs)}</strong>
                          </div>
                          <div className="right-sidebar-runtime-field">
                            <span>Agent</span>
                            <strong>{latestRuntimeTurn.agent ?? "—"}</strong>
                          </div>
                          <div className="right-sidebar-runtime-field">
                            <span>Model</span>
                            <strong>{latestRuntimeTurn.model ?? "—"}</strong>
                          </div>
                        </div>

                        {latestRuntimeTurn.finishReason ? (
                          <p className="right-sidebar-runtime-note">Finish reason: {latestRuntimeTurn.finishReason}</p>
                        ) : null}
                        {latestRuntimeTurn.errorContext?.error.message || latestRuntimeTurn.error?.message ? (
                          <p className="right-sidebar-status-error" role="alert">
                            {latestRuntimeTurn.errorContext?.error.message ?? latestRuntimeTurn.error?.message}
                          </p>
                        ) : null}
                      </section>

                      {latestRuntimeTurn.tools.length > 0 ? (
                        <section className="right-sidebar-runtime-card">
                          <div className="right-sidebar-runtime-card-header">
                            <div>
                              <span className="label">Recent Tools</span>
                              <h4>Latest tool calls</h4>
                            </div>
                          </div>
                          <div className="right-sidebar-runtime-list">
                            {latestRuntimeTurn.tools.slice(0, 5).map((tool) => (
                              <div key={tool.callID} className="right-sidebar-runtime-list-row">
                                <div className="right-sidebar-runtime-list-copy">
                                  <strong>{tool.tool}</strong>
                                  <span>{tool.title ?? tool.inputPreview ?? tool.outputPreview ?? tool.callID}</span>
                                </div>
                                <span className={`settings-badge right-sidebar-runtime-pill is-${tool.status}`}>
                                  {tool.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {latestRuntimeTurn.llmCalls.length > 0 ? (
                        <section className="right-sidebar-runtime-card">
                          <div className="right-sidebar-runtime-card-header">
                            <div>
                              <span className="label">Recent LLM Calls</span>
                              <h4>Latest model requests</h4>
                            </div>
                          </div>
                          <div className="right-sidebar-runtime-list">
                            {latestRuntimeTurn.llmCalls.slice(0, 4).map((call) => (
                              <div key={call.id} className="right-sidebar-runtime-list-row">
                                <div className="right-sidebar-runtime-list-copy">
                                  <strong>{`${call.providerID}/${call.modelID}`}</strong>
                                  <span>
                                    {call.finishReason ?? `messages=${call.messageCount}`}
                                    {call.durationMs ? ` • ${formatRuntimeDuration(call.durationMs)}` : ""}
                                  </span>
                                </div>
                                <span className={`settings-badge right-sidebar-runtime-pill is-${call.status}`}>
                                  {call.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {activeSessionRuntimeDebug.recentEvents.length > 0 ? (
                        <section className="right-sidebar-runtime-card">
                          <div className="right-sidebar-runtime-card-header">
                            <div>
                              <span className="label">Recent Events</span>
                              <h4>Execution timeline</h4>
                            </div>
                          </div>
                          <div className="right-sidebar-runtime-event-list">
                            {activeSessionRuntimeDebug.recentEvents.slice().reverse().map((event) => (
                              <article key={event.eventID} className={`right-sidebar-runtime-event is-${event.tone}`}>
                                <div className="right-sidebar-runtime-event-meta">
                                  <span>{event.title}</span>
                                  <time>{formatTime(event.timestamp)}</time>
                                </div>
                                {event.detail ? <p>{event.detail}</p> : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <div className="right-sidebar-empty">
                      <p>No runtime events were captured for this session yet.</p>
                    </div>
                  )}
                </>
              ) : runtimeState.status === "loading" ? (
                <div className="right-sidebar-empty">
                  <p>Loading runtime state for this session.</p>
                </div>
              ) : runtimeState.status === "error" ? (
                <div className="right-sidebar-empty">
                  <p>Couldn't refresh the current runtime snapshot.</p>
                </div>
              ) : (
                <div className="right-sidebar-empty">
                  <p>No runtime snapshot is available for this session yet.</p>
                </div>
              )
            ) : (
              <div className="right-sidebar-empty">
                <p>Select a session to inspect its runtime state.</p>
              </div>
            )}
          </section>
        ) : null}

        {activeView === "preview" ? (
          <PreviewPanel
            canInsertCommentsIntoDraft={canInsertPreviewCommentsIntoDraft}
            state={activePreviewState}
            workspaceDirectory={previewWorkspaceDirectory}
            workspaceName={previewWorkspaceName}
            onAddComment={onPreviewAddComment}
            onDeleteComment={onPreviewDeleteComment}
            onDraftUrlChange={onPreviewDraftUrlChange}
            onInsertCommentsIntoDraft={onPreviewInsertCommentsIntoDraft}
            onModeChange={onPreviewModeChange}
            onOpen={onPreviewOpen}
            onOpenExternal={onPreviewOpenExternal}
            onReload={onPreviewReload}
          />
        ) : null}

        {activeView === "files" ? (
          <WorkspaceFilesPanel
            canInsertCommentsIntoDraft={canInsertWorkspaceFileCommentsIntoDraft}
            scopeDirectory={activeWorkspaceFileScopeDirectory}
            scopeName={activeWorkspaceFileScopeName}
            state={activeWorkspaceFileState}
            onPendingCommentCancel={onWorkspaceFileCommentCancel}
            onPendingCommentChange={onWorkspaceFileCommentChange}
            onPendingCommentConfirm={onWorkspaceFileCommentConfirm}
            onPendingCommentStart={onWorkspaceFileCommentStart}
            onPendingCommentSubmit={onWorkspaceFileCommentSubmit}
            onQueryChange={onWorkspaceFileQueryChange}
            onSelectFile={onWorkspaceFileSelect}
          />
        ) : null}
      </div>
    </aside>
  )
}

interface SidebarResizerProps {
  isSidebarResizing: boolean
  maxWidth: number
  minWidth: number
  side: SidebarSide
  sidebarWidth: number
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
}

export function SidebarResizer({
  isSidebarResizing,
  maxWidth,
  minWidth,
  side,
  sidebarWidth,
  onKeyDown,
  onPointerDown,
}: SidebarResizerProps) {
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
      aria-valuemin={Math.round(minWidth)}
      aria-valuemax={Math.round(maxWidth)}
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
  }, [isMenuOpen])

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
              className={activeForm === "commit" ? "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"}
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
              className="composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"
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
              className="composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"
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
              className={activeForm === "branch" ? "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"}
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
            {sessions.filter((session) => !isSideChatSession(session)).map((session) => {
              const isActive = activeCreateSessionTabID === null && session.id === activeSessionID
              const workflowBadge = getSessionWorkflowBadge(session.workflow)

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
                    <span className="session-tab-copy">
                      <span className="session-tab-title">{session.title}</span>
                      {isSideChatSession(session) ? <SideChatBadge compact /> : null}
                      <SessionWorkflowBadge compact workflow={workflowBadge} />
                    </span>
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
        sessionKind?: SessionSummary["kind"]
        title: string
        workflow?: SessionSummary["workflow"]
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

type PaneTabBarTab = PaneTabBarProps["tabs"][number]
type CreateSessionPaneTab = Extract<PaneTabBarTab, { kind: "create-session" }>

const ACTIVE_TAB_CURVE_FILL_PATH = "M16 0L16 16L0 16C8.84 16 16 8.84 16 0Z"
const ACTIVE_TAB_CURVE_STROKE_PATH = "M0 16C8.84 16 16 8.84 16 0"

function PaneTabActiveCurve({ side }: { side: "start" | "end" }) {
  return (
    <span
      className={
        side === "start"
          ? "session-tab-active-curve session-tab-active-curve-start"
          : "session-tab-active-curve session-tab-active-curve-end"
      }
      aria-hidden="true"
    >
      <svg className="session-tab-active-curve-svg" viewBox="0 0 16 16" focusable="false">
        <path className="session-tab-active-curve-fill" d={ACTIVE_TAB_CURVE_FILL_PATH} />
        <path className="session-tab-active-curve-stroke" d={ACTIVE_TAB_CURVE_STROKE_PATH} />
      </svg>
    </span>
  )
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
  const activeCreateSessionTab =
    activeTabKey === null
      ? null
      : (tabs.find(
          (tab): tab is CreateSessionPaneTab => tab.key === activeTabKey && tab.kind === "create-session",
        ) ?? null)
  const existingCreateSessionTab =
    activeCreateSessionTab ??
    ([...tabs].reverse().find((tab): tab is CreateSessionPaneTab => tab.kind === "create-session") ?? null)

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

  function handleAddCreateSessionTab() {
    onFocus()
    if (existingCreateSessionTab) {
      onSelectCreateSessionTab(existingCreateSessionTab.createSessionTabID)
      return
    }
    onOpenCreateSessionTab()
  }

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
          const workflowBadge = tab.kind === "session" ? getSessionWorkflowBadge(tab.workflow) : null
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

          if (tab.kind === "session" && tab.sessionKind === "side-chat") {
            return null
          }

          return (
            <div
              key={tab.key}
              className={draggedTabKey === tab.key ? `${tabClassName} is-dragging` : tabClassName}
              onDragEnd={onTabDragEnd}
              onDragStart={(event) => handleTabDragStart(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
            >
              {isActive ? (
                <>
                  <PaneTabActiveCurve side="start" />
                  <PaneTabActiveCurve side="end" />
                </>
              ) : null}
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
                <span className="session-tab-copy">
                  <span className="session-tab-title">{tab.title}</span>
                  {tab.kind === "session" && tab.sessionKind === "side-chat" ? <SideChatBadge compact /> : null}
                  <SessionWorkflowBadge compact workflow={workflowBadge} />
                </span>
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
        <button className="canvas-region-top-menu-add-button" aria-label="Add session tab" title="Add session tab" type="button" onClick={handleAddCreateSessionTab}>
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
  activeSession: SessionSummary | null
  contextLabel: string
  gitProjectID: string | null
  gitDirectory: string | null
  mcpOptions: ComposerMcpOption[]
  pendingPermissionRequests: PermissionRequest[]
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
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel"
          role="dialog"
          aria-label="Project MCP server selection"
        >
          {mcpOptions.length > 0 ? (
            mcpOptions.map((option) => {
              const isSelected = selectedMcpServerIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option canvas-top-menu-segmented-option"}
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
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel"
          role="dialog"
          aria-label="Project skill selection"
        >
          {skillOptions.length > 0 ? (
            skillOptions.map((option) => {
              const isSelected = selectedSkillIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option canvas-top-menu-segmented-option"}
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

type ExternalEditorMenuOption = {
  id: string
  label: string
  iconDataUrl?: string
}

const EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY = "desktop.externalEditor.lastUsed.v1"

function toExternalEditorMenuOption(option: {
  id: string
  label: string
  iconDataUrl?: string
}) {
  return {
    id: option.id,
    label: option.label,
    ...(option.iconDataUrl ? { iconDataUrl: option.iconDataUrl } : {}),
  } satisfies ExternalEditorMenuOption
}

function readStoredExternalEditorID() {
  try {
    return window.localStorage.getItem(EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

function writeStoredExternalEditorID(editorID: string) {
  try {
    window.localStorage.setItem(EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY, editorID)
  } catch {
    // Ignore storage failures and keep the in-memory fallback only.
  }
}

function resolveDefaultExternalEditorOption(
  options: ExternalEditorMenuOption[],
  preferredEditorID: string | null,
) {
  if (preferredEditorID) {
    const preferredOption = options.find((option) => option.id === preferredEditorID)
    if (preferredOption) return preferredOption
  }

  return options[0] ?? null
}

function getExternalEditorFallbackBadge(editorID: string) {
  switch (editorID) {
    case "vscode":
      return "VS"
    case "visualstudio":
      return "VI"
    case "cursor":
      return "CU"
    case "windsurf":
      return "WS"
    case "githubDesktop":
      return "GH"
    case "explorer":
      return "EX"
    case "terminal":
      return "WT"
    case "wsl":
      return "WSL"
    default:
      return "AP"
  }
}

function ExternalEditorMenuButton({ directory }: { directory: string | null }) {
  const listExternalEditorsForTarget = window.desktop?.listExternalEditorsForTarget
  const openInExternalEditor = window.desktop?.openInExternalEditor
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [editorOptions, setEditorOptions] = useState<ExternalEditorMenuOption[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingEditorID, setPendingEditorID] = useState<string | null>(null)
  const [preferredEditorID, setPreferredEditorID] = useState<string | null>(() => readStoredExternalEditorID())
  const iconRefreshTimerRef = useRef<number | null>(null)
  const optionsLoadRequestRef = useRef(0)

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
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

  const loadEditorOptions = useEffectEvent(async ({
    targetPath,
    resetOptions = false,
    allowIconRefresh = true,
  }: {
    targetPath: string
    resetOptions?: boolean
    allowIconRefresh?: boolean
  }) => {
    if (!listExternalEditorsForTarget) return [] as ExternalEditorMenuOption[]
    const requestID = optionsLoadRequestRef.current + 1
    optionsLoadRequestRef.current = requestID

    if (iconRefreshTimerRef.current !== null) {
      window.clearTimeout(iconRefreshTimerRef.current)
      iconRefreshTimerRef.current = null
    }

    if (resetOptions) {
      setEditorOptions([])
    }

    setIsLoadingOptions(true)
    setLoadError(null)

    try {
      const options = (await listExternalEditorsForTarget({ targetPath })).map(toExternalEditorMenuOption)
      if (requestID !== optionsLoadRequestRef.current) {
        return [] as ExternalEditorMenuOption[]
      }

      setEditorOptions(options)

      if (allowIconRefresh && options.some((option) => !option.iconDataUrl)) {
        iconRefreshTimerRef.current = window.setTimeout(() => {
          void loadEditorOptions({
            targetPath,
            allowIconRefresh: false,
          })
        }, 160)
      }

      return options
    } catch (error) {
      if (requestID !== optionsLoadRequestRef.current) {
        return [] as ExternalEditorMenuOption[]
      }

      setEditorOptions([])
      setLoadError(error instanceof Error ? error.message : String(error))
      return [] as ExternalEditorMenuOption[]
    } finally {
      if (requestID === optionsLoadRequestRef.current) {
        setIsLoadingOptions(false)
      }
    }
  })

  useEffect(() => {
    if (!directory || !listExternalEditorsForTarget) return

    void loadEditorOptions({
      targetPath: directory,
      resetOptions: true,
    })

    return () => {
      optionsLoadRequestRef.current += 1
      if (iconRefreshTimerRef.current !== null) {
        window.clearTimeout(iconRefreshTimerRef.current)
        iconRefreshTimerRef.current = null
      }
    }
  }, [directory, listExternalEditorsForTarget])

  if (!directory || !listExternalEditorsForTarget || !openInExternalEditor) {
    return null
  }

  const targetPath = directory
  const launchExternalEditor = openInExternalEditor
  const defaultEditorOption = resolveDefaultExternalEditorOption(editorOptions, preferredEditorID)
  function rememberPreferredEditor(editorID: string) {
    setPreferredEditorID(editorID)
    writeStoredExternalEditorID(editorID)
  }

  async function handleOptionClick(editorID: string) {
    setPendingEditorID(editorID)
    setLoadError(null)

    try {
      await launchExternalEditor({
        targetPath,
        editorID,
      })
      rememberPreferredEditor(editorID)
      setIsMenuOpen(false)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingEditorID(null)
    }
  }

  async function handlePrimaryButtonClick() {
    let editorID = defaultEditorOption?.id ?? null
    if (!editorID) {
      const loadedOptions = await loadEditorOptions({ targetPath })
      editorID = resolveDefaultExternalEditorOption(loadedOptions, preferredEditorID)?.id ?? null
    }

    if (!editorID) return

    await handleOptionClick(editorID)
  }

  return (
    <div ref={triggerRef} className="canvas-top-menu-selector-anchor external-editor-split-button-anchor">
      <div className="external-editor-split-button" role="group" aria-label="Open current project">
        <button
          type="button"
          className="canvas-top-menu-button canvas-top-menu-editor-launch-button"
          aria-label={defaultEditorOption ? `Open current project in ${defaultEditorOption.label}` : "Open current project"}
          title={defaultEditorOption ? `Open current project in ${defaultEditorOption.label}` : "Open current project"}
          disabled={pendingEditorID !== null}
          onClick={() => void handlePrimaryButtonClick()}
        >
          <span className="external-editor-toolbar-icon" aria-hidden="true">
            {defaultEditorOption?.iconDataUrl ? (
              <img className="external-editor-toolbar-icon-image" src={defaultEditorOption.iconDataUrl} alt="" />
            ) : defaultEditorOption ? (
              <span className="external-editor-toolbar-icon-fallback" data-editor-kind={defaultEditorOption.id}>
                {getExternalEditorFallbackBadge(defaultEditorOption.id)}
              </span>
            ) : (
              <OpenInEditorIcon />
            )}
          </span>
        </button>
        <button
          type="button"
          className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-editor-menu-button is-active" : "canvas-top-menu-button canvas-top-menu-editor-menu-button"}
          aria-controls="canvas-top-menu-editor-menu"
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          aria-label="Choose editor for current project"
          title="Choose editor for current project"
          disabled={pendingEditorID !== null}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <ChevronDownIcon />
        </button>
      </div>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-editor-menu"
          className="canvas-top-menu-selector-panel external-editor-menu-panel"
          role="dialog"
          aria-label="Open current project"
        >
          {isLoadingOptions ? <p className="composer-menu-empty">Loading available apps...</p> : null}
          {!isLoadingOptions && loadError ? <p className="composer-menu-empty">{loadError}</p> : null}
          {!isLoadingOptions && !loadError && editorOptions.length === 0 ? (
            <p className="composer-menu-empty">No supported apps are available for this project.</p>
          ) : null}
          {!isLoadingOptions && !loadError
            ? editorOptions.map((option) => (
                <button
                  key={option.id}
                  className="composer-menu-option external-editor-menu-option"
                  disabled={pendingEditorID !== null}
                  onClick={() => void handleOptionClick(option.id)}
                  type="button"
                >
                  <span className="external-editor-menu-option-main">
                    <span className="external-editor-menu-option-icon" aria-hidden="true">
                      {option.iconDataUrl ? (
                        <img
                          className="external-editor-menu-option-icon-image"
                          src={option.iconDataUrl}
                          alt=""
                        />
                      ) : (
                        <span
                          className="external-editor-menu-option-icon-fallback"
                          data-editor-kind={option.id}
                        >
                          {getExternalEditorFallbackBadge(option.id)}
                        </span>
                      )}
                    </span>
                    <span className="composer-menu-option-copy">
                      <strong>{option.label}</strong>
                    </span>
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}

export function SessionCanvasTopMenu({
  activeSession,
  contextLabel,
  gitProjectID,
  gitDirectory,
  mcpOptions,
  pendingPermissionRequests,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: SessionCanvasTopMenuProps) {
  const workflowBadge = getSessionWorkflowBadge(activeSession?.workflow, pendingPermissionRequests)
  const readOnlySideChat = isSideChatSession(activeSession)

  return (
    <ShellTopMenu
      ariaLabel="Session canvas top menu"
      as="div"
      className="session-canvas-top-menu"
      contentClassName="panel-toolbar-copy session-canvas-top-menu-copy"
      content={(
        <div className="session-canvas-top-menu-copy-main">
          <span className="label">{contextLabel}</span>
          {readOnlySideChat || workflowBadge ? (
            <div className="session-canvas-top-menu-copy-status">
              {readOnlySideChat ? <SideChatBadge /> : null}
              <SessionWorkflowBadge workflow={workflowBadge} />
            </div>
          ) : null}
        </div>
      )}
      controlsSpacerVariant="canvas"
      trailing={(
        <>
          <ExternalEditorMenuButton directory={gitDirectory} />
          {!readOnlySideChat ? (
            <>
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
          ) : null}
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
  const label = provider.connectionLabel ?? provider.authState.connectionLabel

  switch (provider.authState.status) {
    case "connected":
      return label ?? "Connected"
    case "pending":
      return label ?? "Pending"
    case "expired":
      return label ?? "Expired"
    case "error":
      return label ?? "Error"
    case "not_connected":
      if (provider.apiKeyConfigured) return "Configured"
      return label ?? "Not connected"
  }
}

function isProviderConnected(provider: ProviderCatalogItem) {
  return provider.authState.status === "connected"
}

function getProviderCredentialSummary(provider: ProviderCatalogItem) {
  const activeCredential =
    provider.authState.credentials.find((credential) => credential.method === provider.authState.activeMethod) ??
    provider.authState.credentials[0]

  if (!activeCredential?.configured) return null
  if (activeCredential.label) return activeCredential.label
  if (activeCredential.email) return activeCredential.email
  if (activeCredential.kind === "api_key") {
    return activeCredential.source === "environment" ? "Configured from environment" : "Stored API key"
  }
  if (activeCredential.source === "external_cache") {
    return "Using shared Codex login"
  }

  return "Stored session"
}

function getProviderAuthCapability(provider: ProviderCatalogItem, method: string | null | undefined) {
  if (!method) return null
  return provider.authCapabilities.find((capability) => capability.method === method) ?? null
}

function isProviderFlowTerminal(status?: string | null) {
  return !status || ["connected", "error", "expired", "cancelled"].includes(status)
}

function formatProviderAuthTimestamp(value?: number) {
  if (!value) return null
  return new Date(value).toLocaleString()
}

function getProviderKeyPlaceholder(provider: ProviderCatalogItem) {
  const apiKeyCredential = provider.authState.credentials.find((credential) => credential.kind === "api_key")
  if (apiKeyCredential?.configured || provider.apiKeyConfigured) {
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

function getPromptPresetSourceLabel(source: PromptPresetSummary["source"]) {
  return source === "custom" ? "Custom" : "Bundled"
}

function getPromptPresetUsageLabels(
  presetID: string,
  selection: PromptPresetSelection | null,
) {
  if (!selection) return []

  const labels: string[] = []
  if (selection.systemPromptPresetID === presetID) {
    labels.push("System")
  }
  if (selection.planModePromptPresetID === presetID) {
    labels.push("Plan")
  }

  return labels
}

type SettingsSectionKey = "services" | "defaults" | "mcp" | "prompts" | "appearance" | "developer" | "archive"

interface SettingsPageProps {
  activeMcpServerID: string | null
  activeMcpServerDiagnostic: McpServerDiagnostic | null
  appearanceConfigError: string | null
  appearanceConfigPath: string | null
  appearanceConfigPreview: string
  appearanceOverrides: AppearanceTokenMap
  appearanceTokenValues: Record<AppearanceTokenName, string>
  assistantTraceVisibility: AssistantTraceVisibility
  archivedSessions: ArchivedSessionSummary[]
  archivedSessionsError: string | null
  catalog: ProviderCatalogItem[]
  deletingArchivedSessionID: string | null
  deletingMcpServerID: string | null
  deletingPromptPresetID: string | null
  deletingProviderID: string | null
  brandTheme: BrandTheme
  colorMode: ColorMode
  isCreatingPromptPreset: boolean
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isDebugLineColorsEnabled: boolean
  isDebugUiRegionsEnabled: boolean
  isLoading: boolean
  isLoadingPromptPreset: boolean
  isLoadingPrompts: boolean
  isLoadingArchivedSessions: boolean
  isOpen: boolean
  isPromptDirty: boolean
  isSystemPromptPresetDirty: boolean
  isPlanModePromptPresetDirty: boolean
  isRefreshingProviderCatalog: boolean
  isSavingPromptPresetSelection: boolean
  isSavingSelection: boolean
  loadError: string | null
  mcpServerDraft: McpServerDraftState
  mcpServers: McpServerSummary[]
  message: {
    tone: "success" | "error"
    text: string
  } | null
  models: ProviderModel[]
  promptDraftLabel: string
  promptDraftContent: string
  promptLoadError: string | null
  promptPresets: PromptPresetSummary[]
  promptPresetSelection: PromptPresetSelection | null
  projectID: string | null
  projectName: string | null
  projectWorktree: string | null
  providerDrafts: Record<string, ProviderDraftState>
  onCreatePromptPreset: () => boolean | Promise<boolean>
  onDeletePromptPreset: () => boolean | Promise<boolean>
  resettingPromptPresetID: string | null
  restoringArchivedSessionID: string | null
  savedSelection: ProjectModelSelection
  savingMcpServerID: string | null
  savingPromptPresetID: string | null
  savingPromptPresetSelectionField: keyof PromptPresetSelection | null
  savingProviderID: string | null
  selectedPromptPreset: PromptPresetDocument | null
  selectionDraft: ProjectModelSelection
  onBrandThemeChange: (theme: BrandTheme) => void
  onColorModeChange: (mode: ColorMode) => void
  onActivityRailVisibilityChange: (value: boolean) => void
  onAppearancePaletteReset: () => void
  onAppearanceTokenChange: (tokenName: AppearanceTokenName, value: string) => void
  onAppearanceTokenReset: (tokenName: AppearanceTokenName) => void
  onAssistantTraceVisibilityChange: (key: AssistantTraceVisibilityKey, value: boolean) => void
  onAgentDebugTraceChange: (value: boolean) => void
  onDebugLineColorsChange: (value: boolean) => void
  onDebugUiRegionsChange: (value: boolean) => void
  onClose: () => void
  onDeleteArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDeleteProviderAuthSession: (providerID: string) => boolean | Promise<boolean>
  onDeleteProvider: (providerID: string) => void | Promise<void>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onPromptDraftLabelChange: (value: string) => void
  onPromptDraftChange: (value: string) => void
  onPromptPresetSelectionChange: (field: keyof PromptPresetSelection, value: string) => void
  onSavePromptPresetSelection: (field?: keyof PromptPresetSelection) => boolean | Promise<boolean>
  onPromptPresetSelect: (presetID: string) => boolean | Promise<boolean>
  onMcpServerSelect: (serverID: string) => void
  onProviderAuthMethodChange: (providerID: string, method: string) => void
  onProviderDraftChange: (providerID: string, field: "apiKey" | "baseURL", value: string) => void
  onRefreshProviderCatalog: () => boolean | Promise<boolean>
  onResetPromptPreset: () => boolean | Promise<boolean>
  onRestoreArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onSaveMcpServer: () => boolean | Promise<boolean>
  onSavePromptPreset: () => boolean | Promise<boolean>
  onSaveProviderApiKey: (providerID: string, apiKey?: string | null) => boolean | Promise<boolean>
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSaveSelection: () => void | Promise<void>
  onSelectionChange: (field: keyof ProjectModelSelection, value: string | null) => void
  onStartProviderAuthFlow: (providerID: string) => boolean | Promise<boolean>
  onStartNewMcpServer: () => void
  onCancelProviderAuthFlow: (providerID: string) => boolean | Promise<boolean>
}

export function SettingsPage({
  activeMcpServerID,
  activeMcpServerDiagnostic,
  appearanceConfigError,
  appearanceConfigPath,
  appearanceConfigPreview,
  appearanceOverrides,
  appearanceTokenValues,
  assistantTraceVisibility,
  archivedSessions,
  archivedSessionsError,
  catalog,
  deletingArchivedSessionID,
  deletingMcpServerID,
  deletingPromptPresetID,
  deletingProviderID,
  brandTheme,
  colorMode,
  isCreatingPromptPreset,
  isActivityRailVisible,
  isAgentDebugTraceEnabled,
  isDebugLineColorsEnabled,
  isDebugUiRegionsEnabled,
  isLoading,
  isLoadingPromptPreset,
  isLoadingPrompts,
  isLoadingArchivedSessions,
  isOpen,
  isPromptDirty,
  isSystemPromptPresetDirty,
  isPlanModePromptPresetDirty,
  isRefreshingProviderCatalog,
  isSavingPromptPresetSelection,
  isSavingSelection,
  loadError,
  mcpServerDraft,
  mcpServers,
  message,
  models,
  promptDraftLabel,
  promptDraftContent,
  promptLoadError,
  promptPresets,
  promptPresetSelection,
  projectID,
  projectName,
  projectWorktree,
  providerDrafts,
  onCreatePromptPreset,
  onDeletePromptPreset,
  resettingPromptPresetID,
  restoringArchivedSessionID,
  savedSelection,
  savingMcpServerID,
  savingPromptPresetID,
  savingPromptPresetSelectionField,
  savingProviderID,
  selectedPromptPreset,
  selectionDraft,
  onBrandThemeChange,
  onColorModeChange,
  onActivityRailVisibilityChange,
  onAppearancePaletteReset,
  onAppearanceTokenChange,
  onAppearanceTokenReset,
  onAssistantTraceVisibilityChange,
  onAgentDebugTraceChange,
  onDebugLineColorsChange,
  onDebugUiRegionsChange,
  onClose,
  onDeleteArchivedSession,
  onDeleteMcpServer,
  onDeleteProviderAuthSession,
  onDeleteProvider,
  onMcpServerDraftChange,
  onPromptDraftLabelChange,
  onPromptDraftChange,
  onPromptPresetSelectionChange,
  onSavePromptPresetSelection,
  onPromptPresetSelect,
  onMcpServerSelect,
  onProviderAuthMethodChange,
  onProviderDraftChange,
  onRefreshProviderCatalog,
  onResetPromptPreset,
  onRestoreArchivedSession,
  onSaveMcpServer,
  onSavePromptPreset,
  onSaveProviderApiKey,
  onSaveProvider,
  onSaveSelection,
  onSelectionChange,
  onStartProviderAuthFlow,
  onStartNewMcpServer,
  onCancelProviderAuthFlow,
}: SettingsPageProps) {
  {
    const [activeSection, setActiveSection] = useState<SettingsSectionKey>("services")
    const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
    const [providerSearch, setProviderSearch] = useState("")
    const serviceDetailPanelRef = useRef<HTMLDivElement | null>(null)
    const enabledTraceVisibilityCount = assistantTraceVisibilityOptions.filter(
      (option) => assistantTraceVisibility[option.key],
    ).length

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
          selectedAuthMethod: activeProvider.authState.activeMethod ?? activeProvider.authCapabilities[0]?.method ?? null,
          activeFlow: activeProvider.authState.flow ?? null,
        })
      : null
    const activeProviderModels = activeProvider ? modelGroups[activeProvider.id] ?? [] : []
    const activeProviderBusy = activeProvider ? savingProviderID === activeProvider.id || deletingProviderID === activeProvider.id : false
    const activeProviderSelectedMethod =
      activeProviderDraft?.selectedAuthMethod ?? activeProvider?.authState.activeMethod ?? activeProvider?.authCapabilities[0]?.method ?? null
    const activeProviderSelectedCapability = activeProvider
      ? getProviderAuthCapability(activeProvider, activeProviderSelectedMethod)
      : null
    const activeProviderFlow = activeProviderDraft?.activeFlow ?? activeProvider?.authState.flow ?? null
    const activeProviderConfigDirty = activeProvider
      ? (activeProviderDraft?.baseURL.trim() ?? "") !== (activeProvider.baseURL ?? "")
      : false
    const activeProviderApiKeyDirty =
      activeProviderSelectedCapability?.kind === "api_key" ? (activeProviderDraft?.apiKey.trim().length ?? 0) > 0 : false
    const activeProviderCanReset = activeProvider?.source === "config"
    const activeProviderCredentialSummary = activeProvider ? getProviderCredentialSummary(activeProvider) : null
    const activeProviderAccountSummary =
      activeProvider?.authState.account?.label ??
      activeProvider?.authState.account?.email ??
      activeProvider?.authState.account?.workspaceName ??
      null
    const activeProviderExpiresAt = activeProvider?.authState.expiresAt ?? activeProviderFlow?.expiresAt
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
    const promptPresetOptions = [...promptPresets].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "bundled" ? -1 : 1
      }

      return left.label.localeCompare(right.label)
    })
    const selectedPromptPresetBusy =
      selectedPromptPreset !== null &&
      (
        savingPromptPresetID === selectedPromptPreset.id ||
        resettingPromptPresetID === selectedPromptPreset.id ||
        deletingPromptPresetID === selectedPromptPreset.id
      )
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

    function handlePromptPresetSelection(presetID: string) {
      if (presetID === selectedPromptPreset?.id) return
      if (
        isPromptDirty &&
        typeof window.confirm === "function" &&
        !window.confirm("Discard unsaved prompt changes and switch presets?")
      ) {
        return
      }

      void onPromptPresetSelect(presetID)
    }

    function handlePromptPresetCreate() {
      if (
        isPromptDirty &&
        typeof window.confirm === "function" &&
        !window.confirm("Discard unsaved prompt changes and create a new preset?")
      ) {
        return
      }

      void onCreatePromptPreset()
    }

    const selectedPromptPresetUsageLabels = selectedPromptPreset
      ? getPromptPresetUsageLabels(selectedPromptPreset.id, promptPresetSelection)
      : []
    const brandThemeOptions = [
      {
        value: "terra" as const,
        label: "Warm Terra & Sand",
        description: "Muted pale red, warm stone surfaces, and a softer trust-first feel.",
      },
      {
        value: "sage" as const,
        label: "Sage / Slate",
        description: "Cool sage accents with the existing slate-driven shell.",
      },
    ]
    const hasCustomAppearanceOverrides = Object.keys(appearanceOverrides).length > 0

    const primarySectionGroups = [
      {
        label: "\u9009\u9879",
        items: [
          { key: "services" as const, label: "Provider", Icon: SettingsIcon },
          { key: "defaults" as const, label: "Models", Icon: ConnectedStatusIcon },
          { key: "mcp" as const, label: "MCP", Icon: FolderIcon },
          { key: "prompts" as const, label: "Prompts", Icon: FileTextIcon },
          { key: "appearance" as const, label: "Appearance", Icon: LayoutSidebarLeftIcon },
          { key: "developer" as const, label: "Developer Mode", Icon: TerminalIcon },
          { key: "archive" as const, label: "Archived Sessions", Icon: ArchiveIcon },
        ],
      },
    ] as const

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
              {primarySectionGroups.map((group) => (
                <section key={group.label} className="settings-primary-nav-group" aria-label={group.label}>
                  <p className="settings-primary-nav-group-label">{group.label}</p>
                  <div className="settings-primary-nav-group-items">
                    {group.items.map((section) => {
                      const isActive = activeSection === section.key
                      const Icon = section.Icon

                      return (
                        <button
                          key={section.key}
                          className={isActive ? "settings-primary-nav-item is-active" : "settings-primary-nav-item"}
                          aria-current={isActive ? "page" : undefined}
                          type="button"
                          onClick={() => setActiveSection(section.key)}
                        >
                          <span className="settings-primary-nav-icon" aria-hidden="true">
                            <Icon />
                          </span>
                          <span className="settings-primary-nav-copy">
                            <span className="settings-primary-nav-label">{section.label}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </aside>

            <div
              className={
                activeSection === "services" || activeSection === "prompts"
                  ? "settings-page-main is-services"
                  : "settings-page-main"
              }
            >
              {message ? (
                <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>{message.text}</div>
              ) : null}

              {loadError && showProviderSections ? <div className="settings-banner is-error">{loadError}</div> : null}

              {archivedSessionsError && activeSection === "archive" ? (
                <div className="settings-banner is-error">{archivedSessionsError}</div>
              ) : null}

              {promptLoadError && activeSection === "prompts" ? (
                <div className="settings-banner is-error">{promptLoadError}</div>
              ) : null}

              {isLoading && showProviderSections ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {isLoadingPrompts && activeSection === "prompts" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching prompt presets</h3>
                  <p>Reading the prompt catalog, override state, and current editable content.</p>
                </article>
              ) : null}

              {isLoadingArchivedSessions && activeSection === "archive" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching archived sessions</h3>
                  <p>Reading archived session snapshots so you can restore or permanently delete them.</p>
                </article>
              ) : null}

              {activeSection === "prompts" ? (
                isLoadingPrompts ? null : (
                  <section className="settings-prompts-shell" aria-label="Prompt preset layout">
                    <section className="settings-panel settings-prompt-slots-panel">
                      <div className="settings-prompt-assignment-list">
                        <div className="settings-prompt-assignment-row">
                          <div className="settings-prompt-assignment-copy">
                            <span className="settings-prompt-assignment-title">System</span>
                            <span className="settings-prompt-assignment-note">Every turn</span>
                          </div>

                          <div className="settings-prompt-assignment-control">
                            <div className="settings-prompt-assignment-actions">
                              <select
                                id="settings-system-prompt-preset"
                                aria-label="System prompt preset"
                                value={promptPresetSelection?.systemPromptPresetID ?? ""}
                                disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                                onChange={(event) =>
                                  onPromptPresetSelectionChange("systemPromptPresetID", event.target.value)
                                }
                              >
                                {promptPresetOptions.map((preset) => (
                                  <option key={`system-${preset.id}`} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary-button"
                                type="button"
                                aria-label="Confirm system prompt preset"
                                disabled={!isSystemPromptPresetDirty || isSavingPromptPresetSelection}
                                onClick={() => void onSavePromptPresetSelection("systemPromptPresetID")}
                              >
                                {savingPromptPresetSelectionField === "systemPromptPresetID" ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="settings-prompt-assignment-row">
                          <div className="settings-prompt-assignment-copy">
                            <span className="settings-prompt-assignment-title">Plan</span>
                            <span className="settings-prompt-assignment-note">Plan only</span>
                          </div>

                          <div className="settings-prompt-assignment-control">
                            <div className="settings-prompt-assignment-actions">
                              <select
                                id="settings-plan-mode-prompt-preset"
                                aria-label="Plan mode prompt preset"
                                value={promptPresetSelection?.planModePromptPresetID ?? ""}
                                disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                                onChange={(event) =>
                                  onPromptPresetSelectionChange("planModePromptPresetID", event.target.value)
                                }
                              >
                                {promptPresetOptions.map((preset) => (
                                  <option key={`plan-${preset.id}`} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary-button"
                                type="button"
                                aria-label="Confirm plan mode prompt preset"
                                disabled={!isPlanModePromptPresetDirty || isSavingPromptPresetSelection}
                                onClick={() => void onSavePromptPresetSelection("planModePromptPresetID")}
                              >
                                {savingPromptPresetSelectionField === "planModePromptPresetID" ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="settings-services-layout settings-prompts-layout">
                      <div className="settings-service-list-panel settings-prompt-library-panel">
                        <div className="settings-prompt-section-bar">
                          <h3>Presets</h3>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={isCreatingPromptPreset}
                            onClick={handlePromptPresetCreate}
                          >
                            {isCreatingPromptPreset ? "Creating..." : "New"}
                          </button>
                        </div>

                        <div className="settings-service-list-body">
                          {promptPresetOptions.length > 0 ? (
                            <div className="settings-service-list settings-prompt-library" role="list" aria-label="Prompt presets">
                              {promptPresetOptions.map((preset) => {
                                const isActive = preset.id === selectedPromptPreset?.id
                                const usageLabels = getPromptPresetUsageLabels(preset.id, promptPresetSelection)

                                return (
                                  <button
                                    key={preset.id}
                                    className={
                                      isActive
                                        ? "settings-service-item settings-prompt-library-item is-active"
                                        : "settings-service-item settings-prompt-library-item"
                                    }
                                    aria-label={preset.label}
                                    aria-pressed={isActive}
                                    type="button"
                                    onClick={() => handlePromptPresetSelection(preset.id)}
                                  >
                                    <div className="settings-service-item-header">
                                      <strong>{preset.label}</strong>
                                      <span className="settings-badge">{getPromptPresetSourceLabel(preset.source)}</span>
                                    </div>
                                    <div className="settings-prompt-item-statuses">
                                      {usageLabels.map((label) => (
                                        <span key={`${preset.id}-${label}`} className="settings-badge is-highlight">
                                          {label}
                                        </span>
                                      ))}
                                      {preset.hasOverride ? <span className="settings-badge is-warning">Edited</span> : null}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <article className="settings-empty-state settings-service-list-empty-state">
                              <h3>No presets</h3>
                            </article>
                          )}
                        </div>
                      </div>

                      <div className="settings-service-detail-panel settings-prompt-detail-panel">
                        {selectedPromptPreset ? (
                          <section className="settings-panel settings-prompt-editor-panel">
                            <div className="settings-prompt-editor-header">
                              <div className="settings-prompt-editor-meta">
                                {selectedPromptPreset.source === "custom" ? (
                                  <input
                                    className="settings-prompt-name-input"
                                    aria-label="Preset name"
                                    value={promptDraftLabel}
                                    readOnly={isLoadingPromptPreset}
                                    onChange={(event) => onPromptDraftLabelChange(event.target.value)}
                                  />
                                ) : (
                                  <h3>{selectedPromptPreset.label}</h3>
                                )}

                                <div className="settings-prompt-item-statuses">
                                  <span className="settings-badge">{getPromptPresetSourceLabel(selectedPromptPreset.source)}</span>
                                  {selectedPromptPresetUsageLabels.map((label) => (
                                    <span key={`${selectedPromptPreset.id}-${label}`} className="settings-badge is-highlight">
                                      {label}
                                    </span>
                                  ))}
                                  {selectedPromptPreset.hasOverride ? (
                                    <span className="settings-badge is-warning">Edited</span>
                                  ) : null}
                                  {isLoadingPromptPreset ? <span className="settings-badge">Loading</span> : null}
                                </div>
                              </div>

                              <div className="settings-inline-actions">
                                {selectedPromptPreset.source === "custom" ? (
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={selectedPromptPresetBusy || isLoadingPromptPreset}
                                    onClick={() => void onDeletePromptPreset()}
                                  >
                                    {deletingPromptPresetID === selectedPromptPreset.id ? "Deleting..." : "Delete"}
                                  </button>
                                ) : (
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={!selectedPromptPreset.hasOverride || selectedPromptPresetBusy || isLoadingPromptPreset}
                                    onClick={() => void onResetPromptPreset()}
                                  >
                                    {resettingPromptPresetID === selectedPromptPreset.id ? "Resetting..." : "Reset"}
                                  </button>
                                )}
                                <button
                                  className="primary-button"
                                  type="button"
                                  disabled={!isPromptDirty || selectedPromptPresetBusy || isLoadingPromptPreset}
                                  onClick={() => void onSavePromptPreset()}
                                >
                                  {savingPromptPresetID === selectedPromptPreset.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>

                            <label className="settings-field settings-prompt-editor-field">
                              <textarea
                                className="settings-prompt-editor"
                                aria-label={`${selectedPromptPreset.label} content`}
                                value={promptDraftContent}
                                readOnly={!selectedPromptPreset.editable || isLoadingPromptPreset}
                                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptDraftChange(event.target.value)}
                              />
                            </label>

                            {selectedPromptPreset.sourcePath ? (
                              <p className="settings-helper-text settings-prompt-source-path">
                                <code>{selectedPromptPreset.sourcePath}</code>
                              </p>
                            ) : null}
                          </section>
                        ) : (
                          <article className="settings-empty-state settings-detail-empty-state">
                            <h3>Select a preset</h3>
                          </article>
                        )}
                      </div>
                    </div>
                  </section>
                )
              ) : activeSection === "appearance" ? (
                <div className="settings-appearance-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Brand</span>
                        <h3>Accent Theme</h3>
                      </div>
                      <p>Switch between the new warm terra palette and the original cool sage shell.</p>
                    </div>
                    <div className="settings-theme-palette-group" role="group" aria-label="Accent theme">
                      {brandThemeOptions.map((theme) => (
                        <button
                          key={theme.value}
                          className={
                            brandTheme === theme.value
                              ? "settings-theme-palette-option is-active"
                              : "settings-theme-palette-option"
                          }
                          role="radio"
                          aria-checked={brandTheme === theme.value}
                          type="button"
                          onClick={() => onBrandThemeChange(theme.value)}
                        >
                          <span className={`settings-theme-palette-swatch is-${theme.value}`} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span className="settings-theme-palette-copy">
                            <strong>{theme.label}</strong>
                            <small>{theme.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Theme</span>
                        <h3>Color Mode</h3>
                      </div>
                      <p>Choose between light, dark, or system-matched color scheme.</p>
                    </div>
                    <div className="settings-color-mode-group" role="group" aria-label="Color mode">
                      {(["system", "light", "dark"] as const).map((mode) => (
                        <button
                          key={mode}
                          className={colorMode === mode ? "settings-color-mode-option is-active" : "settings-color-mode-option"}
                          role="radio"
                          aria-checked={colorMode === mode}
                          type="button"
                          onClick={() => onColorModeChange(mode)}
                        >
                          <span className="settings-color-mode-icon" aria-hidden="true">
                            {mode === "light" ? <SunIcon size={16} /> : mode === "dark" ? <MoonIcon size={16} /> : <MonitorIcon size={16} />}
                          </span>
                          <span>{mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Config</span>
                        <h3>Theme Config File</h3>
                      </div>
                      <div className="settings-inline-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!hasCustomAppearanceOverrides}
                          onClick={onAppearancePaletteReset}
                        >
                          Reset Custom Colors
                        </button>
                      </div>
                    </div>

                    <div className="settings-theme-config-meta">
                      <div className="settings-theme-config-path">
                        <span className="label">Saved To</span>
                        <code>{appearanceConfigPath ?? "Appearance config bridge unavailable."}</code>
                      </div>
                      <p className="settings-helper-text">
                        This file is saved automatically. After you tune the palette here, you can ask the coding agent to
                        read this JSON and continue building UI against the exact same color scheme.
                      </p>
                      {appearanceConfigError ? (
                        <p className="settings-helper-text settings-theme-config-error">{appearanceConfigError}</p>
                      ) : null}
                    </div>

                    <label className="settings-theme-config-preview">
                      <span className="label">Current JSON</span>
                      <textarea
                        aria-label="Current appearance config JSON"
                        readOnly
                        value={appearanceConfigPreview}
                      />
                    </label>
                  </section>

                  {APPEARANCE_TOKEN_GROUPS.map((group) => (
                    <section key={group.id} className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Semantic Tokens</span>
                          <h3>{group.label}</h3>
                        </div>
                        <p>{group.description}</p>
                      </div>

                      <div className="settings-theme-token-grid">
                        {group.tokens.map((tokenName) => {
                          const metadata = APPEARANCE_TOKEN_METADATA[tokenName]
                          const isCustomized = Boolean(appearanceOverrides[tokenName])

                          return (
                            <article
                              key={tokenName}
                              className={
                                isCustomized
                                  ? "settings-theme-token-card is-customized"
                                  : "settings-theme-token-card"
                              }
                            >
                              <div className="settings-theme-token-copy">
                                <div className="settings-theme-token-heading">
                                  <strong>{metadata.label}</strong>
                                  <span className={isCustomized ? "settings-badge is-highlight" : "settings-badge"}>
                                    {isCustomized ? "Custom" : "Preset"}
                                  </span>
                                </div>
                                <small>{metadata.description}</small>
                              </div>

                              <div className="settings-theme-token-controls">
                                <input
                                  aria-label={`${group.label} ${metadata.label} ${tokenName}`}
                                  className="settings-theme-color-picker"
                                  type="color"
                                  value={appearanceTokenValues[tokenName]}
                                  onChange={(event) => onAppearanceTokenChange(tokenName, event.target.value)}
                                />
                                <code>{appearanceTokenValues[tokenName]}</code>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={!isCustomized}
                                  onClick={() => onAppearanceTokenReset(tokenName)}
                                >
                                  Use Preset
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  ))}

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
                        <h3>Appearance State</h3>
                      </div>
                      <p>The left rail is optional. The right inspector stays toggle-only and does not use a dedicated rail.</p>
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
              ) : activeSection === "developer" ? (
                <div className="settings-developer-layout">
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
                        <span className="label">Agent</span>
                        <h3>Trace Visibility</h3>
                      </div>
                      <p>Decide which trace categories get a seat in the main thread, from user-facing response text down to workflow markers and backend metadata.</p>
                    </div>

                    <div className="settings-section-summary">
                      {assistantTraceVisibilityOptions.map((option) => {
                        const enabled = assistantTraceVisibility[option.key]

                        return (
                          <button
                            key={option.key}
                            className={enabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Show trace ${option.title.toLowerCase()}`}
                            type="button"
                            onClick={() => onAssistantTraceVisibilityChange(option.key, !enabled)}
                          >
                            <span className="settings-toggle-copy">
                              <strong className="settings-toggle-title">
                                <span className="settings-toggle-icon" aria-hidden="true">
                                  <FileTextIcon />
                                </span>
                                <span>{option.title}</span>
                              </strong>
                              <small>{option.description}</small>
                            </span>
                            <span className="settings-toggle-control" aria-hidden="true">
                              <span className="settings-toggle-thumb" />
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <p className="settings-helper-text">
                      Tool calls stay visible through the main trace. The tool input and output switches control whether each tool entry reveals the streamed payloads behind that lifecycle item, while debug metadata adds backend-only identifiers and timing details to every entry.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Current</span>
                        <h3>Developer State</h3>
                      </div>
                      <p>Region and line colors are development overlays, while the trace controls decide how much backend execution detail appears inside the main thread.</p>
                    </div>

                    <div className="settings-section-summary">
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
                        <strong>{enabledTraceVisibilityCount}/{assistantTraceVisibilityOptions.length} enabled</strong>
                        <p>
                          {assistantTraceVisibility.debugMetadata
                            ? "The main trace is showing backend metadata in addition to the enabled response, tool, approval, file, and workflow categories."
                            : "The main trace is showing the enabled user-facing categories while backend metadata stays collapsed."}
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
                      <div className="settings-actions-row">
                        <span className="settings-helper-text">Fetch the latest provider catalog and model metadata.</span>
                        <div className="settings-inline-actions">
                          <button
                            className="secondary-button"
                            aria-label="Refresh provider catalog"
                            type="button"
                            disabled={isRefreshingProviderCatalog}
                            onClick={() => void onRefreshProviderCatalog()}
                          >
                            {isRefreshingProviderCatalog ? "Refreshing..." : "Refresh"}
                          </button>
                        </div>
                      </div>

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
                                        isProviderConnected(provider)
                                          ? "settings-status-indicator is-connected"
                                          : "settings-status-indicator is-disconnected"
                                      }
                                      aria-hidden="true"
                                      title={connectionLabel}
                                    >
                                      {isProviderConnected(provider) ? <ConnectedStatusIcon /> : <DisconnectedStatusIcon />}
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
                              <span className="label">{providerSourceLabel(activeProvider)}</span>
                              <h3>{activeProvider.name}</h3>
                              <p>
                                {projectID
                                  ? `Shared connection credentials are available across the app. Only non-secret overrides below are stored for ${projectName ?? "this project"}.`
                                  : "Shared connection credentials are available across the app. Provider overrides below only store non-secret settings."}
                              </p>
                            </div>

                            <div className="provider-row-statuses">
                              <span className="settings-badge">{getProviderConnectionLabel(activeProvider)}</span>
                              {activeProviderSelectedCapability ? (
                                <span className="settings-badge">{activeProviderSelectedCapability.label}</span>
                              ) : null}
                              <span className="settings-badge">{activeProvider.modelCount} models</span>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Shared Connection</span>
                                <h3>Shared across the app</h3>
                              </div>
                              <p>
                                {projectID
                                  ? "Sign in once or store one API key for the whole app. The current project only reads this shared connection."
                                  : "Sign in once or store one API key for the whole app."}
                              </p>
                            </div>

                            <div className="settings-field-grid">
                              <label className="settings-field">
                                <span className="settings-field-label">Connection status</span>
                                <input aria-label={`${activeProvider.name} connection status`} type="text" readOnly value={getProviderConnectionLabel(activeProvider)} />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Sign-in method</span>
                                <select
                                  aria-label={`Authentication method for ${activeProvider.name}`}
                                  value={activeProviderSelectedMethod ?? ""}
                                  onChange={(event) => onProviderAuthMethodChange(activeProvider.id, event.target.value)}
                                >
                                  {activeProvider.authCapabilities.map((capability) => (
                                    <option key={capability.method} value={capability.method}>
                                      {capability.recommended ? `${capability.label} (Recommended)` : capability.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Connection summary</span>
                                <input
                                  aria-label={`${activeProvider.name} connection summary`}
                                  type="text"
                                  readOnly
                                  value={activeProviderCredentialSummary ?? activeProvider.lastAuthError ?? "No shared credential stored"}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">{activeProviderAccountSummary ? "Account" : "Expires"}</span>
                                <input
                                  aria-label={`${activeProvider.name} account summary`}
                                  type="text"
                                  readOnly
                                  value={
                                    activeProviderAccountSummary ??
                                    formatProviderAuthTimestamp(activeProviderExpiresAt) ??
                                    "Not available"
                                  }
                                />
                              </label>
                            </div>

                            {activeProviderSelectedCapability?.description ? (
                              <div className="settings-actions-row">
                                <span className="settings-helper-text">{activeProviderSelectedCapability.description}</span>
                              </div>
                            ) : null}

                            {activeProviderSelectedCapability?.kind === "browser_oauth" ? (
                              <div className="settings-actions-row">
                                <span className="settings-helper-text">
                                  {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status)
                                    ? activeProviderFlow.errorMessage ?? "Waiting for the browser sign-in to complete."
                                    : activeProvider.lastAuthError ?? "Use your ChatGPT subscription to unlock Codex models for this app."}
                                </span>
                                <div className="settings-inline-actions">
                                  {activeProvider.authState.status !== "not_connected" ? (
                                    <button
                                      className="secondary-button"
                                      disabled={activeProviderBusy}
                                      onClick={() => void onDeleteProviderAuthSession(activeProvider.id)}
                                    >
                                      Disconnect
                                    </button>
                                  ) : null}
                                  {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? (
                                    <button
                                      className="secondary-button"
                                      disabled={activeProviderBusy}
                                      onClick={() => void onCancelProviderAuthFlow(activeProvider.id)}
                                    >
                                      Cancel
                                    </button>
                                  ) : null}
                                  <button
                                    className="primary-button"
                                    disabled={activeProviderBusy}
                                    onClick={() => void onStartProviderAuthFlow(activeProvider.id)}
                                  >
                                    {activeProvider.authState.status === "connected" ? "Reconnect in browser" : "Continue in browser"}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {activeProviderSelectedCapability?.kind === "device_code" ? (
                              <>
                                <div className="settings-field-grid">
                                  <label className="settings-field">
                                    <span className="settings-field-label">Verification URL</span>
                                    <input
                                      aria-label={`${activeProvider.name} verification URL`}
                                      type="text"
                                      readOnly
                                      value={activeProviderFlow?.verificationURI ?? ""}
                                      placeholder="Start the device flow to generate a verification link"
                                    />
                                  </label>

                                  <label className="settings-field">
                                    <span className="settings-field-label">One-time code</span>
                                    <input
                                      aria-label={`${activeProvider.name} device code`}
                                      type="text"
                                      readOnly
                                      value={activeProviderFlow?.userCode ?? ""}
                                      placeholder="Start the device flow to generate a code"
                                    />
                                  </label>
                                </div>

                                <div className="settings-actions-row">
                                  <span className="settings-helper-text">
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status)
                                      ? activeProviderFlow.errorMessage ?? "Enter the code in your browser and keep this window open while the app polls for completion."
                                      : activeProvider.lastAuthError ?? "Use the device code flow when the sign-in browser cannot complete inside the current environment."}
                                  </span>
                                  <div className="settings-inline-actions">
                                    {activeProviderFlow?.verificationURI ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() =>
                                          void window.desktop?.openExternalUrl?.({
                                            url: activeProviderFlow.verificationURI!,
                                          })
                                        }
                                      >
                                        Open link
                                      </button>
                                    ) : null}
                                    {activeProviderFlow?.verificationURI ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() => void writeTextToClipboard(activeProviderFlow.verificationURI!)}
                                      >
                                        Copy link
                                      </button>
                                    ) : null}
                                    {activeProviderFlow?.userCode ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() => void writeTextToClipboard(activeProviderFlow.userCode!)}
                                      >
                                        Copy code
                                      </button>
                                    ) : null}
                                    {activeProvider.authState.status !== "not_connected" ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onDeleteProviderAuthSession(activeProvider.id)}
                                      >
                                        Disconnect
                                      </button>
                                    ) : null}
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onCancelProviderAuthFlow(activeProvider.id)}
                                      >
                                        Cancel
                                      </button>
                                    ) : null}
                                    <button
                                      className="primary-button"
                                      disabled={activeProviderBusy}
                                      onClick={() => void onStartProviderAuthFlow(activeProvider.id)}
                                    >
                                      {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? "Restart flow" : "Start device flow"}
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : null}

                            {activeProviderSelectedCapability?.kind === "api_key" ? (
                              <>
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
                                </div>

                                <div className="settings-actions-row">
                                  <span className="settings-helper-text">
                                    {activeProvider.env.length > 0
                                      ? `Environment fallback: ${activeProvider.env.join(", ")}`
                                      : activeProviderCredentialSummary ?? "API keys are stored in the shared credential store and are not written into provider config."}
                                  </span>
                                  <div className="settings-inline-actions">
                                    {activeProvider.apiKeyConfigured ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onSaveProviderApiKey(activeProvider.id, null)}
                                      >
                                        Clear key
                                      </button>
                                    ) : null}
                                    <button
                                      className="primary-button"
                                      disabled={activeProviderBusy || !activeProviderApiKeyDirty}
                                      onClick={() => void onSaveProviderApiKey(activeProvider.id)}
                                    >
                                      {savingProviderID === activeProvider.id ? "Saving..." : "Save key"}
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : null}
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">{projectID ? "Project Overrides" : "Provider Overrides"}</span>
                                <h3>{projectID ? (projectName ?? "Current project") : "Non-secret settings"}</h3>
                              </div>
                              <p>
                                {projectID
                                  ? "Only non-secret settings are stored with this project. Shared connection state above remains global."
                                  : "Store non-secret provider settings such as a custom base URL without mixing them with credentials."}
                              </p>
                            </div>

                            <div className="settings-field-grid">
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
                              <span className="settings-helper-text">
                                {activeProviderCanReset
                                  ? "Reset removes the saved override and falls back to the catalog or environment defaults."
                                  : projectID
                                    ? "This project currently inherits the provider defaults."
                                    : "No saved override yet."}
                              </span>
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
                                  disabled={activeProviderBusy || !activeProviderConfigDirty}
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
                                <p>Connect a shared sign-in method or store an API key, then refresh the catalog to populate visible models.</p>
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
                            {provider.env.length > 0 ? ` · Env ${provider.env.join(", ")}` : " · No env key required"}
                          </p>

                          <div className="provider-model-strip">
                            {providerModels.length > 0 ? (
                              providerModels.slice(0, 3).map((model) => (
                                <div key={`${model.providerID}/${model.id}`} className="provider-model-chip">
                                  <strong>{model.name}</strong>
                                  <span>{buildModelTags(model).join(" · ")}</span>
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
  activeProjectID?: string | null
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion?: number
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSendingQuestionAnswer: boolean
  showSessionBanner?: boolean
  onFileChangeSelect?: (file: string) => void
  onOpenSideChat?: (anchorMessageID: string) => void | Promise<void>
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  sideChatAttachments?: ComposerAttachment[]
  sideChatCountsByAnchorMessageID: Record<string, number>
  sideChatDraftState?: ComposerDraftState
  sideChatIsSending?: boolean
  sideChatPendingPermissionRequests?: PermissionRequest[]
  sideChatPermissionRequestActionError?: string | null
  sideChatPermissionRequestActionRequestID?: string | null
  sideChatSession?: SessionSummary | null
  sideChatTurns?: Turn[]
  threadColumnRef: RefObject<HTMLDivElement | null>
  onAskUserQuestionAnswer: QuestionAnswerHandler
  onSideChatDraftStateChange?: (value: ComposerDraftState) => void
  onSideChatPickAttachments?: (input: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason: string | null
  }) => void | Promise<void>
  onSideChatRemoveAttachment?: (path: string) => void
  onSideChatSend?: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
  onPermissionRequestResponse: PermissionRequestResponseHandler
}

type PermissionRequestResponseHandler = (input: {
  sessionID: string
  request: PermissionRequest
  decision: PermissionDecision
  note?: string
}) => void | Promise<void>

type QuestionAnswerHandler = (input: {
  text: string
  questionID?: string
  selectedOptions?: string[]
  freeformText?: string
}) => void | Promise<void>

function UserTurnBubble({ turn }: { turn: UserTurn }) {
  const displayText = turn.displayText?.trim() || ""
  const references = turn.references ?? []
  const attachments = turn.attachments ?? []
  const hasStructuredContent = Boolean(displayText) || references.length > 0 || attachments.length > 0
  const bodyText = displayText || (references.length > 0 ? references.map((reference) => `@${reference.label}`).join(" ") : turn.text)

  if (!hasStructuredContent) {
    return (
      <div className="user-bubble">
        <ThreadRichText as="div" className="user-bubble-text" text={turn.text} />
      </div>
    )
  }

  return (
    <div className="user-bubble">
      <div className="user-bubble-content">
        <ThreadRichText as="div" className="user-bubble-text" references={references} text={bodyText} />

        {attachments.length > 0 ? (
          <div className="user-bubble-chip-strip" aria-label="Sent attachments">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.path ?? attachment.name}:${index}`}
                className="user-bubble-chip user-bubble-attachment-chip"
              >
                <PaperclipIcon />
                <span className="user-bubble-chip-label" title={attachment.path ?? attachment.name}>
                  {attachment.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

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

function isResponseTraceItem(item: AssistantTraceItem) {
  return item.kind === "text" || item.kind === "question"
}

function isToolTraceItem(item: AssistantTraceItem) {
  return item.kind === "tool"
}

function isSourceTraceItem(item: AssistantTraceItem) {
  return item.section === "sources" || item.kind === "source"
}

function isFileChangeTraceItem(item: AssistantTraceItem) {
  return item.section === "file-change" || item.kind === "patch" || item.kind === "file" || item.kind === "image"
}

function defaultTraceSectionKeyForItem(item: AssistantTraceItem): AssistantTraceSectionKey {
  if (isResponseTraceItem(item)) return "response"
  if (isSourceTraceItem(item)) return "sources"
  if (isFileChangeTraceItem(item)) return "file-change"
  if (isToolTraceItem(item)) return "tools"
  if (item.kind === "reasoning") return "reasoning"
  if (item.kind === "step" || item.kind === "retry" || item.kind === "snapshot" || item.kind === "subtask") {
    return "workflow"
  }
  if (item.kind === "system") return "debug"
  return "workflow"
}

function traceVisibilityKeyForItem(item: AssistantTraceItem): AssistantTraceVisibilityKey | null {
  if (item.kind === "error") return null
  if (item.visibilityKey) return item.visibilityKey

  const sectionKey = traceSectionKeyForItem(item)
  switch (sectionKey) {
    case "response":
      return "response"
    case "reasoning":
      return "reasoning"
    case "tools":
      return "toolCalls"
    case "sources":
      return "sources"
    case "approvals":
      return "approvals"
    case "file-change":
      return "files"
    case "debug":
      return "debugMetadata"
    default:
      return "workflow"
  }
}

function traceSectionKeyForItem(item: AssistantTraceItem): AssistantTraceSectionKey {
  return item.section ?? defaultTraceSectionKeyForItem(item)
}

function traceSectionTitle(sectionKey: AssistantTraceSectionKey) {
  switch (sectionKey) {
    case "tools":
      return "Tools"
    case "sources":
      return "Sources"
    case "approvals":
      return "Approvals"
    case "workflow":
      return "Workflow"
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

function filterRenderedAssistantTraceItems(
  items: AssistantTraceItem[],
  showFileChanges: boolean,
  traceVisibility: AssistantTraceVisibility,
) {
  return items.filter((item) => {
    const sectionKey = traceSectionKeyForItem(item)
    if (!showFileChanges && sectionKey === "file-change") return false
    const visibilityKey = traceVisibilityKeyForItem(item)
    if (visibilityKey === null) return true
    if (!traceVisibility[visibilityKey]) return false
    return true
  })
}

function hasResponseTraceItems(items: AssistantTraceItem[]) {
  return items.some((item) => traceSectionKeyForItem(item) === "response")
}

function buildAssistantResponseCopyText(items: AssistantTraceItem[]) {
  return items
    .map((item) => {
      const segments = [item.title, item.text, item.detail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))

      return segments.join("\n\n")
    })
    .filter(Boolean)
    .join("\n\n")
    .trim()
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
  answeredQuestionIDs,
  isQuestionAnswerDisabled = false,
  items,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  renderAfterSection,
  showFileChanges,
  traceVisibility,
  turnID,
}: {
  answeredQuestionIDs: Set<string>
  isQuestionAnswerDisabled?: boolean
  items: AssistantTraceItem[]
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect: ((file: string) => void) | undefined
  renderAfterSection?: (input: {
    items: AssistantTraceItem[]
    sectionKey: AssistantTraceSectionKey
    title: string
  }) => ReactNode
  showFileChanges: boolean
  traceVisibility: AssistantTraceVisibility
  turnID: string
}) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, showFileChanges, traceVisibility))

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
                <TraceItemView
                  key={item.id}
                  answeredQuestionIDs={answeredQuestionIDs}
                  item={item}
                  isQuestionAnswerDisabled={isQuestionAnswerDisabled}
                  onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                  onFileChangeSelect={onFileChangeSelect}
                  traceVisibility={traceVisibility}
                />
              ))}
              {renderAfterSection
                ? renderAfterSection({
                    items: renderedItems,
                    sectionKey: block.sectionKey,
                    title: block.title,
                  })
                : null}
            </div>
          </AssistantTraceSection>
        )
      })}
    </>
  )
}

interface InlineSideChatThreadProps {
  activeProjectID: string | null
  attachments: ComposerAttachment[]
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion: number
  draftState: ComposerDraftState
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSending: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  session: SessionSummary
  turns: Turn[]
  onDraftStateChange: (value: ComposerDraftState) => void
  onHide: () => void
  onPermissionRequestResponse: PermissionRequestResponseHandler
  onPickAttachments: (input: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason: string | null
  }) => void | Promise<void>
  onRemoveAttachment: (path: string) => void
  onSend: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
}

function InlineSideChatThread({
  activeProjectID,
  attachments,
  assistantTraceVisibility,
  composerRefreshVersion,
  draftState,
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  isSending,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  session,
  turns,
  onDraftStateChange,
  onHide,
  onPermissionRequestResponse,
  onPickAttachments,
  onRemoveAttachment,
  onSend,
}: InlineSideChatThreadProps) {
  const composer = useProjectComposer({
    attachmentPaths: attachments.map((attachment) => attachment.path),
    projectID: activeProjectID,
    refreshToken: composerRefreshVersion,
  })
  const [hydratedTurns, setHydratedTurns] = useState<Turn[]>(turns)
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const effectiveTurns = turns.length > 0 ? turns : hydratedTurns

  useEffect(() => {
    if (turns.length > 0) {
      setHydratedTurns(turns)
      return
    }

    const getSessionHistory = window.desktop?.getSessionHistory
    if (!getSessionHistory) {
      setHydratedTurns([])
      return
    }

    let isCancelled = false
    setHydratedTurns([])

    void getSessionHistory({ sessionID: session.id })
      .then((messages) => {
        if (isCancelled) return
        const nextTurns = buildTurnsFromHistory(messages)
        setHydratedTurns(mergeUserTurnPresentationState(readPersistedUserTurns(session.id), nextTurns))
      })
      .catch((error) => {
        if (isCancelled) return
        console.error("[desktop] getSessionHistory failed for inline side chat:", error)
      })

    return () => {
      isCancelled = true
    }
  }, [session.id, turns])

  return (
    <section className="inline-side-chat-thread" aria-label="Nested side chat">
      <header className="inline-side-chat-header">
        <div className="inline-side-chat-copy">
          <div className="inline-side-chat-header-row">
            <span className="label">Side chat</span>
            <span className="inline-side-chat-pill">Scoped</span>
          </div>
          <strong title={session.origin?.anchorPreview || session.title}>{session.origin?.anchorPreview || session.title}</strong>
          <p>Focused on this reply only. Messages here stay outside the main thread context.</p>
        </div>
        <button className="secondary-button inline-side-chat-close" type="button" onClick={onHide}>
          Hide
        </button>
      </header>

      <div className="inline-side-chat-body">
        <ThreadView
          activeProjectID={activeProjectID}
          activeSession={session}
          activeTurns={effectiveTurns}
          assistantTraceVisibility={assistantTraceVisibility}
          composerRefreshVersion={composerRefreshVersion}
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isResolvingPermissionRequest={isResolvingPermissionRequest}
          isSendingQuestionAnswer={isSending}
          pendingPermissionRequests={pendingPermissionRequests}
          permissionRequestActionError={permissionRequestActionError}
          permissionRequestActionRequestID={permissionRequestActionRequestID}
          showSessionBanner={false}
          sideChatCountsByAnchorMessageID={{}}
          threadColumnRef={threadColumnRef}
          onAskUserQuestionAnswer={(answer) =>
            void onSend({
              draftStateOverride: createComposerDraftStateFromPlainText(answer.text),
              questionAnswer: answer.questionID
                ? {
                    questionID: answer.questionID,
                    selectedOptions: answer.selectedOptions,
                    freeformText: answer.freeformText,
                  }
                : undefined,
              selectedReasoningEffort: composer.selectedReasoningEffort,
              selectedSkillIDs: composer.selectedSkillIDs,
              waitForPendingModelSelection: composer.awaitPendingModelSelection,
            })
          }
          onPermissionRequestResponse={onPermissionRequestResponse}
        />

        <Composer
          attachments={attachments}
          attachmentButtonTitle={composer.attachmentButtonTitle}
          attachmentDisabledReason={composer.attachmentDisabledReason}
          attachmentError={composer.attachmentError}
          canSend
          draftState={draftState}
          hasPendingPermissionRequests={pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
          isSending={isSending}
          mcpOptions={composer.mcpOptions}
          modelOptions={composer.modelOptions}
          permissionMode="default"
          reasoningEffortOptions={composer.reasoningEffortOptions}
          selectedMcpServerIDs={composer.selectedMcpServerIDs}
          selectedModel={composer.selectedModel}
          selectedModelLabel={composer.selectedModelLabel}
          selectedReasoningEffort={composer.selectedReasoningEffort}
          selectedReasoningEffortLabel={composer.selectedReasoningEffortLabel}
          selectedSkillIDs={composer.selectedSkillIDs}
          showModelSelector={false}
          showProjectTagCommands={false}
          skillOptions={composer.skillOptions}
          unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
          workspaceDirectory={null}
          onDraftStateChange={onDraftStateChange}
          onModelChange={composer.handleModelChange}
          onReasoningEffortChange={composer.handleReasoningEffortChange}
          onPickAttachments={() =>
            onPickAttachments({
              allowImage: composer.attachmentCapabilities.image,
              allowPdf: composer.attachmentCapabilities.pdf,
              disabledReason: composer.attachmentDisabledReason,
            })
          }
          onRemoveAttachment={onRemoveAttachment}
          onSend={(draftStateOverride) =>
            void onSend({
              attachmentError: composer.attachmentError,
              draftStateOverride,
              selectedReasoningEffort: composer.selectedReasoningEffort,
              selectedSkillIDs: composer.selectedSkillIDs,
              waitForPendingModelSelection: composer.awaitPendingModelSelection,
            })
          }
        />
      </div>
    </section>
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
  answeredQuestionIDs,
  item,
  isQuestionAnswerDisabled = false,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  traceVisibility,
}: {
  answeredQuestionIDs?: Set<string>
  item: AssistantTraceItem
  isQuestionAnswerDisabled?: boolean
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect?: (file: string) => void
  traceVisibility: AssistantTraceVisibility
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isInputExpanded, setIsInputExpanded] = useState(false)
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const [freeformAnswer, setFreeformAnswer] = useState("")
  const [selectedQuestionOptions, setSelectedQuestionOptions] = useState<string[]>([])
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
  const debugEntries = traceVisibility.debugMetadata ? item.debugEntries ?? [] : []
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
        {item.text ? <ThreadRichText className="trace-item-text trace-item-plain-text" text={item.text} /> : null}
        {item.detail ? <ThreadRichText className="trace-item-detail trace-item-plain-detail" text={item.detail} /> : null}
        {renderDebugEntries()}
      </article>
    )
  }

  if (item.kind === "question" && item.questionPrompt) {
    const prompt = item.questionPrompt
    const isQuestionAnswered = Boolean(prompt.questionID && answeredQuestionIDs?.has(prompt.questionID))
    const isAnswerDisabled = isQuestionAnswerDisabled || isQuestionAnswered
    const canSubmitAnswer = Boolean(onAskUserQuestionAnswer)
    const canUseOptionButtons = prompt.options.length > 0 && !prompt.multiple && canSubmitAnswer
    const canUseMultipleSelection = prompt.options.length > 0 && prompt.multiple && canSubmitAnswer
    const trimmedFreeformAnswer = freeformAnswer.trim()
    const hasSelectedOptions = selectedQuestionOptions.length > 0
    const canSubmitStructuredAnswer = canSubmitAnswer && !isAnswerDisabled && (hasSelectedOptions || Boolean(trimmedFreeformAnswer))
    const note = isQuestionAnswered
      ? "Answered."
      : isQuestionAnswerDisabled
      ? "Wait for the current request to finish before answering."
      : canUseMultipleSelection && prompt.allowFreeform
        ? "Select one or more options or add a custom answer."
        : canUseMultipleSelection
          ? "Select one or more options and submit."
      : prompt.multiple
        ? prompt.allowFreeform
          ? "Reply in the composer below with one or more selections."
          : "Reply in the composer below to continue."
        : prompt.allowFreeform
          ? canSubmitAnswer
            ? "Choose an option or send a custom answer here."
            : "You can also reply in the composer below."
          : null

    function handleQuestionOptionToggle(optionValue: string) {
      setSelectedQuestionOptions((current) =>
        current.includes(optionValue)
          ? current.filter((value) => value !== optionValue)
          : [...current, optionValue],
      )
    }

    function handleStructuredAnswerSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      if (!onAskUserQuestionAnswer || isAnswerDisabled) return

      const selectedOptions = selectedQuestionOptions.map((value) => value.trim()).filter(Boolean)
      const nextFreeformAnswer = freeformAnswer.trim()
      const answerText = nextFreeformAnswer || selectedOptions.join(", ")
      if (!answerText) return

      void onAskUserQuestionAnswer({
        text: answerText,
        questionID: prompt.questionID,
        ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
        ...(nextFreeformAnswer ? { freeformText: nextFreeformAnswer } : {}),
      })

      setFreeformAnswer("")
      setSelectedQuestionOptions([])
    }

    return (
      <article className={`${className} ask-user-question-card`} data-kind={item.kind} role="region" aria-label={item.title || "Agent question"}>
        <header className="ask-user-question-header">
          <div>
            <span className="label">Agent Question</span>
            <h3>{item.title || "Question for you"}</h3>
          </div>
        </header>

        <div className="ask-user-question-body">
          <ThreadRichText className="ask-user-question-text" text={prompt.question} />

          {prompt.options.length > 0 ? (
            <div className="ask-user-question-options">
              {prompt.options.map((option, index) => (
                <div key={`${item.id}-${option.value}-${index}`} className="ask-user-question-option">
                  {canUseOptionButtons ? (
                    <button
                      className={index === 0 ? "primary-button" : "secondary-button"}
                      disabled={isAnswerDisabled}
                      onClick={() =>
                        void onAskUserQuestionAnswer?.({
                          text: option.value,
                          questionID: prompt.questionID,
                          selectedOptions: [option.value],
                        })}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ) : canUseMultipleSelection ? (
                    <label className="ask-user-question-option-choice">
                      <input
                        checked={selectedQuestionOptions.includes(option.value)}
                        className="ask-user-question-option-checkbox"
                        disabled={isAnswerDisabled}
                        onChange={() => handleQuestionOptionToggle(option.value)}
                        type="checkbox"
                      />
                      <span className="ask-user-question-option-label">{option.label}</span>
                    </label>
                  ) : (
                    <div className="ask-user-question-option-label">{option.label}</div>
                  )}
                  {option.description ? <ThreadRichText className="ask-user-question-option-description" text={option.description} /> : null}
                </div>
              ))}
            </div>
          ) : null}

          {canUseMultipleSelection || (prompt.allowFreeform && canSubmitAnswer) ? (
            <form className="ask-user-question-response-form" onSubmit={handleStructuredAnswerSubmit}>
              {prompt.allowFreeform ? (
                <input
                  aria-label="Custom answer"
                  className="ask-user-question-freeform-input"
                  disabled={isAnswerDisabled}
                  onChange={(event) => setFreeformAnswer(event.target.value)}
                  placeholder={prompt.placeholder || "Type your answer"}
                  type="text"
                  value={freeformAnswer}
                />
              ) : null}

              <div className="ask-user-question-actions">
                <button
                  className="secondary-button"
                  disabled={!canSubmitStructuredAnswer}
                  type="submit"
                >
                  Submit answer
                </button>
              </div>
            </form>
          ) : null}

          {note ? <p className="ask-user-question-note">{note}</p> : null}
        </div>
        {renderDebugEntries()}
      </article>
    )
  }

  if (item.kind === "tool") {
    const statusText = formatTraceStatusText(item.status)
    const summaryTitle = item.title || item.label
    const showsToolInputs = item.status === "pending" || item.status === "running" || item.status === "waiting-approval"
    const visibleToolInputText = traceVisibility.toolInputs ? item.toolInputText : undefined
    const visibleToolOutputText = traceVisibility.toolOutputs ? item.toolOutputText : undefined
    const inputSectionDetail = showsToolInputs ? item.detail : undefined
    const outputSectionDetail = !showsToolInputs && traceVisibility.toolOutputs ? item.detail : undefined
    const hasInputDisclosureContent = Boolean(visibleToolInputText || inputSectionDetail)
    const hasOutputDisclosureContent = Boolean(visibleToolOutputText || outputSectionDetail)
    const hasDisclosureContent = Boolean(hasInputDisclosureContent || hasOutputDisclosureContent)
    const disclosureID = `trace-item-disclosure-${item.id}`
    const inputDisclosureID = `trace-item-disclosure-input-${item.id}`
    const outputDisclosureID = `trace-item-disclosure-output-${item.id}`

    function handleToolToggle() {
      setIsExpanded((current) => {
        if (current) {
          setIsInputExpanded(false)
          setIsOutputExpanded(false)
        }
        return !current
      })
    }

    return (
      <article className={className} data-kind={item.kind}>
        {hasDisclosureContent ? (
          <button
            className="trace-item-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-controls={disclosureID}
            onClick={handleToolToggle}
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
            {hasInputDisclosureContent ? (
              <div className="trace-item-subsection">
                <button
                  className="trace-item-subsection-toggle"
                  type="button"
                  aria-expanded={isInputExpanded}
                  aria-controls={inputDisclosureID}
                  aria-label={`${summaryTitle} input`}
                  onClick={() => setIsInputExpanded((current) => !current)}
                >
                  <span className="trace-item-subsection-toggle-icon" aria-hidden="true">
                    {isInputExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <span className="trace-item-subsection-toggle-line">
                    <span className="trace-item-subsection-label">Input</span>
                  </span>
                </button>
                {isInputExpanded ? (
                  <div id={inputDisclosureID} className="trace-item-subsection-body">
                    {visibleToolInputText ? <ThreadRichText className="trace-item-text" text={visibleToolInputText} /> : null}
                    {inputSectionDetail ? <ThreadRichText className="trace-item-detail" text={inputSectionDetail} /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {hasOutputDisclosureContent ? (
              <div className="trace-item-subsection">
                <button
                  className="trace-item-subsection-toggle"
                  type="button"
                  aria-expanded={isOutputExpanded}
                  aria-controls={outputDisclosureID}
                  aria-label={`${summaryTitle} output`}
                  onClick={() => setIsOutputExpanded((current) => !current)}
                >
                  <span className="trace-item-subsection-toggle-icon" aria-hidden="true">
                    {isOutputExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <span className="trace-item-subsection-toggle-line">
                    <span className="trace-item-subsection-label">Output</span>
                  </span>
                </button>
                {isOutputExpanded ? (
                  <div id={outputDisclosureID} className="trace-item-subsection-body">
                    {visibleToolOutputText ? <ThreadRichText className="trace-item-text" text={visibleToolOutputText} /> : null}
                    {outputSectionDetail ? <ThreadRichText className="trace-item-detail" text={outputSectionDetail} /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
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
      {item.text ? <ThreadRichText className="trace-item-text" text={item.text} /> : null}
      {item.detail ? <ThreadRichText className="trace-item-detail" text={item.detail} /> : null}
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

function formatRuntimeLoadStateLabel(status: SessionRuntimeDebugState["status"]) {
  switch (status) {
    case "loading":
      return "Loading"
    case "refreshing":
      return "Refreshing"
    case "ready":
      return "Synced"
    case "error":
      return "Refresh failed"
    default:
      return "Idle"
  }
}

function formatRuntimeBusyStateLabel(status: SessionRuntimeDebugSnapshot["status"]["type"]) {
  return status === "busy" ? "Busy" : "Idle"
}

function formatRuntimePhaseLabel(phase?: SessionRuntimeDebugSnapshot["status"]["phase"]) {
  switch (phase) {
    case "preparing":
      return "Preparing"
    case "waiting_llm":
      return "Waiting LLM"
    case "reasoning":
      return "Reasoning"
    case "executing_tool":
      return "Running Tool"
    case "waiting_approval":
      return "Waiting Approval"
    case "responding":
      return "Responding"
    case "retrying":
      return "Retrying"
    case "blocked":
      return "Blocked"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    default:
      return "Unknown"
  }
}

function formatRuntimeTurnStatusLabel(status?: SessionRuntimeDebugSnapshot["turns"][number]["status"]) {
  switch (status) {
    case "running":
      return "Running"
    case "completed":
      return "Completed"
    case "blocked":
      return "Blocked"
    case "failed":
      return "Failed"
    case "stopped":
      return "Stopped"
    default:
      return "Idle"
  }
}

function formatRuntimeDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return "—"
  if (durationMs < 1000) return `${durationMs} ms`
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function buildRuntimeStatusDescription(input: {
  activeSession: SessionSummary | null
  runtimeState: SessionRuntimeDebugState
  runtimeSnapshot: SessionRuntimeDebugSnapshot | null
}) {
  if (!input.activeSession) {
    return "Select a session to inspect the current agent runtime."
  }

  if (input.runtimeState.status === "loading") {
    return "Loading the current runtime trace for this session."
  }

  if (input.runtimeState.status === "refreshing") {
    return input.runtimeState.updatedAt
      ? `Refreshing runtime state. Last synced at ${formatTime(input.runtimeState.updatedAt)}.`
      : "Refreshing runtime state."
  }

  if (input.runtimeState.status === "error") {
    return input.runtimeState.updatedAt
      ? `The latest runtime refresh failed. Showing the most recent snapshot from ${formatTime(input.runtimeState.updatedAt)}.`
      : "The runtime snapshot could not be loaded."
  }

  const latestTurn = input.runtimeSnapshot?.latestTurn
  if (input.runtimeSnapshot?.status.type === "busy" && latestTurn) {
    return `${formatRuntimePhaseLabel(input.runtimeSnapshot.status.phase ?? latestTurn.phase)} in progress for the latest turn.`
  }

  if (latestTurn?.status === "failed") {
    return latestTurn.errorContext?.error.message ?? latestTurn.error?.message ?? "The latest turn failed."
  }

  if (input.runtimeSnapshot?.diagnostics.blockedOnApproval) {
    return "The latest turn is blocked on a tool approval request."
  }

  if (input.runtimeState.updatedAt) {
    return `Last synced at ${formatTime(input.runtimeState.updatedAt)}.`
  }

  return "Inspect the current runtime state, recent tool calls, and recent execution events."
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
  const detailBody = request.prompt.details?.body?.trim()
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

      {request.prompt.detailsAvailable && (detailLines.length > 0 || detailBody) ? (
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
            {detailBody ? (
              <div className="permission-request-meta permission-request-meta-wide">
                <span className="permission-request-meta-label">Body</span>
                <pre className="permission-request-body">{detailBody}</pre>
              </div>
            ) : null}
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

function collectAnsweredQuestionIDs(turns: Turn[]) {
  const answeredQuestionIDs = new Set<string>()

  for (const turn of turns) {
    if (turn.kind !== "user") continue

    const questionID = turn.questionAnswer?.questionID
    if (!questionID) continue
    answeredQuestionIDs.add(questionID)
  }

  return answeredQuestionIDs
}

export function ThreadView({
  activeProjectID = null,
  activeSession,
  activeTurns,
  assistantTraceVisibility,
  composerRefreshVersion = 0,
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  isSendingQuestionAnswer,
  showSessionBanner = true,
  onFileChangeSelect,
  onOpenSideChat,
  onAskUserQuestionAnswer,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  sideChatAttachments = [],
  sideChatCountsByAnchorMessageID,
  sideChatDraftState = createEmptyComposerDraftState(),
  sideChatIsSending = false,
  sideChatPendingPermissionRequests = [],
  sideChatPermissionRequestActionError = null,
  sideChatPermissionRequestActionRequestID = null,
  sideChatSession = null,
  sideChatTurns = [],
  threadColumnRef,
  onSideChatDraftStateChange,
  onSideChatPickAttachments,
  onSideChatRemoveAttachment,
  onSideChatSend,
  onPermissionRequestResponse,
}: ThreadViewProps) {
  const answeredQuestionIDs = collectAnsweredQuestionIDs(activeTurns)
  const readOnlySideChat = isSideChatSession(activeSession)
  const [copiedResponseTurnID, setCopiedResponseTurnID] = useState<string | null>(null)
  const copiedResponseTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copiedResponseTimeoutRef.current !== null) {
        window.clearTimeout(copiedResponseTimeoutRef.current)
      }
    }
  }, [])

  const handleCopyAssistantResponse = useEffectEvent(async (turnID: string, text: string) => {
    try {
      await writeTextToClipboard(text)
      setCopiedResponseTurnID(turnID)

      if (copiedResponseTimeoutRef.current !== null) {
        window.clearTimeout(copiedResponseTimeoutRef.current)
      }

      copiedResponseTimeoutRef.current = window.setTimeout(() => {
        setCopiedResponseTurnID((current) => (current === turnID ? null : current))
        copiedResponseTimeoutRef.current = null
      }, 1600)
    } catch (error) {
      console.error("[desktop] Failed to copy assistant response:", error)
    }
  })

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
                  traceVisibility={assistantTraceVisibility}
                />
              </div>
            </div>
          </article>
        ) : (
          <>
            {showSessionBanner && readOnlySideChat ? (
              <article className="thread-session-banner">
                <div className="thread-session-banner-copy">
                  <span className="label">Side chat</span>
                  <strong>{activeSession.origin?.anchorPreview || "Anchored reply snapshot"}</strong>
                  <p>Scoped discussion linked to one assistant reply. It stays out of the main session context.</p>
                </div>
                <span className="thread-session-banner-pill">Isolated</span>
              </article>
            ) : null}
            {activeTurns.map((turn, turnIndex) => {
              if (turn.kind === "user") {
                return (
                  <article key={turn.id} className="turn user-turn">
                    <div className="turn-meta">
                      <span>You</span>
                      <time>{formatTime(turn.timestamp)}</time>
                    </div>
                    <UserTurnBubble turn={turn} />
                  </article>
                )
              }

              const { startIndex, endIndex } = findAssistantCycleBounds(activeTurns, turnIndex)
              const isCycleFinalTurn = turnIndex === endIndex
              const cycleFileChangeItems = isCycleFinalTurn
                ? collectAssistantCycleFileChangeItems(activeTurns, startIndex, endIndex)
                : []
              const traceItems = [
                ...turn.items.filter((item) => !isFileChangeTraceItem(item)),
                ...cycleFileChangeItems,
              ]
              const renderedItems = filterRenderedAssistantTraceItems(
                traceItems,
                isCycleFinalTurn && !turn.isStreaming,
                assistantTraceVisibility,
              )
              const ephemeralHint = renderedItems.length === 0 ? getAssistantEphemeralHint(turn) : null
              if (renderedItems.length === 0 && !ephemeralHint) return null
              const existingSideChatCount = sideChatCountsByAnchorMessageID[turn.id] ?? 0
              const canOpenSideChat = !readOnlySideChat && !turn.isStreaming && hasResponseTraceItems(traceItems) && Boolean(onOpenSideChat)
              const activeInlineSideChat = sideChatSession?.origin?.anchorMessageID === turn.id ? sideChatSession : null

              return (
                <article key={turn.id} className="turn assistant-turn">
                  <div className={turn.isStreaming ? "assistant-shell is-sectioned is-streaming" : "assistant-shell is-sectioned"}>
                    {ephemeralHint ? (
                      <AssistantTurnPlaceholder message={ephemeralHint} />
                    ) : (
                      <AssistantTurnSections
                        answeredQuestionIDs={answeredQuestionIDs}
                        isQuestionAnswerDisabled={isSendingQuestionAnswer || isResolvingPermissionRequest || pendingPermissionRequests.length > 0}
                        turnID={turn.id}
                        items={traceItems}
                        onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                        onFileChangeSelect={onFileChangeSelect}
                        renderAfterSection={({ items, sectionKey }) => {
                          if (sectionKey !== "response") return null

                          const responseCopyText = buildAssistantResponseCopyText(items)
                          if (!responseCopyText && !canOpenSideChat) return null

                          return (
                            <div className="assistant-response-side-chat">
                              <div className="assistant-response-actions">
                                {responseCopyText ? (
                                  <button
                                    className={joinClassNames(
                                      "assistant-response-action-button",
                                      copiedResponseTurnID === turn.id && "is-active",
                                    )}
                                    type="button"
                                    onClick={() => void handleCopyAssistantResponse(turn.id, responseCopyText)}
                                  >
                                    {copiedResponseTurnID === turn.id ? "已复制" : "复制"}
                                  </button>
                                ) : null}
                                {canOpenSideChat ? (
                                  <button
                                    className={joinClassNames(
                                      "assistant-response-action-button",
                                      activeInlineSideChat && "is-active",
                                    )}
                                    type="button"
                                    aria-pressed={Boolean(activeInlineSideChat)}
                                    title={
                                      activeInlineSideChat
                                        ? "Hide this side chat"
                                        : existingSideChatCount > 0
                                          ? `${existingSideChatCount} side chat thread${existingSideChatCount === 1 ? "" : "s"}`
                                          : "Open a side chat for this reply"
                                    }
                                    onClick={() => void onOpenSideChat?.(turn.id)}
                                  >
                                    Sidechat
                                  </button>
                                ) : null}
                              </div>

                              {activeInlineSideChat &&
                              onSideChatDraftStateChange &&
                              onSideChatPickAttachments &&
                              onSideChatRemoveAttachment &&
                              onSideChatSend ? (
                                <InlineSideChatThread
                                  activeProjectID={activeProjectID}
                                  attachments={sideChatAttachments}
                                  assistantTraceVisibility={assistantTraceVisibility}
                                  composerRefreshVersion={composerRefreshVersion}
                                  draftState={sideChatDraftState}
                                  isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                                  isResolvingPermissionRequest={isResolvingPermissionRequest}
                                  isSending={sideChatIsSending}
                                  pendingPermissionRequests={sideChatPendingPermissionRequests}
                                  permissionRequestActionError={sideChatPermissionRequestActionError}
                                  permissionRequestActionRequestID={sideChatPermissionRequestActionRequestID}
                                  session={activeInlineSideChat}
                                  turns={sideChatTurns}
                                  onDraftStateChange={onSideChatDraftStateChange}
                                  onHide={() => void onOpenSideChat?.(turn.id)}
                                  onPermissionRequestResponse={onPermissionRequestResponse}
                                  onPickAttachments={onSideChatPickAttachments}
                                  onRemoveAttachment={onSideChatRemoveAttachment}
                                  onSend={onSideChatSend}
                                />
                              ) : null}
                            </div>
                          )
                        }}
                        showFileChanges={isCycleFinalTurn && !turn.isStreaming}
                        traceVisibility={assistantTraceVisibility}
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


export { Composer }

