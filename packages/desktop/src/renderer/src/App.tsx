import { lazy, Profiler, Suspense, useEffect, useMemo, useRef, useState } from "react"
import type { SerializedDockview } from "dockview-react"
import { ActivityRail } from "./app/sidebar/ActivityRail"
import { BuiltinToolsPage } from "./app/tools/BuiltinToolsPage"
import { McpServersPage } from "./app/mcp/McpServersPage"
import { RightSidebar } from "./app/sidebar/RightSidebar"
import { Sidebar } from "./app/sidebar/Sidebar"
import { SidebarResizer } from "./app/sidebar/SidebarResizer"
import { WindowChrome } from "./app/chrome/WindowChrome"
import { TerminalAreaHost } from "./app/terminal/TerminalAreaHost"
import {
  useWorkspaceStoreSelector,
} from "./app/agent-workspace/workspace-store"
import { WorkspaceStoreProvider } from "./app/agent-workspace/workspace-store-context"
import { resolveWorkspaceRelativePath } from "./app/agent-workspace/workspace-loading-hooks"
import type { MarkdownArtifactLinkTarget, MarkdownLocalFileLinkTarget } from "./app/thread-markdown"
import type { RightSidebarView, SessionDiffFile, ToolPermissionMode } from "./app/types"
import { useAgentWorkspace } from "./app/use-agent-workspace"
import { useDesktopShell } from "./app/use-desktop-shell"
import { useGlobalSkills } from "./app/use-global-skills"
import { useSettingsPage } from "./app/use-settings-page"
import { createRendererProfilerOnRender } from "./app/perf-profiler"
import type { BuiltinToolKindKey } from "./app/tools/BuiltinToolsPage"
import { findSession, isSideChatSession } from "./app/workspace"
import { WorkbenchShell } from "./app/workbench/WorkbenchShell"
import {
  createInitialDockviewLayout,
  getActivePanelForGroupFromState,
  getFocusedDockviewGroupIDFromState,
} from "./app/workbench/dockview-state"
import {
  buildWorkbenchPublishSnapshot,
  workbenchPublishSnapshotsAreEqual,
} from "./app/agent-workspace/workspace-derived-state"
import type { WorkbenchSharedState, WorkbenchWindowContext } from "../../shared/desktop-ipc-contract"

const GlobalSkillsPage = lazy(() => import("./app/skills/GlobalSkillsPage").then((module) => ({ default: module.GlobalSkillsPage })))
const PluginsPage = lazy(() => import("./app/plugins/PluginsPage").then((module) => ({ default: module.PluginsPage })))
const PromptPresetsPage = lazy(() => import("./app/prompts/PromptPresetsPage").then((module) => ({ default: module.PromptPresetsPage })))
const SettingsPage = lazy(() => import("./app/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })))

const WORKBENCH_TERMINAL_STORAGE_KEY = "desktop.terminal.workspace.v3:workbench"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

interface LocalFileLinkOpenInput {
  paneID: string
  sessionID: string | null
  target: MarkdownLocalFileLinkTarget
  workspaceDirectory: string | null
  workspaceID: string | null
}

interface ArtifactLinkOpenInput {
  paneID: string
  sessionID: string | null
  target: MarkdownArtifactLinkTarget
  workspaceDirectory: string | null
  workspaceID: string | null
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

const FALLBACK_WORKBENCH_STATE: WorkbenchSharedState = {
  version: 0,
  windows: [
    {
      id: "main",
      kind: "main",
      ownedPanelIDs: [],
      surfaceID: "main",
    },
  ],
  surfaces: [
    {
      surfaceID: "main",
      kind: "main",
      windowID: "main",
      ownedPanelIDs: [],
      layout: null,
    },
  ],
  ownership: [],
  panels: {},
}

const FALLBACK_WORKBENCH_CONTEXT: WorkbenchWindowContext = {
  windowID: "main",
  kind: "main",
  surfaceID: "main",
  ownedPanelIDs: [],
  reference: null,
  state: FALLBACK_WORKBENCH_STATE,
}

function hasExplicitWorkbenchWindowID() {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).has("workbenchWindowID")
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function areWorkbenchReferencesEqual(
  left: WorkbenchWindowContext["reference"],
  right: WorkbenchWindowContext["reference"],
) {
  if (!left || !right) return left === right
  return left.kind === right.kind && left.sessionID === right.sessionID
}

function getWorkbenchSurfaceID(context: WorkbenchWindowContext) {
  return context.surfaceID ?? (context.kind === "main" ? "main" : context.windowID)
}

function getContextSurfaceLayout(context: WorkbenchWindowContext) {
  const surfaceID = getWorkbenchSurfaceID(context)
  return (context.state.surfaces?.find((surface) => surface.surfaceID === surfaceID)?.layout ?? null) as SerializedDockview | null
}

function getContextPanelTitle(context: WorkbenchWindowContext, panelID: string | null | undefined) {
  if (!panelID) return undefined
  return (
    context.state.ownership.find((ownership) => ownership.panelID === panelID)?.title ??
    context.state.panels[panelID]?.title
  )
}

function getWorkbenchPanelOwnershipSurfaceID(ownership: WorkbenchSharedState["ownership"][number]) {
  return ownership.ownerSurfaceID ?? ownership.ownerWindowID
}

function createFallbackPopoutLayout(context: WorkbenchWindowContext) {
  const sessionID = context.reference?.sessionID
  if (!sessionID) return null
  return createInitialDockviewLayout(
    {
      kind: "session",
      sessionID,
    },
    getContextPanelTitle(context, context.panelID) ?? "Session",
  )
}

function getWorkbenchPublishSignature(snapshot: WorkbenchSharedState) {
  const { version: _version, ...content } = snapshot
  return JSON.stringify(content)
}

function useToolPermissionModeState() {
  const [toolPermissionMode, setToolPermissionMode] = useState<ToolPermissionMode>("default")
  const [toolPermissionModeError, setToolPermissionModeError] = useState<string | null>(null)
  const [isSavingToolPermissionMode, setIsSavingToolPermissionMode] = useState(false)

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

  return {
    handleToolPermissionModeChange,
    isSavingToolPermissionMode,
    toolPermissionMode,
    toolPermissionModeError,
  }
}

export function App() {
  const [workbenchContext, setWorkbenchContext] = useState<WorkbenchWindowContext | null>(() =>
    hasExplicitWorkbenchWindowID() ? null : FALLBACK_WORKBENCH_CONTEXT,
  )

  useEffect(() => {
    let cancelled = false

    async function loadWorkbenchContext() {
      const getContext = window.desktop?.getWorkbenchWindowContext
      if (!getContext) {
        setWorkbenchContext(FALLBACK_WORKBENCH_CONTEXT)
        return
      }

      try {
        const context = await getContext()
        if (!cancelled) {
          setWorkbenchContext(context)
        }
      } catch (error) {
        console.error("[desktop] Failed to load workbench window context:", error)
        if (!cancelled) {
          setWorkbenchContext(FALLBACK_WORKBENCH_CONTEXT)
        }
      }
    }

    void loadWorkbenchContext()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.desktop?.onWorkbenchStateChange?.((event) => {
      setWorkbenchContext((current) => {
        if (!current) return current
        const windowSummary = event.state.windows.find((item) => item.id === current.windowID)
        const surfaceID = windowSummary?.surfaceID ?? current.surfaceID ?? (current.kind === "main" ? "main" : undefined)
        const surface = event.state.surfaces?.find((item) => item.surfaceID === surfaceID)
        const ownedPanelIDs = surface?.ownedPanelIDs ?? windowSummary?.ownedPanelIDs ?? current.ownedPanelIDs
        const panelID = current.panelID && ownedPanelIDs.includes(current.panelID)
          ? current.panelID
          : ownedPanelIDs[0] ?? current.panelID
        const ownership = panelID
          ? event.state.ownership.find((item) => item.panelID === panelID) ?? null
          : null
        const reference = ownership?.reference ?? current.reference ?? null

        if (
          event.reason === "snapshot" &&
          current.surfaceID === surfaceID &&
          current.panelID === panelID &&
          areStringArraysEqual(current.ownedPanelIDs, ownedPanelIDs) &&
          areWorkbenchReferencesEqual(current.reference, reference)
        ) {
          return current
        }

        return {
          ...current,
          ownedPanelIDs,
          panelID,
          reference,
          state: event.state,
          surfaceID,
        }
      })
    })

    return unsubscribe
  }, [])

  if (!workbenchContext) {
    return <div className="app-loading-screen" />
  }

  if (workbenchContext.kind === "session-popout") {
    return <SessionPopoutApp workbenchContext={workbenchContext} />
  }

  return <MainApp workbenchContext={workbenchContext} />
}

function SessionPopoutApp({ workbenchContext }: { workbenchContext: WorkbenchWindowContext }) {
  const targetSessionID = workbenchContext.reference?.sessionID ?? null
  const surfaceID = getWorkbenchSurfaceID(workbenchContext)
  const initialDockviewLayout = getContextSurfaceLayout(workbenchContext) ?? createFallbackPopoutLayout(workbenchContext)
  const {
    agentConnected,
    agentDefaultDirectory,
    appShellRef,
    appShellStyle,
    assistantTraceVisibility,
    handleWindowAction,
    isAgentDebugTraceEnabled,
    isWindowMaximized,
    platform,
  } = useDesktopShell()
  const {
    composerRefreshVersion,
    handleApproveProposedPlan,
    handleCancelSend,
    handleCanvasSessionTabClose,
    handleCanvasSessionTabSelect,
    handleCreateSessionSubmit,
    handleCreateSideChatTab,
    handleDeleteSideChatTab,
    handleCreateSessionWorkspaceChange,
    handleOpenSideChat,
    handleClearComposerParentMessage,
    handleDockviewActiveChange,
    handleForkFromMessage,
    handleMovePanelIntoSurface,
    handleMovePanelOutOfSurface,
    handlePaneFocus,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handleRemoveComposerAttachment,
    handleSend,
    handlePlanModeToggle,
    handleSessionBranchSelect,
    handleSessionModelSelectionChange,
    handleSelectSideChatTab,
    handleTurnDiffSummaryHydrate,
    isResolvingPermissionRequest,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    readThreadScrollSnapshot,
    setDraftForTab,
    saveThreadScrollSnapshot,
    handleWorkbenchDockviewCommandsReady,
    setDockviewLayout,
    dockviewLayout,
    workspaceStore,
  } = useAgentWorkspace({
    agentConnected,
    agentDefaultDirectory,
    disableDockviewPersistence: true,
    initialDockviewLayout,
    initialSessionID: targetSessionID,
    isRuntimeDebugEnabled: isAgentDebugTraceEnabled,
    platform,
    surfaceID,
    workbenchState: workbenchContext.state,
  })
  const workbenchPublishSnapshot = useWorkspaceStoreSelector(
    workspaceStore,
    (state) => buildWorkbenchPublishSnapshot({
      createSessionTabs: state.sessions.createSessionTabs,
      dockviewLayout: state.workbench.dockviewLayout,
      workspaces: state.sessions.workspaces,
    }),
    workbenchPublishSnapshotsAreEqual,
  )
  const {
    handleToolPermissionModeChange,
    isSavingToolPermissionMode,
    toolPermissionMode,
    toolPermissionModeError,
  } = useToolPermissionModeState()
  const didMarkMountedRef = useRef(false)
  const lastPublishedWorkbenchSnapshotSignatureRef = useRef<string | null>(null)
  const windowControls = useMemo(
    () => <WindowChrome controlsRef={null} isWindowMaximized={isWindowMaximized} onWindowAction={handleWindowAction} />,
    [handleWindowAction, isWindowMaximized],
  )

  async function handleDetachSessionPanel(input: {
    bounds: { height: number; width: number; x: number; y: number }
    groupID: string
    panelID: string
    reference: { kind: "session"; sessionID: string }
    title: string
  }) {
    const detachSessionPanel = window.desktop?.detachSessionPanel
    if (!detachSessionPanel) return false

    const result = await detachSessionPanel({
      bounds: input.bounds,
      lastMainGroupID: input.groupID,
      panelID: input.panelID,
      sessionID: input.reference.sessionID,
      sourceSurfaceID: surfaceID,
      title: input.title,
    })
    return result.ok
  }

  async function handleMoveSessionPanel(input: {
    panelID: string
    placement: "within" | "left" | "right" | "top" | "bottom"
    sourceSurfaceID: string
    targetGroupID?: string | null
    targetSurfaceID: string
  }) {
    const result = await window.desktop?.moveWorkbenchPanel?.(input)
    return Boolean(result?.ok)
  }

  useEffect(() => {
    void window.desktop?.markWorkbenchWindowReady?.({ windowID: workbenchContext.windowID })
  }, [workbenchContext.windowID])

  useEffect(() => {
    const panelID = workbenchContext.panelID
    if (!panelID || didMarkMountedRef.current) return
    const hasPanel = workbenchPublishSnapshot.ownedPanelIDs.includes(panelID)
    if (!hasPanel) return
    didMarkMountedRef.current = true
    void window.desktop?.markWorkbenchPanelMounted?.({
      panelID,
      windowID: workbenchContext.windowID,
    }).catch((error) => {
      didMarkMountedRef.current = false
      console.error("[desktop] Failed to mark session popout mounted:", error)
    })
  }, [didMarkMountedRef, workbenchContext.panelID, workbenchContext.windowID, workbenchPublishSnapshot.ownedPanelIDs])

  const handleDockBack = (preferredPanelID?: string) => {
    const panelID = preferredPanelID ?? workbenchContext.panelID
    if (!panelID) return
    void window.desktop?.moveWorkbenchPanel?.({
      panelID,
      sourceSurfaceID: surfaceID,
      targetSurfaceID: "main",
    })
  }

  useEffect(() => {
    const publishWorkbenchSnapshot = window.desktop?.publishWorkbenchSnapshot
    if (!publishWorkbenchSnapshot) return
    const snapshot: WorkbenchSharedState = {
      version: 0,
      windows: [],
      surfaces: [
        {
          surfaceID,
          kind: "session-popout",
          windowID: workbenchContext.windowID,
          ownedPanelIDs: workbenchPublishSnapshot.ownedPanelIDs,
          layout: dockviewLayout,
        },
      ],
      ownership: [],
      panels: workbenchPublishSnapshot.panels,
    }
    const signature = getWorkbenchPublishSignature(snapshot)
    if (signature === lastPublishedWorkbenchSnapshotSignatureRef.current) return
    lastPublishedWorkbenchSnapshotSignatureRef.current = signature

    void publishWorkbenchSnapshot(snapshot).catch((error) => {
      if (lastPublishedWorkbenchSnapshotSignatureRef.current === signature) {
        lastPublishedWorkbenchSnapshotSignatureRef.current = null
      }
      console.error("[desktop] Failed to publish workbench popout snapshot:", error)
    })
  }, [dockviewLayout, surfaceID, workbenchContext.windowID, workbenchPublishSnapshot])

  useEffect(() => {
    const unsubscribe = window.desktop?.onWorkbenchStateChange?.((event) => {
      if (event.reason === "focus" && event.panelID) {
        const ownership = event.state.ownership.find((item) => item.panelID === event.panelID)
        if (ownership && getWorkbenchPanelOwnershipSurfaceID(ownership) === surfaceID) {
          handleCanvasSessionTabSelect(ownership.reference.sessionID)
        }
        return
      }

      const move = event.move
      if (!move) return
      if (move.targetSurfaceID === surfaceID) {
        handleMovePanelIntoSurface({
          panelID: move.panelID,
          placement: move.placement,
          targetGroupID: move.targetGroupID,
          title: move.title,
        })
      }
      if (move.sourceSurfaceID === surfaceID) {
        handleMovePanelOutOfSurface(move.panelID)
      }
    })

    return unsubscribe
  }, [handleCanvasSessionTabSelect, handleMovePanelIntoSurface, handleMovePanelOutOfSurface, surfaceID])

  const handleLocalFileLinkOpen = ({ target }: LocalFileLinkOpenInput) => {
    void openSystemLocalPath(target.path)
  }

  const handleArtifactLinkOpen = (_input: ArtifactLinkOpenInput) => {
    // Artifact preview is hosted by the main window right sidebar in v1.
  }

  const handlePopoutDiffNoop = async () => {
    // Diff review and restore are routed through the main window sidebars in v1.
  }

  return (
    <WorkspaceStoreProvider store={workspaceStore}>
      <div className="session-popout-shell">
        <main ref={appShellRef} className="session-popout-app" style={appShellStyle}>
          <WorkbenchShell
          assistantTraceVisibility={assistantTraceVisibility}
          composerRefreshVersion={composerRefreshVersion}
          isActivityRailVisible={false}
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isDetachedWindow
          isResolvingPermissionRequest={isResolvingPermissionRequest}
          isRightSidebarCollapsed
          isSavingToolPermissionMode={isSavingToolPermissionMode}
          isSidebarCollapsed
          platform={platform}
          store={workspaceStore}
          windowControls={windowControls}
          readThreadScrollSnapshot={readThreadScrollSnapshot}
          saveThreadScrollSnapshot={saveThreadScrollSnapshot}
          permissionRequestActionError={permissionRequestActionError}
          permissionRequestActionRequestID={permissionRequestActionRequestID}
          toolPermissionMode={toolPermissionMode}
          toolPermissionModeError={toolPermissionModeError}
          surfaceID={surfaceID}
          onActiveDockviewChange={handleDockviewActiveChange}
          onApproveProposedPlan={handleApproveProposedPlan}
          onAskUserQuestionAnswer={handleAskUserQuestionAnswer}
          onCancelSend={handleCancelSend}
          onCloseCreateSessionTab={handleDockBack}
          onCloseSessionTab={handleCanvasSessionTabClose}
          onCommandsReady={handleWorkbenchDockviewCommandsReady}
          onCreateSessionSubmit={handleCreateSessionSubmit}
          onCreateSessionWorkspaceChange={handleCreateSessionWorkspaceChange}
          onCreateSideChatTab={handleCreateSideChatTab}
          onDeleteSideChatTab={handleDeleteSideChatTab}
          onBranchSelect={handleSessionBranchSelect}
          onClearComposerParentMessage={handleClearComposerParentMessage}
          onDetachSessionPanel={handleDetachSessionPanel}
          onDockBack={handleDockBack}
          onFocusPane={handlePaneFocus}
          onForkFromMessage={handleForkFromMessage}
          onInspectFileInSidebar={() => undefined}
          onLayoutChange={setDockviewLayout}
          onArtifactLinkOpen={handleArtifactLinkOpen}
          onLocalFileLinkOpen={handleLocalFileLinkOpen}
          onMoveSessionPanel={handleMoveSessionPanel}
          onOpenCreateSessionTab={() => undefined}
          onOpenSideChat={handleOpenSideChat}
          onPasteComposerImageAttachments={handlePasteComposerImageAttachments}
          onPermissionRequestResponse={handlePermissionRequestResponse}
          onPickComposerAttachments={handlePickComposerAttachments}
          onPlanModeToggle={handlePlanModeToggle}
          onRemoveComposerAttachment={handleRemoveComposerAttachment}
          onSelectCreateSessionTab={() => undefined}
          onSelectSessionTab={handleCanvasSessionTabSelect}
          onSelectSideChatTab={handleSelectSideChatTab}
          onSend={handleSend}
          onSessionModelSelectionChange={handleSessionModelSelectionChange}
          onSetDraft={setDraftForTab}
          onToggleLeftSidebar={() => undefined}
          onToggleRightSidebar={() => undefined}
          onToolPermissionModeChange={handleToolPermissionModeChange}
          onTurnDiffRestore={handlePopoutDiffNoop}
          onTurnDiffReview={handlePopoutDiffNoop}
          onTurnDiffSummaryHydrate={handleTurnDiffSummaryHydrate}
          />
        </main>
      </div>
    </WorkspaceStoreProvider>
  )
}

function MainApp({ workbenchContext }: { workbenchContext: WorkbenchWindowContext }) {
  const surfaceID = getWorkbenchSurfaceID(workbenchContext)
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
    handleClearComposerParentMessage,
    handleOpenCreateSessionTab,
    handleDockviewActiveChange,
    handleForkFromMessage,
    handleMovePanelIntoSurface,
    handleMovePanelOutOfSurface,
    handlePaneFocus,
    handlePermissionRequestResponse,
    handleAskUserQuestionAnswer,
    handlePickComposerAttachments,
    handlePasteComposerImageAttachments,
    handlePreviewActiveInteractionChange,
    handlePreviewBack,
    handlePreviewCommitInteraction,
    handlePreviewDraftUrlChange,
    handlePreviewForward,
    handlePreviewOpen,
    handlePreviewOpenExternal,
    handlePreviewOpenTarget,
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
    handleSessionBranchSelect,
    handleSessionDelete,
    handleSessionSelect,
    handleSelectSideChatTab,
    handleSessionModelSelectionChange,
    handleTurnDiffSummaryHydrate,
    handleSidebarAction,
    hoveredFolderID,
    isCreatingProject,
    isResolvingPermissionRequest,
    leftSidebarView,
    permissionRequestActionError,
    permissionRequestActionRequestID,
    pinnedWorkspaceIDs,
    projectRowRefs,
    readThreadScrollSnapshot,
    refreshComposerMcp,
    refreshComposerModels,
    refreshComposerSkills,
    refreshWorkspaceFromDirectory,
    rightSidebarView,
    runningSessionIDs,
    selectedFolderID,
    sessionCanvasUnreadBySession,
    setDraftForTab,
    saveThreadScrollSnapshot,
    handleWorkbenchDockviewCommandsReady,
    setHoveredFolderID,
    setDockviewLayout,
    visibleCanvasSessionIDs,
    dockviewLayout,
    workspaceStore,
    workspaces,
  } = useAgentWorkspace({
    agentConnected,
    agentDefaultDirectory,
    isRuntimeDebugEnabled: isAgentDebugTraceEnabled,
    platform,
    surfaceID,
    workbenchState: workbenchContext.state,
  })
  const workbenchPublishSnapshot = useWorkspaceStoreSelector(
    workspaceStore,
    (state) => buildWorkbenchPublishSnapshot({
      createSessionTabs: state.sessions.createSessionTabs,
      dockviewLayout: state.workbench.dockviewLayout,
      workspaces: state.sessions.workspaces,
    }),
    workbenchPublishSnapshotsAreEqual,
  )

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
    clearPluginSelection,
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

  const isCreatingSession = useWorkspaceStoreSelector(
    workspaceStore,
    (state) => Object.values(state.composer.isCreatingSessionByTabKey).some(Boolean),
  )
  const [activeBuiltinToolKind, setActiveBuiltinToolKind] = useState<BuiltinToolKindKey | null>(null)
  const [toolPermissionMode, setToolPermissionMode] = useState<ToolPermissionMode>("default")
  const [toolPermissionModeError, setToolPermissionModeError] = useState<string | null>(null)
  const [isSavingToolPermissionMode, setIsSavingToolPermissionMode] = useState(false)
  const lastPublishedWorkbenchSnapshotSignatureRef = useRef<string | null>(null)
  const terminalSessionID = useWorkspaceStoreSelector(workspaceStore, (state) => {
    const focusedPaneID = getFocusedDockviewGroupIDFromState(
      state.workbench.dockviewLayout,
      state.workbench.dockviewActiveState,
    )
    const reference = getActivePanelForGroupFromState(
      state.workbench.dockviewLayout,
      state.workbench.dockviewActiveState,
      focusedPaneID,
    )
    if (reference?.kind !== "session") return null

    const { session } = findSession(state.sessions.workspaces, reference.sessionID)
    return session && !isSideChatSession(session) ? session.id : null
  })
  const activeRightSidebarView: RightSidebarView =
    rightSidebarView === "runtime" && !isAgentDebugTraceEnabled ? "changes" : rightSidebarView
  const rightSidebarProfiler = useMemo(
    () => createRendererProfilerOnRender("RightSidebar commit", () => ({
      activeView: activeRightSidebarView,
      activeSessionID: activeSession?.id ?? null,
      isRuntimeViewVisible: isAgentDebugTraceEnabled,
    })),
    [activeRightSidebarView, activeSession?.id, isAgentDebugTraceEnabled],
  )

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
    workspaceID,
  }: LocalFileLinkOpenInput) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)

    const workspaceRelativePath = workspaceDirectory
      ? resolveWorkspaceRelativePath(workspaceDirectory, target.path, platform)
      : null

    if (workspaceDirectory && workspaceRelativePath !== null) {
      if (!target.lineRange) {
        void handlePreviewOpenTarget(target.path, workspaceID, workspaceDirectory)
        return
      }

      void handleWorkspaceFileSelect(workspaceRelativePath, {
        linkedLineRange: target.lineRange ?? null,
        scopeDirectory: workspaceDirectory,
      })
      return
    }

    void openSystemLocalPath(target.path)
  }

  function handleArtifactLinkOpen({
    paneID,
    target,
    workspaceDirectory,
    workspaceID,
  }: ArtifactLinkOpenInput) {
    if (isRightSidebarCollapsed) {
      handleRightSidebarToggle()
    }
    handlePaneFocus(paneID)
    void handlePreviewOpenTarget(target.href, workspaceID, workspaceDirectory)
  }

  async function handleDetachSessionPanel(input: {
    bounds: { height: number; width: number; x: number; y: number }
    groupID: string
    panelID: string
    reference: { kind: "session"; sessionID: string }
    title: string
  }) {
    const detachSessionPanel = window.desktop?.detachSessionPanel
    if (!detachSessionPanel) return false

    const result = await detachSessionPanel({
      bounds: input.bounds,
      lastMainGroupID: input.groupID,
      panelID: input.panelID,
      sessionID: input.reference.sessionID,
      sourceSurfaceID: surfaceID,
      title: input.title,
    })
    return result.ok
  }

  async function handleMoveSessionPanel(input: {
    panelID: string
    placement: "within" | "left" | "right" | "top" | "bottom"
    sourceSurfaceID: string
    targetGroupID?: string | null
    targetSurfaceID: string
  }) {
    const result = await window.desktop?.moveWorkbenchPanel?.(input)
    return Boolean(result?.ok)
  }

  useEffect(() => {
    if (workbenchContext.kind !== "main") return
    const publishWorkbenchSnapshot = window.desktop?.publishWorkbenchSnapshot
    if (!publishWorkbenchSnapshot) return

    const snapshot: WorkbenchSharedState = {
      version: 0,
      windows: [],
      surfaces: [
        {
          surfaceID,
          kind: "main",
          windowID: workbenchContext.windowID,
          ownedPanelIDs: workbenchPublishSnapshot.ownedPanelIDs,
          layout: dockviewLayout,
        },
      ],
      ownership: [],
      panels: workbenchPublishSnapshot.panels,
    }
    const signature = getWorkbenchPublishSignature(snapshot)
    if (signature === lastPublishedWorkbenchSnapshotSignatureRef.current) return
    lastPublishedWorkbenchSnapshotSignatureRef.current = signature

    void publishWorkbenchSnapshot(snapshot).catch((error) => {
      if (lastPublishedWorkbenchSnapshotSignatureRef.current === signature) {
        lastPublishedWorkbenchSnapshotSignatureRef.current = null
      }
      console.error("[desktop] Failed to publish workbench snapshot:", error)
    })
  }, [dockviewLayout, surfaceID, workbenchContext.kind, workbenchContext.windowID, workbenchPublishSnapshot])

  useEffect(() => {
    if (workbenchContext.kind !== "main") return
    const unsubscribe = window.desktop?.onWorkbenchStateChange?.((event) => {
      if (event.reason === "focus" && event.panelID) {
        const ownership = event.state.ownership.find((item) => item.panelID === event.panelID)
        if (ownership && getWorkbenchPanelOwnershipSurfaceID(ownership) === surfaceID) {
          handleCanvasSessionTabSelect(ownership.reference.sessionID, ownership.lastMainGroupID ?? undefined)
        }
        return
      }

      const move = event.move
      if (move) {
        if (move.targetSurfaceID === surfaceID) {
          handleMovePanelIntoSurface({
            panelID: move.panelID,
            placement: move.placement,
            targetGroupID: move.targetGroupID,
            title: move.title,
          })
        }
        if (move.sourceSurfaceID === surfaceID) {
          handleMovePanelOutOfSurface(move.panelID)
        }
        return
      }
      if (event.reason !== "dock" && event.reason !== "restored") return
      const ownership = event.panelID
        ? event.state.ownership.find((item) => item.panelID === event.panelID)
        : null
      if (!ownership || ownership.ownerWindowID !== workbenchContext.windowID) return
      handleCanvasSessionTabSelect(ownership.reference.sessionID, ownership.lastMainGroupID ?? undefined)
    })

    return unsubscribe
  }, [
    handleCanvasSessionTabSelect,
    handleMovePanelIntoSurface,
    handleMovePanelOutOfSurface,
    surfaceID,
    workbenchContext.kind,
    workbenchContext.windowID,
  ])

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
    <WorkspaceStoreProvider store={workspaceStore}>
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
              : "canvas is-workbench"
          }
        >
          {isPromptEditorView ? (
            <Suspense fallback={null}>
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
            </Suspense>
          ) : isGlobalSkillsView ? (
            <Suspense fallback={null}>
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
            </Suspense>
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
            <Suspense fallback={null}>
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
                onPluginDeselect={clearPluginSelection}
                onPluginSelect={selectPlugin}
                onSaveInstalledPluginConnectorApiKey={saveInstalledPluginConnectorApiKey}
                onSaveInstalledPluginConfig={saveInstalledPluginConfig}
                onSetInstalledPluginEnabled={setInstalledPluginEnabled}
                savingPluginConnectorID={savingPluginConnectorID}
              />
            </Suspense>
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
          ) : (
            <>
              <WorkbenchShell
                composerRefreshVersion={composerRefreshVersion}
                assistantTraceVisibility={assistantTraceVisibility}
                isActivityRailVisible={isActivityRailVisible}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isSavingToolPermissionMode={isSavingToolPermissionMode}
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                isSidebarCollapsed={isSidebarCollapsed}
                platform={platform}
                store={workspaceStore}
                windowControls={isRightSidebarCollapsed ? workbenchWindowControls : null}
                readThreadScrollSnapshot={readThreadScrollSnapshot}
                saveThreadScrollSnapshot={saveThreadScrollSnapshot}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                toolPermissionMode={toolPermissionMode}
                toolPermissionModeError={toolPermissionModeError}
                surfaceID={surfaceID}
                onCloseCreateSessionTab={handleCloseCreateSessionTab}
                onCloseSessionTab={handleCanvasSessionTabClose}
                onCreateSessionSubmit={handleCreateSessionSubmit}
                onCreateSessionWorkspaceChange={handleCreateSessionWorkspaceChange}
                onActiveDockviewChange={handleDockviewActiveChange}
                onDetachSessionPanel={handleDetachSessionPanel}
                onFocusPane={handlePaneFocus}
                onInspectFileInSidebar={handleInspectFileInSidebar}
                onCommandsReady={handleWorkbenchDockviewCommandsReady}
                onLayoutChange={setDockviewLayout}
                onArtifactLinkOpen={handleArtifactLinkOpen}
                onLocalFileLinkOpen={handleLocalFileLinkOpen}
                onMoveSessionPanel={handleMoveSessionPanel}
                onCreateSideChatTab={handleCreateSideChatTab}
                onDeleteSideChatTab={handleDeleteSideChatTab}
                onBranchSelect={handleSessionBranchSelect}
                onClearComposerParentMessage={handleClearComposerParentMessage}
                onOpenCreateSessionTab={handleOpenCreateSessionTab}
                onOpenSideChat={handleOpenSideChat}
                onForkFromMessage={handleForkFromMessage}
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

            <Profiler id="MainApp.RightSidebar" onRender={rightSidebarProfiler}>
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
                onPreviewActiveInteractionChange={handlePreviewActiveInteractionChange}
                onPreviewCommitInteraction={handlePreviewCommitInteraction}
                onPreviewBack={handlePreviewBack}
                onPreviewDraftUrlChange={handlePreviewDraftUrlChange}
                onPreviewForward={handlePreviewForward}
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
            </Profiler>
          </>
        ) : null}

        {isOpen ? (
          <Suspense fallback={null}>
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
          </Suspense>
        ) : null}
        </main>
      </div>
    </WorkspaceStoreProvider>
  )
}
