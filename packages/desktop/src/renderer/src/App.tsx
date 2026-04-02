import { CanvasTopMenu, Composer, Sidebar, SidebarResizer, ThreadView, Titlebar } from "./app/components"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"

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
    isSidebarCondensed,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    setIsSidebarCondensed,
    sidebarWidth,
    titlebarCommand,
  } = useDesktopShell()

  const {
    activeSession,
    activeTurns,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleProjectClick,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isSending,
    projectRowRefs,
    selectedFolderID,
    setDraft,
    setHoveredFolderID,
    threadColumnRef,
    workspaces,
  } = useAgentWorkspace({
    agentConnected,
    agentDefaultDirectory,
    onToggleSidebarDensity: () => setIsSidebarCondensed((value) => !value),
    platform,
  })

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
          isSidebarCondensed={isSidebarCondensed}
          projectRowRefs={projectRowRefs}
          selectedFolderID={selectedFolderID}
          workspaces={workspaces}
          onHoveredFolderChange={setHoveredFolderID}
          onProjectClick={handleProjectClick}
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
      </main>
    </div>
  )
}
