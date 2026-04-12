import { memo } from "react"
import {
  ActivityRail,
  CanvasRegionTopMenu,
  Composer,
  CreateSessionCanvas,
  RightSidebar,
  SessionCanvasTopMenu,
  SettingsPage,
  Sidebar,
  SidebarResizer,
  ThreadView,
  WindowChrome,
} from "./app/components"
import { TerminalPanel } from "./app/terminal/TerminalPanel"
import { TerminalPanelToggleButton } from "./app/terminal/TerminalPanelToggleButton"
import { useTerminalWorkspace } from "./app/terminal/use-terminal-workspace"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useSettingsPage } from "./app/use-settings-page"

export function App() {
  const {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleActivityRailVisibilityChange,
    handleRightSidebarResizerKeyDown,
    handleRightSidebarResizerPointerDown,
    handleRightSidebarToggle,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleSidebarToggle,
    handleWindowAction,
    isActivityRailVisible,
    isRightSidebarCollapsed,
    isRightSidebarResizing,
    isSidebarCollapsed,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    rightSidebarWidth,
    sidebarWidth,
    windowControlsRef,
  } = useDesktopShell()

  const {
    activeSession,
    activeCreateSessionTabID,
    activeSessionDiff,
    activePendingPermissionRequests,
    activeTurns,
    canvasSessionTabs,
    composerAttachments,
    composerModelOptions,
    composerSelectedModel,
    composerSelectedModelLabel,
    createSessionTabs,
    createSessionTitle,
    createSessionWorkspaceID,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleComposerModelChange,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionTitleChange,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenCreateSessionTab,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreateSessionTabActive,
    isCreatingProject,
    isCreatingSession,
    isResolvingPermissionRequest,
    isSending,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    projectRowRefs,
    rightSidebarView,
    selectedWorkspace,
    selectedFolderID,
    setDraft,
    setHoveredFolderID,
    threadColumnRef,
    workspaces,
  } = useAgentWorkspace({
    agentConnected,
    agentDefaultDirectory,
    platform,
  })

  const {
    catalog,
    closeSettings,
    deleteProvider,
    deletingProviderID,
    isLoading,
    isOpen,
    isSavingSelection,
    loadError,
    message,
    models,
    openSettings,
    providerDrafts,
    savedSelection,
    saveProvider,
    saveSelection,
    savingProviderID,
    selectionDraft,
    setProviderDraftValue,
    setSelectionDraftValue,
  } = useSettingsPage()

  return (
    <div className={isWindowMaximized ? "window-shell is-maximized" : "window-shell"}>
      <WindowChrome controlsRef={windowControlsRef} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />

      <main ref={appShellRef} className="app-shell" style={appShellStyle}>
        {isActivityRailVisible ? (
          <ActivityRail isSidebarCollapsed={isSidebarCollapsed} onToggleSidebar={handleSidebarToggle} side="left" />
        ) : null}

        {!isSidebarCollapsed ? (
          <>
            <Sidebar
              activeSessionID={activeSession?.id ?? null}
              activeView={leftSidebarView}
              deletingSessionID={deletingSessionID}
              expandedFolderID={expandedFolderID}
              hoveredFolderID={hoveredFolderID}
              isCreatingProject={isCreatingProject}
              isCreatingSession={isCreatingSession}
              isSettingsOpen={isOpen}
              showSidebarToggleButton={!isActivityRailVisible}
              projectRowRefs={projectRowRefs}
              selectedFolderID={selectedFolderID}
              workspaces={workspaces}
              onHoveredFolderChange={setHoveredFolderID}
              onOpenSettings={openSettings}
              onProjectCreateSession={handleProjectCreateSession}
              onProjectClick={handleProjectClick}
              onProjectRemove={handleProjectRemove}
              onSessionDelete={handleSessionDelete}
              onSessionSelect={handleSessionSelect}
              onSidebarAction={handleSidebarAction}
              onToggleSidebar={handleSidebarToggle}
              onViewChange={handleLeftSidebarViewChange}
            />

            <SidebarResizer
              isSidebarResizing={isSidebarResizing}
              side="left"
              sidebarWidth={sidebarWidth}
              onKeyDown={handleSidebarResizerKeyDown}
              onPointerDown={handleSidebarResizerPointerDown}
            />
          </>
        ) : null}

        <section className="canvas">
          <div className="canvas-top-stack">
            <CanvasRegionTopMenu
              activeSessionID={activeSession?.id ?? null}
              activeCreateSessionTabID={activeCreateSessionTabID}
              createSessionTabs={createSessionTabs}
              sessions={canvasSessionTabs}
              onCloseCreateSessionTab={handleCloseCreateSessionTab}
              onAddCreateSessionTab={() => handleOpenCreateSessionTab(selectedWorkspace?.id ?? null)}
              onSelectCreateSessionTab={handleCreateSessionTabSelect}
              onSessionClose={handleCanvasSessionTabClose}
              onSessionSelect={handleCanvasSessionTabSelect}
              showLeftSidebarToggleButton={!isActivityRailVisible && isSidebarCollapsed}
              isRightSidebarCollapsed={isRightSidebarCollapsed}
              onToggleLeftSidebar={handleSidebarToggle}
              onToggleRightSidebar={handleRightSidebarToggle}
            />
            {!isCreateSessionTabActive ? (
              <SessionCanvasTopMenu activeSession={activeSession} gitDirectory={selectedWorkspace?.project.worktree ?? null} />
            ) : null}
          </div>
          {isCreateSessionTabActive ? (
            <CreateSessionCanvas
              isCreatingSession={isCreatingSession}
              selectedWorkspaceID={createSessionWorkspaceID}
              title={createSessionTitle}
              workspaces={workspaces}
              onCreateSession={handleCreateSessionSubmit}
              onTitleChange={handleCreateSessionTitleChange}
              onWorkspaceChange={handleCreateSessionWorkspaceChange}
            />
          ) : (
            <>
              <ThreadView
                activeSession={activeSession}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                pendingPermissionRequests={activePendingPermissionRequests}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                activeTurns={activeTurns}
                threadColumnRef={threadColumnRef}
                onPermissionRequestResponse={handlePermissionRequestResponse}
              />
              <Composer
                attachments={composerAttachments}
                draft={draft}
                hasActiveSession={Boolean(activeSession)}
                hasPendingPermissionRequests={activePendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
                isSending={isSending}
                modelOptions={composerModelOptions}
                selectedModel={composerSelectedModel}
                selectedModelLabel={composerSelectedModelLabel}
                onDraftChange={setDraft}
                onModelChange={handleComposerModelChange}
                onPickAttachments={handlePickComposerAttachments}
                onRemoveAttachment={handleRemoveComposerAttachment}
                onSend={handleSend}
              />
            </>
          )}
          <TerminalArea
            currentWorkspaceDirectory={selectedWorkspace?.directory ?? null}
            defaultCwd={agentDefaultDirectory}
          />
        </section>

        {!isRightSidebarCollapsed ? (
          <>
            <SidebarResizer
              isSidebarResizing={isRightSidebarResizing}
              side="right"
              sidebarWidth={rightSidebarWidth}
              onKeyDown={handleRightSidebarResizerKeyDown}
              onPointerDown={handleRightSidebarResizerPointerDown}
            />

            <RightSidebar
              activeSession={activeSession}
              activeSessionDiff={activeSessionDiff}
              activeView={rightSidebarView}
              onViewChange={handleRightSidebarViewChange}
            />
          </>
        ) : null}

        <SettingsPage
          catalog={catalog}
          deletingProviderID={deletingProviderID}
          isActivityRailVisible={isActivityRailVisible}
          isLoading={isLoading}
          isOpen={isOpen}
          isSavingSelection={isSavingSelection}
          loadError={loadError}
          message={message}
          models={models}
          providerDrafts={providerDrafts}
          savedSelection={savedSelection}
          savingProviderID={savingProviderID}
          selectionDraft={selectionDraft}
          onActivityRailVisibilityChange={handleActivityRailVisibilityChange}
          onClose={closeSettings}
          onDeleteProvider={deleteProvider}
          onProviderDraftChange={setProviderDraftValue}
          onSaveProvider={saveProvider}
          onSaveSelection={saveSelection}
          onSelectionChange={setSelectionDraftValue}
        />
      </main>
    </div>
  )
}

interface TerminalAreaProps {
  currentWorkspaceDirectory: string | null
  defaultCwd: string
}

const TerminalArea = memo(function TerminalArea({ currentWorkspaceDirectory, defaultCwd }: TerminalAreaProps) {
  const {
    activeSession,
    handleCloseTerminal,
    handleCreateTerminal,
    handlePanelHeightChange,
    handleSelectTerminal,
    handleTerminalInput,
    handleTerminalResize,
    handleTerminalSnapshotChange,
    handleTogglePanel,
    isOpen,
    panelHeight,
    sessions,
    subscribeToTerminalStream,
  } = useTerminalWorkspace({
    defaultCwd,
    currentWorkspaceDirectory,
  })

  return (
    <>
      {!isOpen ? (
        <div className="canvas-terminal-toggle-anchor">
          <TerminalPanelToggleButton isOpen={false} onToggle={() => void handleTogglePanel()} />
        </div>
      ) : null}
      <TerminalPanel
        activeSession={activeSession}
        isOpen={isOpen}
        panelHeight={panelHeight}
        sessions={sessions}
        onCloseTerminal={handleCloseTerminal}
        onCreateTerminal={handleCreateTerminal}
        onPanelHeightChange={handlePanelHeightChange}
        onSelectTerminal={handleSelectTerminal}
        onTerminalInput={handleTerminalInput}
        onTerminalResize={handleTerminalResize}
        onTerminalSnapshotChange={handleTerminalSnapshotChange}
        onTogglePanel={() => void handleTogglePanel()}
        subscribeToTerminalStream={subscribeToTerminalStream}
      />
    </>
  )
})
