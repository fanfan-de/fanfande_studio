import { CanvasTopMenu, Composer, SettingsPage, Sidebar, SidebarResizer, ThreadView, Titlebar } from "./app/components"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useSettingsPage } from "./app/use-settings-page"

export function App() {
  const {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleTitleMenu,
    handleWindowAction,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    sidebarWidth,
    titlebarCommand,
  } = useDesktopShell()

  const {
    activeSession,
    activeTurns,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isCreatingSession,
    isSending,
    projectRowRefs,
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
      <Titlebar
        isWindowMaximized={isWindowMaximized}
        titlebarCommand={titlebarCommand}
        onMenuClick={handleTitleMenu}
        onWindowAction={handleWindowAction}
      />

      <main ref={appShellRef} className="app-shell" style={appShellStyle}>
        <Sidebar
          activeSessionID={activeSession?.id ?? null}
          deletingSessionID={deletingSessionID}
          expandedFolderID={expandedFolderID}
          hoveredFolderID={hoveredFolderID}
          isCreatingProject={isCreatingProject}
          isCreatingSession={isCreatingSession}
          isSettingsOpen={isOpen}
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
        />

        <SidebarResizer
          isSidebarResizing={isSidebarResizing}
          sidebarWidth={sidebarWidth}
          onKeyDown={handleSidebarResizerKeyDown}
          onPointerDown={handleSidebarResizerPointerDown}
        />

        <section className="canvas">
          <CanvasTopMenu />
          <ThreadView activeSession={activeSession} activeTurns={activeTurns} threadColumnRef={threadColumnRef} />
          <Composer
            draft={draft}
            hasActiveSession={Boolean(activeSession)}
            isSending={isSending}
            onClear={() => setDraft("")}
            onDraftChange={setDraft}
            onSend={handleSend}
          />
        </section>

        <SettingsPage
          catalog={catalog}
          deletingProviderID={deletingProviderID}
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
