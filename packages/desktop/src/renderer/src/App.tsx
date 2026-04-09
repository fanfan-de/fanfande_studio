import {
  ActivityRail,
  CanvasTopMenu,
  Composer,
  RightSidebar,
  SettingsPage,
  Sidebar,
  SidebarResizer,
  ThreadView,
  Titlebar,
} from "./app/components"
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
    handleTitleMenu,
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
    titlebarCommand,
  } = useDesktopShell()

  const {
    activeSession,
    activeSessionDiff,
    activePendingPermissionRequests,
    activeTurns,
    composerAgentMode,
    composerAttachments,
    composerModelOptions,
    composerSelectedModel,
    composerSelectedModelLabel,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleComposerModelChange,
    handleComposerModeChange,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isCreatingSession,
    isResolvingPermissionRequest,
    isSending,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    projectRowRefs,
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
      <Titlebar
        isWindowMaximized={isWindowMaximized}
        titlebarCommand={titlebarCommand}
        onMenuClick={handleTitleMenu}
        onWindowAction={handleWindowAction}
      />

      <main ref={appShellRef} className="app-shell" style={appShellStyle}>
        {isActivityRailVisible ? (
          <ActivityRail isSidebarCollapsed={isSidebarCollapsed} onToggleSidebar={handleSidebarToggle} side="left" />
        ) : null}

        {!isSidebarCollapsed ? (
          <>
            <Sidebar
              activeSessionID={activeSession?.id ?? null}
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
          <CanvasTopMenu
            showLeftSidebarToggleButton={!isActivityRailVisible && isSidebarCollapsed}
            showRightSidebarToggleButton={isRightSidebarCollapsed}
            onToggleLeftSidebar={handleSidebarToggle}
            onToggleRightSidebar={handleRightSidebarToggle}
          />
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
            agentMode={composerAgentMode}
            attachments={composerAttachments}
            draft={draft}
            hasActiveSession={Boolean(activeSession)}
            hasPendingPermissionRequests={activePendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
            isSending={isSending}
            modelOptions={composerModelOptions}
            selectedModel={composerSelectedModel}
            selectedModelLabel={composerSelectedModelLabel}
            onAgentModeChange={handleComposerModeChange}
            onDraftChange={setDraft}
            onModelChange={handleComposerModelChange}
            onPickAttachments={handlePickComposerAttachments}
            onRemoveAttachment={handleRemoveComposerAttachment}
            onSend={handleSend}
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
              onToggleSidebar={handleRightSidebarToggle}
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
