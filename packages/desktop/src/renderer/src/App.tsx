import { useEffect, useMemo, useState } from "react"
import {
  ActivityRail,
  BuiltinToolsPage,
  GlobalSkillsPage,
  McpServersPage,
  PluginsPage,
  PromptPresetsPage,
  RightSidebar,
  SettingsPage,
  Sidebar,
  SidebarResizer,
  WindowChrome,
} from "./app/components"
import { TerminalAreaHost } from "./app/terminal/TerminalAreaHost"
import { resolveWorkspaceRelativePath } from "./app/agent-workspace/workspace-loading-hooks"
import type { MarkdownLocalFileLinkTarget } from "./app/thread-markdown"
import type { RightSidebarView, SessionDiffFile, ToolPermissionMode, WorkspaceMode } from "./app/types"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
import { useSettingsPage } from "./app/use-settings-page"
import type { BuiltinToolKindKey } from "./app/tools/BuiltinToolsPage"
import { isSideChatSession } from "./app/workspace"
import { WorkbenchShell } from "./app/workbench/WorkbenchShell"
import { WorkspaceModeCanvasPlaceholder, WorkspaceModeRightPlaceholder } from "./app/workspace-mode/WorkspaceModePlaceholder"

const WORKBENCH_TERMINAL_STORAGE_KEY = "desktop.terminal.workspace.v3:workbench"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

interface LocalFileLinkOpenInput {
  paneID: string
  sessionID: string | null
  target: MarkdownLocalFileLinkTarget
  workspaceDirectory: string | null
}

function encodeFilePathSegment(value: string) {
  return encodeURIComponent(value).replace(/%3A/i, ":")
}

function toFileUrl(targetPath: string) {
  const trimmedPath = targetPath.trim()
  if (!trimmedPath) return null
  if (trimmedPath.toLowerCase().startsWith("file://")) return trimmedPath

  const normalizedPath = trimmedPath.replace(/\\/g, "/")
  const uncMatch = normalizedPath.match(/^\/\/([^/]+)\/(.+)$/)
  if (uncMatch) {
    const encodedPath = uncMatch[2].split("/").map(encodeFilePathSegment).join("/")
    return `file://${uncMatch[1]}/${encodedPath}`
  }

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    const encodedPath = normalizedPath.split("/").map(encodeFilePathSegment).join("/")
    return `file:///${encodedPath}`
  }

  if (normalizedPath.startsWith("/")) {
    const encodedPath = normalizedPath.split("/").map(encodeFilePathSegment).join("/")
    return `file://${encodedPath}`
  }

  return null
}

async function openSystemLocalPath(targetPath: string) {
  const openPath = window.desktop?.openPath
  if (openPath) {
    try {
      await openPath({ targetPath })
      return
    } catch (error) {
      console.error("[desktop] Failed to open local file path:", error)
    }
  }

  const fileUrl = toFileUrl(targetPath)
  const openExternalUrl = window.desktop?.openExternalUrl
  if (!fileUrl || !openExternalUrl) return

  try {
    await openExternalUrl({ url: fileUrl })
  } catch (error) {
    console.error("[desktop] Failed to open local file URL:", error)
  }
}



export function App() {
  const {
    agentConnected,
    agentDefaultDirectory,
    appearanceConfigError,
    appearanceConfigPath,
    appearanceConfigPreview,
    appearanceOverrides,
    appearanceTokenValues,
    assistantTraceVisibility,
    appShellRef,
    appShellStyle,
    brandTheme,
    handleActivityRailVisibilityChange,
    handleAppearancePaletteReset,
    handleAppearanceTokenChange,
    handleAppearanceTokenReset,
    handleAssistantTraceVisibilityChange,
    handleBrandThemeChange,
    handleAgentDebugTraceChange,
    handleDebugLineColorsChange,
    handleDebugUiRegionsChange,
    handleRightSidebarResizerKeyDown,
    handleRightSidebarResizerPointerDown,
    handleRightSidebarToggle,
    handleSidebarResizerKeyDown,
    handleSidebarResizerPointerDown,
    handleSidebarToggle,
    handleWindowAction,
    colorMode,
    handleColorModeChange,
    isActivityRailVisible,
    isAgentDebugTraceEnabled,
    isDebugLineColorsEnabled,
    isDebugUiRegionsEnabled,
    isRightSidebarCollapsed,
    isRightSidebarResizing,
    isSidebarCollapsed,
    isSidebarResizing,
    isWindowMaximized,
    platform,
    rightSidebarWidthBounds,
    rightSidebarWidth,
    sidebarWidthBounds,
    sidebarWidth,
    windowControlsRef,
  } = useDesktopShell()

  const {
    activePreviewState,
    activeSession,
    activeSessionDirectory,
    activeSessionDiff,
    activeSessionDiffState,
    activeWorkspaceFileScopeDirectory,
    activeWorkspaceFileScopeName,
    activeWorkspaceFileState,
    activeSessionRuntimeDebug,
    activeSessionRuntimeDebugState,
    activeSessionSelectedDiffFile,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerRefreshVersion,
    deletingSessionID,
    handleApproveProposedPlan,
    expandedFolderIDs,
    handleCancelSend,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffFileRestore,
    handleActiveSessionDiffPatchesReverseApply,
    handleActiveSessionDiffRefresh,
    handleActiveSessionRuntimeDebugRefresh,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSideChatTab,
    handleDeleteSideChatTab,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenSideChat,
    handleOpenCreateSessionTab,
    handleDockviewActiveChange,
    handlePaneFocus,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handlePreviewAddComment,
    handlePreviewBack,
    handlePreviewDraftUrlChange,
    handlePreviewForward,
    handlePreviewModeChange,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewOpenUrl,
    handlePreviewReload,
    handleWorkspaceFileCommentCancel,
    handleWorkspaceFileCommentChange,
    handleWorkspaceFileCommentConfirm,
    handleWorkspaceFileCommentStart,
    handleWorkspaceFileQueryChange,
    handleWorkspaceFileSelect,
    handleProjectArchiveSessions,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectOpenInExplorer,
    handleProjectPin,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handlePlanModeToggle,
    handleSessionDelete,
    handleSessionSelect,
    handleSelectSideChatTab,
    handleSessionModelSelectionChange,
    handleTurnDiffSummaryHydrate,
    handleSidebarAction,
    focusedPaneID,
    hoveredFolderID,
    isCreatingProject,
    isResolvingPermissionRequest,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    pinnedWorkspaceIDs,
    projectRowRefs,
    refreshComposerMcp,
    refreshComposerModels,
    refreshComposerSkills,
    refreshWorkspaceFromDirectory,
    rightSidebarView,
    runningSessionIDs,
    selectedFolderID,
    sessionCanvasUnreadBySession,
    setDraftForTab,
    handleWorkbenchDockviewCommandsReady,
    setHoveredFolderID,
    setDockviewLayout,
    visibleCanvasSessionIDs,
    dockviewLayout,
    workbenchPaneStateByID,
    workbenchPaneStates,
    workspaces,
  } = useAgentWorkspace({
    agentConnected,
    agentDefaultDirectory,
    isRuntimeDebugEnabled: isAgentDebugTraceEnabled,
    platform,
  })

  const {
    creatingGlobalSkillName,
    creatingGlobalSkillDraftKind,
    creatingGlobalSkillParentDirectory,
    deletingGlobalSkillDirectory,
    expandedSkillPaths,
    globalSkillFolderOptions,
    globalSkillsMessage,
    globalSkillsRoot,
    globalSkillsTree,
    gitInstallTargetDirectory,
    gitInstallMessage,
    gitInstallPreview,
    gitInstallSource,
    handleCreateGlobalSkill,
    handleCreateGlobalSkillDraftCancel,
    handleCreateGlobalSkillDraftChange,
    handleCreateGlobalSkillDraftStart,
    handleDeleteGlobalSkill,
    handleGitInstallDialogClose,
    handleGitInstallDialogOpen,
    handleGitInstallSkillToggle,
    handleGitInstallSourceChange,
    handleGitInstallTargetDirectoryChange,
    handleGlobalSkillDirectoryToggle,
    handleGlobalSkillDraftChange,
    handleGlobalSkillFileSelect,
    handleInstallGitSkills,
    handleInstallLocalSkillFile,
    handleLocalInstallDialogClose,
    handleLocalInstallDialogOpen,
    handleLocalInstallTargetDirectoryChange,
    handleMoveGlobalSkillDirectory,
    handleMoveGlobalSkillDirectoryCancel,
    handleMoveGlobalSkillDirectoryStart,
    handleMoveGlobalSkillTargetDirectoryChange,
    handleOpenGlobalSkillsFolder,
    handlePreviewGitSkillInstall,
    handleRenameGlobalSkill,
    handleRenameGlobalSkillDraftCancel,
    handleRenameGlobalSkillDraftChange,
    handleRenameGlobalSkillDraftStart,
    handleSaveGlobalSkillFile,
    isCreateGlobalSkillDraftVisible,
    isCreatingGlobalSkill,
    isDirtyGlobalSkillFile,
    isGitInstallDialogOpen,
    isInstallingGitSkills,
    isInstallingLocalSkill,
    isLocalInstallDialogOpen,
    isLoadingGlobalSkillFile,
    isLoadingGlobalSkillsTree,
    isMoveGlobalSkillDialogOpen,
    isMovingGlobalSkillDirectory,
    isPreviewingGitInstall,
    isSavingGlobalSkillFile,
    localInstallTargetDirectory,
    moveGlobalSkillTargetOptions,
    movingGlobalSkillDirectory,
    movingGlobalSkillTargetDirectory,
    renamingGlobalSkillDirectory,
    renamingGlobalSkillDraftDirectory,
    renamingGlobalSkillName,
    selectedGlobalSkillDirectory,
    selectedGlobalSkillFileContent,
    selectedGlobalSkillFilePath,
    selectedGitInstallSkillIDs,
  } = useGlobalSkills({
    onSkillsUpdated: refreshComposerSkills,
  })

  const {
    activeMcpServerID,
    activeMcpServerDiagnostic,
    activePluginID,
    archivedSessions,
    archivedSessionsError,
    builtinTools,
    builtinToolsError,
    catalog,
    closeSettings,
    deleteArchivedSession,
    deleteInstalledPlugin,
    deleteInstalledPluginConnectorApiKey,
    deleteMcpServer,
    deleteProvider,
    deleteProviderAuthSession,
    deletingArchivedSessionID,
    deletingMcpServerID,
    deletingPluginID,
    deletingPromptPresetID,
    deletingProviderID,
    diagnoseInstalledPlugin,
    diagnoseInstalledPluginConnector,
    diagnosingPluginID,
    diagnosingPluginConnectorID,
    dismissMessage,
    installPlugin,
    installPromptsFromUrl,
    importMcpConfigJson,
    installingPluginID,
    installedPlugins,
    isCreatingPromptPreset,
    isImportingMcpConfigJson,
    isLoading,
    isLoadingBuiltinTools,
    isLoadingPlugins,
    isLoadingPromptPreset,
    isLoadingPrompts,
    isLoadingArchivedSessions,
    isOpen,
    isPromptDirty,
    isPromptUrlInstallDialogOpen,
    isBuiltinToolSelectionDirty,
    isRefreshingProviderCatalog,
    isInstallingPromptUrlPrompts,
    isPreviewingPromptUrlInstall,
    isSavingPromptPresetSelection,
    isSavingBuiltinTools,
    loadError,
    loadArchivedSessions,
    mcpServerDraft,
    mcpServers,
    message,
    models,
    openSettings,
    pluginCatalog,
    pluginConnectorStatuses,
    pluginDiagnostics,
    pluginDraft,
    pluginsError,
    promptDraftLabel,
    promptDraftContent,
    promptLoadError,
    promptRoot,
    promptPresets,
    promptPresetSelection,
    promptUrlInstallMessage,
    promptUrlInstallPreview,
    promptUrlInstallSource,
    providerDrafts,
    createPromptPreset,
    deletePromptPreset,
    closePromptUrlInstallDialog,
    openPromptFolder,
    openPromptUrlInstallDialog,
    previewPromptUrlInstall,
    refreshProviderCatalog,
    resetBuiltinTools,
    resetPromptPreset,
    resettingPromptPresetID,
    restoringArchivedSessionID,
    restoreArchivedSession,
    saveBuiltinTools,
    saveInstalledPluginConfig,
    saveInstalledPluginConnectorApiKey,
    saveMcpServer,
    savePromptPreset,
    saveProviderApiKey,
    saveProvider,
    savingMcpServerID,
    savingPromptPresetID,
    savingProviderID,
    savingPluginConnectorID,
    testProviderConnection,
    testingProviderID,
    selectedPromptPreset,
    selectedPromptUrlInstallIDs,
    setProviderAuthMethod,
    setPromptDraftLabelValue,
    setPromptPresetSelectionValue,
    setPromptUrlInstallSourceValue,
    selectPromptPreset,
    selectMcpServer,
    selectPlugin,
    selectionDraft,
    setInstalledPluginEnabled,
    setMcpServerDraftValue,
    setMcpToolPolicy,
    setPluginDraftAppApiKey,
    setPluginDraftConfigValue,
    setBuiltinToolEnabled,
    setPromptDraftValue,
    setProviderDraftValue,
    setSelectionDraftValue,
    togglePromptUrlInstallPrompt,
    startProviderAuthFlow,
    startNewMcpServer,
    cancelProviderAuthFlow,
    updatingPluginID,
  } = useSettingsPage({
    isBuiltinToolsPageOpen: leftSidebarView === "tools",
    isMcpServersPageOpen: leftSidebarView === "mcp",
    isPluginsPageOpen: leftSidebarView === "plugins",
    isPromptPresetEditorOpen: leftSidebarView === "prompts",
    onArchivedSessionRestored: async (session) => {
      await refreshWorkspaceFromDirectory(session.directory)
    },
    onMcpUpdated: refreshComposerMcp,
    onSkillsUpdated: refreshComposerSkills,
    onProviderModelsUpdated: refreshComposerModels,
  })

  const isCreatingSession = workbenchPaneStates.some((pane) => pane.isCreatingSession)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("code")
  const [activeBuiltinToolKind, setActiveBuiltinToolKind] = useState<BuiltinToolKindKey | null>(null)
  const [toolPermissionMode, setToolPermissionMode] = useState<ToolPermissionMode>("default")
  const [toolPermissionModeError, setToolPermissionModeError] = useState<string | null>(null)
  const [isSavingToolPermissionMode, setIsSavingToolPermissionMode] = useState(false)
  const firstPaneID = workbenchPaneStates[0]?.id ?? null
  const lastPaneID = workbenchPaneStates[workbenchPaneStates.length - 1]?.id ?? null
  const focusedWorkbenchPane = focusedPaneID ? workbenchPaneStateByID[focusedPaneID] ?? null : null
  const terminalSession = focusedWorkbenchPane?.activeSession ?? null
  const terminalSessionID = terminalSession && !isSideChatSession(terminalSession) ? terminalSession.id : null
  const activeRightSidebarView: RightSidebarView =
    rightSidebarView === "runtime" && !isAgentDebugTraceEnabled ? "changes" : rightSidebarView

  useEffect(() => {
    let cancelled = false

    async function loadToolPermissionMode() {
      try {
        const result = await window.desktop?.getToolPermissionMode?.()
        if (cancelled || !result) return
        setToolPermissionMode(result.mode)
        setToolPermissionModeError(null)
      } catch (error) {
        if (cancelled) return
        setToolPermissionModeError(getErrorMessage(error))
      }
    }

    void loadToolPermissionMode()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (rightSidebarView !== "runtime" || isAgentDebugTraceEnabled) return
    handleRightSidebarViewChange("changes")
  }, [handleRightSidebarViewChange, isAgentDebugTraceEnabled, rightSidebarView])

  async function handleToolPermissionModeChange(mode: ToolPermissionMode) {
    if (mode === toolPermissionMode || isSavingToolPermissionMode) return
    const previousMode = toolPermissionMode

    setToolPermissionMode(mode)
    setToolPermissionModeError(null)
    setIsSavingToolPermissionMode(true)

    try {
      const result = await window.desktop?.updateToolPermissionMode?.({ mode })
      setToolPermissionMode(result?.mode ?? mode)
    } catch (error) {
      setToolPermissionMode(previousMode)
      setToolPermissionModeError(getErrorMessage(error))
    } finally {
      setIsSavingToolPermissionMode(false)
    }
  }

  function handleInspectFileInSidebar(file: string | null, sessionID: string | null, paneID: string) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)
    handleActiveSessionDiffFileSelect(file, sessionID)
  }

  async function handleTurnDiffReview(_files: string[], sessionID: string | null, paneID: string) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)
    handleActiveSessionDiffFileSelect(null, sessionID)
    await handleActiveSessionDiffRefresh(sessionID)
  }

  async function handleTurnDiffRestore(diffs: SessionDiffFile[], sessionID: string | null, paneID: string) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)
    handleActiveSessionDiffFileSelect(null, sessionID)
    await handleActiveSessionDiffPatchesReverseApply(diffs, sessionID)
  }

  function handleLocalFileLinkOpen({
    paneID,
    target,
    workspaceDirectory,
  }: LocalFileLinkOpenInput) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)

    const workspaceRelativePath = workspaceDirectory
      ? resolveWorkspaceRelativePath(workspaceDirectory, target.path, platform)
      : null

    if (workspaceDirectory && workspaceRelativePath !== null) {
      void handleWorkspaceFileSelect(workspaceRelativePath, {
        linkedLineRange: target.lineRange ?? null,
        scopeDirectory: workspaceDirectory,
      })
      return
    }

    void openSystemLocalPath(target.path)
  }

  function handleInspectorViewChange(view: RightSidebarView) {
    if (view === "runtime" && !isAgentDebugTraceEnabled) return
    handleRightSidebarViewChange(view)
  }

  const windowShellClassName = [
    "window-shell",
    isDebugLineColorsEnabled ? "debug-line-colors" : "",
    isDebugUiRegionsEnabled ? "debug-ui-regions" : "",
    isWindowMaximized ? "is-maximized" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const isPromptEditorView = leftSidebarView === "prompts"
  const isGlobalSkillsView = leftSidebarView === "skills"
  const isMcpServersView = leftSidebarView === "mcp"
  const isPluginsView = leftSidebarView === "plugins"
  const isBuiltinToolsView = leftSidebarView === "tools"
  const isShellSidebarManagedView = isPromptEditorView || isGlobalSkillsView || isMcpServersView || isBuiltinToolsView
  const isFullSurfaceView = isPluginsView
  const placeholderWorkspaceMode: Exclude<WorkspaceMode, "code"> | null =
    leftSidebarView === "workspace" && workspaceMode !== "code" ? workspaceMode : null
  const windowControls = useMemo(
    () => <WindowChrome controlsRef={windowControlsRef} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />,
    [handleWindowAction, isWindowMaximized, windowControlsRef],
  )
  const workbenchWindowControls = useMemo(
    () => <WindowChrome controlsRef={null} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />,
    [handleWindowAction, isWindowMaximized],
  )
  const appShellClassName = isOpen ? "app-shell is-settings-open" : "app-shell"
  const effectiveAppShellStyle = isShellSidebarManagedView
    ? {
        ...appShellStyle,
        "--right-sidebar-display-width": "0px",
        "--right-sidebar-resizer-width": "0px",
      }
    : appShellStyle

  return (
    <div className={windowShellClassName}>
      <main ref={appShellRef} className={appShellClassName} style={effectiveAppShellStyle}>
        {isActivityRailVisible ? (
          <ActivityRail
            activeView={leftSidebarView}
            isSidebarCollapsed={isSidebarCollapsed}
            onViewChange={handleLeftSidebarViewChange}
            onToggleSidebar={handleSidebarToggle}
            side="left"
          />
        ) : null}

        {!isSidebarCollapsed && !isFullSurfaceView ? (
          <>
            <Sidebar
              activeSessionID={activeSession?.id ?? null}
              activeView={leftSidebarView}
              deletingSessionID={deletingSessionID}
              expandedFolderIDs={expandedFolderIDs}
              globalSkillsNavigatorProps={{
                creatingGlobalSkillName,
                creatingGlobalSkillDraftKind,
                creatingGlobalSkillParentDirectory,
                deletingGlobalSkillDirectory,
                expandedSkillPaths,
                globalSkillsRoot,
                globalSkillsTree,
                isCreateGlobalSkillDraftVisible,
                isCreatingGlobalSkill,
                isInstallingLocalSkill,
                isLoadingSkillsTree: isLoadingGlobalSkillsTree,
                renamingGlobalSkillDirectory,
                renamingGlobalSkillDraftDirectory,
                renamingGlobalSkillName,
                selectedGlobalSkillFilePath,
                onCreateGlobalSkill: handleCreateGlobalSkill,
                onCreateGlobalSkillDraftCancel: handleCreateGlobalSkillDraftCancel,
                onCreateGlobalSkillDraftChange: handleCreateGlobalSkillDraftChange,
                onCreateGlobalSkillDraftStart: handleCreateGlobalSkillDraftStart,
                onDeleteGlobalSkill: handleDeleteGlobalSkill,
                onGitInstallDialogOpen: handleGitInstallDialogOpen,
                onGlobalSkillDirectoryToggle: handleGlobalSkillDirectoryToggle,
                onGlobalSkillFileSelect: handleGlobalSkillFileSelect,
                onLocalInstallDialogOpen: handleLocalInstallDialogOpen,
                onMoveGlobalSkillDirectoryStart: handleMoveGlobalSkillDirectoryStart,
                onOpenGlobalSkillsFolder: handleOpenGlobalSkillsFolder,
                onRenameGlobalSkill: handleRenameGlobalSkill,
                onRenameGlobalSkillDraftCancel: handleRenameGlobalSkillDraftCancel,
                onRenameGlobalSkillDraftChange: handleRenameGlobalSkillDraftChange,
                onRenameGlobalSkillDraftStart: handleRenameGlobalSkillDraftStart,
              }}
              hoveredFolderID={hoveredFolderID}
              isCreatingProject={isCreatingProject}
              isCreatingSession={isCreatingSession}
              isSettingsOpen={isOpen}
              mcpServersSidebarProps={{
                activeMcpServerID,
                deletingMcpServerID,
                isImportingMcpConfigJson,
                mcpServers,
                savingMcpServerID,
                onMcpServerSelect: selectMcpServer,
                onStartNewMcpServer: startNewMcpServer,
              }}
              promptPresetsSidebarProps={{
                deletingPromptPresetID,
                isCreatingPromptPreset,
                isInstallingPromptUrlPrompts,
                isPreviewingPromptUrlInstall,
                isPromptDirty,
                promptRoot,
                promptPresets,
                promptPresetSelection,
                selectedPromptPreset,
                onCreatePromptPreset: createPromptPreset,
                onDeletePromptPreset: deletePromptPreset,
                onOpenPromptFolder: openPromptFolder,
                onPromptPresetSelect: selectPromptPreset,
                onPromptUrlInstallDialogOpen: openPromptUrlInstallDialog,
              }}
              showSidebarToggleButton={!isActivityRailVisible}
              builtinToolsSidebarProps={{
                activeToolKind: activeBuiltinToolKind,
                builtinTools,
                onActiveToolKindChange: setActiveBuiltinToolKind,
              }}
              projectRowRefs={projectRowRefs}
              runningSessionIDs={runningSessionIDs}
              selectedFolderID={selectedFolderID}
              sessionCanvasUnreadBySession={sessionCanvasUnreadBySession}
              visibleCanvasSessionIDs={visibleCanvasSessionIDs}
              workspaces={workspaces}
              workspaceMode={workspaceMode}
              pinnedWorkspaceIDs={pinnedWorkspaceIDs}
              onHoveredFolderChange={setHoveredFolderID}
              onOpenSettings={openSettings}
              onProjectArchiveSessions={handleProjectArchiveSessions}
              onProjectCreateSession={handleProjectCreateSession}
              onProjectClick={handleProjectClick}
              onProjectOpenInExplorer={handleProjectOpenInExplorer}
              onProjectPin={handleProjectPin}
              onProjectRemove={handleProjectRemove}
              onSessionDelete={handleSessionDelete}
              onSessionSelect={handleSessionSelect}
              onSidebarAction={handleSidebarAction}
              onToggleSidebar={handleSidebarToggle}
              onViewChange={handleLeftSidebarViewChange}
              onWorkspaceModeChange={setWorkspaceMode}
            />

            <SidebarResizer
              isSidebarResizing={isSidebarResizing}
              maxWidth={sidebarWidthBounds.max}
              minWidth={sidebarWidthBounds.min}
              side="left"
              sidebarWidth={sidebarWidth}
              onKeyDown={handleSidebarResizerKeyDown}
              onPointerDown={handleSidebarResizerPointerDown}
            />
          </>
        ) : null}

        <section
          className={
            isFullSurfaceView
              ? "canvas is-workbench is-full-surface"
              : placeholderWorkspaceMode
                ? "canvas is-workbench is-workspace-mode-placeholder"
                : "canvas is-workbench"
          }
        >
          {isPromptEditorView ? (
            <PromptPresetsPage
              deletingPromptPresetID={deletingPromptPresetID}
              hideNavigator
              isCreatingPromptPreset={isCreatingPromptPreset}
              isLoadingPromptPreset={isLoadingPromptPreset}
              isLoadingPrompts={isLoadingPrompts}
              isInstallingPromptUrlPrompts={isInstallingPromptUrlPrompts}
              isPreviewingPromptUrlInstall={isPreviewingPromptUrlInstall}
              isPromptDirty={isPromptDirty}
              isPromptUrlInstallDialogOpen={isPromptUrlInstallDialogOpen}
              isSavingPromptPresetSelection={isSavingPromptPresetSelection}
              message={message}
              promptDraftContent={promptDraftContent}
              promptDraftLabel={promptDraftLabel}
              promptLoadError={promptLoadError}
              promptRoot={promptRoot}
              promptPresets={promptPresets}
              promptPresetSelection={promptPresetSelection}
              promptUrlInstallMessage={promptUrlInstallMessage}
              promptUrlInstallPreview={promptUrlInstallPreview}
              promptUrlInstallSource={promptUrlInstallSource}
              resettingPromptPresetID={resettingPromptPresetID}
              savingPromptPresetID={savingPromptPresetID}
              selectedPromptPreset={selectedPromptPreset}
              selectedPromptUrlInstallIDs={selectedPromptUrlInstallIDs}
              windowControls={windowControls}
              onCreatePromptPreset={createPromptPreset}
              onDeletePromptPreset={deletePromptPreset}
              onDismissMessage={dismissMessage}
              onInstallPromptsFromUrl={installPromptsFromUrl}
              onPromptUrlInstallDialogClose={closePromptUrlInstallDialog}
              onPromptUrlInstallDialogOpen={openPromptUrlInstallDialog}
              onPromptUrlInstallPromptToggle={togglePromptUrlInstallPrompt}
              onPromptUrlInstallSourceChange={setPromptUrlInstallSourceValue}
              onPromptDraftChange={setPromptDraftValue}
              onPromptDraftLabelChange={setPromptDraftLabelValue}
              onPromptPresetSelect={selectPromptPreset}
              onPromptPresetSelectionChange={setPromptPresetSelectionValue}
              onPreviewPromptUrlInstall={previewPromptUrlInstall}
              onOpenPromptFolder={openPromptFolder}
              onResetPromptPreset={resetPromptPreset}
              onSavePromptPreset={savePromptPreset}
            />
          ) : isGlobalSkillsView ? (
            <GlobalSkillsPage
              creatingGlobalSkillName={creatingGlobalSkillName}
              creatingGlobalSkillDraftKind={creatingGlobalSkillDraftKind}
              creatingGlobalSkillParentDirectory={creatingGlobalSkillParentDirectory}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              expandedSkillPaths={expandedSkillPaths}
              globalSkillFolderOptions={globalSkillFolderOptions}
              globalSkillsMessage={globalSkillsMessage}
              globalSkillsRoot={globalSkillsRoot}
              globalSkillsTree={globalSkillsTree}
              hideNavigator
              gitInstallTargetDirectory={gitInstallTargetDirectory}
              gitInstallMessage={gitInstallMessage}
              gitInstallPreview={gitInstallPreview}
              gitInstallSource={gitInstallSource}
              isCreateGlobalSkillDraftVisible={isCreateGlobalSkillDraftVisible}
              isCreatingGlobalSkill={isCreatingGlobalSkill}
              isDirty={isDirtyGlobalSkillFile}
              isGitInstallDialogOpen={isGitInstallDialogOpen}
              isInstallingGitSkills={isInstallingGitSkills}
              isInstallingLocalSkill={isInstallingLocalSkill}
              isLocalInstallDialogOpen={isLocalInstallDialogOpen}
              isLoadingFile={isLoadingGlobalSkillFile}
              isLoadingSkillsTree={isLoadingGlobalSkillsTree}
              isMoveGlobalSkillDialogOpen={isMoveGlobalSkillDialogOpen}
              isMovingGlobalSkillDirectory={isMovingGlobalSkillDirectory}
              isPreviewingGitInstall={isPreviewingGitInstall}
              isSavingFile={isSavingGlobalSkillFile}
              localInstallTargetDirectory={localInstallTargetDirectory}
              moveGlobalSkillTargetOptions={moveGlobalSkillTargetOptions}
              movingGlobalSkillDirectory={movingGlobalSkillDirectory}
              movingGlobalSkillTargetDirectory={movingGlobalSkillTargetDirectory}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedFileContent={selectedGlobalSkillFileContent}
              selectedFilePath={selectedGlobalSkillFilePath}
              selectedGitInstallSkillIDs={selectedGitInstallSkillIDs}
              selectedSkillDirectoryName={selectedGlobalSkillDirectory?.name ?? null}
              windowControls={windowControls}
              onChange={handleGlobalSkillDraftChange}
              onCreateGlobalSkill={handleCreateGlobalSkill}
              onCreateGlobalSkillDraftCancel={handleCreateGlobalSkillDraftCancel}
              onCreateGlobalSkillDraftChange={handleCreateGlobalSkillDraftChange}
              onCreateGlobalSkillDraftStart={handleCreateGlobalSkillDraftStart}
              onDelete={handleDeleteGlobalSkill}
              onDeleteGlobalSkill={handleDeleteGlobalSkill}
              onGitInstallDialogClose={handleGitInstallDialogClose}
              onGitInstallDialogOpen={handleGitInstallDialogOpen}
              onGitInstallSkillToggle={handleGitInstallSkillToggle}
              onGitInstallSourceChange={handleGitInstallSourceChange}
              onGitInstallTargetDirectoryChange={handleGitInstallTargetDirectoryChange}
              onGlobalSkillDirectoryToggle={handleGlobalSkillDirectoryToggle}
              onGlobalSkillFileSelect={handleGlobalSkillFileSelect}
              onInstallGitSkills={handleInstallGitSkills}
              onInstallLocalSkillFile={handleInstallLocalSkillFile}
              onLocalInstallDialogClose={handleLocalInstallDialogClose}
              onLocalInstallDialogOpen={handleLocalInstallDialogOpen}
              onLocalInstallTargetDirectoryChange={handleLocalInstallTargetDirectoryChange}
              onMoveGlobalSkillDirectory={handleMoveGlobalSkillDirectory}
              onMoveGlobalSkillDirectoryCancel={handleMoveGlobalSkillDirectoryCancel}
              onMoveGlobalSkillDirectoryStart={handleMoveGlobalSkillDirectoryStart}
              onMoveGlobalSkillTargetDirectoryChange={handleMoveGlobalSkillTargetDirectoryChange}
              onOpenGlobalSkillsFolder={handleOpenGlobalSkillsFolder}
              onPreviewGitSkillInstall={handlePreviewGitSkillInstall}
              onRenameGlobalSkill={handleRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={handleRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={handleRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={handleRenameGlobalSkillDraftStart}
              onSave={handleSaveGlobalSkillFile}
            />
          ) : isMcpServersView ? (
            <McpServersPage
              activeMcpServerID={activeMcpServerID}
              activeMcpServerDiagnostic={activeMcpServerDiagnostic}
              deletingMcpServerID={deletingMcpServerID}
              hideNavigator
              isLoading={isLoading}
              loadError={loadError}
              mcpServerDraft={mcpServerDraft}
              mcpServers={mcpServers}
              message={message}
              savingMcpServerID={savingMcpServerID}
              isImportingMcpConfigJson={isImportingMcpConfigJson}
              windowControls={windowControls}
              onDeleteMcpServer={deleteMcpServer}
              onDismissMessage={dismissMessage}
              onImportMcpConfigJson={importMcpConfigJson}
              onMcpServerDraftChange={setMcpServerDraftValue}
              onMcpToolPolicyChange={setMcpToolPolicy}
              onMcpServerSelect={selectMcpServer}
              onSaveMcpServer={saveMcpServer}
              onStartNewMcpServer={startNewMcpServer}
            />
          ) : isPluginsView ? (
            <PluginsPage
              activePluginID={activePluginID}
              deletingPluginID={deletingPluginID}
              diagnosingPluginConnectorID={diagnosingPluginConnectorID}
              diagnosingPluginID={diagnosingPluginID}
              installingPluginID={installingPluginID}
              installedPlugins={installedPlugins}
              isLoading={isLoadingPlugins}
              loadError={pluginsError}
              message={message}
              pluginCatalog={pluginCatalog}
              pluginConnectorStatuses={pluginConnectorStatuses}
              pluginDiagnostics={pluginDiagnostics}
              pluginDraft={pluginDraft}
              updatingPluginID={updatingPluginID}
              windowControls={windowControls}
              onDeleteInstalledPlugin={deleteInstalledPlugin}
              onDeleteInstalledPluginConnectorApiKey={deleteInstalledPluginConnectorApiKey}
              onDiagnoseInstalledPlugin={diagnoseInstalledPlugin}
              onDiagnoseInstalledPluginConnector={diagnoseInstalledPluginConnector}
              onDismissMessage={dismissMessage}
              onInstallPlugin={installPlugin}
              onPluginDraftAppApiKeyChange={setPluginDraftAppApiKey}
              onPluginDraftConfigChange={setPluginDraftConfigValue}
              onPluginSelect={selectPlugin}
              onSaveInstalledPluginConnectorApiKey={saveInstalledPluginConnectorApiKey}
              onSaveInstalledPluginConfig={saveInstalledPluginConfig}
              onSetInstalledPluginEnabled={setInstalledPluginEnabled}
              savingPluginConnectorID={savingPluginConnectorID}
            />
          ) : isBuiltinToolsView ? (
            <BuiltinToolsPage
              activeToolKind={activeBuiltinToolKind}
              builtinTools={builtinTools}
              builtinToolsError={builtinToolsError}
              hideNavigator
              isBuiltinToolSelectionDirty={isBuiltinToolSelectionDirty}
              isLoadingBuiltinTools={isLoadingBuiltinTools}
              isSavingBuiltinTools={isSavingBuiltinTools}
              message={message}
              windowControls={windowControls}
              onActiveToolKindChange={setActiveBuiltinToolKind}
              onBuiltinToolToggle={setBuiltinToolEnabled}
              onDismissMessage={dismissMessage}
              onResetBuiltinTools={resetBuiltinTools}
              onSaveBuiltinTools={saveBuiltinTools}
            />
          ) : placeholderWorkspaceMode ? (
            <WorkspaceModeCanvasPlaceholder
              mode={placeholderWorkspaceMode}
              windowControls={isRightSidebarCollapsed ? windowControls : null}
            />
          ) : (
            <>
              <WorkbenchShell
                composerRefreshVersion={composerRefreshVersion}
                firstPaneID={firstPaneID}
                assistantTraceVisibility={assistantTraceVisibility}
                isActivityRailVisible={isActivityRailVisible}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isSavingToolPermissionMode={isSavingToolPermissionMode}
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                isSidebarCollapsed={isSidebarCollapsed}
                lastPaneID={lastPaneID}
                dockviewLayout={dockviewLayout}
                windowControls={isRightSidebarCollapsed ? workbenchWindowControls : null}
                paneStateByID={workbenchPaneStateByID}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                toolPermissionMode={toolPermissionMode}
                toolPermissionModeError={toolPermissionModeError}
                workspaces={workspaces}
                onCloseCreateSessionTab={handleCloseCreateSessionTab}
                onCloseSessionTab={handleCanvasSessionTabClose}
                onCreateSessionSubmit={handleCreateSessionSubmit}
                onCreateSessionWorkspaceChange={handleCreateSessionWorkspaceChange}
                onActiveDockviewChange={handleDockviewActiveChange}
                onFocusPane={handlePaneFocus}
                onInspectFileInSidebar={handleInspectFileInSidebar}
                onCommandsReady={handleWorkbenchDockviewCommandsReady}
                onLayoutChange={setDockviewLayout}
                onLocalFileLinkOpen={handleLocalFileLinkOpen}
                onCreateSideChatTab={handleCreateSideChatTab}
                onDeleteSideChatTab={handleDeleteSideChatTab}
                onOpenCreateSessionTab={handleOpenCreateSessionTab}
                onOpenSideChat={handleOpenSideChat}
                onPermissionRequestResponse={handlePermissionRequestResponse}
                onApproveProposedPlan={handleApproveProposedPlan}
                onToolPermissionModeChange={handleToolPermissionModeChange}
                onAskUserQuestionAnswer={handleAskUserQuestionAnswer}
                onPickComposerAttachments={handlePickComposerAttachments}
                onPasteComposerImageAttachments={handlePasteComposerImageAttachments}
                onRemoveComposerAttachment={handleRemoveComposerAttachment}
                onSelectCreateSessionTab={handleCreateSessionTabSelect}
                onSelectSideChatTab={handleSelectSideChatTab}
                onSelectSessionTab={handleCanvasSessionTabSelect}
                onCancelSend={handleCancelSend}
                onPlanModeToggle={handlePlanModeToggle}
                onSend={handleSend}
                onSessionModelSelectionChange={handleSessionModelSelectionChange}
                onSetDraft={setDraftForTab}
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
                onTurnDiffRestore={handleTurnDiffRestore}
                onTurnDiffReview={handleTurnDiffReview}
                onTurnDiffSummaryHydrate={handleTurnDiffSummaryHydrate}
              />
            </>
          )}
        </section>

        {!isFullSurfaceView && !isShellSidebarManagedView && !isRightSidebarCollapsed ? (
          <>
            <SidebarResizer
              isSidebarResizing={isRightSidebarResizing}
              maxWidth={rightSidebarWidthBounds.max}
              minWidth={rightSidebarWidthBounds.min}
              side="right"
              sidebarWidth={rightSidebarWidth}
              onKeyDown={handleRightSidebarResizerKeyDown}
              onPointerDown={handleRightSidebarResizerPointerDown}
            />

            {placeholderWorkspaceMode ? (
              <WorkspaceModeRightPlaceholder mode={placeholderWorkspaceMode} windowControls={windowControls} />
            ) : (
              <RightSidebar
                activeWorkspaceFileScopeDirectory={activeWorkspaceFileScopeDirectory}
                activeWorkspaceFileScopeName={activeWorkspaceFileScopeName}
                activeWorkspaceFileState={activeWorkspaceFileState}
                activeSessionDirectory={activeSessionDirectory}
                activePreviewState={activePreviewState}
                activeSession={activeSession}
                activeSessionDiff={activeSessionDiff}
                activeSessionDiffState={activeSessionDiffState}
                activeSessionRuntimeDebug={activeSessionRuntimeDebug}
                activeSessionRuntimeDebugState={activeSessionRuntimeDebugState}
                canInsertWorkspaceFileCommentsIntoDraft={canInsertWorkspaceFileCommentsIntoDraft}
                selectedDiffFile={activeSessionSelectedDiffFile}
                activeView={activeRightSidebarView}
                isRuntimeViewVisible={isAgentDebugTraceEnabled}
                onDiffFileSelect={handleActiveSessionDiffFileSelect}
                onDiffFileRestore={handleActiveSessionDiffFileRestore}
                onPreviewAddComment={handlePreviewAddComment}
                onPreviewBack={handlePreviewBack}
                onPreviewDraftUrlChange={handlePreviewDraftUrlChange}
                onPreviewForward={handlePreviewForward}
                onPreviewModeChange={handlePreviewModeChange}
                onPreviewOpen={handlePreviewOpen}
                onPreviewOpenExternal={handlePreviewOpenExternal}
                onPreviewOpenUrl={handlePreviewOpenUrl}
                onPreviewReload={handlePreviewReload}
                onWorkspaceFileCommentCancel={handleWorkspaceFileCommentCancel}
                onWorkspaceFileCommentChange={handleWorkspaceFileCommentChange}
                onWorkspaceFileCommentConfirm={handleWorkspaceFileCommentConfirm}
                onWorkspaceFileCommentStart={handleWorkspaceFileCommentStart}
                onWorkspaceFileQueryChange={handleWorkspaceFileQueryChange}
                onWorkspaceFileSelect={handleWorkspaceFileSelect}
                onRuntimeRefresh={handleActiveSessionRuntimeDebugRefresh}
                onViewChange={handleInspectorViewChange}
                renderTerminalArea={(togglePortalTarget) => (
                  <TerminalAreaHost
                    brandTheme={brandTheme}
                    colorMode={colorMode}
                    currentSessionID={terminalSessionID}
                    storageKey={WORKBENCH_TERMINAL_STORAGE_KEY}
                    togglePortalTarget={togglePortalTarget}
                  />
                )}
                windowControls={windowControls}
              />
            )}
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
          appearanceConfigError={appearanceConfigError}
          appearanceConfigPath={appearanceConfigPath}
          appearanceConfigPreview={appearanceConfigPreview}
          appearanceOverrides={appearanceOverrides}
          appearanceTokenValues={appearanceTokenValues}
          assistantTraceVisibility={assistantTraceVisibility}
          brandTheme={brandTheme}
          colorMode={colorMode}
          isActivityRailVisible={isActivityRailVisible}
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isDebugLineColorsEnabled={isDebugLineColorsEnabled}
          isDebugUiRegionsEnabled={isDebugUiRegionsEnabled}
          isLoading={isLoading}
          isLoadingArchivedSessions={isLoadingArchivedSessions}
          isOpen={isOpen}
          isRefreshingProviderCatalog={isRefreshingProviderCatalog}
          loadError={loadError}
          mcpServerDraft={mcpServerDraft}
          mcpServers={mcpServers}
          message={message}
          models={models}
          providerDrafts={providerDrafts}
          restoringArchivedSessionID={restoringArchivedSessionID}
          savingMcpServerID={savingMcpServerID}
          savingProviderID={savingProviderID}
          testingProviderID={testingProviderID}
          selectionDraft={selectionDraft}
          onBrandThemeChange={handleBrandThemeChange}
          onColorModeChange={handleColorModeChange}
          onActivityRailVisibilityChange={handleActivityRailVisibilityChange}
          onAppearancePaletteReset={handleAppearancePaletteReset}
          onAppearanceTokenChange={handleAppearanceTokenChange}
          onAppearanceTokenReset={handleAppearanceTokenReset}
          onAssistantTraceVisibilityChange={handleAssistantTraceVisibilityChange}
          onAgentDebugTraceChange={handleAgentDebugTraceChange}
          onDebugLineColorsChange={handleDebugLineColorsChange}
          onDebugUiRegionsChange={handleDebugUiRegionsChange}
          onClose={closeSettings}
          onDismissMessage={dismissMessage}
          onDeleteArchivedSession={deleteArchivedSession}
          onDeleteMcpServer={deleteMcpServer}
          onDeleteProvider={deleteProvider}
          onDeleteProviderAuthSession={deleteProviderAuthSession}
          onMcpServerDraftChange={setMcpServerDraftValue}
          onMcpToolPolicyChange={setMcpToolPolicy}
          onMcpServerSelect={selectMcpServer}
          onProviderAuthMethodChange={setProviderAuthMethod}
          onProviderDraftChange={setProviderDraftValue}
          onRefreshProviderCatalog={refreshProviderCatalog}
          onLoadArchivedSessions={loadArchivedSessions}
          onRestoreArchivedSession={restoreArchivedSession}
          onSaveMcpServer={saveMcpServer}
          onSaveProviderApiKey={saveProviderApiKey}
          onSaveProvider={saveProvider}
          onSelectionChange={setSelectionDraftValue}
          onTestProviderConnection={testProviderConnection}
          onStartProviderAuthFlow={startProviderAuthFlow}
          onStartNewMcpServer={startNewMcpServer}
          onCancelProviderAuthFlow={cancelProviderAuthFlow}
        />
      </main>
    </div>
  )
}
