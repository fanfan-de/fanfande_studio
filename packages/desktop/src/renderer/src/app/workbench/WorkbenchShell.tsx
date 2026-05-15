import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react"
import { CloseIcon, PlusIcon } from "../icons"
import { joinClassNames, SidebarToggleButton, SideChatBadge } from "../shared-ui"
import type { MarkdownLocalFileLinkTarget } from "../thread-markdown"
import type { AssistantTraceVisibility, ComposerDraftState, SessionDiffFile, SessionDiffSummary, ToolPermissionMode } from "../types"
import type { useAgentWorkspace } from "../use-agent-workspace"
import {
  getActiveDockviewPanelID,
  getActiveDockviewPanelReference,
  getDockviewGroupsInOrder,
  getFocusedDockviewGroupID,
  getSerializedDockviewSignature,
  getWorkbenchDockPanelId,
  getWorkbenchDockPanelReference,
  WORKBENCH_DOCK_PANEL_COMPONENT,
  WORKBENCH_DOCK_TAB_COMPONENT,
  type WorkbenchDockviewCommands,
  type WorkbenchDockviewActiveChange,
  type WorkbenchDockPanelReference,
} from "./dockview-state"
import { WorkbenchPaneSurface } from "./WorkbenchPaneSurface"

type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
type WorkbenchPaneStateByID = AgentWorkspaceState["workbenchPaneStateByID"]
type WorkbenchPaneTab = AgentWorkspaceState["workbenchPaneStates"][number]["tabs"][number]

const ACTIVE_TAB_CURVE_FILL_PATH = "M16 0L16 16L0 16C8.84 16 16 8.84 16 0Z"
const ACTIVE_TAB_CURVE_STROKE_PATH = "M0 16C8.84 16 16 8.84 16 0"

function PaneTabActiveCurve({ side }: { side: "start" | "end" }) {
  return (
    <span
      className={
        side === "start"
          ? "session-tab-active-curve session-tab-active-curve-start"
          : "session-tab-active-curve session-tab-active-curve-end"
      }
      aria-hidden="true"
    >
      <svg className="session-tab-active-curve-svg" viewBox="0 0 16 16" focusable="false">
        <path className="session-tab-active-curve-fill" d={ACTIVE_TAB_CURVE_FILL_PATH} />
        <path className="session-tab-active-curve-stroke" d={ACTIVE_TAB_CURVE_STROKE_PATH} />
      </svg>
    </span>
  )
}

function buildPanelTitleMap(paneStateByID: WorkbenchPaneStateByID) {
  const titles: Record<string, string | undefined> = {}
  for (const pane of Object.values(paneStateByID)) {
    for (const tab of pane.tabs) {
      titles[tab.key] = tab.title
    }
  }
  return titles
}

export function findPaneStateForDockviewPanel(
  paneStateByID: WorkbenchPaneStateByID,
  groupID: string,
  panelID?: string,
) {
  const pane = paneStateByID[groupID]
  if (pane || !panelID) return pane ?? null

  return Object.values(paneStateByID).find((candidate) =>
    candidate.tabs.some((tab) => tab.key === panelID),
  ) ?? null
}

function clearDockviewLayout(dockviewApi: DockviewApi) {
  try {
    dockviewApi.clear()
  } catch (error) {
    console.warn("[desktop] Failed to clear Dockview workbench layout.", error)
  }
}

function publishTestDockviewApi(dockviewApi: DockviewApi | null) {
  if (import.meta.env.MODE !== "test") return
  const testWindow = window as Window & { __fanfandeWorkbenchDockviewApi?: DockviewApi | null }
  testWindow.__fanfandeWorkbenchDockviewApi = dockviewApi
}

export interface WorkbenchShellProps {
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion: number
  firstPaneID: string | null
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSavingToolPermissionMode: boolean
  isRightSidebarCollapsed: boolean
  isSidebarCollapsed: boolean
  lastPaneID: string | null
  dockviewLayout: SerializedDockview | null
  windowControls?: ReactNode
  paneStateByID: WorkbenchPaneStateByID
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  toolPermissionMode: ToolPermissionMode
  toolPermissionModeError: string | null
  workspaces: AgentWorkspaceState["workspaces"]
  onCloseCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onCloseSessionTab: (sessionID: string, paneID?: string) => void
  onCreateSessionSubmit: (createSessionTabID?: string | null, paneID?: string) => Promise<void>
  onCreateSessionWorkspaceChange: (workspaceID: string, createSessionTabID?: string | null) => void
  onActiveDockviewChange: (input: WorkbenchDockviewActiveChange) => void
  onFocusPane: (paneID: string) => void
  onInspectFileInSidebar: (file: string | null, sessionID: string | null, paneID: string) => void
  onCommandsReady: (commands: WorkbenchDockviewCommands | null) => void
  onLayoutChange: (layout: SerializedDockview | null) => void
  onLocalFileLinkOpen: (input: {
    paneID: string
    sessionID: string | null
    target: MarkdownLocalFileLinkTarget
    workspaceDirectory: string | null
  }) => void
  onCreateSideChatTab: AgentWorkspaceState["handleCreateSideChatTab"]
  onDeleteSideChatTab: AgentWorkspaceState["handleDeleteSideChatTab"]
  onOpenCreateSessionTab: (preferredWorkspaceID?: string | null, paneID?: string) => void
  onOpenSideChat: AgentWorkspaceState["handleOpenSideChat"]
  onAskUserQuestionAnswer: AgentWorkspaceState["handleAskUserQuestionAnswer"]
  onApproveProposedPlan: AgentWorkspaceState["handleApproveProposedPlan"]
  onPermissionRequestResponse: AgentWorkspaceState["handlePermissionRequestResponse"]
  onToolPermissionModeChange: (mode: ToolPermissionMode) => void | Promise<void>
  onPickComposerAttachments: AgentWorkspaceState["handlePickComposerAttachments"]
  onPasteComposerImageAttachments: AgentWorkspaceState["handlePasteComposerImageAttachments"]
  onRemoveComposerAttachment: (path: string, tabKey?: string | null) => void
  onSelectCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onSelectSideChatTab: AgentWorkspaceState["handleSelectSideChatTab"]
  onSelectSessionTab: (sessionID: string, paneID?: string) => void
  onCancelSend: AgentWorkspaceState["handleCancelSend"]
  onPlanModeToggle: AgentWorkspaceState["handlePlanModeToggle"]
  onSend: AgentWorkspaceState["handleSend"]
  onSessionModelSelectionChange: AgentWorkspaceState["handleSessionModelSelectionChange"]
  onSetDraft: (tabKey: string, value: ComposerDraftState) => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  onTurnDiffRestore: (diffs: SessionDiffFile[], sessionID: string | null, paneID: string) => void | Promise<void>
  onTurnDiffReview: (files: string[], sessionID: string | null, paneID: string) => void | Promise<void>
  onTurnDiffSummaryHydrate: (turnID: string, diffSummary: SessionDiffSummary, sessionID?: string | null) => void | Promise<void>
}

const WorkbenchShellContext = createContext<WorkbenchShellProps | null>(null)

function useWorkbenchShellContext() {
  const props = useContext(WorkbenchShellContext)
  if (!props) {
    throw new Error("Workbench Dockview components must be rendered inside WorkbenchShell.")
  }
  return props
}

export function WorkbenchShell(props: WorkbenchShellProps) {
  const [api, setApi] = useState<DockviewApi | null>(null)
  const latestPropsRef = useRef(props)
  const isApplyingLayoutRef = useRef(false)
  const lastAppliedSerializedSignatureRef = useRef<string | null>(null)
  const lastEmittedSerializedSignatureRef = useRef(getSerializedDockviewSignature(props.dockviewLayout))
  const lastEmittedActiveSignatureRef = useRef<string | null>(null)
  const panelTitles = useMemo(() => buildPanelTitleMap(props.paneStateByID), [props.paneStateByID])
  const hasMultiplePanes = getDockviewGroupsInOrder(props.dockviewLayout).length > 1
  latestPropsRef.current = props

  const emitActiveDockviewChange = useCallback((layout: SerializedDockview | null) => {
    const groupID = getFocusedDockviewGroupID(layout)
    const panelID = getActiveDockviewPanelID(layout, groupID)
    const reference = getActiveDockviewPanelReference(layout, groupID)
    const activeSignature = [
      groupID ?? "",
      panelID ?? "",
      reference ? getWorkbenchDockPanelId(reference) : "",
    ].join("\u0000")
    if (activeSignature === lastEmittedActiveSignatureRef.current) return

    lastEmittedActiveSignatureRef.current = activeSignature
    latestPropsRef.current.onActiveDockviewChange({
      layout,
      groupID,
      panelID,
      reference,
    })
  }, [])

  const syncDockviewFromLayout = useCallback((dockviewApi: DockviewApi, serialized: SerializedDockview | null) => {
    const serializedSignature = getSerializedDockviewSignature(serialized)
    if (serializedSignature === lastAppliedSerializedSignatureRef.current) return

    isApplyingLayoutRef.current = true
    try {
      let appliedLayout: SerializedDockview | null = null
      if (serialized) {
        dockviewApi.fromJSON(serialized, { reuseExistingPanels: true })
        appliedLayout = dockviewApi.toJSON()
      } else {
        clearDockviewLayout(dockviewApi)
      }
      const appliedSignature = getSerializedDockviewSignature(appliedLayout)
      lastAppliedSerializedSignatureRef.current = appliedSignature
      lastEmittedSerializedSignatureRef.current = appliedSignature
      emitActiveDockviewChange(appliedLayout)
    } catch (error) {
      console.warn("[desktop] Failed to apply Dockview workbench layout; using an empty layout.", error)
      clearDockviewLayout(dockviewApi)
      const emptySignature = getSerializedDockviewSignature(null)
      lastAppliedSerializedSignatureRef.current = emptySignature
      lastEmittedSerializedSignatureRef.current = emptySignature
      emitActiveDockviewChange(null)
    } finally {
      isApplyingLayoutRef.current = false
    }
  }, [emitActiveDockviewChange])

  const readDockviewSnapshot = useCallback((dockviewApi: DockviewApi): SerializedDockview | null => {
    try {
      if (dockviewApi.totalPanels === 0) return null
      return dockviewApi.toJSON()
    } catch (error) {
      console.warn("[desktop] Failed to serialize Dockview workbench layout.", error)
      return null
    }
  }, [])

  const emitDockviewSnapshot = useCallback((dockviewApi: DockviewApi) => {
    if (isApplyingLayoutRef.current) return readDockviewSnapshot(dockviewApi)

    const serialized = readDockviewSnapshot(dockviewApi)
    const serializedSignature = getSerializedDockviewSignature(serialized)
    lastAppliedSerializedSignatureRef.current = serializedSignature
    if (serializedSignature !== lastEmittedSerializedSignatureRef.current) {
      lastEmittedSerializedSignatureRef.current = serializedSignature
      latestPropsRef.current.onLayoutChange(serialized)
    }
    emitActiveDockviewChange(serialized)
    return serialized
  }, [emitActiveDockviewChange, readDockviewSnapshot])

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    setApi(event.api)
    publishTestDockviewApi(event.api)
    syncDockviewFromLayout(event.api, latestPropsRef.current.dockviewLayout)
  }, [syncDockviewFromLayout])

  useEffect(() => {
    return () => publishTestDockviewApi(null)
  }, [])

  useEffect(() => {
    if (!api) return
    syncDockviewFromLayout(api, props.dockviewLayout)
  }, [api, props.dockviewLayout, syncDockviewFromLayout])

  useEffect(() => {
    if (!api) return

    for (const [panelID, title] of Object.entries(panelTitles)) {
      const panel = api.getPanel(panelID)
      if (panel && title && panel.title !== title) {
        panel.api.setTitle(title)
      }
    }
  }, [api, panelTitles])

  useEffect(() => {
    if (!api) return

    const disposables = [
      api.onDidLayoutChange(() => emitDockviewSnapshot(api)),
      api.onDidActivePanelChange(() => emitDockviewSnapshot(api)),
      api.onDidActiveGroupChange(() => emitDockviewSnapshot(api)),
    ]

    return () => {
      for (const disposable of disposables) {
        disposable.dispose()
      }
    }
  }, [api, emitDockviewSnapshot])

  useEffect(() => {
    if (!api) {
      latestPropsRef.current.onCommandsReady(null)
      return
    }

    const emitSnapshot = () => {
      return emitDockviewSnapshot(api)
    }
    const addPanel = (
      reference: WorkbenchDockPanelReference,
      options?: { targetGroupID?: string | null; title?: string; activate?: boolean; direction?: "left" | "right" | "above" | "below" | "within" },
    ) => {
      const id = getWorkbenchDockPanelId(reference)
      const position = options?.targetGroupID && api.getGroup(options.targetGroupID)
        ? {
            direction: options.direction ?? "within",
            referenceGroup: options.targetGroupID,
          }
        : undefined

      const panel = api.addPanel({
        id,
        component: WORKBENCH_DOCK_PANEL_COMPONENT,
        tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
        params: reference,
        title: options?.title ?? (reference.kind === "session" ? "Session" : "Create session"),
        inactive: options?.activate === false,
        position,
      })
      if (options?.activate !== false) {
        panel.api.setActive()
      }
      return panel
    }
    const openPanel: WorkbenchDockviewCommands["openPanel"] = (reference, options) => {
      const id = getWorkbenchDockPanelId(reference)
      const existing = api.getPanel(id)
      if (existing) {
        if (options?.title && existing.title !== options.title) {
          existing.api.setTitle(options.title)
        }
        if (options?.activate !== false) {
          existing.api.setActive()
        }
        emitSnapshot()
        return true
      }

      addPanel(reference, {
        activate: options?.activate,
        targetGroupID: options?.targetGroupID,
        title: options?.title,
      })
      emitSnapshot()
      return true
    }
    const focusPanel: WorkbenchDockviewCommands["focusPanel"] = (reference) => {
      const id = getWorkbenchDockPanelId(reference)
      const panel = api.getPanel(id)
      if (!panel) return false
      panel.api.setActive()
      emitSnapshot()
      return true
    }
    const closePanel: WorkbenchDockviewCommands["closePanel"] = (reference) => {
      const id = getWorkbenchDockPanelId(reference)
      const panel = api.getPanel(id)
      if (!panel) return false
      panel.api.close()
      emitSnapshot()
      return true
    }
    const commands: WorkbenchDockviewCommands = {
      openPanel,
      focusPanel,
      closePanel,
      replacePanel: (currentReference, nextReference, options) => {
        const currentID = getWorkbenchDockPanelId(currentReference)
        const nextID = getWorkbenchDockPanelId(nextReference)
        const currentPanel = api.getPanel(currentID)
        const existingNextPanel = api.getPanel(nextID)
        if (existingNextPanel) {
          existingNextPanel.api.setActive()
          currentPanel?.api.close()
          emitSnapshot()
          return true
        }
        if (!currentPanel) {
          return openPanel(nextReference, { title: options?.title })
        }

        addPanel(nextReference, {
          targetGroupID: currentPanel.group.id,
          title: options?.title,
        })
        currentPanel.api.close()
        emitSnapshot()
        return true
      },
      splitPanel: (reference, options) => {
        const id = getWorkbenchDockPanelId(reference)
        const direction = options.direction === "top" ? "above" : options.direction === "bottom" ? "below" : options.direction
        const targetGroupID = options.targetGroupID ?? api.activeGroup?.id ?? null
        const existing = api.getPanel(id)
        const targetGroup = targetGroupID ? api.getGroup(targetGroupID) : undefined
        if (existing && targetGroup) {
          existing.api.moveTo({
            group: targetGroup as any,
            position: options.direction === "top" ? "top" : options.direction === "bottom" ? "bottom" : options.direction,
          })
          existing.api.setActive()
          emitSnapshot()
          return true
        }
        addPanel(reference, {
          direction,
          targetGroupID,
          title: options.title,
        })
        emitSnapshot()
        return true
      },
      getSnapshot: () => readDockviewSnapshot(api),
    }

    latestPropsRef.current.onCommandsReady(commands)
    return () => latestPropsRef.current.onCommandsReady(null)
  }, [api, emitDockviewSnapshot, readDockviewSnapshot])

  const PanelComponent = useCallback((panelProps: IDockviewPanelProps<WorkbenchDockPanelReference>) => {
    const props = useWorkbenchShellContext()
    const groupID = panelProps.api.group.id
    const pane = findPaneStateForDockviewPanel(props.paneStateByID, groupID, panelProps.api.id)
    if (!pane) {
      return (
        <div
          className="workbench-pane dockview-workbench-missing-panel"
          data-dockview-group-id={groupID}
          data-dockview-panel-id={panelProps.api.id}
        />
      )
    }

    return (
      <WorkbenchPaneSurface
        assistantTraceVisibility={props.assistantTraceVisibility}
        composerRefreshVersion={props.composerRefreshVersion}
        isResolvingPermissionRequest={props.isResolvingPermissionRequest}
        isAgentDebugTraceEnabled={props.isAgentDebugTraceEnabled}
        isSavingToolPermissionMode={props.isSavingToolPermissionMode}
        isTopRow={false}
        pane={pane}
        permissionRequestActionError={props.permissionRequestActionError}
        permissionRequestActionRequestID={props.permissionRequestActionRequestID}
        toolPermissionMode={props.toolPermissionMode}
        toolPermissionModeError={props.toolPermissionModeError}
        workspaces={props.workspaces}
        onCreateSessionSubmit={props.onCreateSessionSubmit}
        onCreateSessionWorkspaceChange={props.onCreateSessionWorkspaceChange}
        onInspectFileInSidebar={props.onInspectFileInSidebar}
        onLocalFileLinkOpen={props.onLocalFileLinkOpen}
        onCreateSideChatTab={props.onCreateSideChatTab}
        onDeleteSideChatTab={props.onDeleteSideChatTab}
        onOpenSideChat={props.onOpenSideChat}
        onAskUserQuestionAnswer={props.onAskUserQuestionAnswer}
        onApproveProposedPlan={props.onApproveProposedPlan}
        onPermissionRequestResponse={props.onPermissionRequestResponse}
        onToolPermissionModeChange={props.onToolPermissionModeChange}
        onPickComposerAttachments={props.onPickComposerAttachments}
        onPasteComposerImageAttachments={props.onPasteComposerImageAttachments}
        onRemoveComposerAttachment={props.onRemoveComposerAttachment}
        onSelectSideChatTab={props.onSelectSideChatTab}
        onCancelSend={props.onCancelSend}
        onPlanModeToggle={props.onPlanModeToggle}
        onSend={props.onSend}
        onSessionModelSelectionChange={props.onSessionModelSelectionChange}
        onSetDraft={props.onSetDraft}
        onTurnDiffRestore={props.onTurnDiffRestore}
        onTurnDiffReview={props.onTurnDiffReview}
        onTurnDiffSummaryHydrate={props.onTurnDiffSummaryHydrate}
      />
    )
  }, [])

  const TabComponent = useCallback((tabProps: IDockviewPanelHeaderProps<WorkbenchDockPanelReference>) => {
    const props = useWorkbenchShellContext()
    const [isActive, setIsActive] = useState(tabProps.api.isActive)
    useEffect(() => {
      const disposable = tabProps.api.onDidActiveChange((event) => {
        setIsActive(event.isActive)
      })

      return () => disposable.dispose()
    }, [tabProps.api])

    const reference = tabProps.params ?? getWorkbenchDockPanelReference(tabProps.api.id)
    const pane = findPaneStateForDockviewPanel(props.paneStateByID, tabProps.api.group.id, tabProps.api.id)
    const paneTab = pane?.tabs.find((tab) => tab.key === tabProps.api.id) as WorkbenchPaneTab | undefined
    const title = paneTab?.title ?? tabProps.api.title ?? "Session"
    const createTabIndex = pane && paneTab?.kind === "create-session"
      ? pane.tabs.slice(0, pane.tabs.findIndex((tab) => tab.key === paneTab.key) + 1).filter((tab) => tab.kind === "create-session").length - 1
      : -1
    const tabClassName = joinClassNames(
      "dockview-workbench-tab",
      "session-tab",
      isActive ? "is-active" : null,
      reference?.kind === "create-session" ? "is-create-tab" : null,
    )
    const switchLabel =
      reference?.kind === "session"
        ? `Switch to session ${title}`
        : createTabIndex <= 0
          ? "Switch to create session tab"
          : `Switch to create session tab ${createTabIndex + 1}`
    const closeLabel =
      reference?.kind === "session"
        ? `Close session tab ${title}`
        : createTabIndex <= 0
          ? "Close create session tab"
          : `Close create session tab ${createTabIndex + 1}`

    const closePanel = () => {
      const paneID = pane?.id ?? tabProps.api.group.id
      if (reference?.kind === "session") {
        props.onCloseSessionTab(reference.sessionID, paneID)
        return
      }

      if (reference?.kind === "create-session") {
        props.onCloseCreateSessionTab(reference.createSessionTabID, paneID)
      }
    }
    const selectPanel = () => {
      tabProps.api.setActive()
    }

    return (
      <div className={tabClassName}>
        {isActive ? (
          <>
            <PaneTabActiveCurve side="start" />
            <PaneTabActiveCurve side="end" />
          </>
        ) : null}
        <button
          className="session-tab-trigger"
          aria-label={switchLabel}
          aria-pressed={isActive}
          title={switchLabel}
          type="button"
          onClick={selectPanel}
        >
          <span className="session-tab-copy">
            <span className="session-tab-title">{title}</span>
            {paneTab?.kind === "session" && paneTab.sessionKind === "side-chat" ? <SideChatBadge compact /> : null}
          </span>
        </button>
        <button
          className="session-tab-close"
          aria-label={closeLabel}
          draggable={false}
          title={closeLabel}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            closePanel()
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <CloseIcon />
        </button>
      </div>
    )
  }, [])

  const LeftHeaderActions = useCallback((headerProps: IDockviewHeaderActionsProps) => {
    const props = useWorkbenchShellContext()
    const pane = findPaneStateForDockviewPanel(props.paneStateByID, headerProps.group.id, headerProps.activePanel?.id)
    const paneID = pane?.id ?? headerProps.group.id
    if (paneID !== props.firstPaneID || props.isActivityRailVisible || !props.isSidebarCollapsed) {
      return null
    }

    return (
      <div className="dockview-workbench-header-actions pane-tab-bar-leading">
        <SidebarToggleButton
          isSidebarCollapsed={true}
          onToggleSidebar={props.onToggleLeftSidebar}
          side="left"
          variant="top-menu"
        />
      </div>
    )
  }, [])

  const RightHeaderActions = useCallback((headerProps: IDockviewHeaderActionsProps) => {
    const props = useWorkbenchShellContext()
    const pane = findPaneStateForDockviewPanel(props.paneStateByID, headerProps.group.id, headerProps.activePanel?.id)
    const paneID = pane?.id ?? headerProps.group.id
    const isLastPane = paneID === props.lastPaneID

    return (
      <div className="dockview-workbench-header-actions pane-tab-bar-trailing">
        <button
          className="canvas-region-top-menu-add-button dockview-workbench-add-tab-button"
          aria-label="Add session tab"
          title="Add session tab"
          type="button"
          onClick={() => {
            const existingCreateTab = pane?.tabs.find((tab) => tab.kind === "create-session")
            if (existingCreateTab?.kind === "create-session") {
              const panel = headerProps.panels.find(
                (item) => item.id === `create-session:${existingCreateTab.createSessionTabID}`,
              )
              panel?.api.setActive()
              return
            }
            props.onOpenCreateSessionTab(pane?.workspace?.id ?? null, paneID)
          }}
        >
          <PlusIcon />
        </button>
        {isLastPane ? (
          <>
            <SidebarToggleButton
              isSidebarCollapsed={props.isRightSidebarCollapsed}
              onToggleSidebar={props.onToggleRightSidebar}
              side="right"
              variant="top-menu"
            />
            {props.isRightSidebarCollapsed ? props.windowControls : null}
          </>
        ) : null}
      </div>
    )
  }, [])

  const components = useMemo(() => ({
    [WORKBENCH_DOCK_PANEL_COMPONENT]: PanelComponent,
  }), [PanelComponent])
  const tabComponents = useMemo(() => ({
    [WORKBENCH_DOCK_TAB_COMPONENT]: TabComponent,
  }), [TabComponent])

  return (
    <WorkbenchShellContext.Provider value={props}>
      <div
        className={joinClassNames(
          "workbench-panes",
          "dockview-workbench-panes",
          hasMultiplePanes ? "has-multiple" : null,
        )}
      >
        <DockviewReact
          className="dockview-theme-fanfande"
          components={components}
          defaultTabComponent={TabComponent}
          disableFloatingGroups
          getTabContextMenuItems={() => []}
          hideBorders
          leftHeaderActionsComponent={LeftHeaderActions}
          noPanelsOverlay="emptyGroup"
          rightHeaderActionsComponent={RightHeaderActions}
          singleTabMode="default"
          tabComponents={tabComponents}
          tabGroupAccent="off"
          onReady={handleReady}
        />
      </div>
    </WorkbenchShellContext.Provider>
  )
}
