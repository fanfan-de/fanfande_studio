import { type ReactNode } from "react"
import { ChangesPanel } from "../changes/ChangesPanel"
import { WorkspaceFilesPanel } from "../files/WorkspaceFilesPanel"
import {
  ConnectedStatusIcon,
  FileTextIcon,
  LayoutSidebarRightIcon,
  OpenInEditorIcon
} from "../icons"
import { PreviewPanel } from "../preview/PreviewPanel"
import { buildRuntimeStatusDescription, formatRuntimeBusyStateLabel, formatRuntimeDuration, formatRuntimeLoadStateLabel, formatRuntimePhaseLabel, formatRuntimeTurnStatusLabel } from "../runtime-debug"
import { ShellTopMenu, TopMenuViewButton } from "../shared-ui"
import type {
  PreviewComment,
  PreviewMode,
  RightSidebarView,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  WorkspaceFileReviewState,
  WorkspacePreviewState
} from "../types"
import { formatTime } from "../utils"

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
  onDiffFileRestore: (file: string) => void | Promise<void>
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
  windowControls?: ReactNode
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
  onDiffFileRestore,
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
  windowControls,
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
        dragRegion
        trailing={windowControls}
        trailingClassName="right-sidebar-top-menu-window-controls"
      />

      <div className={activeView === "preview" ? "right-sidebar-view-host is-preview" : "right-sidebar-view-host"}>
        {activeView === "changes" ? (
          <ChangesPanel
            activeSession={activeSession}
            activeSessionDiff={activeSessionDiff}
            activeSessionDiffState={activeSessionDiffState}
            selectedDiffFile={selectedDiffFile}
            onDiffFileSelect={onDiffFileSelect}
            onDiffFileRestore={onDiffFileRestore}
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
