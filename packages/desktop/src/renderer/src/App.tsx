import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
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
import type { RightSidebarView, ToolPermissionMode, WorkspaceMode } from "./app/types"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
import { useSettingsPage } from "./app/use-settings-page"
import { clamp } from "./app/utils"
import { isSideChatSession } from "./app/workspace"
import { getSplitNode, type WorkbenchSplitAxis } from "./app/workbench/core"
import { WorkbenchShell } from "./app/workbench/WorkbenchShell"
import { WorkspaceModeCanvasPlaceholder, WorkspaceModeRightPlaceholder } from "./app/workspace-mode/WorkspaceModePlaceholder"

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
  didCommit: boolean
  frameID: number | null
  latestLeftSize: number
  latestRightSize: number
  leftElement: HTMLElement
  leftIndex: number
  originalLeftFlexGrow: string
  originalRightFlexGrow: string
  rightElement: HTMLElement
  splitID: string
  totalSize: number
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
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
    handleProjectCreateSession,
    handleProjectClick,
    handleProjectRemove,
    handleRemoveComposerAttachment,
    handleRightSidebarViewChange,
    handleSend,
    handleSessionDelete,
    handleSessionSelect,
    handleSessionModelSelectionChange,
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
    selectedFolderID,
    sessionCanvasUnreadBySession,
    setDraftForTab,
    setHoveredFolderID,
    visibleCanvasSessionIDs,
    workbenchLayout,
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
    isSavingSelection,
    loadError,
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
    savedSelection,
    restoreArchivedSession,
    saveBuiltinTools,
    saveInstalledPluginConfig,
    saveInstalledPluginConnectorApiKey,
    saveMcpServer,
    savePromptPreset,
    saveProviderApiKey,
    saveProvider,
    saveSelection,
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
  const paneRefs = useRef<Record<string, HTMLElement | null>>({})
  const workbenchPanesRef = useRef<HTMLDivElement | null>(null)
  const draggedPaneTabRef = useRef<DraggedPaneTab | null>(null)
  const [draggedPaneTab, setDraggedPaneTab] = useState<DraggedPaneTab | null>(null)
  const [paneDropTarget, setPaneDropTarget] = useState<PaneDropTarget | null>(null)
  const [activePaneResize, setActivePaneResize] = useState<ActivePaneResize | null>(null)
  const handleWorkbenchPaneResizeRef = useRef(handleWorkbenchPaneResize)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("code")
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
  handleWorkbenchPaneResizeRef.current = handleWorkbenchPaneResize

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

  function handleInspectorViewChange(view: RightSidebarView) {
    if (view === "runtime" && !isAgentDebugTraceEnabled) return
    handleRightSidebarViewChange(view)
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

    function applyPreview(leftSize: number, rightSize: number) {
      resizeState.leftElement.style.flexGrow = String(leftSize)
      resizeState.rightElement.style.flexGrow = String(rightSize)
    }

    function restorePreview() {
      resizeState.leftElement.style.flexGrow = resizeState.originalLeftFlexGrow
      resizeState.rightElement.style.flexGrow = resizeState.originalRightFlexGrow
    }

    function clearPreviewFrame() {
      if (resizeState.frameID === null) return
      window.cancelAnimationFrame(resizeState.frameID)
      resizeState.frameID = null
    }

    function queuePreview(leftSize: number, rightSize: number) {
      resizeState.latestLeftSize = leftSize
      resizeState.latestRightSize = rightSize
      if (resizeState.frameID !== null) return

      resizeState.frameID = window.requestAnimationFrame(() => {
        resizeState.frameID = null
        applyPreview(resizeState.latestLeftSize, resizeState.latestRightSize)
      })
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const pointerPosition = resizeState.axis === "horizontal" ? event.clientX : event.clientY
      const minPaneSize = resizeState.axis === "horizontal" ? MIN_WORKBENCH_PANE_WIDTH : MIN_WORKBENCH_PANE_HEIGHT
      const nextLeftSizePx = clamp(
        pointerPosition - resizeState.containerOrigin,
        minPaneSize,
        resizeState.combinedSize - minPaneSize,
      )
      const nextLeftSize = resizeState.totalSize * (nextLeftSizePx / resizeState.combinedSize)
      const nextRightSize = resizeState.totalSize - nextLeftSize

      queuePreview(nextLeftSize, nextRightSize)
    }

    function stopPaneResize() {
      clearPreviewFrame()
      applyPreview(resizeState.latestLeftSize, resizeState.latestRightSize)
      resizeState.didCommit = true
      handleWorkbenchPaneResizeRef.current(
        resizeState.splitID,
        resizeState.leftIndex,
        resizeState.latestLeftSize,
        resizeState.latestRightSize,
      )
      setActivePaneResize(null)
    }

    function cancelPaneResize() {
      clearPreviewFrame()
      restorePreview()
      setActivePaneResize(null)
    }

    document.body.classList.add("is-resizing-workbench-pane")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopPaneResize)
    window.addEventListener("pointercancel", cancelPaneResize)

    return () => {
      clearPreviewFrame()
      if (!resizeState.didCommit) {
        restorePreview()
      }
      document.body.classList.remove("is-resizing-workbench-pane")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPaneResize)
      window.removeEventListener("pointercancel", cancelPaneResize)
    }
  }, [activePaneResize])

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
    const initialLeftSize = split.sizes[leftIndex] ?? 0
    const initialRightSize = split.sizes[leftIndex + 1] ?? 0
    setActivePaneResize({
      axis,
      combinedSize,
      containerOrigin: axis === "horizontal" ? leftRect.left : leftRect.top,
      didCommit: false,
      frameID: null,
      latestLeftSize: initialLeftSize,
      latestRightSize: initialRightSize,
      leftElement: leftPaneElement,
      leftIndex,
      originalLeftFlexGrow: leftPaneElement.style.flexGrow,
      originalRightFlexGrow: rightPaneElement.style.flexGrow,
      rightElement: rightPaneElement,
      splitID,
      totalSize: initialLeftSize + initialRightSize,
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
  const isPromptEditorView = leftSidebarView === "prompts"
  const isGlobalSkillsView = leftSidebarView === "skills"
  const isMcpServersView = leftSidebarView === "mcp"
  const isPluginsView = leftSidebarView === "plugins"
  const isBuiltinToolsView = leftSidebarView === "tools"
  const isFullSurfaceView =
    isPromptEditorView || isGlobalSkillsView || isMcpServersView || isPluginsView || isBuiltinToolsView
  const placeholderWorkspaceMode: Exclude<WorkspaceMode, "code"> | null =
    leftSidebarView === "workspace" && workspaceMode !== "code" ? workspaceMode : null
  const windowControls = (
    <WindowChrome controlsRef={windowControlsRef} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />
  )
  const appShellClassName = isOpen ? "app-shell is-settings-open" : "app-shell"

  return (
    <div className={windowShellClassName}>
      <main ref={appShellRef} className={appShellClassName} style={appShellStyle}>
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
              sessionCanvasUnreadBySession={sessionCanvasUnreadBySession}
              visibleCanvasSessionIDs={visibleCanvasSessionIDs}
              workspaces={workspaces}
              workspaceMode={workspaceMode}
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
              builtinTools={builtinTools}
              builtinToolsError={builtinToolsError}
              isBuiltinToolSelectionDirty={isBuiltinToolSelectionDirty}
              isLoadingBuiltinTools={isLoadingBuiltinTools}
              isSavingBuiltinTools={isSavingBuiltinTools}
              message={message}
              windowControls={windowControls}
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
                draggedTabKey={draggedPaneTab?.tabKey ?? null}
                firstPaneID={firstPaneID}
                assistantTraceVisibility={assistantTraceVisibility}
                isActivityRailVisible={isActivityRailVisible}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isSavingToolPermissionMode={isSavingToolPermissionMode}
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
                toolPermissionMode={toolPermissionMode}
                toolPermissionModeError={toolPermissionModeError}
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
                onToolPermissionModeChange={handleToolPermissionModeChange}
                onAskUserQuestionAnswer={handleAskUserQuestionAnswer}
                onPickComposerAttachments={handlePickComposerAttachments}
                onRegisterPane={handleRegisterPane}
                onRemoveComposerAttachment={handleRemoveComposerAttachment}
                onSelectCreateSessionTab={handleCreateSessionTabSelect}
                onSelectSessionTab={handleCanvasSessionTabSelect}
                onCancelSend={handleCancelSend}
                onSend={handleSend}
                onSessionModelSelectionChange={handleSessionModelSelectionChange}
                onSetDraft={setDraftForTab}
                onToggleLeftSidebar={handleSidebarToggle}
                onToggleRightSidebar={handleRightSidebarToggle}
              />
            </>
          )}
        </section>

        {!isFullSurfaceView && !isRightSidebarCollapsed ? (
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
          isSavingSelection={isSavingSelection}
          loadError={loadError}
          mcpServerDraft={mcpServerDraft}
          mcpServers={mcpServers}
          message={message}
          models={models}
          providerDrafts={providerDrafts}
          restoringArchivedSessionID={restoringArchivedSessionID}
          savedSelection={savedSelection}
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
          onRestoreArchivedSession={restoreArchivedSession}
          onSaveMcpServer={saveMcpServer}
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
