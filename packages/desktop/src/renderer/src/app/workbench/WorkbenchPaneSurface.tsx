import { memo, useRef, type CSSProperties, type ReactNode } from "react"
import {
  Composer,
  CreateSessionCanvas,
  PaneTabBar,
  SessionCanvasTopMenu,
  ThreadView,
} from "../components"
import { ComposerTaskProgress } from "../composer/ComposerTaskProgress"
import { ComposerUtilityBar } from "../ComposerUtilityBar"
import { getSessionWorkflowBadge, type SessionWorkflowBadge as SessionWorkflowBadgeInfo } from "../session-workflow"
import { getPendingStreamInsertionUserTurns } from "../stream-insertion"
import type { MarkdownLocalFileLinkTarget } from "../thread-markdown"
import { ThreadRichText } from "../thread-rich-text"
import type { AssistantTraceVisibility, ComposerDraftState, SessionDiffFile, SessionDiffSummary, ToolPermissionMode, UserTurn } from "../types"
import type { useAgentWorkspace } from "../use-agent-workspace"
import { useProjectComposer } from "../use-project-composer"
import { isSideChatSession } from "../workspace"
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

function ComposerPlanModeNotice({ workflow }: { workflow: SessionWorkflowBadgeInfo }) {
  return (
    <div className="composer-plan-mode-notice" role="status" title={workflow.description}>
      <span className="composer-plan-mode-dot" aria-hidden="true" />
      <span className="composer-plan-mode-label">{workflow.label}</span>
      <span className="composer-plan-mode-detail">Read-only research</span>
    </div>
  )
}

function getUserTurnPendingSteerText(turn: UserTurn) {
  return turn.displayText?.trim() || turn.text
}

function ComposerPendingSteerDrawer({ turns }: { turns: UserTurn[] }) {
  if (turns.length === 0) return null

  return (
    <div className="composer-pending-steer-drawer" aria-live="polite" aria-label="Pending submitted guidance">
      {turns.map((turn) => (
        <article key={turn.id} className="composer-pending-steer-card">
          <ThreadRichText
            as="div"
            className="composer-pending-steer-text"
            references={turn.references ?? []}
            text={getUserTurnPendingSteerText(turn)}
          />
          <div className="composer-pending-steer-note">
            <span>提交，但不中断模型运行</span>
            <span>下次模型/工具调用后</span>
          </div>
        </article>
      ))}
    </div>
  )
}

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
  isSavingToolPermissionMode: boolean
  isTopRow: boolean
  leadingAccessory: ReactNode
  pane: WorkbenchPaneState
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  style?: CSSProperties
  toolPermissionMode: ToolPermissionMode
  toolPermissionModeError: string | null
  trailingAccessory: ReactNode
  workspaces: AgentWorkspaceState["workspaces"]
  onCloseCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onCloseSessionTab: (sessionID: string, paneID?: string) => void
  onCreateSessionSubmit: (createSessionTabID?: string | null, paneID?: string) => Promise<void>
  onCreateSessionWorkspaceChange: (workspaceID: string, createSessionTabID?: string | null) => void
  onFocusPane: (paneID: string) => void
  onInspectFileInSidebar: (file: string | null, sessionID: string | null, paneID: string) => void
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
  onPaneDropTargetChange: (paneID: string, position: PaneDropPosition | null) => void
  onPaneTabDragEnd: () => void
  onPaneTabDragStart: (paneID: string, tabKey: string) => void
  onPaneTabPointerDragMove: (clientX: number, clientY: number) => void
  onPaneTabPointerDrop: (clientX: number, clientY: number) => void
  onPaneTabDrop: (paneID: string, position: PaneDropPosition) => void
  onAskUserQuestionAnswer: AgentWorkspaceState["handleAskUserQuestionAnswer"]
  onApproveProposedPlan: AgentWorkspaceState["handleApproveProposedPlan"]
  onPermissionRequestResponse: AgentWorkspaceState["handlePermissionRequestResponse"]
  onToolPermissionModeChange: (mode: ToolPermissionMode) => void | Promise<void>
  onPickComposerAttachments: AgentWorkspaceState["handlePickComposerAttachments"]
  onPasteComposerImageAttachments: AgentWorkspaceState["handlePasteComposerImageAttachments"]
  onRegisterPane: (paneID: string, node: HTMLElement | null) => void
  onRemoveComposerAttachment: (path: string, tabKey?: string | null) => void
  onSelectCreateSessionTab: (createSessionTabID: string, paneID?: string) => void
  onSelectSideChatTab: AgentWorkspaceState["handleSelectSideChatTab"]
  onSelectSessionTab: (sessionID: string, paneID?: string) => void
  onCancelSend: AgentWorkspaceState["handleCancelSend"]
  onPlanModeToggle: AgentWorkspaceState["handlePlanModeToggle"]
  onSend: AgentWorkspaceState["handleSend"]
  onSessionModelSelectionChange: AgentWorkspaceState["handleSessionModelSelectionChange"]
  onSetDraft: (tabKey: string, value: ComposerDraftState) => void
  onTurnDiffRestore: (diffs: SessionDiffFile[], sessionID: string | null, paneID: string) => void | Promise<void>
  onTurnDiffReview: (files: string[], sessionID: string | null, paneID: string) => void | Promise<void>
  onTurnDiffSummaryHydrate: (turnID: string, diffSummary: SessionDiffSummary, sessionID?: string | null) => void | Promise<void>
}

export const WorkbenchPaneSurface = memo(function WorkbenchPaneSurface({
  assistantTraceVisibility,
  composerRefreshVersion,
  draggedTabKey,
  dropTargetPosition,
  isResolvingPermissionRequest,
  isAgentDebugTraceEnabled,
  isSavingToolPermissionMode,
  isTopRow,
  leadingAccessory,
  pane,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  style,
  toolPermissionMode,
  toolPermissionModeError,
  trailingAccessory,
  workspaces,
  onCloseCreateSessionTab,
  onCloseSessionTab,
  onCreateSessionSubmit,
  onCreateSessionWorkspaceChange,
  onFocusPane,
  onInspectFileInSidebar,
  onLocalFileLinkOpen,
  onCreateSideChatTab,
  onDeleteSideChatTab,
  onOpenCreateSessionTab,
  onOpenSideChat,
  onPaneDropTargetChange,
  onPaneTabDragEnd,
  onPaneTabDragStart,
  onPaneTabPointerDragMove,
  onPaneTabPointerDrop,
  onPaneTabDrop,
  onAskUserQuestionAnswer,
  onApproveProposedPlan,
  onPermissionRequestResponse,
  onToolPermissionModeChange,
  onPickComposerAttachments,
  onPasteComposerImageAttachments,
  onRegisterPane,
  onRemoveComposerAttachment,
  onSelectCreateSessionTab,
  onSelectSideChatTab,
  onSelectSessionTab,
  onCancelSend,
  onPlanModeToggle,
  onSend,
  onSessionModelSelectionChange,
  onSetDraft,
  onTurnDiffRestore,
  onTurnDiffReview,
  onTurnDiffSummaryHydrate,
}: WorkbenchPaneSurfaceProps) {
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const splitPreviewPosition = draggedTabKey && dropTargetPosition && dropTargetPosition !== "center" ? dropTargetPosition : null
  const splitPreviewStyles = splitPreviewPosition ? getPaneDropPreviewStyles(splitPreviewPosition) : null

  const composer = useProjectComposer({
    attachmentPaths: pane.composerAttachments.map((attachment) => attachment.path),
    onSessionModelSelectionChange,
    projectID: pane.composerProjectID,
    refreshToken: composerRefreshVersion,
    sessionModelSelection: pane.activeSession?.modelSelection,
    sessionID: pane.sessionID,
  })
  const readOnlySideChat = isSideChatSession(pane.activeSession)
  const pendingSteerTurns = getPendingStreamInsertionUserTurns(pane.activeTurns)
  const composerWorkflowBadge = !readOnlySideChat ? getSessionWorkflowBadge(pane.activeSession?.workflow) : null
  const createSessionWorkflowBadge =
    pane.createSessionInitialWorkflowMode === "planning"
      ? getSessionWorkflowBadge({
          mode: "planning",
          plan: {
            status: "idle",
            updatedAt: 0,
          },
        })
      : null

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
            isSavingToolPermissionMode={isSavingToolPermissionMode}
            mcpOptions={composer.mcpOptions}
            pendingPermissionRequests={pane.pendingPermissionRequests}
            selectedMcpServerIDs={composer.selectedMcpServerIDs}
            selectedMcpServerLabel={composer.selectedMcpLabel}
            onMcpServerToggle={composer.handleMcpToggle}
            toolPermissionMode={toolPermissionMode}
            toolPermissionModeError={toolPermissionModeError}
            onToolPermissionModeChange={onToolPermissionModeChange}
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
                <ComposerTaskProgress tasks={pane.activeSessionRuntimeDebug?.tasks ?? null} />
                <Composer
                  attachments={pane.composerAttachments}
                  attachmentButtonTitle={composer.attachmentButtonTitle}
                  attachmentDisabledReason={composer.attachmentDisabledReason}
                  attachmentError={composer.attachmentError}
                  canSend={Boolean(pane.createSessionWorkspaceID)}
                  canPasteImageAttachments={composer.attachmentCapabilities.image && composer.attachmentDisabledReason === null}
                  draftState={pane.draftState}
                  hasPendingPermissionRequests={false}
                  isCancelling={pane.isCancelling}
                  isInterruptible={pane.isInterruptible || pane.isCreatingSession}
                  isSending={pane.isSending || pane.isCreatingSession}
                  mcpOptions={composer.mcpOptions}
                  modelOptions={composer.modelOptions}
                  onDraftStateChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onMcpToggle={composer.handleMcpToggle}
                  reasoningEffortOptions={composer.reasoningEffortOptions}
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
                  onReasoningEffortChange={composer.handleReasoningEffortChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onPasteImageAttachments={(images) =>
                    onPasteComposerImageAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      disabledReason: composer.attachmentDisabledReason,
                      images,
                      tabKey: pane.tabKey,
                    })
                  }
                  onPlanModeToggle={
                    pane.createSessionTabID
                      ? () => void onPlanModeToggle({ createSessionTabID: pane.createSessionTabID })
                      : readOnlySideChat
                      ? undefined
                      : () => void onPlanModeToggle({ sessionID: pane.sessionID })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onCancelSend={() => void onCancelSend({ tabKey: pane.tabKey })}
                  onSend={(draftStateOverride) =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      createSessionTabID: pane.createSessionTabID,
                      draftStateOverride,
                      paneID: pane.id,
                      selectedReasoningEffort: composer.selectedReasoningEffort,
                      selectedModel: composer.selectedModel,
                      selectedSkillIDs: composer.selectedSkillIDs,
                      tabKey: pane.tabKey,
                      waitForPendingModelSelection: composer.awaitPendingModelSelection,
                    })
                  }
                />
                {createSessionWorkflowBadge ? <ComposerPlanModeNotice workflow={createSessionWorkflowBadge} /> : null}
                <ComposerUtilityBar
                  contextWindow={composer.contextWindow}
                  gitDirectory={pane.workspace?.directory ?? null}
                  gitProjectID={pane.projectID}
                  showGitControls
                  usage={null}
                />
              </div>
            </>
          ) : (
            <>
              <ThreadView
                activeProjectID={pane.projectID}
                activeSession={pane.activeSession}
                activeSessionDiff={pane.activeSessionDiff}
                assistantTraceVisibility={assistantTraceVisibility}
                composerRefreshVersion={composerRefreshVersion}
                isResolvingPermissionRequest={isResolvingPermissionRequest}
                isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                pendingPermissionRequests={pane.pendingPermissionRequests}
                permissionRequestActionError={permissionRequestActionError}
                permissionRequestActionRequestID={permissionRequestActionRequestID}
                activeTurns={pane.activeTurns}
                sideChatAttachments={pane.activeSideChatAttachments}
                sideChatCountsByAnchorMessageID={pane.sideChatCountsByAnchorMessageID}
                sideChatDraftState={pane.activeSideChatDraftState}
                sideChatIsCancelling={pane.activeSideChatIsCancelling}
                sideChatIsInterruptible={pane.activeSideChatIsInterruptible}
                sideChatIsSending={pane.activeSideChatIsSending}
                sideChatPendingPermissionRequests={pane.activeSideChatPendingPermissionRequests}
                sideChatPermissionRequestActionError={permissionRequestActionError}
                sideChatPermissionRequestActionRequestID={permissionRequestActionRequestID}
                sideChatSession={pane.activeSideChatSession}
                sideChatSessionsByAnchorMessageID={pane.sideChatSessionsByAnchorMessageID}
                sideChatTurns={pane.activeSideChatTurns}
                threadColumnRef={threadColumnRef}
                onSessionModelSelectionChange={onSessionModelSelectionChange}
                onAskUserQuestionAnswer={(answer) =>
                  onAskUserQuestionAnswer({
                    freeformText: answer.freeformText,
                    questionID: answer.questionID,
                    selectedOptions: answer.selectedOptions,
                    sessionID: pane.sessionID,
                    tabKey: pane.tabKey,
                    text: answer.text,
                  })
                }
                onFileChangeSelect={(file) => onInspectFileInSidebar(file, pane.sessionID, pane.id)}
                onTurnDiffRestore={(files) => onTurnDiffRestore(files, pane.sessionID, pane.id)}
                onTurnDiffReview={(files) => onTurnDiffReview(files, pane.sessionID, pane.id)}
                onTurnDiffSummaryHydrate={(turnID, diffSummary) => onTurnDiffSummaryHydrate(turnID, diffSummary, pane.sessionID)}
                onLocalFileLinkOpen={(target) =>
                  onLocalFileLinkOpen({
                    paneID: pane.id,
                    sessionID: pane.sessionID,
                    target,
                    workspaceDirectory: pane.workspace?.directory ?? null,
                  })
                }
                onOpenSideChat={(anchorMessageID) =>
                  void onOpenSideChat(anchorMessageID, {
                    paneID: pane.id,
                    parentSessionID: pane.sessionID,
                  })
                }
                onSideChatCreate={(anchorMessageID) =>
                  void onCreateSideChatTab(anchorMessageID, {
                    paneID: pane.id,
                    parentSessionID: pane.sessionID,
                  })
                }
                onSideChatDelete={(sessionID) => void onDeleteSideChatTab(sessionID)}
                onSideChatSelect={(sessionID) => void onSelectSideChatTab(sessionID)}
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
                onSideChatPasteImageAttachments={({ allowImage, disabledReason, images }) =>
                  onPasteComposerImageAttachments({
                    allowImage,
                    disabledReason,
                    images,
                    tabKey: pane.activeSideChatTabKey,
                  })
                }
                onSideChatRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.activeSideChatTabKey)}
                onSideChatCancelSend={() => void onCancelSend({
                  sessionID: pane.activeSideChatSession?.id,
                  tabKey: pane.activeSideChatTabKey,
                })}
                onSideChatSend={(input) =>
                  void onSend({
                    attachmentError: input.attachmentError,
                    draftStateOverride: input.draftStateOverride,
                    paneID: pane.id,
                    preserveComposerState: Boolean(input.questionAnswer),
                    questionAnswer: input.questionAnswer,
                    selectedReasoningEffort: input.selectedReasoningEffort,
                    selectedModel: input.selectedModel,
                    selectedSkillIDs: input.selectedSkillIDs,
                    sessionID: pane.activeSideChatSession?.id,
                    submissionMode: input.submissionMode,
                    tabKey: pane.activeSideChatTabKey,
                    waitForPendingModelSelection: input.waitForPendingModelSelection,
                  })
                }
                onProposedPlanConfirm={(input) =>
                  onApproveProposedPlan({
                    planMarkdown: input.planMarkdown,
                    selectedReasoningEffort: composer.selectedReasoningEffort,
                    selectedModel: composer.selectedModel,
                    selectedSkillIDs: composer.selectedSkillIDs,
                    sessionID: pane.sessionID,
                    tabKey: pane.tabKey,
                    waitForPendingModelSelection: composer.awaitPendingModelSelection,
                  })
                }
                onPermissionRequestResponse={onPermissionRequestResponse}
              />
              <div className="composer-stack">
                <ComposerTaskProgress tasks={pane.activeSessionRuntimeDebug?.tasks ?? null} />
                <ComposerPendingSteerDrawer turns={pendingSteerTurns} />
                <Composer
                  attachments={pane.composerAttachments}
                  attachmentButtonTitle={composer.attachmentButtonTitle}
                  attachmentDisabledReason={composer.attachmentDisabledReason}
                  attachmentError={composer.attachmentError}
                  canSend={Boolean(pane.activeSession)}
                  canPasteImageAttachments={composer.attachmentCapabilities.image && composer.attachmentDisabledReason === null}
                  draftState={pane.draftState}
                  hasPendingPermissionRequests={pane.pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
                  isCancelling={pane.isCancelling}
                  isInterruptible={pane.isInterruptible}
                  isSending={pane.isSending}
                  mcpOptions={composer.mcpOptions}
                  modelOptions={composer.modelOptions}
                  onDraftStateChange={(value) => pane.tabKey && onSetDraft(pane.tabKey, value)}
                  onMcpToggle={readOnlySideChat ? undefined : composer.handleMcpToggle}
                  reasoningEffortOptions={composer.reasoningEffortOptions}
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
                  onReasoningEffortChange={composer.handleReasoningEffortChange}
                  onPickAttachments={() =>
                    onPickComposerAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      allowPdf: composer.attachmentCapabilities.pdf,
                      disabledReason: composer.attachmentDisabledReason,
                      tabKey: pane.tabKey,
                    })
                  }
                  onPasteImageAttachments={(images) =>
                    onPasteComposerImageAttachments({
                      allowImage: composer.attachmentCapabilities.image,
                      disabledReason: composer.attachmentDisabledReason,
                      images,
                      tabKey: pane.tabKey,
                    })
                  }
                  onPlanModeToggle={
                    readOnlySideChat
                      ? undefined
                      : () => void onPlanModeToggle({ sessionID: pane.sessionID })
                  }
                  onRemoveAttachment={(path) => onRemoveComposerAttachment(path, pane.tabKey)}
                  onCancelSend={() => void onCancelSend({
                    sessionID: pane.sessionID,
                    tabKey: pane.tabKey,
                  })}
                  onSend={(draftStateOverride) =>
                    void onSend({
                      attachmentError: composer.attachmentError,
                      draftStateOverride,
                      paneID: pane.id,
                      selectedReasoningEffort: composer.selectedReasoningEffort,
                      selectedModel: composer.selectedModel,
                      selectedSkillIDs: composer.selectedSkillIDs,
                      sessionID: pane.sessionID,
                      submissionMode: pane.isSending || pane.isInterruptible ? "steer" : undefined,
                      tabKey: pane.tabKey,
                      waitForPendingModelSelection: composer.awaitPendingModelSelection,
                    })
                  }
                />
                {composerWorkflowBadge ? <ComposerPlanModeNotice workflow={composerWorkflowBadge} /> : null}
                <ComposerUtilityBar
                  contextWindow={composer.contextWindow}
                  gitDirectory={pane.workspace?.directory ?? null}
                  gitProjectID={pane.projectID}
                  showGitControls={!readOnlySideChat}
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
