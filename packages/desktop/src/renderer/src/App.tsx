import { Fragment, memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ActivityRail,
  CanvasRegionUtilityMenu,
  Composer,
  CreateSessionCanvas,
  GlobalSkillsCanvas,
  PaneTabBar,
  RightSidebar,
  SessionCanvasTopMenu,
  SettingsPage,
  Sidebar,
  SidebarToggleButton,
  SidebarResizer,
  ThreadView,
  WindowChrome,
} from "./app/components"
import { ComposerUtilityBar } from "./app/ComposerUtilityBar"
import { TerminalPanel } from "./app/terminal/TerminalPanel"
import { TerminalPanelToggleButton } from "./app/terminal/TerminalPanelToggleButton"
import { useTerminalWorkspace } from "./app/terminal/use-terminal-workspace"
import { clamp } from "./app/utils"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
import { useProjectComposer } from "./app/use-project-composer"
import { useSettingsPage } from "./app/use-settings-page"
import { getSplitNode, type WorkbenchSplitAxis } from "./app/workbench/core"

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

const PANE_DROP_PREVIEW_INSET = 12
const PANE_DROP_PREVIEW_GAP = 12
const PANE_DROP_PREVIEW_HALF_SPAN = `calc(50% - ${PANE_DROP_PREVIEW_INSET + PANE_DROP_PREVIEW_GAP / 2}px)`
const PANE_DROP_PREVIEW_FULL_SPAN = `calc(100% - ${PANE_DROP_PREVIEW_INSET * 2}px)`
const PANE_DROP_PREVIEW_TRAILING_OFFSET = `calc(50% + ${PANE_DROP_PREVIEW_GAP / 2}px)`

function getPaneDropPreviewStyles(position: PaneDropPosition): { current: CSSProperties; incoming: CSSProperties } {
  switch (position) {
    case "left":
      return {
        current: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: PANE_DROP_PREVIEW_TRAILING_OFFSET,
          width: PANE_DROP_PREVIEW_HALF_SPAN,
          height: PANE_DROP_PREVIEW_FULL_SPAN,
        },
        incoming: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_HALF_SPAN,
          height: PANE_DROP_PREVIEW_FULL_SPAN,
        },
      }
    case "right":
      return {
        current: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_HALF_SPAN,
          height: PANE_DROP_PREVIEW_FULL_SPAN,
        },
        incoming: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: PANE_DROP_PREVIEW_TRAILING_OFFSET,
          width: PANE_DROP_PREVIEW_HALF_SPAN,
          height: PANE_DROP_PREVIEW_FULL_SPAN,
        },
      }
    case "top":
      return {
        current: {
          top: PANE_DROP_PREVIEW_TRAILING_OFFSET,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_FULL_SPAN,
          height: PANE_DROP_PREVIEW_HALF_SPAN,
        },
        incoming: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_FULL_SPAN,
          height: PANE_DROP_PREVIEW_HALF_SPAN,
        },
      }
    case "bottom":
      return {
        current: {
          top: `${PANE_DROP_PREVIEW_INSET}px`,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_FULL_SPAN,
          height: PANE_DROP_PREVIEW_HALF_SPAN,
        },
        incoming: {
          top: PANE_DROP_PREVIEW_TRAILING_OFFSET,
          left: `${PANE_DROP_PREVIEW_INSET}px`,
          width: PANE_DROP_PREVIEW_FULL_SPAN,
          height: PANE_DROP_PREVIEW_HALF_SPAN,
        },
      }
    case "center":
      return {
        current: {
          inset: 0,
        },
        incoming: {
          top: "50%",
          left: "50%",
          width: 0,
          height: 0,
          opacity: 0,
        },
      }
  }
}

export function App() {
  const {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    handleActivityRailVisibilityChange,
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
    rightSidebarWidth,
    sidebarWidth,
    windowControlsRef,
  } = useDesktopShell()

  const {
    activeSession,
    activeSessionDirectory,
    activeSessionDiff,
    activeSessionDiffState,
    activeSessionSelectedDiffFile,
    composerRefreshVersion,
    deletingSessionID,
    expandedFolderID,
    handleComposerPermissionModeToggle,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionTabSelect,
    handleActiveSessionDiffFileSelect,
    handleActiveSessionDiffRefresh,
    handleCloseCreateSessionTab,
    handleCreateSessionSubmit,
    handleCreateSessionWorkspaceChange,
    handleLeftSidebarViewChange,
    handleOpenCreateSessionTab,
    handlePaneFocus,
    handleSplitResize: handleWorkbenchPaneResize,
    handlePaneTabDrop: handleWorkbenchTabDrop,
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

  return (
    <div className={windowShellClassName}>
      <WindowChrome controlsRef={windowControlsRef} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />

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

        <section className={leftSidebarView === "skills" ? "canvas" : "canvas is-workbench"}>
          {leftSidebarView === "skills" ? (
            <div className="canvas-top-stack">
              <CanvasRegionUtilityMenu
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                label="Global Skills"
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
                showLeftSidebarToggleButton={!isActivityRailVisible && isSidebarCollapsed}
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
              <WorkbenchTree
                composerRefreshVersion={composerRefreshVersion}
                draggedTabKey={draggedPaneTab?.tabKey ?? null}
                firstPaneID={firstPaneID}
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
                onPaneDropTargetChange={handlePaneDropTargetChange}
                onPaneResizerPointerDown={handleWorkbenchPaneResizerPointerDown}
                onPaneTabDragEnd={handlePaneTabDragEnd}
                onPaneTabDragStart={handlePaneTabDragStart}
                onPaneTabPointerDragMove={handlePaneTabPointerDragMove}
                onPaneTabPointerDrop={handlePaneTabPointerDrop}
                onPaneTabDrop={handlePaneTabDrop}
                onPermissionRequestResponse={handlePermissionRequestResponse}
                onPickComposerAttachments={handlePickComposerAttachments}
                onToggleComposerPermissionMode={handleComposerPermissionModeToggle}
                onRegisterPane={handleRegisterPane}
                onRemoveComposerAttachment={handleRemoveComposerAttachment}
                onSelectCreateSessionTab={handleCreateSessionTabSelect}
                onSelectSessionTab={handleCanvasSessionTabSelect}
                onSend={handleSend}
                onSetDraft={setDraftForTab}
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
              />
              <TerminalArea
                collapsedTogglePortalTarget={isActivityRailVisible ? activityRailTerminalSlot : null}
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
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isDebugLineColorsEnabled={isDebugLineColorsEnabled}
          isDebugUiRegionsEnabled={isDebugUiRegionsEnabled}
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
          onAgentDebugTraceChange={handleAgentDebugTraceChange}
          onDebugLineColorsChange={handleDebugLineColorsChange}
          onDebugUiRegionsChange={handleDebugUiRegionsChange}
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

type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
type WorkbenchLayout = AgentWorkspaceState["workbenchLayout"]
type WorkbenchPaneState = AgentWorkspaceState["workbenchPaneStates"][number]
type WorkbenchPaneStateByID = AgentWorkspaceState["workbenchPaneStateByID"]
type PaneTabDescriptor =
  | {
      key: string
      kind: "session"
      sessionID: string
      title: string
    }
  | {
      key: string
      kind: "create-session"
      createSessionTabID: string
      title: string
    }

function getTopRowRightmostPaneID(layout: WorkbenchLayout): string | null {
  function visit(nodeId: string | null): string | null {
    if (!nodeId) return null

    const node = layout.nodes[nodeId]
    if (!node) return null
    if (node.kind === "group") return node.id

    if (node.axis === "horizontal") {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const match = visit(node.children[index] ?? null)
        if (match) return match
      }
      return null
    }

    return visit(node.children[0] ?? null)
  }

  return visit(layout.rootId)
}

interface WorkbenchTreeProps {
  composerRefreshVersion: number
  draggedTabKey: string | null
  firstPaneID: string | null
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isRightSidebarCollapsed: boolean
  isSidebarCollapsed: boolean
  lastPaneID: string | null
  layout: WorkbenchLayout
  paneDropTarget: PaneDropTarget | null
  paneRefs: { current: Record<string, HTMLElement | null> }
  workbenchPanesRef: { current: HTMLDivElement | null }
  paneStateByID: WorkbenchPaneStateByID
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  workspaces: AgentWorkspaceState["workspaces"]
  onCloseCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onCloseSessionTab: (sessionID: string, paneID?: string) => void
  onCreateSessionSubmit: (createSessionTabID?: string | null, paneID?: string) => Promise<void>
  onCreateSessionWorkspaceChange: (workspaceID: string, createSessionTabID?: string | null) => void
  onFocusPane: (paneID: string) => void
  onInspectFileInSidebar: (file: string | null, sessionID: string | null, paneID: string) => void
  onOpenCreateSessionTab: (preferredWorkspaceID?: string | null, paneID?: string) => void
  onPaneDropTargetChange: (paneID: string, position: PaneDropPosition | null) => void
  onPaneResizerPointerDown: (event: ReactPointerEvent<HTMLDivElement>, splitID: string, leftIndex: number) => void
  onPaneTabDragEnd: () => void
  onPaneTabDragStart: (paneID: string, tabKey: string) => void
  onPaneTabPointerDragMove: (clientX: number, clientY: number) => void
  onPaneTabPointerDrop: (clientX: number, clientY: number) => void
  onPaneTabDrop: (paneID: string, position: PaneDropPosition) => void
  onPermissionRequestResponse: AgentWorkspaceState["handlePermissionRequestResponse"]
  onPickComposerAttachments: AgentWorkspaceState["handlePickComposerAttachments"]
  onToggleComposerPermissionMode: AgentWorkspaceState["handleComposerPermissionModeToggle"]
  onRegisterPane: (paneID: string, node: HTMLElement | null) => void
  onRemoveComposerAttachment: (path: string, tabKey?: string | null) => void
  onSelectCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onSelectSessionTab: (sessionID: string, paneID?: string) => void
  onSend: AgentWorkspaceState["handleSend"]
  onSetDraft: (tabKey: string, value: string) => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

function WorkbenchTree(props: WorkbenchTreeProps) {
  if (!props.layout.rootId) {
    return <div ref={props.workbenchPanesRef} className="workbench-panes" />
  }

  const hasMultiplePanes = props.firstPaneID !== null && props.lastPaneID !== null && props.firstPaneID !== props.lastPaneID
  const topRowRightmostPaneID = getTopRowRightmostPaneID(props.layout) ?? props.lastPaneID

  return (
    <div ref={props.workbenchPanesRef} className={hasMultiplePanes ? "workbench-panes has-multiple" : "workbench-panes"}>
      <WorkbenchNodeView {...props} lastPaneID={topRowRightmostPaneID} nodeId={props.layout.rootId} />
    </div>
  )
}

interface WorkbenchNodeViewProps extends WorkbenchTreeProps {
  flexSize?: number
  isTopRow?: boolean
  nodeId: string
}

function WorkbenchNodeView({
  flexSize,
  isTopRow = true,
  nodeId,
  ...props
}: WorkbenchNodeViewProps) {
  const node = props.layout.nodes[nodeId]
  if (!node) return null

  const style: CSSProperties | undefined = flexSize !== undefined
    ? {
        flexBasis: 0,
        flexGrow: flexSize,
      }
    : undefined

  if (node.kind === "group") {
    const pane = props.paneStateByID[node.id]
    if (!pane) return null

    return (
      <PaneSurface
        composerRefreshVersion={props.composerRefreshVersion}
        draggedTabKey={props.draggedTabKey}
        dropTargetPosition={props.paneDropTarget?.paneID === pane.id ? props.paneDropTarget.position : null}
        isResolvingPermissionRequest={props.isResolvingPermissionRequest}
        isAgentDebugTraceEnabled={props.isAgentDebugTraceEnabled}
        isTopRow={isTopRow}
        leadingAccessory={
          node.id === props.firstPaneID && !props.isActivityRailVisible && props.isSidebarCollapsed ? (
            <SidebarToggleButton isSidebarCollapsed={true} onToggleSidebar={props.onToggleLeftSidebar} side="left" variant="top-menu" />
          ) : null
        }
        pane={pane}
        permissionRequestActionError={props.permissionRequestActionError}
        permissionRequestActionRequestID={props.permissionRequestActionRequestID}
        style={style}
        trailingAccessory={
          node.id === props.lastPaneID ? (
            <SidebarToggleButton
              isSidebarCollapsed={props.isRightSidebarCollapsed}
              onToggleSidebar={props.onToggleRightSidebar}
              side="right"
              variant="top-menu"
            />
          ) : null
        }
        workspaces={props.workspaces}
        onCloseCreateSessionTab={props.onCloseCreateSessionTab}
        onCloseSessionTab={props.onCloseSessionTab}
        onCreateSessionSubmit={props.onCreateSessionSubmit}
        onCreateSessionWorkspaceChange={props.onCreateSessionWorkspaceChange}
        onFocusPane={props.onFocusPane}
        onInspectFileInSidebar={props.onInspectFileInSidebar}
        onOpenCreateSessionTab={props.onOpenCreateSessionTab}
        onPaneDropTargetChange={props.onPaneDropTargetChange}
        onPaneTabDragEnd={props.onPaneTabDragEnd}
        onPaneTabDragStart={props.onPaneTabDragStart}
        onPaneTabPointerDragMove={props.onPaneTabPointerDragMove}
        onPaneTabPointerDrop={props.onPaneTabPointerDrop}
        onPaneTabDrop={props.onPaneTabDrop}
        onPermissionRequestResponse={props.onPermissionRequestResponse}
        onPickComposerAttachments={props.onPickComposerAttachments}
        onToggleComposerPermissionMode={props.onToggleComposerPermissionMode}
        onRegisterPane={props.onRegisterPane}
        onRemoveComposerAttachment={props.onRemoveComposerAttachment}
        onSelectCreateSessionTab={props.onSelectCreateSessionTab}
        onSelectSessionTab={props.onSelectSessionTab}
        onSend={props.onSend}
        onSetDraft={props.onSetDraft}
      />
    )
  }

  return (
    <div
      ref={(element) => props.onRegisterPane(node.id, element)}
      className={`workbench-split is-${node.axis}`}
      style={style}
    >
      {node.children.map((childId, index) => {
        const nextChildId = node.children[index + 1]
        const childIsTopRow = isTopRow && (node.axis === "horizontal" || index === 0)

        return (
          <Fragment key={childId}>
            <WorkbenchNodeView {...props} flexSize={node.sizes[index]} isTopRow={childIsTopRow} nodeId={childId} />
            {nextChildId ? (
              <div
                className={node.axis === "horizontal" ? "workbench-pane-resizer is-horizontal" : "workbench-pane-resizer is-vertical"}
                data-testid={node.id === props.layout.rootId ? `workbench-pane-resizer-${index}` : `workbench-pane-resizer-${node.id}-${index}`}
                role="separator"
                aria-label="Resize workbench panes"
                aria-orientation={node.axis === "horizontal" ? "vertical" : "horizontal"}
                onPointerDown={(event) => props.onPaneResizerPointerDown(event, node.id, index)}
              />
            ) : null}
          </Fragment>
        )
      })}
    </div>
  )
}

interface PaneSurfaceProps {
  composerRefreshVersion: number
  draggedTabKey: string | null
  dropTargetPosition: PaneDropPosition | null
  isResolvingPermissionRequest: boolean
  isAgentDebugTraceEnabled: boolean
  isTopRow: boolean
  leadingAccessory: ReactNode
  pane: WorkbenchPaneState
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  style?: CSSProperties
  trailingAccessory: ReactNode
  workspaces: AgentWorkspaceState["workspaces"]
  onCloseCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onCloseSessionTab: (sessionID: string, paneID?: string) => void
  onCreateSessionSubmit: (createSessionTabID?: string | null, paneID?: string) => Promise<void>
  onCreateSessionWorkspaceChange: (workspaceID: string, createSessionTabID?: string | null) => void
  onFocusPane: (paneID: string) => void
  onInspectFileInSidebar: (file: string | null, sessionID: string | null, paneID: string) => void
  onOpenCreateSessionTab: (preferredWorkspaceID?: string | null, paneID?: string) => void
  onPaneDropTargetChange: (paneID: string, position: PaneDropPosition | null) => void
  onPaneTabDragEnd: () => void
  onPaneTabDragStart: (paneID: string, tabKey: string) => void
  onPaneTabPointerDragMove: (clientX: number, clientY: number) => void
  onPaneTabPointerDrop: (clientX: number, clientY: number) => void
  onPaneTabDrop: (paneID: string, position: PaneDropPosition) => void
  onPermissionRequestResponse: AgentWorkspaceState["handlePermissionRequestResponse"]
  onPickComposerAttachments: AgentWorkspaceState["handlePickComposerAttachments"]
  onToggleComposerPermissionMode: AgentWorkspaceState["handleComposerPermissionModeToggle"]
  onRegisterPane: (paneID: string, node: HTMLElement | null) => void
  onRemoveComposerAttachment: (path: string, tabKey?: string | null) => void
  onSelectCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onSelectSessionTab: (sessionID: string, paneID?: string) => void
  onSend: AgentWorkspaceState["handleSend"]
  onSetDraft: (tabKey: string, value: string) => void
}

const PaneSurface = memo(function PaneSurface({
  composerRefreshVersion,
  draggedTabKey,
  dropTargetPosition,
  isResolvingPermissionRequest,
  isAgentDebugTraceEnabled,
  isTopRow,
  leadingAccessory,
  pane,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  style,
  trailingAccessory,
  workspaces,
  onCloseCreateSessionTab,
  onCloseSessionTab,
  onCreateSessionSubmit,
  onCreateSessionWorkspaceChange,
  onFocusPane,
  onInspectFileInSidebar,
  onOpenCreateSessionTab,
  onPaneDropTargetChange,
  onPaneTabDragEnd,
  onPaneTabDragStart,
  onPaneTabPointerDragMove,
  onPaneTabPointerDrop,
  onPaneTabDrop,
  onPermissionRequestResponse,
  onPickComposerAttachments,
  onToggleComposerPermissionMode,
  onRegisterPane,
  onRemoveComposerAttachment,
  onSelectCreateSessionTab,
  onSelectSessionTab,
  onSend,
  onSetDraft,
}: PaneSurfaceProps) {
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const splitPreviewPosition = draggedTabKey && dropTargetPosition && dropTargetPosition !== "center" ? dropTargetPosition : null
  const splitPreviewStyles = splitPreviewPosition ? getPaneDropPreviewStyles(splitPreviewPosition) : null

  useEffect(() => {
    const threadColumn = threadColumnRef.current
    if (!threadColumn) return
    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [pane.activeSession?.id, pane.activeTurns, pane.pendingPermissionRequests.length, permissionRequestActionRequestID])

  const composer = useProjectComposer({
    attachmentPaths: pane.composerAttachments.map((attachment) => attachment.path),
    projectID: pane.composerProjectID,
    refreshToken: composerRefreshVersion,
  })

  return (
    <section
      ref={(node) => onRegisterPane(pane.id, node)}
      className={pane.isFocused ? "workbench-pane is-focused" : "workbench-pane"}
      data-is-top-row={isTopRow ? "true" : "false"}
      data-pane-id={pane.id}
      style={style}
      onPointerDownCapture={() => onFocusPane(pane.id)}
    >
      <div className={splitPreviewPosition ? `workbench-pane-stage pane-drop-preview is-${splitPreviewPosition}` : "workbench-pane-stage"}>
        <div className={splitPreviewPosition ? "workbench-pane-live-region pane-drop-preview-current" : "workbench-pane-live-region"} style={splitPreviewStyles?.current}>
          <PaneTabBar
            activeTabKey={pane.activeTabKey}
            draggedTabKey={draggedTabKey}
            hasMergePreview={draggedTabKey !== null && dropTargetPosition === "center"}
            isFocused={pane.isFocused}
            isTopRow={isTopRow}
            leadingAccessory={leadingAccessory}
            tabs={pane.tabs as PaneTabDescriptor[]}
            onCloseCreateSessionTab={(createSessionTabID) => onCloseCreateSessionTab(createSessionTabID, pane.id)}
            onCloseSessionTab={(sessionID) => onCloseSessionTab(sessionID, pane.id)}
            onFocus={() => onFocusPane(pane.id)}
            onOpenCreateSessionTab={() => onOpenCreateSessionTab(pane.workspace?.id ?? null, pane.id)}
            onTabDragEnd={onPaneTabDragEnd}
            onTabDragStart={(tabKey) => onPaneTabDragStart(pane.id, tabKey)}
            onTabPointerDragMove={onPaneTabPointerDragMove}
            onTabPointerDrop={onPaneTabPointerDrop}
            onSelectCreateSessionTab={(createSessionTabID) => onSelectCreateSessionTab(createSessionTabID, pane.id)}
            onSelectSessionTab={(sessionID) => onSelectSessionTab(sessionID, pane.id)}
            trailingAccessory={trailingAccessory}
          />
          <SessionCanvasTopMenu
            contextLabel={pane.contextLabel}
            contextTitle={pane.contextTitle}
            gitProjectID={pane.projectID}
            gitDirectory={pane.workspace?.directory ?? null}
            mcpOptions={composer.mcpOptions}
            selectedMcpServerIDs={composer.selectedMcpServerIDs}
            selectedMcpServerLabel={composer.selectedMcpLabel}
            onMcpServerToggle={composer.handleMcpToggle}
            skillOptions={composer.skillOptions}
            selectedSkillIDs={composer.selectedSkillIDs}
            selectedSkillLabel={composer.selectedSkillLabel}
            onSkillToggle={composer.handleSkillToggle}
          />
          {pane.createSessionTabID ? (
            <>
              <CreateSessionCanvas
                isCreatingSession={pane.isCreatingSession}
                selectedWorkspaceID={pane.createSessionWorkspaceID}
                workspaces={workspaces}
                onWorkspaceChange={(workspaceID) => onCreateSessionWorkspaceChange(workspaceID, pane.createSessionTabID)}
              />
              <div className="composer-stack">
                <Composer
                  attachments={pane.composerAttachments}
                  attachmentButtonTitle={composer.attachmentButtonTitle}
                  attachmentDisabledReason={composer.attachmentDisabledReason}
                  attachmentError={composer.attachmentError}
                  canSend={Boolean(pane.createSessionWorkspaceID)}
                  draft={pane.draft}
                  hasPendingPermissionRequests={false}
                  isSending={pane.isSending || pane.isCreatingSession}
                  modelOptions={composer.modelOptions}
                  selectedModel={composer.selectedModel}
                  selectedModelLabel={composer.selectedModelLabel}
                  unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
                  onDraftChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onModelChange={composer.handleModelChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onSend={() =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      createSessionTabID: pane.createSessionTabID,
                      paneID: pane.id,
                      selectedSkillIDs: composer.selectedSkillIDs,
                      tabKey: pane.tabKey,
                      waitForPendingModelSelection: composer.awaitPendingModelSelection,
                    })
                  }
                />
                <ComposerUtilityBar
                  contextWindow={composer.contextWindow}
                  gitDirectory={pane.workspace?.directory ?? null}
                  gitProjectID={pane.projectID}
                  permissionMode={pane.composerPermissionMode}
                  onPermissionModeToggle={() => pane.tabKey && onToggleComposerPermissionMode(pane.tabKey)}
                  usage={null}
                />
              </div>
            </>
          ) : (
            <>
              <ThreadView
                activeSession={pane.activeSession}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                pendingPermissionRequests={pane.pendingPermissionRequests}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                activeTurns={pane.activeTurns}
                threadColumnRef={threadColumnRef}
                onFileChangeSelect={(file) => onInspectFileInSidebar(file, pane.sessionID, pane.id)}
                onPermissionRequestResponse={onPermissionRequestResponse}
              />
              <div className="composer-stack">
                <Composer
                  attachments={pane.composerAttachments}
                  attachmentButtonTitle={composer.attachmentButtonTitle}
                  attachmentDisabledReason={composer.attachmentDisabledReason}
                  attachmentError={composer.attachmentError}
                  canSend={Boolean(pane.activeSession)}
                  draft={pane.draft}
                  hasPendingPermissionRequests={pane.pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
                  isSending={pane.isSending}
                  modelOptions={composer.modelOptions}
                  selectedModel={composer.selectedModel}
                  selectedModelLabel={composer.selectedModelLabel}
                  unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
                  onDraftChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onModelChange={composer.handleModelChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onSend={() =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      paneID: pane.id,
                      selectedSkillIDs: composer.selectedSkillIDs,
                      sessionID: pane.sessionID,
                      tabKey: pane.tabKey,
                      waitForPendingModelSelection: composer.awaitPendingModelSelection,
                    })
                  }
                />
                <ComposerUtilityBar
                  contextWindow={composer.contextWindow}
                  gitDirectory={pane.workspace?.directory ?? null}
                  gitProjectID={pane.projectID}
                  permissionMode={pane.composerPermissionMode}
                  onPermissionModeToggle={() => pane.tabKey && onToggleComposerPermissionMode(pane.tabKey)}
                  usage={pane.activeSessionContextUsage}
                />
              </div>
            </>
          )}
        </div>
        {splitPreviewStyles ? <div className="workbench-pane-incoming-preview pane-drop-preview-incoming" style={splitPreviewStyles.incoming} aria-hidden="true" /> : null}
      </div>
      {draggedTabKey ? (
        <div className={isTopRow ? "pane-drop-targets is-top-row" : "pane-drop-targets"} aria-hidden="true">
          {(
            [
              ["top", "Drop tab to split above"],
              ["left", "Drop tab to split left"],
              ["center", "Drop tab into pane"],
              ["right", "Drop tab to split right"],
              ["bottom", "Drop tab to split below"],
            ] as const
          ).map(([position, label]) => (
            <div
              key={position}
              className={dropTargetPosition === position ? `pane-drop-target is-active is-${position}` : `pane-drop-target is-${position}`}
              data-pane-drop-position={position}
              data-pane-id={pane.id}
              data-testid={`pane-drop-${position}`}
              aria-label={label}
              onDragEnter={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPaneDropTargetChange(pane.id, position)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPaneDropTargetChange(pane.id, position)
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPaneTabDrop(pane.id, position)
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
})

interface TerminalAreaProps {
  collapsedTogglePortalTarget?: Element | null
  currentWorkspaceDirectory: string | null
  defaultCwd: string
  storageKey?: string
}

const TerminalArea = memo(function TerminalArea({
  collapsedTogglePortalTarget,
  currentWorkspaceDirectory,
  defaultCwd,
  storageKey,
}: TerminalAreaProps) {
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
    storageKey,
  })

  const collapsedToggleButton = <TerminalPanelToggleButton isOpen={false} onToggle={() => void handleTogglePanel()} />

  return (
    <>
      {!isOpen
        ? collapsedTogglePortalTarget
          ? createPortal(collapsedToggleButton, collapsedTogglePortalTarget)
          : (
            <div className="canvas-terminal-toggle-anchor">
              {collapsedToggleButton}
            </div>
          )
        : null}
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
