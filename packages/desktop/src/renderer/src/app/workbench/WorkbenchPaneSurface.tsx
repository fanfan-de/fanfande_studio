import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import {
  Composer,
  CreateSessionCanvas,
  PaneTabBar,
  SessionCanvasTopMenu,
  ThreadView,
} from "../components"
import { ComposerUtilityBar } from "../ComposerUtilityBar"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type { AssistantTraceVisibility, ComposerDraftState } from "../types"
import { useProjectComposer } from "../use-project-composer"
import { isSideChatSession } from "../workspace"
import type { useAgentWorkspace } from "../use-agent-workspace"
import { WorkbenchDragLayer } from "./WorkbenchDragLayer"

export type PaneDropPosition = "center" | "left" | "right" | "top" | "bottom"

type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
type WorkbenchPaneState = AgentWorkspaceState["workbenchPaneStates"][number]
type PaneTabDescriptor =
  | {
      key: string
      kind: "session"
      sessionID: string
      title: string
      sessionKind?: NonNullable<WorkbenchPaneState["activeSession"]>["kind"]
      workflow?: NonNullable<WorkbenchPaneState["activeSession"]>["workflow"]
    }
  | {
      key: string
      kind: "create-session"
      createSessionTabID: string
      title: string
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

export interface WorkbenchPaneSurfaceProps {
  assistantTraceVisibility: AssistantTraceVisibility
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
  onOpenSideChat: AgentWorkspaceState["handleOpenSideChat"]
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
  onSetDraft: (tabKey: string, value: ComposerDraftState) => void
}

export const WorkbenchPaneSurface = memo(function WorkbenchPaneSurface({
  assistantTraceVisibility,
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
  onOpenSideChat,
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
}: WorkbenchPaneSurfaceProps) {
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
  const readOnlySideChat = isSideChatSession(pane.activeSession)

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
            activeSession={pane.activeSession}
            gitProjectID={pane.projectID}
            gitDirectory={pane.workspace?.directory ?? null}
            mcpOptions={composer.mcpOptions}
            pendingPermissionRequests={pane.pendingPermissionRequests}
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
                  draftState={pane.draftState}
                  hasPendingPermissionRequests={false}
                  isSending={pane.isSending || pane.isCreatingSession}
                  mcpOptions={composer.mcpOptions}
                  modelOptions={composer.modelOptions}
                  onDraftStateChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onMcpToggle={composer.handleMcpToggle}
                  reasoningEffortOptions={composer.reasoningEffortOptions}
                  permissionMode={pane.composerPermissionMode}
                  selectedMcpServerIDs={composer.selectedMcpServerIDs}
                  selectedModel={composer.selectedModel}
                  selectedModelLabel={composer.selectedModelLabel}
                  selectedReasoningEffort={composer.selectedReasoningEffort}
                  selectedReasoningEffortLabel={composer.selectedReasoningEffortLabel}
                  selectedSkillIDs={composer.selectedSkillIDs}
                  showModelSelector
                  showProjectTagCommands
                  skillOptions={composer.skillOptions}
                  unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
                  workspaceDirectory={pane.workspace?.directory ?? null}
                  onModelChange={composer.handleModelChange}
                  onPermissionModeToggle={() => pane.tabKey && onToggleComposerPermissionMode(pane.tabKey)}
                  onReasoningEffortChange={composer.handleReasoningEffortChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onSend={(draftStateOverride) =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      createSessionTabID: pane.createSessionTabID,
                      draftStateOverride,
                      paneID: pane.id,
                      selectedReasoningEffort: composer.selectedReasoningEffort,
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
                  showGitControls
                  showPermissionToggle
                  usage={null}
                />
              </div>
            </>
          ) : (
            <>
              <ThreadView
                activeProjectID={pane.projectID}
                activeSession={pane.activeSession}
                assistantTraceVisibility={assistantTraceVisibility}
                composerRefreshVersion={composerRefreshVersion}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isSendingQuestionAnswer={pane.isSending}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                pendingPermissionRequests={pane.pendingPermissionRequests}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                activeTurns={pane.activeTurns}
                sideChatAttachments={pane.activeSideChatAttachments}
                sideChatCountsByAnchorMessageID={pane.sideChatCountsByAnchorMessageID}
                sideChatDraftState={pane.activeSideChatDraftState}
                sideChatIsSending={pane.activeSideChatIsSending}
                sideChatPendingPermissionRequests={pane.activeSideChatPendingPermissionRequests}
                sideChatPermissionRequestActionError={permissionRequestActionError}
                sideChatPermissionRequestActionRequestID={permissionRequestActionRequestID}
                sideChatSession={pane.activeSideChatSession}
                sideChatTurns={pane.activeSideChatTurns}
                threadColumnRef={threadColumnRef}
                onAskUserQuestionAnswer={(answer) =>
                  void onSend({
                    attachmentsOverride: [],
                    draftStateOverride: createComposerDraftStateFromPlainText(answer.text),
                    paneID: pane.id,
                    preserveComposerState: true,
                    questionAnswer: answer.questionID
                      ? {
                          questionID: answer.questionID,
                          selectedOptions: answer.selectedOptions,
                          freeformText: answer.freeformText,
                        }
                      : undefined,
                    selectedReasoningEffort: composer.selectedReasoningEffort,
                    selectedSkillIDs: composer.selectedSkillIDs,
                    sessionID: pane.sessionID,
                    tabKey: pane.tabKey,
                    waitForPendingModelSelection: composer.awaitPendingModelSelection,
                  })
                }
                onFileChangeSelect={(file) => onInspectFileInSidebar(file, pane.sessionID, pane.id)}
                onOpenSideChat={(anchorMessageID) =>
                  void onOpenSideChat(anchorMessageID, {
                    paneID: pane.id,
                    parentSessionID: pane.sessionID,
                  })
                }
                onSideChatDraftStateChange={(value) => {
                  if (pane.activeSideChatTabKey) {
                    onSetDraft(pane.activeSideChatTabKey, value)
                  }
                }}
                onSideChatPickAttachments={({ allowImage, allowPdf, disabledReason }) =>
                  onPickComposerAttachments({
                    allowImage,
                    allowPdf,
                    disabledReason,
                    tabKey: pane.activeSideChatTabKey,
                  })
                }
                onSideChatRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.activeSideChatTabKey)}
                onSideChatSend={(input) =>
                  void onSend({
                    attachmentError: input.attachmentError,
                    draftStateOverride: input.draftStateOverride,
                    paneID: pane.id,
                    preserveComposerState: Boolean(input.questionAnswer),
                    questionAnswer: input.questionAnswer,
                    selectedReasoningEffort: input.selectedReasoningEffort,
                    selectedSkillIDs: input.selectedSkillIDs,
                    sessionID: pane.activeSideChatSession?.id,
                    tabKey: pane.activeSideChatTabKey,
                    waitForPendingModelSelection: input.waitForPendingModelSelection,
                  })
                }
                onPermissionRequestResponse={onPermissionRequestResponse}
              />
              <div className="composer-stack">
                <Composer
                  attachments={pane.composerAttachments}
                  attachmentButtonTitle={composer.attachmentButtonTitle}
                  attachmentDisabledReason={composer.attachmentDisabledReason}
                  attachmentError={composer.attachmentError}
                  canSend={Boolean(pane.activeSession)}
                  draftState={pane.draftState}
                  hasPendingPermissionRequests={pane.pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
                  isSending={pane.isSending}
                  mcpOptions={composer.mcpOptions}
                  modelOptions={composer.modelOptions}
                  onDraftStateChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onMcpToggle={readOnlySideChat ? undefined : composer.handleMcpToggle}
                  reasoningEffortOptions={composer.reasoningEffortOptions}
                  permissionMode={pane.composerPermissionMode}
                  selectedMcpServerIDs={composer.selectedMcpServerIDs}
                  selectedModel={composer.selectedModel}
                  selectedModelLabel={composer.selectedModelLabel}
                  selectedReasoningEffort={composer.selectedReasoningEffort}
                  selectedReasoningEffortLabel={composer.selectedReasoningEffortLabel}
                  selectedSkillIDs={composer.selectedSkillIDs}
                  showModelSelector={!readOnlySideChat}
                  showProjectTagCommands={!readOnlySideChat}
                  skillOptions={composer.skillOptions}
                  unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
                  workspaceDirectory={pane.workspace?.directory ?? null}
                  onModelChange={composer.handleModelChange}
                  onPermissionModeToggle={readOnlySideChat ? undefined : () => pane.tabKey && onToggleComposerPermissionMode(pane.tabKey)}
                  onReasoningEffortChange={composer.handleReasoningEffortChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onSend={(draftStateOverride) =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      draftStateOverride,
                      paneID: pane.id,
                      selectedReasoningEffort: composer.selectedReasoningEffort,
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
                  showGitControls={!readOnlySideChat}
                  showPermissionToggle={!readOnlySideChat}
                  usage={pane.activeSessionContextUsage}
                />
              </div>
            </>
          )}
        </div>
        {splitPreviewStyles ? <div className="workbench-pane-incoming-preview pane-drop-preview-incoming" style={splitPreviewStyles.incoming} aria-hidden="true" /> : null}
      </div>
      {draggedTabKey ? (
        <WorkbenchDragLayer
          dropTargetPosition={dropTargetPosition}
          isTopRow={isTopRow}
          paneID={pane.id}
          onPaneDropTargetChange={onPaneDropTargetChange}
          onPaneTabDrop={onPaneTabDrop}
        />
      ) : null}
    </section>
  )
})
