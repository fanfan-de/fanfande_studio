import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject, type SetStateAction } from "react"
import { Composer } from "../composer/Composer"
import { createComposerDraftStateFromPlainText, createEmptyComposerDraftState } from "../composer/draft-state"
import { getAgentSessionBridge } from "../agent-session/client"
import { useProjectComposer } from "../use-project-composer"
import { buildTurnsFromHistory } from "../stream"
import { ThreadRichText } from "../thread-rich-text"
import { mergeUserTurnPresentationState, readPersistedUserTurns } from "../user-turn-presentation"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DeleteIcon,
  DisconnectedStatusIcon,
  FileTextIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  LayoutSidebarRightIcon,
  LeftSidebarCollapseIcon,
  LeftSidebarExpandIcon,
  MaximizeIcon,
  MinimizeIcon,
  NewItemIcon,
  OpenInEditorIcon,
  MoonIcon,
  MonitorIcon,
  PaletteIcon,
  PaperclipIcon,
  ResetIcon,
  RestoreIcon,
  SunIcon,
  RightSidebarCollapseIcon,
  RightSidebarExpandIcon,
  SettingsIcon,
  SortIcon,
  TerminalIcon
} from "../icons"
import type {
  AssistantTraceSectionKey,
  BrandTheme,
  ColorMode,
  AssistantTurn,
  AssistantTraceItem,
  AssistantTraceVisibility,
  AssistantTraceVisibilityKey,
  ComposerAttachment,
  ComposerDraftState,
  ComposerMcpOption,
  ComposerSkillOption,
  CreateSessionTab,
  GlobalSkillTreeNode,
  LeftSidebarView,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  OpenAIReasoningEffort,
  PermissionDecision,
  PermissionRequest,
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
  PreviewComment,
  PreviewMode,
  ProjectModelSelection,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel,
  RightSidebarView,
  ArchivedSessionSummary,
  SessionDiffState,
  SessionDiffSummary,
  SessionRuntimeDebugSnapshot,
  SessionRuntimeDebugState,
  SessionSummary,
  SidebarActionKey,
  Turn,
  UserTurn,
  WindowAction,
  WorkspaceFileReviewState,
  WorkspacePreviewState,
  WorkspaceGroup
} from "../types"
import { formatTime } from "../utils"
import { isSideChatSession } from "../workspace"
import { joinClassNames, writeTextToClipboard } from "../shared-ui"

interface ThreadViewProps {
  activeProjectID?: string | null
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion?: number
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSendingQuestionAnswer: boolean
  showSessionBanner?: boolean
  onFileChangeSelect?: (file: string) => void
  onOpenSideChat?: (anchorMessageID: string) => void | Promise<void>
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  sideChatAttachments?: ComposerAttachment[]
  sideChatCountsByAnchorMessageID: Record<string, number>
  sideChatDraftState?: ComposerDraftState
  sideChatIsSending?: boolean
  sideChatPendingPermissionRequests?: PermissionRequest[]
  sideChatPermissionRequestActionError?: string | null
  sideChatPermissionRequestActionRequestID?: string | null
  sideChatSession?: SessionSummary | null
  sideChatTurns?: Turn[]
  threadColumnRef: RefObject<HTMLDivElement | null>
  onAskUserQuestionAnswer: QuestionAnswerHandler
  onSideChatDraftStateChange?: (value: ComposerDraftState) => void
  onSideChatPickAttachments?: (input: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason: string | null
  }) => void | Promise<void>
  onSideChatRemoveAttachment?: (path: string) => void
  onSideChatSend?: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
  onPermissionRequestResponse: PermissionRequestResponseHandler
}

type PermissionRequestResponseHandler = (input: {
  sessionID: string
  request: PermissionRequest
  decision: PermissionDecision
  note?: string
}) => void | Promise<void>

type QuestionAnswerHandler = (input: {
  text: string
  questionID?: string
  selectedOptions?: string[]
  freeformText?: string
}) => void | Promise<void>

function UserTurnBubble({ turn }: { turn: UserTurn }) {
  const displayText = turn.displayText?.trim() || ""
  const references = turn.references ?? []
  const attachments = turn.attachments ?? []
  const hasStructuredContent = Boolean(displayText) || references.length > 0 || attachments.length > 0
  const bodyText = displayText || (references.length > 0 ? references.map((reference) => `@${reference.label}`).join(" ") : turn.text)

  if (!hasStructuredContent) {
    return (
      <div className="user-bubble">
        <ThreadRichText as="div" className="user-bubble-text" text={turn.text} />
      </div>
    )
  }

  return (
    <div className="user-bubble">
      <div className="user-bubble-content">
        <ThreadRichText as="div" className="user-bubble-text" references={references} text={bodyText} />

        {attachments.length > 0 ? (
          <div className="user-bubble-chip-strip" aria-label="Sent attachments">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.path ?? attachment.name}:${index}`}
                className="user-bubble-chip user-bubble-attachment-chip"
              >
                <PaperclipIcon />
                <span className="user-bubble-chip-label" title={attachment.path ?? attachment.name}>
                  {attachment.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

const primaryPermissionDecisions: PermissionDecision[] = ["deny", "allow-once"]

function formatPermissionRiskLabel(risk: PermissionRequest["prompt"]["risk"]) {
  return `${risk} risk`
}

function formatPermissionDecisionLabel(decision: PermissionDecision) {
  switch (decision) {
    case "allow-once":
      return "Allow once"
    case "allow-session":
      return "Allow this session"
    case "allow-project":
      return "Allow this project"
    case "allow-forever":
      return "Allow always"
    case "deny":
      return "Deny"
  }
}

function isPersistentAllowDecision(decision: PermissionDecision) {
  return decision === "allow-session" || decision === "allow-project" || decision === "allow-forever"
}

function isResponseTraceItem(item: AssistantTraceItem) {
  return item.kind === "text" || item.kind === "question"
}

function isToolTraceItem(item: AssistantTraceItem) {
  return item.kind === "tool"
}

function isSourceTraceItem(item: AssistantTraceItem) {
  return item.section === "sources" || item.kind === "source"
}

function isFileChangeTraceItem(item: AssistantTraceItem) {
  return item.section === "file-change" || item.kind === "patch" || item.kind === "file" || item.kind === "image"
}

function defaultTraceSectionKeyForItem(item: AssistantTraceItem): AssistantTraceSectionKey {
  if (isResponseTraceItem(item)) return "response"
  if (isSourceTraceItem(item)) return "sources"
  if (isFileChangeTraceItem(item)) return "file-change"
  if (isToolTraceItem(item)) return "tools"
  if (item.kind === "reasoning") return "reasoning"
  if (item.kind === "step" || item.kind === "retry" || item.kind === "snapshot" || item.kind === "subtask") {
    return "workflow"
  }
  if (item.kind === "system") return "debug"
  return "workflow"
}

function traceVisibilityKeyForItem(item: AssistantTraceItem): AssistantTraceVisibilityKey | null {
  if (item.kind === "error") return null
  if (item.visibilityKey) return item.visibilityKey

  const sectionKey = traceSectionKeyForItem(item)
  switch (sectionKey) {
    case "response":
      return "response"
    case "reasoning":
      return "reasoning"
    case "tools":
      return "toolCalls"
    case "sources":
      return "sources"
    case "approvals":
      return "approvals"
    case "file-change":
      return "files"
    case "debug":
      return "debugMetadata"
    default:
      return "workflow"
  }
}

function traceSectionKeyForItem(item: AssistantTraceItem): AssistantTraceSectionKey {
  return item.section ?? defaultTraceSectionKeyForItem(item)
}

function traceSectionTitle(sectionKey: AssistantTraceSectionKey) {
  switch (sectionKey) {
    case "tools":
      return "Tools"
    case "sources":
      return "Sources"
    case "approvals":
      return "Approvals"
    case "workflow":
      return "Workflow"
    case "response":
      return "Response"
    case "file-change":
      return "File Changes"
    case "debug":
      return "Debug"
    default:
      return "Reasoning"
  }
}

function buildAssistantTraceBlocks(items: AssistantTraceItem[]) {
  return items.reduce<
    {
      sectionKey: AssistantTraceSectionKey
      title: string
      items: AssistantTraceItem[]
    }[]
  >(
    (blocks, item) => {
      const sectionKey = traceSectionKeyForItem(item)
      if (sectionKey === "file-change") {
        const fileChangeBlock = blocks.find((block) => block.sectionKey === "file-change")
        if (fileChangeBlock) {
          fileChangeBlock.items.push(item)
          return blocks
        }

        blocks.push({
          sectionKey,
          title: traceSectionTitle(sectionKey),
          items: [item],
        })
        return blocks
      }

      const fileChangeBlockIndex = blocks.findIndex((block) => block.sectionKey === "file-change")
      const insertIndex = fileChangeBlockIndex === -1 ? blocks.length : fileChangeBlockIndex
      const previousBlock = blocks[insertIndex - 1]

      if (previousBlock && previousBlock.sectionKey === sectionKey) {
        previousBlock.items.push(item)
        return blocks
      }

      blocks.splice(insertIndex, 0, {
        sectionKey,
        title: traceSectionTitle(sectionKey),
        items: [item],
      })
      return blocks
    },
    [],
  )
}

function filterRenderedAssistantTraceItems(
  items: AssistantTraceItem[],
  showFileChanges: boolean,
  traceVisibility: AssistantTraceVisibility,
) {
  return items.filter((item) => {
    const sectionKey = traceSectionKeyForItem(item)
    if (!showFileChanges && sectionKey === "file-change") return false
    const visibilityKey = traceVisibilityKeyForItem(item)
    if (visibilityKey === null) return true
    if (!traceVisibility[visibilityKey]) return false
    return true
  })
}

function hasResponseTraceItems(items: AssistantTraceItem[]) {
  return items.some((item) => traceSectionKeyForItem(item) === "response")
}

function buildAssistantResponseCopyText(items: AssistantTraceItem[]) {
  return items
    .map((item) => {
      const segments = [item.title, item.text, item.detail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))

      return segments.join("\n\n")
    })
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function getAssistantEphemeralHint(turn: AssistantTurn) {
  switch (turn.runtime.phase) {
    case "requesting":
    case "waiting_first_event":
    case "preparing":
      return "Preparing..."
    case "waiting_llm":
      return "Waiting for model..."
    case "reasoning":
      return "Thinking..."
    case "tool_running":
      return turn.runtime.toolName ? `Running ${turn.runtime.toolName}...` : "Running tools..."
    case "waiting_approval":
      return "Waiting for approval..."
    case "blocked":
      return turn.state || "Blocked..."
    case "responding":
      return "Responding..."
    default:
      return null
  }
}

function summarizeFileChangeItems(items: AssistantTraceItem[]) {
  const latestPatch = [...items].reverse().find((item) => item.kind === "patch")
  if (latestPatch) return [latestPatch]

  const latestItem = items[items.length - 1]
  return latestItem ? [latestItem] : []
}

function AssistantTraceSection({
  children,
  sectionKey,
  title,
}: {
  children: ReactNode
  sectionKey: AssistantTraceSectionKey
  title: string
}) {
  return (
    <section className={`assistant-section is-${sectionKey}`} role="region" aria-label={title}>
      <div className="assistant-section-body">{children}</div>
    </section>
  )
}

function AssistantTurnPlaceholder({ message }: { message: string }) {
  return (
    <section className="assistant-section assistant-ephemeral-state" aria-live="polite" aria-label="Assistant status">
      <p className="assistant-ephemeral-hint">{message}</p>
    </section>
  )
}

function AssistantTurnSections({
  answeredQuestionIDs,
  isQuestionAnswerDisabled = false,
  items,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  renderAfterSection,
  showFileChanges,
  traceVisibility,
  turnID,
}: {
  answeredQuestionIDs: Set<string>
  isQuestionAnswerDisabled?: boolean
  items: AssistantTraceItem[]
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect: ((file: string) => void) | undefined
  renderAfterSection?: (input: {
    items: AssistantTraceItem[]
    sectionKey: AssistantTraceSectionKey
    title: string
  }) => ReactNode
  showFileChanges: boolean
  traceVisibility: AssistantTraceVisibility
  turnID: string
}) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, showFileChanges, traceVisibility))

  return (
    <>
      {blocks.map((block, index) => {
        const renderedItems = block.sectionKey === "file-change" ? summarizeFileChangeItems(block.items) : block.items

        return (
          <AssistantTraceSection
            key={`${turnID}-${block.sectionKey}-${index}`}
            sectionKey={block.sectionKey}
            title={block.title}
          >
            <div
              className={
                block.sectionKey === "response"
                  ? "assistant-response-stack"
                  : block.sectionKey === "file-change"
                    ? "assistant-file-change-stack"
                    : "assistant-section-list"
              }
            >
              {renderedItems.map((item) => (
                <TraceItemView
                  key={item.id}
                  answeredQuestionIDs={answeredQuestionIDs}
                  item={item}
                  isQuestionAnswerDisabled={isQuestionAnswerDisabled}
                  onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                  onFileChangeSelect={onFileChangeSelect}
                  traceVisibility={traceVisibility}
                />
              ))}
              {renderAfterSection
                ? renderAfterSection({
                    items: renderedItems,
                    sectionKey: block.sectionKey,
                    title: block.title,
                  })
                : null}
            </div>
          </AssistantTraceSection>
        )
      })}
    </>
  )
}

interface InlineSideChatThreadProps {
  activeProjectID: string | null
  attachments: ComposerAttachment[]
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion: number
  draftState: ComposerDraftState
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  isSending: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  session: SessionSummary
  turns: Turn[]
  onDraftStateChange: (value: ComposerDraftState) => void
  onHide: () => void
  onPermissionRequestResponse: PermissionRequestResponseHandler
  onPickAttachments: (input: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason: string | null
  }) => void | Promise<void>
  onRemoveAttachment: (path: string) => void
  onSend: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
}

function InlineSideChatThread({
  activeProjectID,
  attachments,
  assistantTraceVisibility,
  composerRefreshVersion,
  draftState,
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  isSending,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  session,
  turns,
  onDraftStateChange,
  onHide,
  onPermissionRequestResponse,
  onPickAttachments,
  onRemoveAttachment,
  onSend,
}: InlineSideChatThreadProps) {
  const composer = useProjectComposer({
    attachmentPaths: attachments.map((attachment) => attachment.path),
    projectID: activeProjectID,
    refreshToken: composerRefreshVersion,
  })
  const [hydratedTurns, setHydratedTurns] = useState<Turn[]>(turns)
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const effectiveTurns = turns.length > 0 ? turns : hydratedTurns

  useEffect(() => {
    if (turns.length > 0) {
      setHydratedTurns(turns)
      return
    }

    const agentSession = getAgentSessionBridge()
    if (!agentSession) {
      setHydratedTurns([])
      return
    }

    let isCancelled = false
    setHydratedTurns([])

    void agentSession.loadHistory({ backendSessionID: session.id })
      .then((messages) => {
        if (isCancelled) return
        const nextTurns = buildTurnsFromHistory(messages)
        setHydratedTurns(mergeUserTurnPresentationState(readPersistedUserTurns(session.id), nextTurns))
      })
      .catch((error) => {
        if (isCancelled) return
        console.error("[desktop] agentSession.loadHistory failed for inline side chat:", error)
      })

    return () => {
      isCancelled = true
    }
  }, [session.id, turns])

  return (
    <section className="inline-side-chat-thread" aria-label="Nested side chat">
      <header className="inline-side-chat-header">
        <div className="inline-side-chat-copy">
          <strong title={session.origin?.anchorPreview || session.title}>{session.origin?.anchorPreview || session.title}</strong>
        </div>
        <button
          aria-label="Hide side chat"
          className="inline-side-chat-close"
          title="Hide side chat"
          type="button"
          onClick={onHide}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="inline-side-chat-body">
        <ThreadView
          activeProjectID={activeProjectID}
          activeSession={session}
          activeTurns={effectiveTurns}
          assistantTraceVisibility={assistantTraceVisibility}
          composerRefreshVersion={composerRefreshVersion}
          isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
          isResolvingPermissionRequest={isResolvingPermissionRequest}
          isSendingQuestionAnswer={isSending}
          pendingPermissionRequests={pendingPermissionRequests}
          permissionRequestActionError={permissionRequestActionError}
          permissionRequestActionRequestID={permissionRequestActionRequestID}
          showSessionBanner={false}
          sideChatCountsByAnchorMessageID={{}}
          threadColumnRef={threadColumnRef}
          onAskUserQuestionAnswer={(answer) =>
            void onSend({
              draftStateOverride: createComposerDraftStateFromPlainText(answer.text),
              questionAnswer: answer.questionID
                ? {
                    questionID: answer.questionID,
                    selectedOptions: answer.selectedOptions,
                    freeformText: answer.freeformText,
                  }
                : undefined,
              selectedReasoningEffort: composer.selectedReasoningEffort,
              selectedSkillIDs: composer.selectedSkillIDs,
              waitForPendingModelSelection: composer.awaitPendingModelSelection,
            })
          }
          onPermissionRequestResponse={onPermissionRequestResponse}
        />

        <Composer
          attachments={attachments}
          attachmentButtonTitle={composer.attachmentButtonTitle}
          attachmentDisabledReason={composer.attachmentDisabledReason}
          attachmentError={composer.attachmentError}
          canSend
          draftState={draftState}
          hasPendingPermissionRequests={pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
          isSending={isSending}
          mcpOptions={composer.mcpOptions}
          modelOptions={composer.modelOptions}
          permissionMode="default"
          reasoningEffortOptions={composer.reasoningEffortOptions}
          selectedMcpServerIDs={composer.selectedMcpServerIDs}
          selectedModel={composer.selectedModel}
          selectedModelLabel={composer.selectedModelLabel}
          selectedReasoningEffort={composer.selectedReasoningEffort}
          selectedReasoningEffortLabel={composer.selectedReasoningEffortLabel}
          selectedSkillIDs={composer.selectedSkillIDs}
          showModelSelector={false}
          placeholder="Ask a follow-up about this reply."
          showProjectTagCommands={false}
          skillOptions={composer.skillOptions}
          unsupportedAttachmentPaths={composer.unsupportedAttachmentPaths}
          workspaceDirectory={null}
          onDraftStateChange={onDraftStateChange}
          onModelChange={composer.handleModelChange}
          onReasoningEffortChange={composer.handleReasoningEffortChange}
          onPickAttachments={() =>
            onPickAttachments({
              allowImage: composer.attachmentCapabilities.image,
              allowPdf: composer.attachmentCapabilities.pdf,
              disabledReason: composer.attachmentDisabledReason,
            })
          }
          onRemoveAttachment={onRemoveAttachment}
          onSend={(draftStateOverride) =>
            void onSend({
              attachmentError: composer.attachmentError,
              draftStateOverride,
              selectedReasoningEffort: composer.selectedReasoningEffort,
              selectedSkillIDs: composer.selectedSkillIDs,
              waitForPendingModelSelection: composer.awaitPendingModelSelection,
            })
          }
        />
      </div>
    </section>
  )
}

function formatTraceStatusText(status?: AssistantTraceItem["status"]) {
  switch (status) {
    case "waiting-approval":
      return "waiting approval"
    case "completed":
      return "completed"
    case "running":
      return "running"
    case "pending":
      return "pending"
    case "error":
      return "error"
    case "denied":
      return "denied"
    default:
      return null
  }
}

function TraceItemView({
  answeredQuestionIDs,
  item,
  isQuestionAnswerDisabled = false,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  traceVisibility,
}: {
  answeredQuestionIDs?: Set<string>
  item: AssistantTraceItem
  isQuestionAnswerDisabled?: boolean
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect?: (file: string) => void
  traceVisibility: AssistantTraceVisibility
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isInputExpanded, setIsInputExpanded] = useState(false)
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const [freeformAnswer, setFreeformAnswer] = useState("")
  const [selectedQuestionOptions, setSelectedQuestionOptions] = useState<string[]>([])
  const className = [
    "trace-item",
    `trace-kind-${item.kind}`,
    item.kind === "reasoning" || item.kind === "tool" ? "is-plain" : "",
    item.isStreaming ? "is-streaming" : "",
    item.status ? `is-${item.status}` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const selectableFilePaths = item.kind === "patch" ? item.filePaths?.filter(Boolean) ?? [] : []
  const debugEntries = traceVisibility.debugMetadata ? item.debugEntries ?? [] : []
  const hasDebugEntries = debugEntries.length > 0

  function renderDebugEntries() {
    if (!hasDebugEntries) return null

    return (
      <div className="trace-item-debug">
        {debugEntries.map((entry) => (
          <div key={`${item.id}-${entry.label}`} className="trace-item-debug-row">
            <span className="trace-item-debug-label">{entry.label}</span>
            <span className="trace-item-debug-value">{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  if (item.kind === "reasoning") {
    return (
      <article className={className} data-kind={item.kind}>
        {item.text ? <ThreadRichText className="trace-item-text trace-item-plain-text" text={item.text} /> : null}
        {item.detail ? <ThreadRichText className="trace-item-detail trace-item-plain-detail" text={item.detail} /> : null}
        {renderDebugEntries()}
      </article>
    )
  }

  if (item.kind === "question" && item.questionPrompt) {
    const prompt = item.questionPrompt
    const isQuestionAnswered = Boolean(prompt.questionID && answeredQuestionIDs?.has(prompt.questionID))
    const isAnswerDisabled = isQuestionAnswerDisabled || isQuestionAnswered
    const canSubmitAnswer = Boolean(onAskUserQuestionAnswer)
    const canUseOptionButtons = prompt.options.length > 0 && !prompt.multiple && canSubmitAnswer
    const canUseMultipleSelection = prompt.options.length > 0 && prompt.multiple && canSubmitAnswer
    const trimmedFreeformAnswer = freeformAnswer.trim()
    const hasSelectedOptions = selectedQuestionOptions.length > 0
    const canSubmitStructuredAnswer = canSubmitAnswer && !isAnswerDisabled && (hasSelectedOptions || Boolean(trimmedFreeformAnswer))
    const note = isQuestionAnswered
      ? "Answered."
      : isQuestionAnswerDisabled
      ? "Wait for the current request to finish before answering."
      : canUseMultipleSelection && prompt.allowFreeform
        ? "Select one or more options or add a custom answer."
        : canUseMultipleSelection
          ? "Select one or more options and submit."
      : prompt.multiple
        ? prompt.allowFreeform
          ? "Reply in the composer below with one or more selections."
          : "Reply in the composer below to continue."
        : prompt.allowFreeform
          ? canSubmitAnswer
            ? "Choose an option or send a custom answer here."
            : "You can also reply in the composer below."
          : null

    function handleQuestionOptionToggle(optionValue: string) {
      setSelectedQuestionOptions((current) =>
        current.includes(optionValue)
          ? current.filter((value) => value !== optionValue)
          : [...current, optionValue],
      )
    }

    function handleStructuredAnswerSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      if (!onAskUserQuestionAnswer || isAnswerDisabled) return

      const selectedOptions = selectedQuestionOptions.map((value) => value.trim()).filter(Boolean)
      const nextFreeformAnswer = freeformAnswer.trim()
      const answerText = nextFreeformAnswer || selectedOptions.join(", ")
      if (!answerText) return

      void onAskUserQuestionAnswer({
        text: answerText,
        questionID: prompt.questionID,
        ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
        ...(nextFreeformAnswer ? { freeformText: nextFreeformAnswer } : {}),
      })

      setFreeformAnswer("")
      setSelectedQuestionOptions([])
    }

    return (
      <article className={`${className} ask-user-question-card`} data-kind={item.kind} role="region" aria-label={item.title || "Agent question"}>
        <header className="ask-user-question-header">
          <div>
            <span className="label">Agent Question</span>
            <h3>{item.title || "Question for you"}</h3>
          </div>
        </header>

        <div className="ask-user-question-body">
          <ThreadRichText className="ask-user-question-text" text={prompt.question} />

          {prompt.options.length > 0 ? (
            <div className="ask-user-question-options">
              {prompt.options.map((option, index) => (
                <div key={`${item.id}-${option.value}-${index}`} className="ask-user-question-option">
                  {canUseOptionButtons ? (
                    <button
                      className={index === 0 ? "primary-button" : "secondary-button"}
                      disabled={isAnswerDisabled}
                      onClick={() =>
                        void onAskUserQuestionAnswer?.({
                          text: option.value,
                          questionID: prompt.questionID,
                          selectedOptions: [option.value],
                        })}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ) : canUseMultipleSelection ? (
                    <label className="ask-user-question-option-choice">
                      <input
                        checked={selectedQuestionOptions.includes(option.value)}
                        className="ask-user-question-option-checkbox"
                        disabled={isAnswerDisabled}
                        onChange={() => handleQuestionOptionToggle(option.value)}
                        type="checkbox"
                      />
                      <span className="ask-user-question-option-label">{option.label}</span>
                    </label>
                  ) : (
                    <div className="ask-user-question-option-label">{option.label}</div>
                  )}
                  {option.description ? <ThreadRichText className="ask-user-question-option-description" text={option.description} /> : null}
                </div>
              ))}
            </div>
          ) : null}

          {canUseMultipleSelection || (prompt.allowFreeform && canSubmitAnswer) ? (
            <form className="ask-user-question-response-form" onSubmit={handleStructuredAnswerSubmit}>
              {prompt.allowFreeform ? (
                <input
                  aria-label="Custom answer"
                  className="ask-user-question-freeform-input"
                  disabled={isAnswerDisabled}
                  onChange={(event) => setFreeformAnswer(event.target.value)}
                  placeholder={prompt.placeholder || "Type your answer"}
                  type="text"
                  value={freeformAnswer}
                />
              ) : null}

              <div className="ask-user-question-actions">
                <button
                  className="secondary-button"
                  disabled={!canSubmitStructuredAnswer}
                  type="submit"
                >
                  Submit answer
                </button>
              </div>
            </form>
          ) : null}

          {note ? <p className="ask-user-question-note">{note}</p> : null}
        </div>
        {renderDebugEntries()}
      </article>
    )
  }

  if (item.kind === "tool") {
    const statusText = formatTraceStatusText(item.status)
    const summaryTitle = item.title || item.label
    const showsToolInputs = item.status === "pending" || item.status === "running" || item.status === "waiting-approval"
    const visibleToolInputText = traceVisibility.toolInputs ? item.toolInputText : undefined
    const visibleToolOutputText = traceVisibility.toolOutputs ? item.toolOutputText : undefined
    const inputSectionDetail = showsToolInputs ? item.detail : undefined
    const outputSectionDetail = !showsToolInputs && traceVisibility.toolOutputs ? item.detail : undefined
    const hasInputDisclosureContent = Boolean(visibleToolInputText || inputSectionDetail)
    const hasOutputDisclosureContent = Boolean(visibleToolOutputText || outputSectionDetail)
    const hasDisclosureContent = Boolean(hasInputDisclosureContent || hasOutputDisclosureContent)
    const disclosureID = `trace-item-disclosure-${item.id}`
    const inputDisclosureID = `trace-item-disclosure-input-${item.id}`
    const outputDisclosureID = `trace-item-disclosure-output-${item.id}`

    function handleToolToggle() {
      setIsExpanded((current) => {
        if (current) {
          setIsInputExpanded(false)
          setIsOutputExpanded(false)
        }
        return !current
      })
    }

    return (
      <article className={className} data-kind={item.kind}>
        {hasDisclosureContent ? (
          <button
            className="trace-item-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-controls={disclosureID}
            onClick={handleToolToggle}
          >
            <span className="trace-item-toggle-summary">
              <span className="trace-item-toggle-icon" aria-hidden="true">
                {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </span>
              <span className="trace-item-toggle-line">
                <span className="trace-item-inline-title">{summaryTitle}</span>
                {statusText ? <span className="trace-item-inline-status">{" \u00b7 "}{statusText}</span> : null}
              </span>
            </span>
          </button>
        ) : (
          <p className="trace-item-toggle-line">
            <span className="trace-item-inline-title">{summaryTitle}</span>
            {statusText ? <span className="trace-item-inline-status">{" \u00b7 "}{statusText}</span> : null}
          </p>
        )}

        {hasDisclosureContent && isExpanded ? (
          <div id={disclosureID} className="trace-item-disclosure">
            {hasInputDisclosureContent ? (
              <div className="trace-item-subsection">
                <button
                  className="trace-item-subsection-toggle"
                  type="button"
                  aria-expanded={isInputExpanded}
                  aria-controls={inputDisclosureID}
                  aria-label={`${summaryTitle} input`}
                  onClick={() => setIsInputExpanded((current) => !current)}
                >
                  <span className="trace-item-subsection-toggle-icon" aria-hidden="true">
                    {isInputExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <span className="trace-item-subsection-toggle-line">
                    <span className="trace-item-subsection-label">Input</span>
                  </span>
                </button>
                {isInputExpanded ? (
                  <div id={inputDisclosureID} className="trace-item-subsection-body">
                    {visibleToolInputText ? <ThreadRichText className="trace-item-text" text={visibleToolInputText} /> : null}
                    {inputSectionDetail ? <ThreadRichText className="trace-item-detail" text={inputSectionDetail} /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {hasOutputDisclosureContent ? (
              <div className="trace-item-subsection">
                <button
                  className="trace-item-subsection-toggle"
                  type="button"
                  aria-expanded={isOutputExpanded}
                  aria-controls={outputDisclosureID}
                  aria-label={`${summaryTitle} output`}
                  onClick={() => setIsOutputExpanded((current) => !current)}
                >
                  <span className="trace-item-subsection-toggle-icon" aria-hidden="true">
                    {isOutputExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <span className="trace-item-subsection-toggle-line">
                    <span className="trace-item-subsection-label">Output</span>
                  </span>
                </button>
                {isOutputExpanded ? (
                  <div id={outputDisclosureID} className="trace-item-subsection-body">
                    {visibleToolOutputText ? <ThreadRichText className="trace-item-text" text={visibleToolOutputText} /> : null}
                    {outputSectionDetail ? <ThreadRichText className="trace-item-detail" text={outputSectionDetail} /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {renderDebugEntries()}
      </article>
    )
  }

  return (
    <article className={className} data-kind={item.kind}>
      <div className="trace-item-header">
        <span className="trace-item-label">{item.label}</span>
        {item.title ? <strong className="trace-item-title">{item.title}</strong> : null}
        {item.status ? <span className={`trace-item-status is-${item.status}`}>{item.status}</span> : null}
      </div>
      {item.text ? <ThreadRichText className="trace-item-text" text={item.text} /> : null}
      {item.detail ? <ThreadRichText className="trace-item-detail" text={item.detail} /> : null}
      {selectableFilePaths.length > 0 && onFileChangeSelect ? (
        <div className="trace-item-file-actions">
          {selectableFilePaths.map((filePath) => (
            <button
              key={`${item.id}-${filePath}`}
              type="button"
              className="trace-item-file-chip"
              onClick={() => onFileChangeSelect(filePath)}
            >
              {filePath}
            </button>
          ))}
        </div>
      ) : null}
      {renderDebugEntries()}
    </article>
  )
}

function PermissionRequestCard({
  actionError,
  activeSession,
  isResolving,
  request,
  onRespond,
}: {
  actionError: string | null
  activeSession: SessionSummary
  isResolving: boolean
  request: PermissionRequest
  onRespond: PermissionRequestResponseHandler
}) {
  const title = request.prompt.title.trim()
  const rememberDecisions = request.prompt.allowedDecisions.filter((decision) => isPersistentAllowDecision(decision))
  const detailBody = request.prompt.details?.body?.trim()
  const detailLines = [
    request.prompt.details?.workdir ? { label: "Workdir", value: request.prompt.details.workdir } : null,
    request.prompt.details?.command ? { label: "Command", value: request.prompt.details.command } : null,
    request.prompt.details?.paths && request.prompt.details.paths.length > 0
      ? { label: "Paths", value: request.prompt.details.paths.join(", ") }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  function handleRespond(decision: PermissionDecision) {
    void onRespond({
      sessionID: activeSession.id,
      request,
      decision,
    })
  }

  return (
    <article className="permission-request-card">
      <header className="permission-request-header">
        <div>
          <span className="label">Approval Required</span>
          <h3>{title}</h3>
          <p className="permission-request-subtitle">{request.prompt.summary}</p>
          <p className="permission-request-rationale">{request.prompt.rationale}</p>
        </div>
        <div className="permission-request-badges">
          <span className={`permission-risk-chip is-${request.prompt.risk}`}>{formatPermissionRiskLabel(request.prompt.risk)}</span>
        </div>
      </header>

      <div className="permission-request-controls">
        <div className="settings-inline-actions permission-request-actions">
          {primaryPermissionDecisions.map((decision) => (
            <button
              key={decision}
              className={decision === "allow-once" ? "primary-button" : "secondary-button"}
              aria-label={`${formatPermissionDecisionLabel(decision)} ${title}`}
              disabled={isResolving}
              onClick={() => handleRespond(decision)}
              type="button"
            >
              {isResolving ? "Applying..." : formatPermissionDecisionLabel(decision)}
            </button>
          ))}
        </div>
      </div>

      {rememberDecisions.length > 0 ? (
        <details className="permission-request-disclosure">
          <summary>Remember this decision</summary>
          <div className="permission-request-memory-actions">
            {rememberDecisions.map((decision) => (
              <button
                key={decision}
                className="secondary-button"
                aria-label={`${formatPermissionDecisionLabel(decision)} ${title}`}
                disabled={isResolving}
                onClick={() => handleRespond(decision)}
                type="button"
              >
                {formatPermissionDecisionLabel(decision)}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {request.prompt.detailsAvailable && (detailLines.length > 0 || detailBody) ? (
        <details className="permission-request-disclosure">
          <summary>View details</summary>
          <div className="permission-request-grid permission-request-grid-compact">
            <div className="permission-request-meta">
              <span className="permission-request-meta-label">Requested</span>
              <strong>{formatTime(request.createdAt)}</strong>
            </div>
            {detailLines.map((item) => (
              <div
                key={item.label}
                className={item.label === "Paths" || item.label === "Command" ? "permission-request-meta permission-request-meta-wide" : "permission-request-meta"}
              >
                <span className="permission-request-meta-label">{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            {detailBody ? (
              <div className="permission-request-meta permission-request-meta-wide">
                <span className="permission-request-meta-label">Body</span>
                <pre className="permission-request-body">{detailBody}</pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="permission-request-footer">
        <p className="permission-request-note">The session resumes after this decision is recorded.</p>
      </div>

      {actionError ? <p className="permission-request-error">{actionError}</p> : null}
    </article>
  )
}

interface PermissionRequestInlinePromptProps {
  activeSession: SessionSummary | null
  isResolvingPermissionRequest: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  onPermissionRequestResponse: PermissionRequestResponseHandler
}

function PermissionRequestInlinePrompt({
  activeSession,
  isResolvingPermissionRequest,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  onPermissionRequestResponse,
}: PermissionRequestInlinePromptProps) {
  if (!activeSession || isResolvingPermissionRequest || pendingPermissionRequests.length === 0) return null

  const [request] = pendingPermissionRequests
  const remainingCount = pendingPermissionRequests.length - 1

  return (
    <article className="turn assistant-turn permission-request-turn">
      <section className="permission-request-inline" role="region" aria-labelledby="permission-request-title">
        <header className="permission-request-inline-header">
          <div>
            <span className="label">Tool Approval</span>
            <h3 id="permission-request-title">Tool approval request</h3>
            <p className="permission-request-inline-copy">Confirm or deny this tool call directly in the thread shell.</p>
          </div>
          {remainingCount > 0 ? (
            <span className="settings-badge permission-request-count">
              {remainingCount + 1} requests waiting
            </span>
          ) : null}
        </header>

        <PermissionRequestCard
          actionError={
            permissionRequestActionError &&
            (!permissionRequestActionRequestID || permissionRequestActionRequestID === request.id)
              ? permissionRequestActionError
              : null
          }
          activeSession={activeSession}
          isResolving={false}
          request={request}
          onRespond={onPermissionRequestResponse}
        />
      </section>
    </article>
  )
}

function findAssistantCycleBounds(turns: Turn[], assistantTurnIndex: number) {
  let startIndex = assistantTurnIndex
  while (startIndex > 0 && turns[startIndex - 1]?.kind === "assistant") {
    startIndex -= 1
  }

  let endIndex = assistantTurnIndex
  while (endIndex + 1 < turns.length && turns[endIndex + 1]?.kind === "assistant") {
    endIndex += 1
  }

  return { startIndex, endIndex }
}

function collectAssistantCycleFileChangeItems(turns: Turn[], startIndex: number, endIndex: number) {
  const items: AssistantTraceItem[] = []

  for (let index = startIndex; index <= endIndex; index += 1) {
    const turn = turns[index]
    if (!turn || turn.kind !== "assistant") continue

    items.push(...turn.items.filter((item) => item.kind !== "system" && isFileChangeTraceItem(item)))
  }

  return items
}

function collectAnsweredQuestionIDs(turns: Turn[]) {
  const answeredQuestionIDs = new Set<string>()

  for (const turn of turns) {
    if (turn.kind !== "user") continue

    const questionID = turn.questionAnswer?.questionID
    if (!questionID) continue
    answeredQuestionIDs.add(questionID)
  }

  return answeredQuestionIDs
}

export function ThreadView({
  activeProjectID = null,
  activeSession,
  activeTurns,
  assistantTraceVisibility,
  composerRefreshVersion = 0,
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  isSendingQuestionAnswer,
  showSessionBanner = true,
  onFileChangeSelect,
  onOpenSideChat,
  onAskUserQuestionAnswer,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  sideChatAttachments = [],
  sideChatCountsByAnchorMessageID,
  sideChatDraftState = createEmptyComposerDraftState(),
  sideChatIsSending = false,
  sideChatPendingPermissionRequests = [],
  sideChatPermissionRequestActionError = null,
  sideChatPermissionRequestActionRequestID = null,
  sideChatSession = null,
  sideChatTurns = [],
  threadColumnRef,
  onSideChatDraftStateChange,
  onSideChatPickAttachments,
  onSideChatRemoveAttachment,
  onSideChatSend,
  onPermissionRequestResponse,
}: ThreadViewProps) {
  const answeredQuestionIDs = collectAnsweredQuestionIDs(activeTurns)
  const readOnlySideChat = isSideChatSession(activeSession)
  const [copiedResponseTurnID, setCopiedResponseTurnID] = useState<string | null>(null)
  const copiedResponseTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copiedResponseTimeoutRef.current !== null) {
        window.clearTimeout(copiedResponseTimeoutRef.current)
      }
    }
  }, [])

  const handleCopyAssistantResponse = useEffectEvent(async (turnID: string, text: string) => {
    try {
      await writeTextToClipboard(text)
      setCopiedResponseTurnID(turnID)

      if (copiedResponseTimeoutRef.current !== null) {
        window.clearTimeout(copiedResponseTimeoutRef.current)
      }

      copiedResponseTimeoutRef.current = window.setTimeout(() => {
        setCopiedResponseTurnID((current) => (current === turnID ? null : current))
        copiedResponseTimeoutRef.current = null
      }, 1600)
    } catch (error) {
      console.error("[desktop] Failed to copy assistant response:", error)
    }
  })

  return (
    <section className="thread-shell">
      <div ref={threadColumnRef} className="thread-column">
        {!activeSession ? (
          <article className="turn assistant-turn">
            <div className="assistant-shell">
              <header className="assistant-header">
                <div>
                  <span className="label">Agent Turn</span>
                  <h3>No session selected</h3>
                </div>
              </header>

              <div className="assistant-trace-list">
                <TraceItemView
                  item={{
                    id: "empty-no-session",
                    kind: "system",
                    timestamp: Date.now(),
                    label: "System",
                    title: "No session selected",
                    detail: "Load a folder from the sidebar or create a new session to begin.",
                    status: "completed",
                  }}
                  traceVisibility={assistantTraceVisibility}
                />
              </div>
            </div>
          </article>
        ) : (
          <>
            {showSessionBanner && readOnlySideChat ? (
              <article className="thread-session-banner">
                <div className="thread-session-banner-copy">
                  <span className="label">Side chat</span>
                  <strong>{activeSession.origin?.anchorPreview || "Anchored reply snapshot"}</strong>
                  <p>Scoped discussion linked to one assistant reply. It stays out of the main session context.</p>
                </div>
                <span className="thread-session-banner-pill">Isolated</span>
              </article>
            ) : null}
            {activeTurns.map((turn, turnIndex) => {
              if (turn.kind === "user") {
                return (
                  <article key={turn.id} className="turn user-turn">
                    <div className="turn-meta">
                      <span>You</span>
                      <time>{formatTime(turn.timestamp)}</time>
                    </div>
                    <UserTurnBubble turn={turn} />
                  </article>
                )
              }

              const { startIndex, endIndex } = findAssistantCycleBounds(activeTurns, turnIndex)
              const isCycleFinalTurn = turnIndex === endIndex
              const cycleFileChangeItems = isCycleFinalTurn
                ? collectAssistantCycleFileChangeItems(activeTurns, startIndex, endIndex)
                : []
              const traceItems = [
                ...turn.items.filter((item) => !isFileChangeTraceItem(item)),
                ...cycleFileChangeItems,
              ]
              const renderedItems = filterRenderedAssistantTraceItems(
                traceItems,
                isCycleFinalTurn && !turn.isStreaming,
                assistantTraceVisibility,
              )
              const ephemeralHint = renderedItems.length === 0 ? getAssistantEphemeralHint(turn) : null
              if (renderedItems.length === 0 && !ephemeralHint) return null
              const existingSideChatCount = sideChatCountsByAnchorMessageID[turn.id] ?? 0
              const canOpenSideChat = !readOnlySideChat && !turn.isStreaming && hasResponseTraceItems(traceItems) && Boolean(onOpenSideChat)
              const activeInlineSideChat = sideChatSession?.origin?.anchorMessageID === turn.id ? sideChatSession : null

              return (
                <article key={turn.id} className="turn assistant-turn">
                  <div className={turn.isStreaming ? "assistant-shell is-sectioned is-streaming" : "assistant-shell is-sectioned"}>
                    {ephemeralHint ? (
                      <AssistantTurnPlaceholder message={ephemeralHint} />
                    ) : (
                      <AssistantTurnSections
                        answeredQuestionIDs={answeredQuestionIDs}
                        isQuestionAnswerDisabled={isSendingQuestionAnswer || isResolvingPermissionRequest || pendingPermissionRequests.length > 0}
                        turnID={turn.id}
                        items={traceItems}
                        onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                        onFileChangeSelect={onFileChangeSelect}
                        renderAfterSection={({ items, sectionKey }) => {
                          if (sectionKey !== "response") return null

                          const responseCopyText = buildAssistantResponseCopyText(items)
                          if (!responseCopyText && !canOpenSideChat) return null

                          return (
                            <div
                              className={joinClassNames(
                                "assistant-response-side-chat",
                                (copiedResponseTurnID === turn.id ||
                                  activeInlineSideChat ||
                                  existingSideChatCount > 0) &&
                                  "is-persistent",
                              )}
                            >
                              <div className="assistant-response-actions">
                                {responseCopyText ? (
                                  <button
                                    className={joinClassNames(
                                      "assistant-response-action-button",
                                      copiedResponseTurnID === turn.id && "is-active",
                                    )}
                                    type="button"
                                    onClick={() => void handleCopyAssistantResponse(turn.id, responseCopyText)}
                                  >
                                    {copiedResponseTurnID === turn.id ? "已复制" : "复制"}
                                  </button>
                                ) : null}
                                {canOpenSideChat ? (
                                  <button
                                    className={joinClassNames(
                                      "assistant-response-action-button",
                                      activeInlineSideChat && "is-active",
                                    )}
                                    type="button"
                                    aria-pressed={Boolean(activeInlineSideChat)}
                                    title={
                                      activeInlineSideChat
                                        ? "Hide this side chat"
                                        : existingSideChatCount > 0
                                          ? `${existingSideChatCount} side chat thread${existingSideChatCount === 1 ? "" : "s"}`
                                          : "Open a side chat for this reply"
                                    }
                                    onClick={() => void onOpenSideChat?.(turn.id)}
                                  >
                                    Sidechat
                                  </button>
                                ) : null}
                              </div>

                              {activeInlineSideChat &&
                              onSideChatDraftStateChange &&
                              onSideChatPickAttachments &&
                              onSideChatRemoveAttachment &&
                              onSideChatSend ? (
                                <InlineSideChatThread
                                  activeProjectID={activeProjectID}
                                  attachments={sideChatAttachments}
                                  assistantTraceVisibility={assistantTraceVisibility}
                                  composerRefreshVersion={composerRefreshVersion}
                                  draftState={sideChatDraftState}
                                  isAgentDebugTraceEnabled={isAgentDebugTraceEnabled}
                                  isResolvingPermissionRequest={isResolvingPermissionRequest}
                                  isSending={sideChatIsSending}
                                  pendingPermissionRequests={sideChatPendingPermissionRequests}
                                  permissionRequestActionError={sideChatPermissionRequestActionError}
                                  permissionRequestActionRequestID={sideChatPermissionRequestActionRequestID}
                                  session={activeInlineSideChat}
                                  turns={sideChatTurns}
                                  onDraftStateChange={onSideChatDraftStateChange}
                                  onHide={() => void onOpenSideChat?.(turn.id)}
                                  onPermissionRequestResponse={onPermissionRequestResponse}
                                  onPickAttachments={onSideChatPickAttachments}
                                  onRemoveAttachment={onSideChatRemoveAttachment}
                                  onSend={onSideChatSend}
                                />
                              ) : null}
                            </div>
                          )
                        }}
                        showFileChanges={isCycleFinalTurn && !turn.isStreaming}
                        traceVisibility={assistantTraceVisibility}
                      />
                    )}
                  </div>
                </article>
              )
            })}

            <PermissionRequestInlinePrompt
              activeSession={activeSession}
              isResolvingPermissionRequest={isResolvingPermissionRequest}
              pendingPermissionRequests={pendingPermissionRequests}
              permissionRequestActionError={permissionRequestActionError}
              permissionRequestActionRequestID={permissionRequestActionRequestID}
              onPermissionRequestResponse={onPermissionRequestResponse}
            />
          </>
        )}
      </div>
    </section>
  )
}
