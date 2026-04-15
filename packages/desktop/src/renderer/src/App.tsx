import { memo } from "react"
import {
  ActivityRail,
  CanvasRegionUtilityMenu,
  CanvasRegionTopMenu,
  Composer,
  CreateSessionCanvas,
  GlobalSkillsCanvas,
  RightSidebar,
  SessionCanvasTopMenu,
  SettingsPage,
  Sidebar,
  SidebarResizer,
  ThreadView,
  WindowChrome,
} from "./app/components"
import { ComposerUtilityBar } from "./app/ComposerUtilityBar"
import { TerminalPanel } from "./app/terminal/TerminalPanel"
import { TerminalPanelToggleButton } from "./app/terminal/TerminalPanelToggleButton"
import { useTerminalWorkspace } from "./app/terminal/use-terminal-workspace"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
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
    activeSessionDirectory,
    activeSessionContextUsage,
    activeCreateSessionTabID,
    activeSessionDiff,
    activeSessionDiffState,
    activePendingPermissionRequests,
    activeSessionSelectedDiffFile,
    activeTurns,
    canvasSessionTabs,
    composerAttachments,
    composerAttachmentButtonTitle,
    composerAttachmentDisabledReason,
    composerAttachmentError,
    composerContextWindow,
    composerMcpOptions,
    composerModelOptions,
    composerSelectedMcpLabel,
    composerSelectedMcpServerIDs,
    composerSkillOptions,
    composerSelectedModel,
    composerSelectedModelLabel,
    composerSelectedSkillIDs,
    composerSelectedSkillLabel,
    composerUnsupportedAttachmentPaths,
    createSessionTabs,
    createSessionWorkspaceID,
    deletingSessionID,
    draft,
    expandedFolderID,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffRefresh,
    handleComposerMcpToggle,
    handleComposerModelChange,
    handleComposerSkillToggle,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
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
    refreshComposerMcp,
    refreshComposerModels,
    refreshComposerSkills,
    refreshWorkspaceFromDirectory,
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
    creatingGlobalSkillName,
    deletingGlobalSkillDirectory,
    expandedSkillPaths,
    globalSkillsMessage,
    globalSkillsRoot,
    globalSkillsTree,
    handleCreateGlobalSkill,
    handleCreateGlobalSkillDraftCancel,
    handleCreateGlobalSkillDraftChange,
    handleCreateGlobalSkillDraftStart,
    handleDeleteGlobalSkill,
    handleGlobalSkillDirectoryToggle,
    handleGlobalSkillDraftChange,
    handleGlobalSkillFileSelect,
    handleRenameGlobalSkill,
    handleRenameGlobalSkillDraftCancel,
    handleRenameGlobalSkillDraftChange,
    handleRenameGlobalSkillDraftStart,
    handleSaveGlobalSkillFile,
    isCreateGlobalSkillDraftVisible,
    isCreatingGlobalSkill,
    isDirtyGlobalSkillFile,
    isLoadingGlobalSkillFile,
    isLoadingGlobalSkillsTree,
    isSavingGlobalSkillFile,
    renamingGlobalSkillDirectory,
    renamingGlobalSkillDraftDirectory,
    renamingGlobalSkillName,
    selectedGlobalSkillDirectory,
    selectedGlobalSkillFileContent,
    selectedGlobalSkillFilePath,
  } = useGlobalSkills({
    onSkillsUpdated: refreshComposerSkills,
  })

  const {
    activeMcpServerID,
    activeMcpServerDiagnostic,
    archivedSessions,
    archivedSessionsError,
    catalog,
    closeSettings,
    deleteArchivedSession,
    deleteMcpServer,
    deleteProvider,
    deletingArchivedSessionID,
    deletingMcpServerID,
    deletingProviderID,
    isLoading,
    isLoadingArchivedSessions,
    isOpen,
    isSavingSelection,
    loadError,
    mcpServerDraft,
    mcpServers,
    message,
    models,
    openSettings,
    projectID,
    projectName,
    projectWorktree,
    providerDrafts,
    restoringArchivedSessionID,
    savedSelection,
    restoreArchivedSession,
    saveMcpServer,
    saveProvider,
    saveSelection,
    savingMcpServerID,
    savingProviderID,
    selectMcpServer,
    selectionDraft,
    setMcpServerDraftValue,
    setProviderDraftValue,
    setSelectionDraftValue,
    startNewMcpServer,
  } = useSettingsPage({
    onArchivedSessionRestored: async (session) => {
      await refreshWorkspaceFromDirectory(session.directory)
    },
    onMcpUpdated: refreshComposerMcp,
    onProviderModelsUpdated: refreshComposerModels,
    projectID: selectedWorkspace?.project.id ?? null,
    projectName: selectedWorkspace?.project.name ?? null,
    projectWorktree: selectedWorkspace?.project.worktree ?? null,
  })

  const activeCreateSessionWorkspace =
    (createSessionWorkspaceID ? workspaces.find((workspace) => workspace.id === createSessionWorkspaceID) ?? null : null) ?? selectedWorkspace
  const sessionCanvasWorkspace = isCreateSessionTabActive ? activeCreateSessionWorkspace : selectedWorkspace
  const sessionCanvasTopMenuLabel = isCreateSessionTabActive ? "Create session" : "Session"
  const sessionCanvasTopMenuTitle = activeSession
    ? activeSession.title
    : activeCreateSessionWorkspace
      ? `${activeCreateSessionWorkspace.project.name} / ${activeCreateSessionWorkspace.name}`
      : "No project selected"

  function handleInspectFileInSidebar(file: string | null) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handleActiveSessionDiffFileSelect(file)
  }

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
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              deletingSessionID={deletingSessionID}
              expandedFolderID={expandedFolderID}
              expandedSkillPaths={expandedSkillPaths}
              creatingGlobalSkillName={creatingGlobalSkillName}
              globalSkillsRoot={globalSkillsRoot}
              globalSkillsTree={globalSkillsTree}
              hoveredFolderID={hoveredFolderID}
              isCreateGlobalSkillDraftVisible={isCreateGlobalSkillDraftVisible}
              isCreatingGlobalSkill={isCreatingGlobalSkill}
              isCreatingProject={isCreatingProject}
              isCreatingSession={isCreatingSession}
              isLoadingSkillsTree={isLoadingGlobalSkillsTree}
              isSettingsOpen={isOpen}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
              showSidebarToggleButton={!isActivityRailVisible}
              projectRowRefs={projectRowRefs}
              selectedFolderID={selectedFolderID}
              workspaces={workspaces}
              onCreateGlobalSkill={handleCreateGlobalSkill}
              onCreateGlobalSkillDraftCancel={handleCreateGlobalSkillDraftCancel}
              onCreateGlobalSkillDraftChange={handleCreateGlobalSkillDraftChange}
              onCreateGlobalSkillDraftStart={handleCreateGlobalSkillDraftStart}
              onDeleteGlobalSkill={handleDeleteGlobalSkill}
              onGlobalSkillDirectoryToggle={handleGlobalSkillDirectoryToggle}
              onGlobalSkillFileSelect={handleGlobalSkillFileSelect}
              onRenameGlobalSkill={handleRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={handleRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={handleRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={handleRenameGlobalSkillDraftStart}
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
            {leftSidebarView === "skills" ? (
              <CanvasRegionUtilityMenu
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                label="Global Skills"
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
                showLeftSidebarToggleButton={!isActivityRailVisible && isSidebarCollapsed}
              />
            ) : (
              <CanvasRegionTopMenu
                activeSessionID={activeSession?.id ?? null}
                activeCreateSessionTabID={activeCreateSessionTabID}
                createSessionTabs={createSessionTabs}
                sessions={canvasSessionTabs}
                workspaces={workspaces}
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
            )}
            {leftSidebarView === "skills" ? null : (
              <SessionCanvasTopMenu
                contextLabel={sessionCanvasTopMenuLabel}
                contextTitle={sessionCanvasTopMenuTitle}
                gitProjectID={sessionCanvasWorkspace?.project.id ?? null}
                gitDirectory={sessionCanvasWorkspace?.directory ?? null}
                mcpOptions={composerMcpOptions}
                selectedMcpServerIDs={composerSelectedMcpServerIDs}
                selectedMcpServerLabel={composerSelectedMcpLabel}
                onMcpServerToggle={handleComposerMcpToggle}
                skillOptions={composerSkillOptions}
                selectedSkillIDs={composerSelectedSkillIDs}
                selectedSkillLabel={composerSelectedSkillLabel}
                onSkillToggle={handleComposerSkillToggle}
              />
            )}
          </div>
          {leftSidebarView === "skills" ? (
            <GlobalSkillsCanvas
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              globalSkillsMessage={globalSkillsMessage}
              globalSkillsRoot={globalSkillsRoot}
              isDirty={isDirtyGlobalSkillFile}
              isLoadingFile={isLoadingGlobalSkillFile}
              isSavingFile={isSavingGlobalSkillFile}
              selectedFileContent={selectedGlobalSkillFileContent}
              selectedFilePath={selectedGlobalSkillFilePath}
              selectedSkillDirectoryName={selectedGlobalSkillDirectory?.name ?? null}
              onChange={handleGlobalSkillDraftChange}
              onDelete={handleDeleteGlobalSkill}
              onSave={handleSaveGlobalSkillFile}
            />
          ) : isCreateSessionTabActive ? (
            <>
              <CreateSessionCanvas
                isCreatingSession={isCreatingSession}
                selectedWorkspaceID={createSessionWorkspaceID}
                workspaces={workspaces}
                onWorkspaceChange={handleCreateSessionWorkspaceChange}
              />
              <div className="composer-stack">
                <Composer
                  attachments={composerAttachments}
                  attachmentButtonTitle={composerAttachmentButtonTitle}
                  attachmentDisabledReason={composerAttachmentDisabledReason}
                  attachmentError={composerAttachmentError}
                  canSend={Boolean(createSessionWorkspaceID)}
                  draft={draft}
                  hasPendingPermissionRequests={false}
                  isSending={isSending || isCreatingSession}
                  modelOptions={composerModelOptions}
                  selectedModel={composerSelectedModel}
                  selectedModelLabel={composerSelectedModelLabel}
                  unsupportedAttachmentPaths={composerUnsupportedAttachmentPaths}
                  onDraftChange={setDraft}
                  onModelChange={handleComposerModelChange}
                  onPickAttachments={handlePickComposerAttachments}
                  onRemoveAttachment={handleRemoveComposerAttachment}
                  onSend={handleSend}
                />
                <ComposerUtilityBar
                  contextWindow={composerContextWindow}
                  gitDirectory={sessionCanvasWorkspace?.directory ?? null}
                  gitProjectID={sessionCanvasWorkspace?.project.id ?? null}
                  usage={null}
                />
              </div>
            </>
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
                onFileChangeSelect={handleInspectFileInSidebar}
                onPermissionRequestResponse={handlePermissionRequestResponse}
              />
              <div className="composer-stack">
                <Composer
                  attachments={composerAttachments}
                  attachmentButtonTitle={composerAttachmentButtonTitle}
                  attachmentDisabledReason={composerAttachmentDisabledReason}
                  attachmentError={composerAttachmentError}
                  canSend={Boolean(activeSession)}
                  draft={draft}
                  hasPendingPermissionRequests={activePendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
                  isSending={isSending}
                  modelOptions={composerModelOptions}
                  selectedModel={composerSelectedModel}
                  selectedModelLabel={composerSelectedModelLabel}
                  unsupportedAttachmentPaths={composerUnsupportedAttachmentPaths}
                  onDraftChange={setDraft}
                  onModelChange={handleComposerModelChange}
                  onPickAttachments={handlePickComposerAttachments}
                  onRemoveAttachment={handleRemoveComposerAttachment}
                  onSend={handleSend}
                />
                <ComposerUtilityBar
                  contextWindow={composerContextWindow}
                  gitDirectory={sessionCanvasWorkspace?.directory ?? null}
                  gitProjectID={sessionCanvasWorkspace?.project.id ?? null}
                  usage={activeSessionContextUsage}
                />
              </div>
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
              activeSessionDirectory={leftSidebarView === "skills" ? null : activeSessionDirectory}
              activeSession={leftSidebarView === "skills" ? null : activeSession}
              activeSessionDiff={leftSidebarView === "skills" ? null : activeSessionDiff}
              activeSessionDiffState={leftSidebarView === "skills" ? undefined : activeSessionDiffState}
              selectedDiffFile={leftSidebarView === "skills" ? null : activeSessionSelectedDiffFile}
              activeView={rightSidebarView}
              onDiffFileSelect={handleActiveSessionDiffFileSelect}
              onRefresh={handleActiveSessionDiffRefresh}
              onViewChange={handleRightSidebarViewChange}
            />
          </>
        ) : null}

        <SettingsPage
          activeMcpServerID={activeMcpServerID}
          activeMcpServerDiagnostic={activeMcpServerDiagnostic}
          archivedSessions={archivedSessions}
          archivedSessionsError={archivedSessionsError}
          catalog={catalog}
          deletingArchivedSessionID={deletingArchivedSessionID}
          deletingMcpServerID={deletingMcpServerID}
          deletingProviderID={deletingProviderID}
          isActivityRailVisible={isActivityRailVisible}
          isLoading={isLoading}
          isLoadingArchivedSessions={isLoadingArchivedSessions}
          isOpen={isOpen}
          isSavingSelection={isSavingSelection}
          loadError={loadError}
          mcpServerDraft={mcpServerDraft}
          mcpServers={mcpServers}
          message={message}
          models={models}
          projectID={projectID}
          projectName={projectName}
          projectWorktree={projectWorktree}
          providerDrafts={providerDrafts}
          restoringArchivedSessionID={restoringArchivedSessionID}
          savedSelection={savedSelection}
          savingMcpServerID={savingMcpServerID}
          savingProviderID={savingProviderID}
          selectionDraft={selectionDraft}
          onActivityRailVisibilityChange={handleActivityRailVisibilityChange}
          onClose={closeSettings}
          onDeleteArchivedSession={deleteArchivedSession}
          onDeleteMcpServer={deleteMcpServer}
          onDeleteProvider={deleteProvider}
          onMcpServerDraftChange={setMcpServerDraftValue}
          onMcpServerSelect={selectMcpServer}
          onProviderDraftChange={setProviderDraftValue}
          onRestoreArchivedSession={restoreArchivedSession}
          onSaveMcpServer={saveMcpServer}
          onSaveProvider={saveProvider}
          onSaveSelection={saveSelection}
          onSelectionChange={setSelectionDraftValue}
          onStartNewMcpServer={startNewMcpServer}
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
