import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { SidebarToggleButton } from "../shared-ui"
import type { AssistantTraceVisibility, ComposerDraftState, ToolPermissionMode } from "../types"
import type { useAgentWorkspace } from "../use-agent-workspace"
import { WorkbenchPaneSurface, type PaneDropPosition } from "./WorkbenchPaneSurface"

type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
type WorkbenchLayout = AgentWorkspaceState["workbenchLayout"]
type WorkbenchPaneStateByID = AgentWorkspaceState["workbenchPaneStateByID"]

interface PaneDropTarget {
  paneID: string
  position: PaneDropPosition
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

export interface WorkbenchShellProps {
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion: number
  draggedTabKey: string | null
  firstPaneID: string | null
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSavingToolPermissionMode: boolean
  isRightSidebarCollapsed: boolean
  isSidebarCollapsed: boolean
  lastPaneID: string | null
  layout: WorkbenchLayout
  paneDropTarget: PaneDropTarget | null
  paneRefs: { current: Record<string, HTMLElement | null> }
  workbenchPanesRef: { current: HTMLDivElement | null }
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
  onFocusPane: (paneID: string) => void
  onInspectFileInSidebar: (file: string | null, sessionID: string | null, paneID: string) => void
  onOpenCreateSessionTab: (preferredWorkspaceID?: string | null, paneID?: string) => void
  onOpenSideChat: AgentWorkspaceState["handleOpenSideChat"]
  onPaneDropTargetChange: (paneID: string, position: PaneDropPosition | null) => void
  onPaneResizerPointerDown: (event: ReactPointerEvent<HTMLDivElement>, splitID: string, leftIndex: number) => void
  onPaneTabDragEnd: () => void
  onPaneTabDragStart: (paneID: string, tabKey: string) => void
  onPaneTabPointerDragMove: (clientX: number, clientY: number) => void
  onPaneTabPointerDrop: (clientX: number, clientY: number) => void
  onPaneTabDrop: (paneID: string, position: PaneDropPosition) => void
  onAskUserQuestionAnswer: AgentWorkspaceState["handleAskUserQuestionAnswer"]
  onPermissionRequestResponse: AgentWorkspaceState["handlePermissionRequestResponse"]
  onToolPermissionModeChange: (mode: ToolPermissionMode) => void | Promise<void>
  onPickComposerAttachments: AgentWorkspaceState["handlePickComposerAttachments"]
  onPasteComposerImageAttachments: AgentWorkspaceState["handlePasteComposerImageAttachments"]
  onRegisterPane: (paneID: string, node: HTMLElement | null) => void
  onRemoveComposerAttachment: (path: string, tabKey?: string | null) => void
  onSelectCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onSelectSessionTab: (sessionID: string, paneID?: string) => void
  onCancelSend: AgentWorkspaceState["handleCancelSend"]
  onSend: AgentWorkspaceState["handleSend"]
  onSessionModelSelectionChange: AgentWorkspaceState["handleSessionModelSelectionChange"]
  onSetDraft: (tabKey: string, value: ComposerDraftState) => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

export function WorkbenchShell(props: WorkbenchShellProps) {
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

interface WorkbenchNodeViewProps extends WorkbenchShellProps {
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
      <WorkbenchPaneSurface
        assistantTraceVisibility={props.assistantTraceVisibility}
        composerRefreshVersion={props.composerRefreshVersion}
        draggedTabKey={props.draggedTabKey}
        dropTargetPosition={props.paneDropTarget?.paneID === pane.id ? props.paneDropTarget.position : null}
        isResolvingPermissionRequest={props.isResolvingPermissionRequest}
        isAgentDebugTraceEnabled={props.isAgentDebugTraceEnabled}
        isSavingToolPermissionMode={props.isSavingToolPermissionMode}
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
        toolPermissionMode={props.toolPermissionMode}
        toolPermissionModeError={props.toolPermissionModeError}
        trailingAccessory={
          node.id === props.lastPaneID ? (
            <>
              <SidebarToggleButton
                isSidebarCollapsed={props.isRightSidebarCollapsed}
                onToggleSidebar={props.onToggleRightSidebar}
                side="right"
                variant="top-menu"
              />
              {props.isRightSidebarCollapsed ? props.windowControls : null}
            </>
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
        onOpenSideChat={props.onOpenSideChat}
        onPaneDropTargetChange={props.onPaneDropTargetChange}
        onPaneTabDragEnd={props.onPaneTabDragEnd}
        onPaneTabDragStart={props.onPaneTabDragStart}
        onPaneTabPointerDragMove={props.onPaneTabPointerDragMove}
        onPaneTabPointerDrop={props.onPaneTabPointerDrop}
        onPaneTabDrop={props.onPaneTabDrop}
        onAskUserQuestionAnswer={props.onAskUserQuestionAnswer}
        onPermissionRequestResponse={props.onPermissionRequestResponse}
        onToolPermissionModeChange={props.onToolPermissionModeChange}
        onPickComposerAttachments={props.onPickComposerAttachments}
        onPasteComposerImageAttachments={props.onPasteComposerImageAttachments}
        onRegisterPane={props.onRegisterPane}
        onRemoveComposerAttachment={props.onRemoveComposerAttachment}
        onSelectCreateSessionTab={props.onSelectCreateSessionTab}
        onSelectSessionTab={props.onSelectSessionTab}
        onCancelSend={props.onCancelSend}
        onSend={props.onSend}
        onSessionModelSelectionChange={props.onSessionModelSelectionChange}
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
