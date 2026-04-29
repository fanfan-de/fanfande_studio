import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  ActivityRail,
  CanvasRegionUtilityMenu,
  GlobalSkillsCanvas,
  RightSidebar,
  SettingsPage,
  Sidebar,
  SidebarResizer,
  WindowChrome,
} from "./app/components"
import { TerminalAreaHost } from "./app/terminal/TerminalAreaHost"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
import { useSettingsPage } from "./app/use-settings-page"
import { clamp } from "./app/utils"
import { getSplitNode, type WorkbenchSplitAxis } from "./app/workbench/core"
import { WorkbenchShell } from "./app/workbench/WorkbenchShell"

const MIN_WORKBENCH_PANE_WIDTH = 320
const MIN_WORKBENCH_PANE_HEIGHT = 240
const WORKBENCH_PANE_DROP_TOP_THRESHOLD = 10
const WORKBENCH_PANE_DROP_BOTTOM_THRESHOLD = 108
const WORKBENCH_PANE_DROP_SIDE_THRESHOLD = 144
const WORKBENCH_TERMINAL_STORAGE_KEY = "desktop.terminal.workspace.v3:workbench"

type PaneDropPosition = "center" | "left" | "right" | "top" | "bottom"

interface DraggedPaneTab {
  sourcePaneID: string
  tabKey: string
}

interface PaneDropTarget {
  paneID: string
  position: PaneDropPosition
}

interface ActivePaneResize {
  axis: WorkbenchSplitAxis
  combinedSize: number
  containerOrigin: number
  leftIndex: number
  splitID: string
  totalSize: number
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
    canInsertPreviewCommentsIntoDraft,
    canInsertWorkspaceFileCommentsIntoDraft,
    composerRefreshVersion,
    deletingSessionID,
    expandedFolderID,
    handleCancelSend,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffFileRestore,
    handleActiveSessionRuntimeDebugRefresh,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenSideChat,
    handleOpenCreateSessionTab,
    handlePaneFocus,
    handleSplitResize: handleWorkbenchPaneResize,
    handlePaneTabDrop: handleWorkbenchTabDrop,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handlePreviewAddComment,
    handlePreviewDeleteComment,
    handlePreviewDraftUrlChange,
    handlePreviewInsertCommentsIntoDraft,
    handlePreviewModeChange,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewReload,
    handleWorkspaceFileCommentCancel,
    handleWorkspaceFileCommentChange,
    handleWorkspaceFileCommentConfirm,
    handleWorkspaceFileCommentStart,
    handleWorkspaceFileCommentSubmit,
    handleWorkspaceFileQueryChange,
    handleWorkspaceFileSelect,
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSidebarAction,
    focusedPaneID,
    hoveredFolderID,
    isCreatingProject,
    isResolvingPermissionRequest,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    projectRowRefs,
    refreshComposerMcp,
    refreshComposerModels,
    refreshComposerSkills,
    refreshWorkspaceFromDirectory,
    rightSidebarView,
    runningSessionIDs,
    selectedWorkspace,
    selectedFolderID,
    setDraftForTab,
    setHoveredFolderID,
    workbenchLayout,
    workbenchPaneStateByID,
    workbenchPaneStates,
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
    builtinTools,
    builtinToolsError,
    catalog,
    closeSettings,
    deleteArchivedSession,
    deleteMcpServer,
    deleteProviderAuthSession,
    deletingArchivedSessionID,
    deletingMcpServerID,
    deletingPromptPresetID,
    deletingProviderID,
    dismissMessage,
    isCreatingPromptPreset,
    isLoading,
    isLoadingBuiltinTools,
    isLoadingPromptPreset,
    isLoadingPrompts,
    isLoadingArchivedSessions,
    isOpen,
    isPromptDirty,
    isBuiltinToolSelectionDirty,
    isSystemPromptPresetDirty,
    isPlanModePromptPresetDirty,
    isRefreshingProviderCatalog,
    isSavingPromptPresetSelection,
    isSavingBuiltinTools,
    isSavingSelection,
    loadError,
    mcpServerDraft,
    mcpServers,
    message,
    models,
    openSettings,
    promptDraftLabel,
    promptDraftContent,
    promptLoadError,
    promptPresets,
    promptPresetSelection,
    providerDrafts,
    createPromptPreset,
    deletePromptPreset,
    refreshProviderCatalog,
    resetBuiltinTools,
    resetPromptPreset,
    resettingPromptPresetID,
    restoringArchivedSessionID,
    savedSelection,
    restoreArchivedSession,
    saveBuiltinTools,
    saveMcpServer,
    savePromptPreset,
    savePromptPresetSelection,
    savingPromptPresetSelectionField,
    saveProviderApiKey,
    saveProvider,
    saveSelection,
    savingMcpServerID,
    savingPromptPresetID,
    savingProviderID,
    testProviderConnection,
    testingProviderID,
    selectedPromptPreset,
    setProviderAuthMethod,
    setPromptDraftLabelValue,
    setPromptPresetSelectionValue,
    selectPromptPreset,
    selectMcpServer,
    selectionDraft,
    setMcpServerDraftValue,
    setBuiltinToolEnabled,
    setPromptDraftValue,
    setProviderDraftValue,
    setSelectionDraftValue,
    startProviderAuthFlow,
    startNewMcpServer,
    cancelProviderAuthFlow,
  } = useSettingsPage({
    onArchivedSessionRestored: async (session) => {
      await refreshWorkspaceFromDirectory(session.directory)
    },
    onMcpUpdated: refreshComposerMcp,
    onProviderModelsUpdated: refreshComposerModels,
  })

  const isCreatingSession = workbenchPaneStates.some((pane) => pane.isCreatingSession)
  const paneRefs = useRef<Record<string, HTMLElement | null>>({})
  const workbenchPanesRef = useRef<HTMLDivElement | null>(null)
  const draggedPaneTabRef = useRef<DraggedPaneTab | null>(null)
  const [draggedPaneTab, setDraggedPaneTab] = useState<DraggedPaneTab | null>(null)
  const [paneDropTarget, setPaneDropTarget] = useState<PaneDropTarget | null>(null)
  const [activePaneResize, setActivePaneResize] = useState<ActivePaneResize | null>(null)
  const [activityRailTerminalSlot, setActivityRailTerminalSlot] = useState<HTMLDivElement | null>(null)
  const firstPaneID = workbenchPaneStates[0]?.id ?? null
  const lastPaneID = workbenchPaneStates[workbenchPaneStates.length - 1]?.id ?? null
  const focusedWorkbenchPane = focusedPaneID ? workbenchPaneStateByID[focusedPaneID] ?? null : null
  const terminalWorkspaceDirectory = focusedWorkbenchPane?.workspace?.directory ?? selectedWorkspace?.directory ?? null

  function handleInspectFileInSidebar(file: string | null, sessionID: string | null, paneID: string) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)
    handleActiveSessionDiffFileSelect(file, sessionID)
  }

  useEffect(() => {
    if (!draggedPaneTab && !paneDropTarget) return

    const hasSourcePane = workbenchPaneStates.some((pane) => pane.id === draggedPaneTab?.sourcePaneID)
    const hasTargetPane = workbenchPaneStates.some((pane) => pane.id === paneDropTarget?.paneID)
    if (draggedPaneTab && !hasSourcePane) {
      draggedPaneTabRef.current = null
      setDraggedPaneTab(null)
    }
    if (paneDropTarget && !hasTargetPane) {
      setPaneDropTarget(null)
    }
  }, [draggedPaneTab, paneDropTarget, workbenchPaneStates])

  useEffect(() => {
    if (!activePaneResize) return
    const resizeState = activePaneResize

    function handlePointerMove(event: PointerEvent) {
      const pointerPosition = resizeState.axis === "horizontal" ? event.clientX : event.clientY
      const minPaneSize = resizeState.axis === "horizontal" ? MIN_WORKBENCH_PANE_WIDTH : MIN_WORKBENCH_PANE_HEIGHT
      const nextLeftSizePx = clamp(
        pointerPosition - resizeState.containerOrigin,
        minPaneSize,
        resizeState.combinedSize - minPaneSize,
      )
      const nextLeftSize = resizeState.totalSize * (nextLeftSizePx / resizeState.combinedSize)
      const nextRightSize = resizeState.totalSize - nextLeftSize

      handleWorkbenchPaneResize(resizeState.splitID, resizeState.leftIndex, nextLeftSize, nextRightSize)
    }

    function stopPaneResize() {
      setActivePaneResize(null)
    }

    document.body.classList.add("is-resizing-workbench-pane")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopPaneResize)
    window.addEventListener("pointercancel", stopPaneResize)

    return () => {
      document.body.classList.remove("is-resizing-workbench-pane")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPaneResize)
      window.removeEventListener("pointercancel", stopPaneResize)
    }
  }, [activePaneResize, handleWorkbenchPaneResize])

  function handleRegisterPane(paneID: string, node: HTMLElement | null) {
    if (node) {
      paneRefs.current[paneID] = node
      return
    }

    delete paneRefs.current[paneID]
  }

  function handlePaneTabDragStart(sourcePaneID: string, tabKey: string) {
    const nextDraggedPaneTab = {
      sourcePaneID,
      tabKey,
    }
    draggedPaneTabRef.current = nextDraggedPaneTab
    setDraggedPaneTab(nextDraggedPaneTab)
    setPaneDropTarget(null)
  }

  function handlePaneTabDragEnd() {
    draggedPaneTabRef.current = null
    setDraggedPaneTab(null)
    setPaneDropTarget(null)
  }

  function handlePaneDropTargetChange(paneID: string, position: PaneDropPosition | null) {
    if (!draggedPaneTab) return
    setPaneDropTarget(position ? { paneID, position } : null)
  }

  function handlePaneTabDrop(paneID: string, position: PaneDropPosition) {
    const draggedTab = draggedPaneTabRef.current
    if (!draggedTab) return

    handleWorkbenchTabDrop({
      position,
      sourcePaneID: draggedTab.sourcePaneID,
      tabKey: draggedTab.tabKey,
      targetPaneID: paneID,
    })
    draggedPaneTabRef.current = null
    setDraggedPaneTab(null)
    setPaneDropTarget(null)
  }

  function getPaneDropTargetFromPoint(clientX: number, clientY: number): PaneDropTarget | null {
    const paneRects = Object.entries(paneRefs.current).flatMap(([paneID, paneElement]) => {
      if (!paneElement) return []

      return [{
        paneElement,
        paneID,
        rect: paneElement.getBoundingClientRect(),
      }]
    })

    const workbenchRect = workbenchPanesRef.current?.getBoundingClientRect()
    if (workbenchRect) {
      const topRowPanes = paneRects.filter(({ paneElement }) => paneElement.dataset.isTopRow === "true")
      const topBandBottom = workbenchRect.top + WORKBENCH_PANE_DROP_TOP_THRESHOLD
      if (
        topRowPanes.length > 0 &&
        clientX >= workbenchRect.left &&
        clientX <= workbenchRect.right &&
        clientY >= workbenchRect.top &&
        clientY <= topBandBottom
      ) {
        const topPane = topRowPanes
          .map(({ paneID, rect }) => ({
            distance:
              clientX < rect.left
                ? rect.left - clientX
                : clientX > rect.right
                  ? clientX - rect.right
                  : 0,
            paneID,
          }))
          .sort((left, right) => left.distance - right.distance)[0]
        if (topPane) {
          return { paneID: topPane.paneID, position: "top" }
        }
      }
    }

    for (const { paneID, rect } of paneRects) {
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        continue
      }

      const width = Math.max(rect.width, 1)
      const height = Math.max(rect.height, 1)
      const offsetX = clientX - rect.left
      const offsetY = clientY - rect.top
      const topThreshold = Math.min(WORKBENCH_PANE_DROP_TOP_THRESHOLD, height / 2)
      const bottomThreshold = Math.min(WORKBENCH_PANE_DROP_BOTTOM_THRESHOLD, height / 2)
      const sideThreshold = Math.min(WORKBENCH_PANE_DROP_SIDE_THRESHOLD, width / 2)
      const position: PaneDropPosition =
        offsetY <= topThreshold
          ? "top"
          : offsetY >= height - bottomThreshold
            ? "bottom"
            : offsetX <= sideThreshold
              ? "left"
              : offsetX >= width - sideThreshold
                ? "right"
                : "center"

      return { paneID, position }
    }

    return null
  }

  function handlePaneTabPointerDragMove(clientX: number, clientY: number) {
    setPaneDropTarget(getPaneDropTargetFromPoint(clientX, clientY))
  }

  function handlePaneTabPointerDrop(clientX: number, clientY: number) {
    const dropTarget = getPaneDropTargetFromPoint(clientX, clientY)
    const draggedTab = draggedPaneTabRef.current
    if (!draggedTab || !dropTarget) {
      draggedPaneTabRef.current = null
      setDraggedPaneTab(null)
      setPaneDropTarget(null)
      return
    }

    handleWorkbenchTabDrop({
      position: dropTarget.position,
      sourcePaneID: draggedTab.sourcePaneID,
      tabKey: draggedTab.tabKey,
      targetPaneID: dropTarget.paneID,
    })
    draggedPaneTabRef.current = null
    setDraggedPaneTab(null)
    setPaneDropTarget(null)
  }

  function handleWorkbenchPaneResizerPointerDown(event: ReactPointerEvent<HTMLDivElement>, splitID: string, leftIndex: number) {
    if (event.button !== 0) return

    const split = getSplitNode(workbenchLayout, splitID)
    if (!split) return

    const leftNodeID = split.children[leftIndex]
    const rightNodeID = split.children[leftIndex + 1]
    if (!leftNodeID || !rightNodeID) return

    const leftPaneElement = paneRefs.current[leftNodeID]
    const rightPaneElement = paneRefs.current[rightNodeID]
    if (!leftPaneElement || !rightPaneElement) return

    const leftRect = leftPaneElement.getBoundingClientRect()
    const rightRect = rightPaneElement.getBoundingClientRect()
    const axis = split.axis
    const combinedSize = axis === "horizontal" ? leftRect.width + rightRect.width : leftRect.height + rightRect.height
    const minPaneSize = axis === "horizontal" ? MIN_WORKBENCH_PANE_WIDTH : MIN_WORKBENCH_PANE_HEIGHT
    if (combinedSize <= minPaneSize * 2) return

    event.preventDefault()
    setActivePaneResize({
      axis,
      combinedSize,
      containerOrigin: axis === "horizontal" ? leftRect.left : leftRect.top,
      leftIndex,
      splitID,
      totalSize: (split.sizes[leftIndex] ?? 0) + (split.sizes[leftIndex + 1] ?? 0),
    })
  }

  const windowShellClassName = [
    "window-shell",
    isDebugLineColorsEnabled ? "debug-line-colors" : "",
    isDebugUiRegionsEnabled ? "debug-ui-regions" : "",
    isWindowMaximized ? "is-maximized" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const windowControls = (
    <WindowChrome controlsRef={windowControlsRef} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />
  )

  return (
    <div className={windowShellClassName}>
      <main ref={appShellRef} className="app-shell" style={appShellStyle}>
        {isActivityRailVisible ? (
          <ActivityRail
            bottomSlotRef={leftSidebarView === "skills" ? undefined : setActivityRailTerminalSlot}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleSidebarToggle}
            side="left"
          />
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
              runningSessionIDs={runningSessionIDs}
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
              maxWidth={sidebarWidthBounds.max}
              minWidth={sidebarWidthBounds.min}
              side="left"
              sidebarWidth={sidebarWidth}
              onKeyDown={handleSidebarResizerKeyDown}
              onPointerDown={handleSidebarResizerPointerDown}
            />
          </>
        ) : null}

        <section className={leftSidebarView === "skills" ? "canvas" : "canvas is-workbench"}>
          {leftSidebarView === "skills" ? (
            <div className="canvas-top-stack">
              <CanvasRegionUtilityMenu
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                label="Global Skills"
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
                showLeftSidebarToggleButton={!isActivityRailVisible && isSidebarCollapsed}
                windowControls={isRightSidebarCollapsed ? windowControls : null}
              />
            </div>
          ) : null}
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
          ) : (
            <>
              <WorkbenchShell
                composerRefreshVersion={composerRefreshVersion}
                draggedTabKey={draggedPaneTab?.tabKey ?? null}
                firstPaneID={firstPaneID}
                assistantTraceVisibility={assistantTraceVisibility}
                isActivityRailVisible={isActivityRailVisible}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                isSidebarCollapsed={isSidebarCollapsed}
                lastPaneID={lastPaneID}
                layout={workbenchLayout}
                paneDropTarget={paneDropTarget}
                paneRefs={paneRefs}
                workbenchPanesRef={workbenchPanesRef}
                windowControls={isRightSidebarCollapsed ? windowControls : null}
                paneStateByID={workbenchPaneStateByID}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                workspaces={workspaces}
                onCloseCreateSessionTab={handleCloseCreateSessionTab}
                onCloseSessionTab={handleCanvasSessionTabClose}
                onCreateSessionSubmit={handleCreateSessionSubmit}
                onCreateSessionWorkspaceChange={handleCreateSessionWorkspaceChange}
                onFocusPane={handlePaneFocus}
                onInspectFileInSidebar={handleInspectFileInSidebar}
                onOpenCreateSessionTab={handleOpenCreateSessionTab}
                onOpenSideChat={handleOpenSideChat}
                onPaneDropTargetChange={handlePaneDropTargetChange}
                onPaneResizerPointerDown={handleWorkbenchPaneResizerPointerDown}
                onPaneTabDragEnd={handlePaneTabDragEnd}
                onPaneTabDragStart={handlePaneTabDragStart}
                onPaneTabPointerDragMove={handlePaneTabPointerDragMove}
                onPaneTabPointerDrop={handlePaneTabPointerDrop}
                onPaneTabDrop={handlePaneTabDrop}
                onPermissionRequestResponse={handlePermissionRequestResponse}
                onPickComposerAttachments={handlePickComposerAttachments}
                onRegisterPane={handleRegisterPane}
                onRemoveComposerAttachment={handleRemoveComposerAttachment}
                onSelectCreateSessionTab={handleCreateSessionTabSelect}
                onSelectSessionTab={handleCanvasSessionTabSelect}
                onCancelSend={handleCancelSend}
                onSend={handleSend}
                onSetDraft={setDraftForTab}
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
              />
              <TerminalAreaHost
                brandTheme={brandTheme}
                collapsedTogglePortalTarget={isActivityRailVisible ? activityRailTerminalSlot : null}
                colorMode={colorMode}
                currentWorkspaceDirectory={terminalWorkspaceDirectory}
                defaultCwd={agentDefaultDirectory}
                storageKey={WORKBENCH_TERMINAL_STORAGE_KEY}
              />
            </>
          )}
        </section>

        {!isRightSidebarCollapsed ? (
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

            <RightSidebar
              activeWorkspaceFileScopeDirectory={activeWorkspaceFileScopeDirectory}
              activeWorkspaceFileScopeName={activeWorkspaceFileScopeName}
              activeWorkspaceFileState={activeWorkspaceFileState}
              activeSessionDirectory={leftSidebarView === "skills" ? null : activeSessionDirectory}
              activePreviewState={activePreviewState}
              activeSession={leftSidebarView === "skills" ? null : activeSession}
              activeSessionDiff={leftSidebarView === "skills" ? null : activeSessionDiff}
              activeSessionDiffState={leftSidebarView === "skills" ? undefined : activeSessionDiffState}
              activeSessionRuntimeDebug={leftSidebarView === "skills" ? null : activeSessionRuntimeDebug}
              activeSessionRuntimeDebugState={leftSidebarView === "skills" ? undefined : activeSessionRuntimeDebugState}
              canInsertPreviewCommentsIntoDraft={canInsertPreviewCommentsIntoDraft}
              canInsertWorkspaceFileCommentsIntoDraft={canInsertWorkspaceFileCommentsIntoDraft}
              previewWorkspaceDirectory={selectedWorkspace?.directory ?? null}
              previewWorkspaceName={selectedWorkspace?.name ?? null}
              selectedDiffFile={leftSidebarView === "skills" ? null : activeSessionSelectedDiffFile}
              activeView={rightSidebarView}
              onDiffFileSelect={handleActiveSessionDiffFileSelect}
              onDiffFileRestore={handleActiveSessionDiffFileRestore}
              onPreviewAddComment={handlePreviewAddComment}
              onPreviewDeleteComment={handlePreviewDeleteComment}
              onPreviewDraftUrlChange={handlePreviewDraftUrlChange}
              onPreviewInsertCommentsIntoDraft={handlePreviewInsertCommentsIntoDraft}
              onPreviewModeChange={handlePreviewModeChange}
              onPreviewOpen={handlePreviewOpen}
              onPreviewOpenExternal={handlePreviewOpenExternal}
              onPreviewReload={handlePreviewReload}
              onWorkspaceFileCommentCancel={handleWorkspaceFileCommentCancel}
              onWorkspaceFileCommentChange={handleWorkspaceFileCommentChange}
              onWorkspaceFileCommentConfirm={handleWorkspaceFileCommentConfirm}
              onWorkspaceFileCommentStart={handleWorkspaceFileCommentStart}
              onWorkspaceFileCommentSubmit={handleWorkspaceFileCommentSubmit}
              onWorkspaceFileQueryChange={handleWorkspaceFileQueryChange}
              onWorkspaceFileSelect={handleWorkspaceFileSelect}
              onRuntimeRefresh={handleActiveSessionRuntimeDebugRefresh}
              onViewChange={handleRightSidebarViewChange}
              windowControls={windowControls}
            />
          </>
        ) : null}

        <SettingsPage
          activeMcpServerID={activeMcpServerID}
          activeMcpServerDiagnostic={activeMcpServerDiagnostic}
          archivedSessions={archivedSessions}
          archivedSessionsError={archivedSessionsError}
          builtinTools={builtinTools}
          builtinToolsError={builtinToolsError}
          catalog={catalog}
          deletingArchivedSessionID={deletingArchivedSessionID}
          deletingMcpServerID={deletingMcpServerID}
          deletingPromptPresetID={deletingPromptPresetID}
          deletingProviderID={deletingProviderID}
          appearanceConfigError={appearanceConfigError}
          appearanceConfigPath={appearanceConfigPath}
          appearanceConfigPreview={appearanceConfigPreview}
          appearanceOverrides={appearanceOverrides}
          appearanceTokenValues={appearanceTokenValues}
          assistantTraceVisibility={assistantTraceVisibility}
          brandTheme={brandTheme}
          colorMode={colorMode}
          isCreatingPromptPreset={isCreatingPromptPreset}
          isActivityRailVisible={isActivityRailVisible}
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isDebugLineColorsEnabled={isDebugLineColorsEnabled}
          isDebugUiRegionsEnabled={isDebugUiRegionsEnabled}
          isLoading={isLoading}
          isLoadingBuiltinTools={isLoadingBuiltinTools}
          isLoadingPromptPreset={isLoadingPromptPreset}
          isLoadingPrompts={isLoadingPrompts}
          isLoadingArchivedSessions={isLoadingArchivedSessions}
          isOpen={isOpen}
          isPromptDirty={isPromptDirty}
          isBuiltinToolSelectionDirty={isBuiltinToolSelectionDirty}
          isSystemPromptPresetDirty={isSystemPromptPresetDirty}
          isPlanModePromptPresetDirty={isPlanModePromptPresetDirty}
          isRefreshingProviderCatalog={isRefreshingProviderCatalog}
          isSavingPromptPresetSelection={isSavingPromptPresetSelection}
          isSavingBuiltinTools={isSavingBuiltinTools}
          isSavingSelection={isSavingSelection}
          loadError={loadError}
          mcpServerDraft={mcpServerDraft}
          mcpServers={mcpServers}
          message={message}
          models={models}
          promptDraftLabel={promptDraftLabel}
          promptDraftContent={promptDraftContent}
          promptLoadError={promptLoadError}
          promptPresets={promptPresets}
          promptPresetSelection={promptPresetSelection}
          providerDrafts={providerDrafts}
          onCreatePromptPreset={createPromptPreset}
          onDeletePromptPreset={deletePromptPreset}
          resettingPromptPresetID={resettingPromptPresetID}
          restoringArchivedSessionID={restoringArchivedSessionID}
          savedSelection={savedSelection}
          savingMcpServerID={savingMcpServerID}
          savingPromptPresetID={savingPromptPresetID}
          savingPromptPresetSelectionField={savingPromptPresetSelectionField}
          savingProviderID={savingProviderID}
          testingProviderID={testingProviderID}
          selectedPromptPreset={selectedPromptPreset}
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
          onBuiltinToolToggle={setBuiltinToolEnabled}
          onDeleteArchivedSession={deleteArchivedSession}
          onDeleteMcpServer={deleteMcpServer}
          onDeleteProviderAuthSession={deleteProviderAuthSession}
          onMcpServerDraftChange={setMcpServerDraftValue}
          onPromptDraftLabelChange={setPromptDraftLabelValue}
          onPromptDraftChange={setPromptDraftValue}
          onPromptPresetSelectionChange={setPromptPresetSelectionValue}
          onSavePromptPresetSelection={savePromptPresetSelection}
          onPromptPresetSelect={selectPromptPreset}
          onMcpServerSelect={selectMcpServer}
          onProviderAuthMethodChange={setProviderAuthMethod}
          onProviderDraftChange={setProviderDraftValue}
          onRefreshProviderCatalog={refreshProviderCatalog}
          onResetBuiltinTools={resetBuiltinTools}
          onResetPromptPreset={resetPromptPreset}
          onRestoreArchivedSession={restoreArchivedSession}
          onSaveBuiltinTools={saveBuiltinTools}
          onSaveMcpServer={saveMcpServer}
          onSavePromptPreset={savePromptPreset}
          onSaveProviderApiKey={saveProviderApiKey}
          onSaveProvider={saveProvider}
          onSaveSelection={saveSelection}
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
