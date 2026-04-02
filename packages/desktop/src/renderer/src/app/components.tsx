import type { Dispatch, KeyboardEvent, MouseEvent, MutableRefObject, PointerEvent, RefObject, SetStateAction } from "react"
import { canvasMenuItems, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, sidebarActions, titlebarMenus } from "./constants"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  ExpandIcon,
  FolderIcon,
  MaximizeIcon,
  MinimizeIcon,
  NewItemIcon,
  RestoreIcon,
  SettingsIcon,
  SortIcon,
} from "./icons"
import type {
  AssistantTraceItem,
  SessionSummary,
  SidebarActionKey,
  TitlebarMenuKey,
  Turn,
  WindowAction,
  WorkspaceGroup,
} from "./types"
import { formatTime } from "./utils"

interface TitlebarProps {
  isWindowMaximized: boolean
  titlebarCommand: string
  onMenuClick: (menuKey: TitlebarMenuKey, event: MouseEvent<HTMLButtonElement>) => void
  onWindowAction: (action: WindowAction) => void
}

export function Titlebar({ isWindowMaximized, titlebarCommand, onMenuClick, onWindowAction }: TitlebarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar-surface">
        <div className="titlebar-left">
          <div className="titlebar-brand" aria-hidden="true">
            <span className="titlebar-mark">*</span>
          </div>
          <nav className="titlebar-menus" aria-label="Application menu">
            {titlebarMenus.map((menu) => (
              <button key={menu.key} className="titlebar-menu-button" onClick={(event) => onMenuClick(menu.key, event)}>
                {menu.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="titlebar-right">
          <div className="titlebar-command">{titlebarCommand}</div>
          <div className="titlebar-controls" aria-label="Window controls">
            <button className="window-control" aria-label="Minimize window" onClick={() => onWindowAction("minimize")}>
              <MinimizeIcon />
            </button>
            <button
              className="window-control"
              aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
              onClick={() => onWindowAction("toggle-maximize")}
            >
              {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button className="window-control is-close" aria-label="Close window" onClick={() => onWindowAction("close")}>
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

interface SidebarProps {
  activeSessionID: string | null
  deletingSessionID: string | null
  expandedFolderID: string | null
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isSidebarCondensed: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  workspaces: WorkspaceGroup[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onProjectClick: (workspace: WorkspaceGroup) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
}

export function Sidebar({
  activeSessionID,
  deletingSessionID,
  expandedFolderID,
  hoveredFolderID,
  isCreatingProject,
  isSidebarCondensed,
  projectRowRefs,
  selectedFolderID,
  workspaces,
  onHoveredFolderChange,
  onProjectClick,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
}: SidebarProps) {
  return (
    <aside id="app-sidebar" className={isSidebarCondensed ? "sidebar is-condensed" : "sidebar"} aria-label="Folder navigation">
      <div className="sidebar-actions" aria-label="Sidebar actions">
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
            {action.key === "density" ? <ExpandIcon /> : null}
            {action.key === "sort" ? <SortIcon /> : null}
            {action.key === "new" ? <NewItemIcon /> : null}
          </button>
        ))}
      </div>

      <div className="sidebar-projects">
        {workspaces.map((workspace) => {
          const isActiveWorkspace = workspace.id === selectedFolderID
          const isExpanded = workspace.id === expandedFolderID
          const showStateIcon = workspace.id === hoveredFolderID
          const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"

          return (
            <section key={workspace.id} className="project-block">
              <div className="project-row-shell">
                <button
                  ref={(node) => {
                    projectRowRefs.current[workspace.id] = node
                  }}
                  className={isActiveWorkspace ? "project-row is-active" : "project-row"}
                  aria-label={workspace.name}
                  aria-expanded={isExpanded}
                  data-folder-id={workspace.id}
                  onClick={() => onProjectClick(workspace)}
                  onMouseEnter={() => onHoveredFolderChange(workspace.id)}
                  onMouseLeave={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                  onFocus={() => onHoveredFolderChange(workspace.id)}
                  onBlur={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                >
                  <span className="project-row-leading" data-icon={leadingIcon} data-testid={`project-leading-${workspace.id}`} aria-hidden="true">
                    {showStateIcon ? isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon /> : <FolderIcon />}
                  </span>
                  <span className="project-row-text">
                    <span className="project-row-label">{workspace.name}</span>
                    <span className="project-row-meta">{workspace.project.name}</span>
                  </span>
                </button>
              </div>

              {isExpanded ? (
                <div className="session-tree">
                  {workspace.sessions.map((session) => {
                    const active = session.id === activeSessionID

                    return (
                      <div key={session.id} className="session-row-shell">
                        <button className={active ? "session-row is-active" : "session-row"} onClick={() => onSessionSelect(workspace.id, session.id)}>
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

      <button className="sidebar-settings" aria-label="Open settings" title="Open settings">
        <SettingsIcon />
      </button>
    </aside>
  )
}

interface SidebarResizerProps {
  isSidebarResizing: boolean
  sidebarWidth: number
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
}

export function SidebarResizer({ isSidebarResizing, sidebarWidth, onKeyDown, onPointerDown }: SidebarResizerProps) {
  return (
    <div
      className={isSidebarResizing ? "sidebar-resizer is-active" : "sidebar-resizer"}
      role="separator"
      aria-label="Resize sidebar"
      aria-controls="app-sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={sidebarWidth}
      data-testid="sidebar-resizer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  )
}

export function CanvasTopMenu() {
  return (
    <nav className="canvas-top-menu" aria-label="Main content menu">
      <div className="canvas-top-menu-group">
        {canvasMenuItems.map((item, index) => (
          <button key={item.key} className={index === 0 ? "canvas-top-menu-button is-active" : "canvas-top-menu-button"}>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

interface ThreadViewProps {
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  threadColumnRef: RefObject<HTMLDivElement | null>
}

function TraceItemView({ item }: { item: AssistantTraceItem }) {
  const className = [
    "trace-item",
    `trace-kind-${item.kind}`,
    item.isStreaming ? "is-streaming" : "",
    item.status ? `is-${item.status}` : "",
  ]
    .filter(Boolean)
    .join(" ")

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

export function ThreadView({ activeSession, activeTurns, threadColumnRef }: ThreadViewProps) {
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
        ) : activeTurns.length === 0 ? null : (
          activeTurns.map((turn) => {
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

            const visibleItems = turn.items.filter((item) => item.kind !== "system")
            if (visibleItems.length === 0) return null

            return (
              <article key={turn.id} className="turn assistant-turn">
                <div className={turn.isStreaming ? "assistant-shell is-streaming" : "assistant-shell"}>
                  <div className="assistant-trace-list">
                    {visibleItems.map((item) => (
                      <TraceItemView key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

interface ComposerProps {
  draft: string
  hasActiveSession: boolean
  isSending: boolean
  onClear: () => void
  onDraftChange: (value: string) => void
  onSend: () => void | Promise<void>
}

export function Composer({ draft, hasActiveSession, isSending, onClear, onDraftChange, onSend }: ComposerProps) {
  return (
    <footer className="composer prompt-input-shell">
      <textarea
        aria-label="Task draft"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the UI, implementation task, or review target for the agent."
        rows={3}
      />

      <div className="composer-toolbar">
        <div className="composer-pills">
          <span className="composer-pill">GPT-5.4</span>
          <span className="composer-pill">Desktop</span>
          <span className="composer-pill">Anybox Ref</span>
        </div>

        <div className="composer-actions">
          <button aria-label="Clear draft" className="secondary-button" onClick={onClear}>
            Clear
          </button>
          <button aria-label="Send task" className="primary-button" disabled={isSending || !hasActiveSession} onClick={() => void onSend()}>
            {isSending ? "Sending..." : "Send task"}
          </button>
        </div>
      </div>
    </footer>
  )
}
