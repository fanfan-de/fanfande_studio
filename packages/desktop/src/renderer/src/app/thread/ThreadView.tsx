import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ComponentType, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type WheelEvent as ReactWheelEvent } from "react"
import { createPortal } from "react-dom"
import { getAgentSessionBridge } from "../agent-session/client"
import { Composer } from "../composer/Composer"
import { createEmptyComposerDraftState } from "../composer/draft-state"
import { DiffPreview } from "../diff/DiffPreview"
import {
  ChangesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  MinimizeIcon,
  PaperclipIcon,
  PlusIcon,
  ResetIcon,
  SideChatIcon,
  ToolsIcon,
} from "../icons"
import { joinClassNames, writeTextToClipboard } from "../shared-ui"
import { buildTurnsFromHistory } from "../stream"
import {
  ThreadMarkdown,
  normalizeMarkdownLinkTarget,
  openExternalThreadLink,
  type MarkdownLocalFileLinkTarget,
} from "../thread-markdown"
import { ThreadRichText } from "../thread-rich-text"
import type {
  AssistantTraceDebugEntry,
  AssistantTraceFileChange,
  AssistantTraceItem,
  AssistantTraceItemKind,
  AssistantTraceSectionKey,
  AssistantTraceVisibility,
  AssistantTraceVisibilityKey,
  AssistantTurn,
  ComposerAttachment,
  ComposerDraftState,
  ComposerPastedImageAttachment,
  OpenAIReasoningEffort,
  PermissionDecision,
  PermissionRequest,
  SessionSummary,
  Turn,
  UserTurn
} from "../types"
import { useProjectComposer } from "../use-project-composer"
import { mergeUserTurnPresentationState, readPersistedUserTurns } from "../user-turn-presentation"
import { formatTime } from "../utils"
import { isSideChatSession } from "../workspace"

type ProposedPlanConfirmHandler = (input: { planMarkdown: string }) => void | Promise<void>
type ProposedPlanCardStatus = "idle" | "cancelled" | "confirming" | "confirmed"

interface ThreadViewProps {
  activeProjectID?: string | null
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  assistantTraceVisibility: AssistantTraceVisibility
  composerRefreshVersion?: number
  isAgentDebugTraceEnabled: boolean
  isResolvingPermissionRequest: boolean
  showSessionBanner?: boolean
  onFileChangeSelect?: (file: string) => void
  onLocalFileLinkOpen?: (target: MarkdownLocalFileLinkTarget) => void
  onOpenSideChat?: (anchorMessageID: string) => void | Promise<void>
  onTurnDiffRestore?: (files: string[]) => void | Promise<void>
  onTurnDiffReview?: (files: string[]) => void | Promise<void>
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  sideChatAttachments?: ComposerAttachment[]
  sideChatCountsByAnchorMessageID: Record<string, number>
  sideChatDraftState?: ComposerDraftState
  sideChatIsCancelling?: boolean
  sideChatIsInterruptible?: boolean
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
  onSideChatPasteImageAttachments?: (input: {
    allowImage: boolean
    disabledReason: string | null
    images: ComposerPastedImageAttachment[]
  }) => void | Promise<void>
  onSideChatRemoveAttachment?: (path: string) => void
  onSideChatCancelSend?: () => void | Promise<void>
  onSideChatSend?: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedModel?: string | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
  onSessionModelSelectionChange?: (sessionID: string, selection: SessionSummary["modelSelection"] | undefined) => void
  onProposedPlanConfirm?: ProposedPlanConfirmHandler
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
  sessionID?: string | null
  selectedOptions?: string[]
  freeformText?: string
}) => void | Promise<void>

const THREAD_BOTTOM_LOCK_THRESHOLD_PX = 32
const IMAGE_LIGHTBOX_BODY_CLASS = "is-image-lightbox-open"
const IMAGE_LIGHTBOX_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const IMAGE_LIGHTBOX_MIN_ZOOM = 0.5
const IMAGE_LIGHTBOX_MAX_ZOOM = 4
const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>"
const PROPOSED_PLAN_CLOSE_TAG = "</proposed_plan>"
const IMAGE_LIGHTBOX_ZOOM_STEP = 0.1
const IMAGE_TALL_RATIO_THRESHOLD = 1.8

type ImagePreviewFitMode = "fit-width" | "fit-contain"

interface ImagePreviewPayload {
  src: string
  alt: string
  width?: number
  height?: number
  mimeType?: string
  triggerElement?: HTMLButtonElement | null
}

interface ActiveImagePreview extends ImagePreviewPayload {
  openedAt: number
}

function clampImageZoom(value: number) {
  return Math.min(IMAGE_LIGHTBOX_MAX_ZOOM, Math.max(IMAGE_LIGHTBOX_MIN_ZOOM, Math.round(value * 100) / 100))
}

function isTallImage(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) return false
  return height / width >= IMAGE_TALL_RATIO_THRESHOLD
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(IMAGE_LIGHTBOX_FOCUSABLE_SELECTOR))
}

function isThreadColumnPinnedToBottom(threadColumn: HTMLDivElement) {
  return threadColumn.scrollHeight - threadColumn.scrollTop - threadColumn.clientHeight <= THREAD_BOTTOM_LOCK_THRESHOLD_PX
}

function getUserTurnBodyText(turn: UserTurn) {
  const displayText = turn.displayText?.trim() || ""
  const references = turn.references ?? []

  return displayText || (references.length > 0 ? references.map((reference) => `@${reference.label}`).join(" ") : turn.text)
}

function UserTurnBubble({ turn }: { turn: UserTurn }) {
  const displayText = turn.displayText?.trim() || ""
  const references = turn.references ?? []
  const attachments = turn.attachments ?? []
  const hasStructuredContent = Boolean(displayText) || references.length > 0 || attachments.length > 0
  const bodyText = getUserTurnBodyText(turn)

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

function normalizeUserTurnDiffSummary(diffSummary: UserTurn["diffSummary"]): AssistantTraceFileChange[] {
  return diffSummary?.diffs
    .filter((change) => change.file.trim())
    .map((change) => ({
      file: change.file,
      additions: change.additions,
      deletions: change.deletions,
    })) ?? []
}

function summarizeUserTurnDiffStats(
  diffSummary: UserTurn["diffSummary"],
  fileChanges: AssistantTraceFileChange[],
) {
  const fallback = fileChanges.reduce(
    (stats, change) => ({
      additions: stats.additions + change.additions,
      deletions: stats.deletions + change.deletions,
      files: stats.files + 1,
    }),
    { additions: 0, deletions: 0, files: 0 },
  )
  const stats = diffSummary?.stats ?? fallback

  return {
    additions: stats.additions,
    deletions: stats.deletions,
    files: stats.files > 0 ? stats.files : fallback.files,
  }
}

function formatUserTurnDiffSummaryLabel(fileCount: number) {
  return `${fileCount} 个文件已更改`
}

function UserTurnDiffCard({
  onFileChangeSelect,
  onTurnDiffRestore,
  onTurnDiffReview,
  turn,
}: {
  onFileChangeSelect?: (file: string) => void
  onTurnDiffRestore?: (files: string[]) => void | Promise<void>
  onTurnDiffReview?: (files: string[]) => void | Promise<void>
  turn: UserTurn
}) {
  const fileChanges = normalizeUserTurnDiffSummary(turn.diffSummary)
  const fileChangeSignature = fileChanges
    .map((change) => `${change.file}\u0000${change.additions}\u0000${change.deletions}`)
    .join("\u0001")
  const [isListExpanded, setIsListExpanded] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setIsListExpanded(false)
    setIsRestoring(false)
    setActionErrorMessage(null)
  }, [fileChangeSignature, turn.id])

  if (fileChanges.length === 0) return null

  const stats = summarizeUserTurnDiffStats(turn.diffSummary, fileChanges)
  const listID = `user-turn-diff-list-${turn.id}`
  const summaryLabel = formatUserTurnDiffSummaryLabel(stats.files)
  const filePaths = fileChanges.map((change) => change.file)

  const handleReviewClick = async () => {
    if (!onTurnDiffReview) return

    setActionErrorMessage(null)
    try {
      await onTurnDiffReview(filePaths)
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const handleRestoreClick = async () => {
    if (!onTurnDiffRestore || isRestoring) return
    const confirmed = window.confirm(
      `撤销这 ${stats.files} 个文件的当前工作区变更？这会按当前 workspace 状态恢复这些文件，可能丢弃后续 turn 对同一文件的改动。`,
    )
    if (!confirmed) return

    setIsRestoring(true)
    setActionErrorMessage(null)
    try {
      await onTurnDiffRestore(filePaths)
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="user-turn-diff-card">
      <div className="user-turn-diff-card-header">
        <button
          type="button"
          className="user-turn-diff-card-summary"
          aria-expanded={isListExpanded}
          aria-controls={listID}
          onClick={() => setIsListExpanded((current) => !current)}
        >
          <span className="user-turn-diff-card-title">{summaryLabel}</span>
          <span className="user-turn-diff-stats" aria-label={`${stats.additions} additions, ${stats.deletions} deletions`}>
            <span className="is-add">+{stats.additions}</span>
            <span className="is-remove">-{stats.deletions}</span>
          </span>
        </button>
        <div className="user-turn-diff-actions" aria-label="Turn file change actions">
          <button
            type="button"
            className="user-turn-diff-action"
            disabled={!onTurnDiffRestore || isRestoring}
            onClick={() => void handleRestoreClick()}
          >
            <span>{isRestoring ? "撤销中" : "撤销"}</span>
            <ResetIcon />
          </button>
          <button
            type="button"
            className="user-turn-diff-action"
            disabled={!onTurnDiffReview}
            onClick={() => void handleReviewClick()}
          >
            <span>审核</span>
            <span aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            className="user-turn-diff-expand"
            aria-label={isListExpanded ? "收起文件变更" : "展开文件变更"}
            aria-expanded={isListExpanded}
            aria-controls={listID}
            onClick={() => setIsListExpanded((current) => !current)}
          >
            {isListExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        </div>
      </div>
      {isListExpanded ? (
        <div id={listID} className="user-turn-diff-file-list">
          {fileChanges.map((change, changeIndex) => {
            const rowContent = (
              <>
                <span className="user-turn-diff-file-path">{change.file}</span>
                <span className="user-turn-diff-stats" aria-label={`${change.additions} additions, ${change.deletions} deletions`}>
                  <span className="is-add">+{change.additions}</span>
                  <span className="is-remove">-{change.deletions}</span>
                </span>
                <span className="user-turn-diff-file-chevron" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </>
            )

            return (
              <div key={`${turn.id}-${change.file}-${changeIndex}`} className="user-turn-diff-file-entry">
                {onFileChangeSelect ? (
                  <button
                    type="button"
                    className="user-turn-diff-file-row"
                    aria-label={`审核 ${change.file}`}
                    title={change.file}
                    onClick={() => onFileChangeSelect(change.file)}
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div className="user-turn-diff-file-row is-static" title={change.file}>
                    {rowContent}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
      {actionErrorMessage ? (
        <p className="user-turn-diff-error" role="alert">{actionErrorMessage}</p>
      ) : null}
    </div>
  )
}

function hasUserTurnDiffSummary(turn: UserTurn) {
  return normalizeUserTurnDiffSummary(turn.diffSummary).length > 0
}

function hasFollowingAssistantBeforeNextUser(turns: Turn[], startIndex: number) {
  for (let index = startIndex + 1; index < turns.length; index += 1) {
    const candidate = turns[index]
    if (candidate.kind === "user") return false
    if (candidate.kind === "assistant") return true
  }

  return false
}

function findPreviousUserTurn(turns: Turn[], startIndex: number) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const candidate = turns[index]
    if (candidate.kind === "user") return candidate
  }

  return null
}

function getAssistantTrailingUserDiffTurn(turns: Turn[], assistantIndex: number, assistantTurn: AssistantTurn) {
  if (assistantTurn.isStreaming || hasFollowingAssistantBeforeNextUser(turns, assistantIndex)) return null

  const userTurn = findPreviousUserTurn(turns, assistantIndex)
  if (!userTurn || !hasUserTurnDiffSummary(userTurn)) return null

  return userTurn
}

function shouldRenderDiffOnStandaloneUserTurn(turns: Turn[], userIndex: number, turn: UserTurn) {
  return hasUserTurnDiffSummary(turn) && !hasFollowingAssistantBeforeNextUser(turns, userIndex)
}

const primaryPermissionDecisions: PermissionDecision[] = ["deny", "allow"]

function formatPermissionRiskLabel(risk: PermissionRequest["prompt"]["risk"]) {
  return `${risk} risk`
}

function formatPermissionDecisionLabel(decision: PermissionDecision) {
  switch (decision) {
    case "allow":
      return "Allow"
    case "deny":
      return "Deny"
  }
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
  if (item.kind === "compaction") return "workflow"
  if (item.kind === "step" || item.kind === "retry" || item.kind === "snapshot" || item.kind === "subtask" || item.kind === "task-state") {
    return "workflow"
  }
  if (item.kind === "system") return "debug"
  return "workflow"
}

function traceVisibilityKeyForItem(item: AssistantTraceItem): AssistantTraceVisibilityKey | null {
  if (item.kind === "error") return null
  if (item.kind === "compaction") return null
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

function buildAssistantResponseCopyText(items: AssistantTraceItem[]) {
  return items
    .filter((item) => item.kind === "text")
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

function getLastAssistantResponseSectionItems(
  items: AssistantTraceItem[],
  traceVisibility: AssistantTraceVisibility,
) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, true, traceVisibility))

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.sectionKey !== "response") continue
    if (!block.items.some((item) => item.kind === "text" && Boolean(item.text?.trim()))) continue
    return block.items
  }

  return []
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
  const imageItems = items.filter((item) => item.kind === "image")
  const latestPatch = [...items].reverse().find((item) => item.kind === "patch")
  const latestNonImageItem = latestPatch ?? [...items].reverse().find((item) => item.kind !== "image")

  if (imageItems.length > 0) {
    const includedIDs = new Set([
      ...imageItems.map((item) => item.id),
      ...(latestNonImageItem ? [latestNonImageItem.id] : []),
    ])
    return items.filter((item) => includedIDs.has(item.id))
  }

  if (latestPatch) return [latestPatch]

  const latestItem = items[items.length - 1]
  return latestItem ? [latestItem] : []
}

function isCollapsibleTraceItem(item: AssistantTraceItem) {
  return item.kind === "reasoning" || item.kind === "tool"
}

function firstNonEmptyLine(value?: string) {
  return value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function getCollapsedReasoningLine(item: AssistantTraceItem) {
  return firstNonEmptyLine(item.text) ?? firstNonEmptyLine(item.detail) ?? item.title ?? item.label
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
  isLatestMessage,
  items,
  onOpenImagePreview,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  onLocalFileLinkOpen,
  onProposedPlanConfirm,
  showFileChanges,
  shouldCollapseReasoningAndTools,
  traceVisibility,
}: {
  answeredQuestionIDs: Set<string>
  isQuestionAnswerDisabled?: boolean
  isLatestMessage: boolean
  items: AssistantTraceItem[]
  onOpenImagePreview?: (payload: ImagePreviewPayload) => void
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect: ((file: string) => void) | undefined
  onLocalFileLinkOpen: ((target: MarkdownLocalFileLinkTarget) => void) | undefined
  onProposedPlanConfirm?: ProposedPlanConfirmHandler
  showFileChanges: boolean
  shouldCollapseReasoningAndTools: boolean
  traceVisibility: AssistantTraceVisibility
}) {
  const blocks = buildAssistantTraceBlocks(filterRenderedAssistantTraceItems(items, showFileChanges, traceVisibility))

  return (
    <>
      {blocks.map((block, index) => {
        const renderedItems = block.sectionKey === "file-change" ? summarizeFileChangeItems(block.items) : block.items
        const sectionID = `${block.sectionKey}-${index}`

        return (
          <AssistantTraceSection
            key={sectionID}
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
                  onOpenImagePreview={onOpenImagePreview}
                  onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                  onFileChangeSelect={onFileChangeSelect}
                  onLocalFileLinkOpen={onLocalFileLinkOpen}
                  isLatestMessage={isLatestMessage}
                  onProposedPlanConfirm={onProposedPlanConfirm}
                  shouldCollapseAfterTurnCompletion={shouldCollapseReasoningAndTools}
                  traceVisibility={traceVisibility}
                />
              ))}
            </div>
          </AssistantTraceSection>
        )
      })}
    </>
  )
}

function TraceImagePreview({
  item,
  onOpenImagePreview,
}: {
  item: AssistantTraceItem
  onOpenImagePreview?: (payload: ImagePreviewPayload) => void
}) {
  const src = item.src ?? ""
  const alt = item.alt || item.title || "Image attachment"
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading")
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const thumbnailStyle = item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined
  const sizeText = item.width && item.height ? `${item.width} x ${item.height}` : ""
  const metaText = [item.mimeType, sizeText].filter(Boolean).join(" | ")

  useEffect(() => {
    setLoadState("loading")
  }, [src])

  if (!src) return null

  return (
    <div className="trace-image-preview">
      <button
        ref={triggerRef}
        type="button"
        className={joinClassNames("trace-image-thumbnail", `is-${loadState}`)}
        style={thumbnailStyle}
        aria-label={`Preview ${alt}`}
        disabled={loadState === "error"}
        onClick={() => onOpenImagePreview?.({
          src,
          alt,
          width: item.width,
          height: item.height,
          mimeType: item.mimeType,
          triggerElement: triggerRef.current,
        })}
      >
        <img
          className="trace-image-thumbnail-image"
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoadState("loaded")}
          onError={() => setLoadState("error")}
        />
        {loadState === "loading" ? <span className="trace-image-state">Loading image...</span> : null}
        {loadState === "error" ? <span className="trace-image-state is-error">Image failed to load</span> : null}
      </button>
      {metaText ? <p className="trace-image-meta">{metaText}</p> : null}
    </div>
  )
}

function ImageLightbox({
  preview,
  onClose,
}: {
  preview: ActiveImagePreview
  onClose: () => void
}) {
  const isDefaultFitWidth = isTallImage(preview.width, preview.height)
  const [fitMode, setFitMode] = useState<ImagePreviewFitMode>(isDefaultFitWidth ? "fit-width" : "fit-contain")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    pointerTarget: HTMLDivElement
    originClientX: number
    originClientY: number
    originPanX: number
    originPanY: number
  } | null>(null)
  const effectiveLabel = preview.alt || "Image preview"

  const closePreview = useEffectEvent(() => {
    onClose()
    const trigger = preview.triggerElement
    if (trigger?.isConnected) {
      trigger.focus()
    }
  })

  const adjustZoom = useEffectEvent((delta: number) => {
    setZoom((currentZoom) => clampImageZoom(currentZoom + delta))
  })

  const resetView = useEffectEvent(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    dragStateRef.current = null
  })

  useEffect(() => {
    setFitMode(isTallImage(preview.width, preview.height) ? "fit-width" : "fit-contain")
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    dragStateRef.current = null
  }, [preview.height, preview.src, preview.width])

  useEffect(() => {
    if (zoom > 1) return
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    const dragState = dragStateRef.current
    if (dragState?.pointerTarget.hasPointerCapture(dragState.pointerId)) {
      dragState.pointerTarget.releasePointerCapture(dragState.pointerId)
    }
    dragStateRef.current = null
  }, [zoom])

  useEffect(() => {
    document.body.classList.add(IMAGE_LIGHTBOX_BODY_CLASS)
    closeButtonRef.current?.focus()
    return () => {
      document.body.classList.remove(IMAGE_LIGHTBOX_BODY_CLASS)
    }
  }, [])

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        closePreview()
        return
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        adjustZoom(IMAGE_LIGHTBOX_ZOOM_STEP)
        return
      }
      if (event.key === "-") {
        event.preventDefault()
        adjustZoom(-IMAGE_LIGHTBOX_ZOOM_STEP)
        return
      }
      if (event.key === "0") {
        event.preventDefault()
        resetView()
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [adjustZoom, closePreview, resetView])

  function handleBackdropKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return
    const focusable = getFocusableElements(backdropRef.current)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeElement = document.activeElement as HTMLElement | null
    const activeInside = activeElement ? backdropRef.current?.contains(activeElement) : false

    if (event.shiftKey) {
      if (!activeInside || activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (!activeInside || activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    adjustZoom(event.deltaY < 0 ? IMAGE_LIGHTBOX_ZOOM_STEP : -IMAGE_LIGHTBOX_ZOOM_STEP)
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerTarget: event.currentTarget,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originPanX: pan.x,
      originPanY: pan.y,
    }
    setIsDragging(true)
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    event.preventDefault()
    const deltaX = event.clientX - dragState.originClientX
    const deltaY = event.clientY - dragState.originClientY
    setPan({
      x: dragState.originPanX + deltaX,
      y: dragState.originPanY + deltaY,
    })
  }

  function handleCanvasPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    if (dragState.pointerTarget.hasPointerCapture(event.pointerId)) {
      dragState.pointerTarget.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
    setIsDragging(false)
  }

  const zoomPercent = Math.round(zoom * 100)

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={backdropRef}
      className="trace-image-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={effectiveLabel}
      tabIndex={-1}
      onClick={closePreview}
      onKeyDown={handleBackdropKeyDown}
    >
      <div className="trace-image-lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <div className="trace-image-lightbox-toolbar">
          <div className="trace-image-lightbox-toolbar-group">
            <button
              type="button"
              className={fitMode === "fit-width" ? "trace-image-lightbox-toolbar-button is-active" : "trace-image-lightbox-toolbar-button"}
              aria-label="Fit width"
              onClick={() => {
                setFitMode("fit-width")
                resetView()
              }}
            >
              Fit width
            </button>
            <button
              type="button"
              className={fitMode === "fit-contain" ? "trace-image-lightbox-toolbar-button is-active" : "trace-image-lightbox-toolbar-button"}
              aria-label="Fit contain"
              onClick={() => {
                setFitMode("fit-contain")
                resetView()
              }}
            >
              Fit contain
            </button>
          </div>

          <div className="trace-image-lightbox-toolbar-group">
            <button
              type="button"
              className="trace-image-lightbox-toolbar-icon-button"
              aria-label="Zoom out"
              onClick={() => adjustZoom(-IMAGE_LIGHTBOX_ZOOM_STEP)}
            >
              <MinimizeIcon />
            </button>
            <button
              type="button"
              className="trace-image-lightbox-toolbar-button trace-image-lightbox-zoom-button"
              aria-label="Reset zoom"
              onClick={resetView}
            >
              <ResetIcon />
              <span>{zoomPercent}%</span>
            </button>
            <button
              type="button"
              className="trace-image-lightbox-toolbar-icon-button"
              aria-label="Zoom in"
              onClick={() => adjustZoom(IMAGE_LIGHTBOX_ZOOM_STEP)}
            >
              <PlusIcon />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="trace-image-lightbox-close"
              aria-label="Close image preview"
              onClick={closePreview}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className={fitMode === "fit-width" ? "trace-image-lightbox-viewport is-fit-width" : "trace-image-lightbox-viewport"} onWheel={handleViewportWheel}>
          <div
            className={joinClassNames(
              "trace-image-lightbox-canvas",
              `is-${fitMode}`,
              zoom > 1 && "is-zoomed",
              isDragging && "is-dragging",
            )}
            onPointerCancel={handleCanvasPointerEnd}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerEnd}
          >
            <img
              className="trace-image-lightbox-image"
              src={preview.src}
              alt={preview.alt}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
  isCancelling?: boolean
  isInterruptible?: boolean
  isSending: boolean
  pendingPermissionRequests: PermissionRequest[]
  permissionRequestActionError: string | null
  permissionRequestActionRequestID: string | null
  session: SessionSummary
  turns: Turn[]
  onDraftStateChange: (value: ComposerDraftState) => void
  onHide: () => void
  onAskUserQuestionAnswer: QuestionAnswerHandler
  onLocalFileLinkOpen?: (target: MarkdownLocalFileLinkTarget) => void
  onPermissionRequestResponse: PermissionRequestResponseHandler
  onPickAttachments: (input: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason: string | null
  }) => void | Promise<void>
  onPasteImageAttachments?: (input: {
    allowImage: boolean
    disabledReason: string | null
    images: ComposerPastedImageAttachment[]
  }) => void | Promise<void>
  onRemoveAttachment: (path: string) => void
  onCancelSend?: () => void | Promise<void>
  onSend: (input: {
    attachmentError?: string | null
    draftStateOverride?: ComposerDraftState
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedModel?: string | null
    selectedSkillIDs: string[]
    waitForPendingModelSelection: () => Promise<void>
  }) => void | Promise<void>
  onSessionModelSelectionChange?: (sessionID: string, selection: SessionSummary["modelSelection"] | undefined) => void
}

function InlineSideChatThread({
  activeProjectID,
  attachments,
  assistantTraceVisibility,
  composerRefreshVersion,
  draftState,
  isAgentDebugTraceEnabled,
  isResolvingPermissionRequest,
  isCancelling = false,
  isInterruptible = false,
  isSending,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  session,
  turns,
  onDraftStateChange,
  onHide,
  onAskUserQuestionAnswer,
  onLocalFileLinkOpen,
  onPermissionRequestResponse,
  onPickAttachments,
  onPasteImageAttachments,
  onRemoveAttachment,
  onCancelSend,
  onSend,
  onSessionModelSelectionChange,
}: InlineSideChatThreadProps) {
  const composer = useProjectComposer({
    attachmentPaths: attachments.map((attachment) => attachment.path),
    onSessionModelSelectionChange,
    projectID: activeProjectID,
    refreshToken: composerRefreshVersion,
    sessionModelSelection: session.modelSelection,
    sessionID: session.id,
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
          <strong>Side chat</strong>
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
          pendingPermissionRequests={pendingPermissionRequests}
          permissionRequestActionError={permissionRequestActionError}
          permissionRequestActionRequestID={permissionRequestActionRequestID}
          showSessionBanner={false}
          sideChatCountsByAnchorMessageID={{}}
          threadColumnRef={threadColumnRef}
          onAskUserQuestionAnswer={(answer) =>
            onAskUserQuestionAnswer({
              ...answer,
              sessionID: session.id,
            })
          }
          onLocalFileLinkOpen={onLocalFileLinkOpen}
          onPermissionRequestResponse={onPermissionRequestResponse}
        />

        <Composer
          attachments={attachments}
          attachmentButtonTitle={composer.attachmentButtonTitle}
          attachmentDisabledReason={composer.attachmentDisabledReason}
          attachmentError={composer.attachmentError}
          canSend
          canPasteImageAttachments={
            Boolean(onPasteImageAttachments) && composer.attachmentCapabilities.image && composer.attachmentDisabledReason === null
          }
          draftState={draftState}
          hasPendingPermissionRequests={pendingPermissionRequests.length > 0 || isResolvingPermissionRequest}
          isCancelling={isCancelling}
          isInterruptible={isInterruptible}
          isSending={isSending}
          mcpOptions={composer.mcpOptions}
          modelOptions={composer.modelOptions}
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
          onPasteImageAttachments={
            onPasteImageAttachments
              ? (images) =>
                  onPasteImageAttachments({
                    allowImage: composer.attachmentCapabilities.image,
                    disabledReason: composer.attachmentDisabledReason,
                    images,
                  })
              : undefined
          }
          onRemoveAttachment={onRemoveAttachment}
          onCancelSend={onCancelSend}
          onSend={(draftStateOverride) =>
            void onSend({
              attachmentError: composer.attachmentError,
              draftStateOverride,
              selectedReasoningEffort: composer.selectedReasoningEffort,
              selectedModel: composer.selectedModel,
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

function parseProposedPlanBlock(text: string | null | undefined) {
  const raw = text?.trim() ?? ""
  if (!raw.startsWith(PROPOSED_PLAN_OPEN_TAG)) return null

  const closeTagIndex = raw.indexOf(PROPOSED_PLAN_CLOSE_TAG, PROPOSED_PLAN_OPEN_TAG.length)
  const isComplete = closeTagIndex >= 0
  const contentEndIndex = isComplete ? closeTagIndex : raw.length
  const rawEndIndex = isComplete ? closeTagIndex + PROPOSED_PLAN_CLOSE_TAG.length : raw.length
  const markdown = raw.slice(PROPOSED_PLAN_OPEN_TAG.length, contentEndIndex).trim()

  return {
    raw: raw.slice(0, rawEndIndex).trim(),
    markdown,
    isComplete,
  }
}

function getProposedPlanStateText(status: ProposedPlanCardStatus) {
  switch (status) {
    case "cancelled":
      return "已取消"
    case "confirmed":
      return "已确认"
    case "confirming":
      return "确认中..."
    case "idle":
      return null
  }
}

function ProposedPlanCard({
  planMarkdown,
  rawPlanMarkdown,
  isComplete,
  isLatestMessage,
  onConfirm,
}: {
  planMarkdown: string
  rawPlanMarkdown: string
  isComplete: boolean
  isLatestMessage: boolean
  onConfirm?: ProposedPlanConfirmHandler
}) {
  const [status, setStatus] = useState<ProposedPlanCardStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const stateText = getProposedPlanStateText(status)
  const showActions = isLatestMessage && status === "idle"
  const showState = isLatestMessage && Boolean(stateText)
  const isActionDisabled = !isComplete || status !== "idle"

  async function handleConfirm() {
    if (!isComplete || !onConfirm || status !== "idle") return

    setStatus("confirming")
    setErrorMessage(null)
    try {
      await onConfirm({ planMarkdown: rawPlanMarkdown })
      setStatus("confirmed")
    } catch (error) {
      setStatus("idle")
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <article className="proposed-plan-card" aria-label="Proposed plan">
      <div className="proposed-plan-card-body">
        <ThreadMarkdown className="proposed-plan-markdown thread-markdown" text={planMarkdown} />
      </div>
      <div className="proposed-plan-actions">
        {errorMessage ? <span className="proposed-plan-error">{errorMessage}</span> : null}
        {showState ? <span className="proposed-plan-state">{stateText}</span> : null}
        {showActions ? (
          <>
            <button
              className="secondary-button"
              disabled={isActionDisabled}
              type="button"
              onClick={() => setStatus("cancelled")}
            >
              取消
            </button>
            <button
              className="primary-button"
              disabled={!onConfirm || isActionDisabled}
              type="button"
              onClick={() => void handleConfirm()}
            >
              确认实施
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
}

interface TraceItemViewProps {
  answeredQuestionIDs?: Set<string>
  item: AssistantTraceItem
  isQuestionAnswerDisabled?: boolean
  isLatestMessage?: boolean
  onOpenImagePreview?: (payload: ImagePreviewPayload) => void
  onAskUserQuestionAnswer?: QuestionAnswerHandler
  onFileChangeSelect?: (file: string) => void
  onLocalFileLinkOpen?: (target: MarkdownLocalFileLinkTarget) => void
  onProposedPlanConfirm?: ProposedPlanConfirmHandler
  shouldCollapseAfterTurnCompletion?: boolean
  traceVisibility: AssistantTraceVisibility
}

type RequiredTraceItemRendererProps = Required<
  Pick<
    TraceItemViewProps,
    "isQuestionAnswerDisabled" | "isLatestMessage" | "shouldCollapseAfterTurnCompletion"
  >
>

type TraceItemRendererProps = RequiredTraceItemRendererProps &
  Pick<
    TraceItemViewProps,
    | "answeredQuestionIDs"
    | "item"
    | "onAskUserQuestionAnswer"
    | "onFileChangeSelect"
    | "onLocalFileLinkOpen"
    | "onOpenImagePreview"
    | "onProposedPlanConfirm"
    | "traceVisibility"
  > & {
    className: string
    debugEntries: AssistantTraceDebugEntry[]
    isResponseItem: boolean
  }

function TraceItemDebugEntries({
  debugEntries,
  itemID,
}: {
  debugEntries: AssistantTraceDebugEntry[]
  itemID: string
}) {
  if (debugEntries.length === 0) return null

  return (
    <div className="trace-item-debug">
      {debugEntries.map((entry) => (
        <div key={`${itemID}-${entry.label}`} className="trace-item-debug-row">
          <span className="trace-item-debug-label">{entry.label}</span>
          <span className="trace-item-debug-value">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

function TraceItemHeader({
  item,
  statusText,
}: {
  item: AssistantTraceItem
  statusText?: string | null
}) {
  return (
    <div className="trace-item-header">
      <span className="trace-item-label">{item.label}</span>
      {item.title ? <strong className="trace-item-title">{item.title}</strong> : null}
      {item.status ? <span className={`trace-item-status is-${item.status}`}>{statusText ?? item.status}</span> : null}
    </div>
  )
}

function TraceItemTextBody({
  isResponseItem,
  item,
  onLocalFileLinkOpen,
}: {
  isResponseItem: boolean
  item: AssistantTraceItem
  onLocalFileLinkOpen?: (target: MarkdownLocalFileLinkTarget) => void
}) {
  return (
    <>
      {item.text ? (
        isResponseItem && !item.isStreaming ? (
          <ThreadMarkdown className="trace-item-text thread-markdown" text={item.text} onLocalFileLinkOpen={onLocalFileLinkOpen} />
        ) : (
          <ThreadRichText
            className="trace-item-text"
            text={item.text}
            onLocalFileLinkOpen={isResponseItem ? onLocalFileLinkOpen : undefined}
          />
        )
      ) : null}
      {item.detail ? (
        isResponseItem && !item.isStreaming ? (
          <ThreadMarkdown className="trace-item-detail thread-markdown" text={item.detail} onLocalFileLinkOpen={onLocalFileLinkOpen} />
        ) : (
          <ThreadRichText
            className="trace-item-detail"
            text={item.detail}
            onLocalFileLinkOpen={isResponseItem ? onLocalFileLinkOpen : undefined}
          />
        )
      ) : null}
    </>
  )
}

function TraceItemFileActions({
  filePaths,
  itemID,
  onFileChangeSelect,
}: {
  filePaths: string[]
  itemID: string
  onFileChangeSelect?: (file: string) => void
}) {
  if (filePaths.length === 0 || !onFileChangeSelect) return null

  return (
    <div className="trace-item-file-actions">
      {filePaths.map((filePath) => (
        <button
          key={`${itemID}-${filePath}`}
          type="button"
          className="trace-item-file-chip"
          onClick={() => onFileChangeSelect(filePath)}
        >
          {filePath}
        </button>
      ))}
    </div>
  )
}

function normalizePatchFileChanges(item: AssistantTraceItem): AssistantTraceFileChange[] {
  const changes = item.fileChanges?.filter((change) => change.file.trim()) ?? []
  if (changes.length > 0) return changes

  return (item.filePaths ?? [])
    .filter((file) => file.trim())
    .map((file) => ({
      file,
      additions: 0,
      deletions: 0,
    }))
}

function GenericTraceItemView({
  className,
  debugEntries,
  isResponseItem,
  item,
  onFileChangeSelect,
  onLocalFileLinkOpen,
  showFileActions = false,
}: TraceItemRendererProps & {
  showFileActions?: boolean
}) {
  const selectableFilePaths = showFileActions ? item.filePaths?.filter(Boolean) ?? [] : []

  return (
    <article className={className} data-kind={item.kind}>
      <TraceItemHeader item={item} />
      <TraceItemTextBody item={item} isResponseItem={isResponseItem} onLocalFileLinkOpen={onLocalFileLinkOpen} />
      <TraceItemFileActions
        filePaths={selectableFilePaths}
        itemID={item.id}
        onFileChangeSelect={onFileChangeSelect}
      />
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function SystemTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function SourceTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function FileTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function PatchTraceItemView({
  className,
  debugEntries,
  item,
  onFileChangeSelect,
  ...props
}: TraceItemRendererProps) {
  const fileChanges = normalizePatchFileChanges(item)
  const fileChangeSignature = fileChanges
    .map((change) => `${change.file}\u0000${change.additions}\u0000${change.deletions}\u0000${Boolean(change.patch?.trim())}`)
    .join("\u0001")
  const [isListExpanded, setIsListExpanded] = useState(false)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [fullHeightFile, setFullHeightFile] = useState<string | null>(null)

  useEffect(() => {
    setIsListExpanded(false)
    setExpandedFile(null)
    setFullHeightFile(null)
  }, [fileChangeSignature, item.id])

  if (fileChanges.length === 0) {
    return (
      <GenericTraceItemView
        className={className}
        debugEntries={debugEntries}
        item={item}
        onFileChangeSelect={onFileChangeSelect}
        showFileActions
        {...props}
      />
    )
  }

  const listID = `trace-file-change-list-${item.id}`
  const editedFileSummary = `已编辑 ${fileChanges.length} 个文件`
  const handleSummaryToggle = () => {
    const nextIsListExpanded = !isListExpanded
    setIsListExpanded(nextIsListExpanded)
    if (!nextIsListExpanded) {
      setExpandedFile(null)
      setFullHeightFile(null)
    }
  }

  return (
    <article className={className} data-kind={item.kind}>
      <button
        type="button"
        className="trace-file-change-summary"
        aria-expanded={isListExpanded}
        aria-controls={listID}
        onClick={handleSummaryToggle}
      >
        <span className="trace-file-change-summary-icon" aria-hidden="true">
          <ChangesIcon />
        </span>
        <span className="trace-file-change-summary-label">{editedFileSummary}</span>
        <span className="trace-file-change-summary-chevron" aria-hidden="true">
          {isListExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
      </button>
      {isListExpanded ? (
        <div id={listID} className="trace-file-change-list">
          {fileChanges.map((change, changeIndex) => {
            const hasPatch = Boolean(change.patch?.trim())
            const isExpanded = expandedFile === change.file
            const previewID = `trace-file-change-${item.id}-${changeIndex}`
            const rowContent = (
              <>
                <span className="trace-file-change-toggle-icon" aria-hidden="true">
                  {hasPatch ? (isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />) : null}
                </span>
                <span className="trace-file-change-action">已编辑</span>
                <span className="trace-file-change-file">{change.file}</span>
                <span className="trace-file-change-stats" aria-label={`${change.additions} additions, ${change.deletions} deletions`}>
                  <span className="is-add">+{change.additions}</span>
                  <span className="is-remove">-{change.deletions}</span>
                </span>
                {!hasPatch ? <span className="trace-file-change-note">仅摘要</span> : null}
              </>
            )

            return (
              <div key={`${item.id}-${change.file}-${changeIndex}`} className="trace-file-change-entry">
                {hasPatch ? (
                  <button
                    type="button"
                    className="trace-file-change-row"
                    aria-expanded={isExpanded}
                    aria-controls={previewID}
                    onClick={() => setExpandedFile((current) => current === change.file ? null : change.file)}
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div className="trace-file-change-row is-static">
                    {rowContent}
                  </div>
                )}
                {hasPatch && isExpanded ? (
                  <div id={previewID} className="trace-file-change-preview">
                    <DiffPreview
                      className="trace-historical-diff"
                      emptyClassName="trace-historical-diff-empty"
                      file={change.file}
                      isFullHeight={fullHeightFile === change.file}
                      onToggleFullHeight={() =>
                        setFullHeightFile((current) => current === change.file ? null : change.file)
                      }
                      patch={change.patch}
                      viewMode="unified"
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function SubtaskTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function StepTraceItemView(props: TraceItemRendererProps) {
  const { className, debugEntries, item } = props
  const statusText = formatTraceStatusText(item.status) ?? item.status

  return (
    <article className={`${className} trace-item-step-line`} data-kind={item.kind}>
      <div className="trace-item-step-row">
        <span className="trace-item-label">{item.label}</span>
        {item.title ? <strong className="trace-item-title">{item.title}</strong> : null}
        {item.text ? <ThreadRichText as="span" className="trace-item-text trace-item-step-summary" text={item.text} /> : null}
        {item.detail ? <ThreadRichText as="span" className="trace-item-detail trace-item-step-summary" text={item.detail} /> : null}
        {item.status ? <span className={`trace-item-status is-${item.status}`}>{statusText}</span> : null}
      </div>
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function RetryTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function SnapshotTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function ErrorTraceItemView(props: TraceItemRendererProps) {
  return <GenericTraceItemView {...props} />
}

function ImageTraceItemView({
  className,
  debugEntries,
  item,
  onOpenImagePreview,
  ...props
}: TraceItemRendererProps) {
  if (!item.src) {
    return (
      <GenericTraceItemView
        className={className}
        debugEntries={debugEntries}
        item={item}
        onOpenImagePreview={onOpenImagePreview}
        {...props}
      />
    )
  }

  return (
    <article className={className} data-kind={item.kind}>
      <TraceItemHeader item={item} />
      <TraceImagePreview item={item} onOpenImagePreview={onOpenImagePreview} />
      {item.text ? <ThreadRichText className="trace-item-text" text={item.text} /> : null}
      {item.detail ? <ThreadRichText className="trace-item-detail" text={item.detail} /> : null}
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function ReasoningTraceItemView({
  className,
  debugEntries,
  item,
  shouldCollapseAfterTurnCompletion,
}: TraceItemRendererProps) {
  const shouldCollapseTraceItem = shouldCollapseAfterTurnCompletion && isCollapsibleTraceItem(item)
  const [isExpanded, setIsExpanded] = useState(() => !shouldCollapseTraceItem)
  const contentID = `trace-item-reasoning-${item.id}`
  const collapsedLine = getCollapsedReasoningLine(item)

  useLayoutEffect(() => {
    if (!shouldCollapseTraceItem) return
    setIsExpanded(false)
  }, [item.id, shouldCollapseTraceItem])

  function handleReasoningToggle(event?: { target: EventTarget | null }) {
    if (event?.target instanceof Element && event.target.closest("a[href]")) return
    setIsExpanded((current) => !current)
  }

  function handleReasoningKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    handleReasoningToggle()
  }

  return (
    <article
      className={joinClassNames(className, isExpanded ? "is-expanded" : "is-collapsed")}
      data-kind={item.kind}
    >
      <div
        className="trace-item-reasoning-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={contentID}
        onClick={handleReasoningToggle}
        onKeyDown={handleReasoningKeyDown}
      >
        {isExpanded ? (
          <div id={contentID} className="trace-item-reasoning-body">
            {item.text ? <ThreadRichText className="trace-item-text trace-item-plain-text" text={item.text} /> : null}
            {item.detail ? <ThreadRichText className="trace-item-detail trace-item-plain-detail" text={item.detail} /> : null}
            <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
          </div>
        ) : (
          <ThreadRichText
            as="div"
            className="trace-item-text trace-item-plain-text trace-item-collapsed-line"
            text={collapsedLine}
          />
        )}
      </div>
    </article>
  )
}

function CompactionTraceItemView({
  className,
  debugEntries,
  item,
}: TraceItemRendererProps) {
  return (
    <article className={className} data-kind={item.kind} aria-label={item.title || "Context compacted"}>
      <div className="trace-compaction-separator">
        <span className="trace-compaction-rule" aria-hidden="true" />
        <span className="trace-compaction-label">
          <span className="trace-compaction-glyph" aria-hidden="true" />
          {item.title || "Context compacted"}
        </span>
        <span className="trace-compaction-rule" aria-hidden="true" />
      </div>
      {item.detail ? <ThreadRichText className="trace-item-detail trace-compaction-detail" text={item.detail} /> : null}
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function QuestionTraceItemView({
  answeredQuestionIDs,
  className,
  debugEntries,
  isQuestionAnswerDisabled,
  item,
  onAskUserQuestionAnswer,
  ...props
}: TraceItemRendererProps) {
  const [isSubmittingQuestionAnswer, setIsSubmittingQuestionAnswer] = useState(false)
  const [freeformAnswer, setFreeformAnswer] = useState("")
  const [selectedQuestionOptions, setSelectedQuestionOptions] = useState<string[]>([])
  const prompt = item.questionPrompt

  useEffect(() => {
    setIsSubmittingQuestionAnswer(false)
  }, [item.id])

  if (!prompt) {
    return (
      <GenericTraceItemView
        answeredQuestionIDs={answeredQuestionIDs}
        className={className}
        debugEntries={debugEntries}
        isQuestionAnswerDisabled={isQuestionAnswerDisabled}
        item={item}
        onAskUserQuestionAnswer={onAskUserQuestionAnswer}
        {...props}
      />
    )
  }

  const questionID = prompt.questionID
  const isQuestionAnswered = Boolean(prompt.answered || (questionID && answeredQuestionIDs?.has(questionID)))
  const canSubmitAnswer = Boolean(onAskUserQuestionAnswer && questionID)
  const isAnswerDisabled = isQuestionAnswered || isQuestionAnswerDisabled || isSubmittingQuestionAnswer || !questionID
  const canUseOptionButtons = prompt.options.length > 0 && !prompt.multiple && canSubmitAnswer
  const canUseMultipleSelection = prompt.options.length > 0 && prompt.multiple && canSubmitAnswer
  const trimmedFreeformAnswer = freeformAnswer.trim()
  const hasSelectedOptions = selectedQuestionOptions.length > 0
  const canSubmitStructuredAnswer = canSubmitAnswer && !isAnswerDisabled && (hasSelectedOptions || Boolean(trimmedFreeformAnswer))
  const note = isQuestionAnswered
    ? prompt.answerText ? `Answered: ${prompt.answerText}` : "Answered."
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

  async function submitQuestionAnswer(input: {
    text: string
    selectedOptions?: string[]
    freeformText?: string
  }) {
    if (!onAskUserQuestionAnswer || isAnswerDisabled || !questionID) return

    setIsSubmittingQuestionAnswer(true)
    try {
      await onAskUserQuestionAnswer({
        text: input.text,
        questionID,
        ...(input.selectedOptions && input.selectedOptions.length > 0 ? { selectedOptions: input.selectedOptions } : {}),
        ...(input.freeformText ? { freeformText: input.freeformText } : {}),
      })
    } finally {
      setIsSubmittingQuestionAnswer(false)
    }
  }

  function handleStructuredAnswerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isAnswerDisabled) return

    const selectedOptions = selectedQuestionOptions.map((value) => value.trim()).filter(Boolean)
    const nextFreeformAnswer = freeformAnswer.trim()
    const answerText = nextFreeformAnswer || selectedOptions.join(", ")
    if (!answerText) return

    void submitQuestionAnswer({
      text: answerText,
      ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
      ...(nextFreeformAnswer ? { freeformText: nextFreeformAnswer } : {}),
    })

    setFreeformAnswer("")
    setSelectedQuestionOptions([])
  }

  return (
    <article className={`${className} ask-user-question-card`} data-kind={item.kind} role="region" aria-label={item.title || "Agent question"}>
      <div className="ask-user-question-body">
        <ThreadRichText className="ask-user-question-text" text={prompt.question} />

        {prompt.options.length > 0 ? (
          <ol className="ask-user-question-options">
            {prompt.options.map((option, index) => (
              <li key={`${item.id}-${option.value}-${index}`} className="ask-user-question-option">
                <span className="ask-user-question-option-number" aria-hidden="true">{index + 1}.</span>
                {canUseOptionButtons ? (
                  <button
                    aria-label={option.label}
                    className="ask-user-question-option-button"
                    disabled={isAnswerDisabled}
                    onClick={() =>
                      void submitQuestionAnswer({
                        text: option.value,
                        selectedOptions: [option.value],
                      })}
                    type="button"
                  >
                    <span className="ask-user-question-option-label">{option.label}</span>
                    {option.description ? <ThreadRichText as="span" className="ask-user-question-option-description" text={option.description} /> : null}
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
                    {option.description ? <ThreadRichText as="span" className="ask-user-question-option-description" text={option.description} /> : null}
                  </label>
                ) : (
                  <div className="ask-user-question-option-static">
                    <span className="ask-user-question-option-label">{option.label}</span>
                    {option.description ? <ThreadRichText as="span" className="ask-user-question-option-description" text={option.description} /> : null}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : null}

        {canUseMultipleSelection || (prompt.allowFreeform && canSubmitAnswer) ? (
          <form className="ask-user-question-response-form" onSubmit={handleStructuredAnswerSubmit}>
            {prompt.allowFreeform ? (
              <label className={joinClassNames(
                "ask-user-question-freeform-row",
                prompt.options.length === 0 && "is-standalone",
              )}>
                {prompt.options.length > 0 ? (
                  <span className="ask-user-question-option-number" aria-hidden="true">{prompt.options.length + 1}.</span>
                ) : null}
                <input
                  aria-label="Custom answer"
                  className="ask-user-question-freeform-input"
                  disabled={isAnswerDisabled}
                  onChange={(event) => setFreeformAnswer(event.target.value)}
                  placeholder={prompt.placeholder || "Type your answer"}
                  type="text"
                  value={freeformAnswer}
                />
              </label>
            ) : null}

            <div className="ask-user-question-actions">
              <button
                className="secondary-button"
                disabled={!canSubmitStructuredAnswer}
                type="submit"
              >
                Submit
              </button>
            </div>
          </form>
        ) : null}

        {note ? <p className="ask-user-question-note">{note}</p> : null}
      </div>
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function TaskStateTraceItemView({
  className,
  debugEntries,
  item,
  ...props
}: TraceItemRendererProps) {
  if (!item.progressItems?.length) {
    return <GenericTraceItemView className={className} debugEntries={debugEntries} item={item} {...props} />
  }

  return (
    <article className={className} data-kind={item.kind}>
      <TraceItemHeader item={item} statusText={formatTraceStatusText(item.status) ?? item.status} />
      {item.detail ? <ThreadRichText className="trace-item-detail" text={item.detail} /> : null}
      <ol className="task-progress-list">
        {item.progressItems.map((progressItem) => (
          <li key={`${item.id}-${progressItem.id}`} className={`task-progress-item is-${progressItem.status}`}>
            <span className="task-progress-status">{progressItem.status === "in_progress" ? "in progress" : progressItem.status}</span>
            <span className="task-progress-step">{progressItem.step}</span>
          </li>
        ))}
      </ol>
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

type ToolTraceDisplayTone = "preparing" | "running" | "waiting-approval" | "success" | "error" | "denied" | "idle"
type ToolTraceDisplayIconType = "dot" | "success" | "error" | "tool"

function getToolTraceDisplayState(item: AssistantTraceItem): {
  iconType: ToolTraceDisplayIconType
  isBreathing: boolean
  label: string | null
  shouldShowLabel: boolean
  tone: ToolTraceDisplayTone
} {
  switch (item.status) {
    case "pending":
      return {
        iconType: "dot",
        isBreathing: true,
        label: "准备中",
        shouldShowLabel: true,
        tone: "preparing",
      }
    case "running":
      return {
        iconType: "dot",
        isBreathing: true,
        label: "执行中",
        shouldShowLabel: true,
        tone: "running",
      }
    case "waiting-approval":
      return {
        iconType: "dot",
        isBreathing: true,
        label: "等待确认",
        shouldShowLabel: true,
        tone: "waiting-approval",
      }
    case "completed":
      return {
        iconType: "success",
        isBreathing: false,
        label: null,
        shouldShowLabel: false,
        tone: "success",
      }
    case "error":
      return {
        iconType: "error",
        isBreathing: false,
        label: "失败",
        shouldShowLabel: true,
        tone: "error",
      }
    case "denied":
      return {
        iconType: "error",
        isBreathing: false,
        label: "已拒绝",
        shouldShowLabel: true,
        tone: "denied",
      }
    default:
      return {
        iconType: "tool",
        isBreathing: false,
        label: null,
        shouldShowLabel: false,
        tone: "idle",
      }
  }
}

function ToolTraceItemView({
  className,
  debugEntries,
  item,
  shouldCollapseAfterTurnCompletion,
  traceVisibility,
}: TraceItemRendererProps) {
  const shouldCollapseTraceItem = shouldCollapseAfterTurnCompletion && isCollapsibleTraceItem(item)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isInputExpanded, setIsInputExpanded] = useState(false)
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const summaryTitle = item.title || item.label
  const displayState = getToolTraceDisplayState(item)
  const statusIndicatorClassName = joinClassNames(
    "trace-tool-status-indicator",
    `is-${displayState.tone}`,
    `is-icon-${displayState.iconType}`,
    displayState.isBreathing && "is-breathing",
  )
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

  useLayoutEffect(() => {
    if (!shouldCollapseTraceItem) return
    setIsExpanded(false)
    setIsInputExpanded(false)
    setIsOutputExpanded(false)
  }, [item.id, shouldCollapseTraceItem])

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
            <span className={joinClassNames("trace-item-toggle-leading-icon", statusIndicatorClassName)} aria-hidden="true">
              <ToolsIcon />
            </span>
            <span className="trace-item-toggle-line">
              <span className="trace-item-inline-title">{summaryTitle}</span>
              {displayState.shouldShowLabel && displayState.label ? (
                <span className="trace-item-inline-status">{" \u00b7 "}{displayState.label}</span>
              ) : null}
            </span>
            <span className="trace-item-toggle-chevron" aria-hidden="true">
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
          </span>
        </button>
      ) : (
        <p className="trace-item-toggle-summary trace-item-toggle-static-summary">
          <span className={joinClassNames("trace-item-toggle-leading-icon", statusIndicatorClassName)} aria-hidden="true">
            <ToolsIcon />
          </span>
          <span className="trace-item-toggle-line">
            <span className="trace-item-inline-title">{summaryTitle}</span>
            {displayState.shouldShowLabel && displayState.label ? (
              <span className="trace-item-inline-status">{" \u00b7 "}{displayState.label}</span>
            ) : null}
          </span>
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
      <TraceItemDebugEntries debugEntries={debugEntries} itemID={item.id} />
    </article>
  )
}

function TextTraceItemView({
  isLatestMessage,
  isResponseItem,
  item,
  onProposedPlanConfirm,
  ...props
}: TraceItemRendererProps) {
  const proposedPlan = isResponseItem ? parseProposedPlanBlock(item.text) : null

  if (proposedPlan) {
    return (
      <ProposedPlanCard
        planMarkdown={proposedPlan.markdown}
        rawPlanMarkdown={proposedPlan.raw}
        isComplete={proposedPlan.isComplete}
        isLatestMessage={isLatestMessage}
        onConfirm={onProposedPlanConfirm}
      />
    )
  }

  return (
    <GenericTraceItemView
      isLatestMessage={isLatestMessage}
      isResponseItem={isResponseItem}
      item={item}
      onProposedPlanConfirm={onProposedPlanConfirm}
      {...props}
    />
  )
}

const traceItemRenderers = {
  system: SystemTraceItemView,
  reasoning: ReasoningTraceItemView,
  text: TextTraceItemView,
  question: QuestionTraceItemView,
  tool: ToolTraceItemView,
  source: SourceTraceItemView,
  file: FileTraceItemView,
  image: ImageTraceItemView,
  patch: PatchTraceItemView,
  subtask: SubtaskTraceItemView,
  compaction: CompactionTraceItemView,
  step: StepTraceItemView,
  retry: RetryTraceItemView,
  snapshot: SnapshotTraceItemView,
  "task-state": TaskStateTraceItemView,
  error: ErrorTraceItemView,
} satisfies Record<AssistantTraceItemKind, ComponentType<TraceItemRendererProps>>

function TraceItemView({
  answeredQuestionIDs,
  item,
  isQuestionAnswerDisabled = false,
  isLatestMessage = false,
  onOpenImagePreview,
  onAskUserQuestionAnswer,
  onFileChangeSelect,
  onLocalFileLinkOpen,
  onProposedPlanConfirm,
  shouldCollapseAfterTurnCompletion = false,
  traceVisibility,
}: TraceItemViewProps) {
  const className = [
    "trace-item",
    `trace-kind-${item.kind}`,
    item.kind === "reasoning" || item.kind === "tool" ? "is-plain" : "",
    item.isStreaming ? "is-streaming" : "",
    item.status ? `is-${item.status}` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const debugEntries = traceVisibility.debugMetadata ? item.debugEntries ?? [] : []
  const isResponseItem = traceSectionKeyForItem(item) === "response"
  const Renderer = traceItemRenderers[item.kind]

  return (
    <Renderer
      answeredQuestionIDs={answeredQuestionIDs}
      className={className}
      debugEntries={debugEntries}
      isLatestMessage={isLatestMessage}
      isQuestionAnswerDisabled={isQuestionAnswerDisabled}
      isResponseItem={isResponseItem}
      item={item}
      onAskUserQuestionAnswer={onAskUserQuestionAnswer}
      onFileChangeSelect={onFileChangeSelect}
      onLocalFileLinkOpen={onLocalFileLinkOpen}
      onOpenImagePreview={onOpenImagePreview}
      onProposedPlanConfirm={onProposedPlanConfirm}
      shouldCollapseAfterTurnCompletion={shouldCollapseAfterTurnCompletion}
      traceVisibility={traceVisibility}
    />
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
              className={decision === "allow" ? "primary-button" : "secondary-button"}
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
  showSessionBanner = true,
  onFileChangeSelect,
  onLocalFileLinkOpen,
  onOpenSideChat,
  onTurnDiffRestore,
  onTurnDiffReview,
  onAskUserQuestionAnswer,
  pendingPermissionRequests,
  permissionRequestActionError,
  permissionRequestActionRequestID,
  sideChatAttachments = [],
  sideChatCountsByAnchorMessageID,
  sideChatDraftState = createEmptyComposerDraftState(),
  sideChatIsCancelling = false,
  sideChatIsInterruptible = false,
  sideChatIsSending = false,
  sideChatPendingPermissionRequests = [],
  sideChatPermissionRequestActionError = null,
  sideChatPermissionRequestActionRequestID = null,
  sideChatSession = null,
  sideChatTurns = [],
  threadColumnRef,
  onSideChatDraftStateChange,
  onSideChatPickAttachments,
  onSideChatPasteImageAttachments,
  onSideChatRemoveAttachment,
  onSideChatCancelSend,
  onSideChatSend,
  onSessionModelSelectionChange,
  onProposedPlanConfirm,
  onPermissionRequestResponse,
}: ThreadViewProps) {
  const answeredQuestionIDs = collectAnsweredQuestionIDs(activeTurns)
  const readOnlySideChat = isSideChatSession(activeSession)
  const [copiedResponseTurnID, setCopiedResponseTurnID] = useState<string | null>(null)
  const [copiedUserTurnID, setCopiedUserTurnID] = useState<string | null>(null)
  const [activeImagePreview, setActiveImagePreview] = useState<ActiveImagePreview | null>(null)
  const copiedResponseTimeoutRef = useRef<number | null>(null)
  const copiedUserTimeoutRef = useRef<number | null>(null)
  const isPinnedToBottomRef = useRef(true)
  const lastInlineLinkActivationRef = useRef<{
    href: string
    time: number
    x: number
    y: number
  } | null>(null)
  const activeSessionID = activeSession?.id ?? null

  useEffect(() => {
    return () => {
      if (copiedResponseTimeoutRef.current !== null) {
        window.clearTimeout(copiedResponseTimeoutRef.current)
      }
      if (copiedUserTimeoutRef.current !== null) {
        window.clearTimeout(copiedUserTimeoutRef.current)
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

  const handleCopyUserMessage = useEffectEvent(async (turnID: string, text: string) => {
    try {
      await writeTextToClipboard(text)
      setCopiedUserTurnID(turnID)

      if (copiedUserTimeoutRef.current !== null) {
        window.clearTimeout(copiedUserTimeoutRef.current)
      }

      copiedUserTimeoutRef.current = window.setTimeout(() => {
        setCopiedUserTurnID((current) => (current === turnID ? null : current))
        copiedUserTimeoutRef.current = null
      }, 1600)
    } catch (error) {
      console.error("[desktop] Failed to copy user message:", error)
    }
  })

  const handleOpenImagePreview = useEffectEvent((payload: ImagePreviewPayload) => {
    if (!payload.src) return
    setActiveImagePreview({
      ...payload,
      openedAt: Date.now(),
    })
  })

  const handleCloseImagePreview = useEffectEvent(() => {
    setActiveImagePreview(null)
  })

  useEffect(() => {
    function handleInlineThreadLinkActivation(event: MouseEvent | PointerEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      const threadColumn = threadColumnRef.current
      if (!threadColumn) return

      let anchor: HTMLAnchorElement | null = null
      for (const target of event.composedPath()) {
        if (!(target instanceof Element)) continue
        const candidate = target.closest<HTMLAnchorElement>("a[href]")
        if (candidate && threadColumn.contains(candidate)) {
          anchor = candidate
          break
        }
      }

      if (!anchor) {
        const elementsAtPoint = document.elementsFromPoint?.(event.clientX, event.clientY) ?? []
        for (const element of elementsAtPoint) {
          const candidate = element.closest<HTMLAnchorElement>("a[href]")
          if (candidate && threadColumn.contains(candidate)) {
            anchor = candidate
            break
          }
        }
      }

      if (!anchor) return

      const linkTarget = normalizeMarkdownLinkTarget(anchor.getAttribute("href") ?? "")
      if (!linkTarget) return

      const lastActivation = lastInlineLinkActivationRef.current
      const isDuplicateClick =
        event.type === "click" &&
        lastActivation?.href === linkTarget.href &&
        Date.now() - lastActivation.time < 700 &&
        Math.abs(lastActivation.x - event.clientX) < 6 &&
        Math.abs(lastActivation.y - event.clientY) < 6

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (isDuplicateClick) return

      lastInlineLinkActivationRef.current = {
        href: linkTarget.href,
        time: Date.now(),
        x: event.clientX,
        y: event.clientY,
      }

      if (linkTarget.kind === "local-file") {
        onLocalFileLinkOpen?.(linkTarget.target)
        return
      }

      openExternalThreadLink(linkTarget.href)
    }

    document.addEventListener("pointerup", handleInlineThreadLinkActivation, { capture: true })
    document.addEventListener("click", handleInlineThreadLinkActivation, { capture: true })
    return () => {
      document.removeEventListener("pointerup", handleInlineThreadLinkActivation, { capture: true })
      document.removeEventListener("click", handleInlineThreadLinkActivation, { capture: true })
    }
  }, [onLocalFileLinkOpen, threadColumnRef])

  useLayoutEffect(() => {
    isPinnedToBottomRef.current = true

    const threadColumn = threadColumnRef.current
    if (!threadColumn) return

    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [activeSessionID, threadColumnRef])

  useLayoutEffect(() => {
    const threadColumn = threadColumnRef.current
    if (!threadColumn || !isPinnedToBottomRef.current) return

    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [activeTurns, pendingPermissionRequests.length, permissionRequestActionRequestID, threadColumnRef])

  function handleThreadScroll() {
    const threadColumn = threadColumnRef.current
    if (!threadColumn) return

    isPinnedToBottomRef.current = isThreadColumnPinnedToBottom(threadColumn)
  }

  return (
    <section className="thread-shell">
      <div ref={threadColumnRef} className="thread-column" onScroll={handleThreadScroll}>
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
                  <strong>Linked reply thread</strong>
                  <p>Scoped discussion linked to one assistant reply. It stays out of the main session context.</p>
                </div>
                <span className="thread-session-banner-pill">Isolated</span>
              </article>
            ) : null}
            {activeTurns.map((turn, turnIndex) => {
              if (turn.kind === "user") {
                const userCopyText = getUserTurnBodyText(turn).trim()
                const isUserCopied = copiedUserTurnID === turn.id

                return (
                  <article key={turn.id} className="turn user-turn">
                    <div className="turn-meta">
                      <span>You</span>
                      <time>{formatTime(turn.timestamp)}</time>
                    </div>
                    <UserTurnBubble turn={turn} />
                    {shouldRenderDiffOnStandaloneUserTurn(activeTurns, turnIndex, turn) ? (
                      <UserTurnDiffCard
                        turn={turn}
                        onFileChangeSelect={onFileChangeSelect}
                        onTurnDiffRestore={onTurnDiffRestore}
                        onTurnDiffReview={onTurnDiffReview}
                      />
                    ) : null}
                    {userCopyText ? (
                      <div className="user-message-actions">
                        <button
                          className={joinClassNames(
                            "message-action-icon-button user-message-action-button",
                            isUserCopied && "is-active",
                          )}
                          type="button"
                          aria-label={isUserCopied ? "Copied user message" : "Copy user message"}
                          title={isUserCopied ? "Copied" : "Copy"}
                          onClick={() => void handleCopyUserMessage(turn.id, userCopyText)}
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    ) : null}
                  </article>
                )
              }

              const traceItems = turn.items
              const renderedItems = filterRenderedAssistantTraceItems(
                traceItems,
                !turn.isStreaming,
                assistantTraceVisibility,
              )
              const ephemeralHint = renderedItems.length === 0 ? getAssistantEphemeralHint(turn) : null
              if (renderedItems.length === 0 && !ephemeralHint) return null
              const sideChatAnchorMessageID = turn.messageID ?? turn.id
              const existingSideChatCount = sideChatCountsByAnchorMessageID[sideChatAnchorMessageID] ?? 0
              const lastResponseItems = getLastAssistantResponseSectionItems(traceItems, assistantTraceVisibility)
              const responseCopyText = buildAssistantResponseCopyText(lastResponseItems)
              const canOpenSideChat =
                !readOnlySideChat &&
                !turn.isStreaming &&
                lastResponseItems.length > 0 &&
                Boolean(onOpenSideChat)
              const activeInlineSideChat = sideChatSession?.origin?.anchorMessageID === sideChatAnchorMessageID ? sideChatSession : null
              const trailingUserDiffTurn = getAssistantTrailingUserDiffTurn(activeTurns, turnIndex, turn)
              const shouldRenderResponseActions = Boolean(responseCopyText || canOpenSideChat)

              return (
                <article key={turn.id} className="turn assistant-turn">
                  <div className={turn.isStreaming ? "assistant-shell is-sectioned is-streaming" : "assistant-shell is-sectioned"}>
                    {ephemeralHint ? (
                      <AssistantTurnPlaceholder message={ephemeralHint} />
                    ) : (
                      <AssistantTurnSections
                        answeredQuestionIDs={answeredQuestionIDs}
                        isQuestionAnswerDisabled={isResolvingPermissionRequest || pendingPermissionRequests.length > 0}
                        isLatestMessage={turnIndex === activeTurns.length - 1}
                        items={traceItems}
                        onOpenImagePreview={handleOpenImagePreview}
                        onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                        onFileChangeSelect={onFileChangeSelect}
                        onLocalFileLinkOpen={onLocalFileLinkOpen}
                        onProposedPlanConfirm={onProposedPlanConfirm}
                        showFileChanges={!turn.isStreaming}
                        shouldCollapseReasoningAndTools={!turn.isStreaming}
                        traceVisibility={assistantTraceVisibility}
                      />
                    )}
                    {shouldRenderResponseActions ? (
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
                                "assistant-response-action-button message-action-icon-button",
                                copiedResponseTurnID === turn.id && "is-active",
                              )}
                              type="button"
                              aria-label={copiedResponseTurnID === turn.id ? "Copied assistant response" : "Copy assistant response"}
                              title={copiedResponseTurnID === turn.id ? "Copied" : "Copy"}
                              onClick={() => void handleCopyAssistantResponse(turn.id, responseCopyText)}
                            >
                              <CopyIcon />
                            </button>
                          ) : null}
                          {canOpenSideChat ? (
                            <button
                              className={joinClassNames(
                                "assistant-response-action-button message-action-icon-button",
                                activeInlineSideChat && "is-active",
                              )}
                              type="button"
                              aria-label={
                                activeInlineSideChat
                                  ? "Hide this side chat"
                                  : existingSideChatCount > 0
                                    ? `Open side chat (${existingSideChatCount})`
                                    : "Open side chat"
                              }
                              aria-pressed={Boolean(activeInlineSideChat)}
                              title={
                                activeInlineSideChat
                                  ? "Hide this side chat"
                                  : existingSideChatCount > 0
                                    ? `${existingSideChatCount} side chat thread${existingSideChatCount === 1 ? "" : "s"}`
                                    : "Open a side chat for this reply"
                              }
                              onClick={() => void onOpenSideChat?.(sideChatAnchorMessageID)}
                            >
                              <SideChatIcon />
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
                            isCancelling={sideChatIsCancelling}
                            isInterruptible={sideChatIsInterruptible}
                            isSending={sideChatIsSending}
                            pendingPermissionRequests={sideChatPendingPermissionRequests}
                            permissionRequestActionError={sideChatPermissionRequestActionError}
                            permissionRequestActionRequestID={sideChatPermissionRequestActionRequestID}
                            session={activeInlineSideChat}
                            turns={sideChatTurns}
                            onDraftStateChange={onSideChatDraftStateChange}
                            onHide={() => void onOpenSideChat?.(sideChatAnchorMessageID)}
                            onAskUserQuestionAnswer={onAskUserQuestionAnswer}
                            onLocalFileLinkOpen={onLocalFileLinkOpen}
                            onPermissionRequestResponse={onPermissionRequestResponse}
                            onPickAttachments={onSideChatPickAttachments}
                            onPasteImageAttachments={onSideChatPasteImageAttachments}
                            onRemoveAttachment={onSideChatRemoveAttachment}
                            onCancelSend={onSideChatCancelSend}
                            onSend={onSideChatSend}
                            onSessionModelSelectionChange={onSessionModelSelectionChange}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {trailingUserDiffTurn ? (
                      <UserTurnDiffCard
                        turn={trailingUserDiffTurn}
                        onFileChangeSelect={onFileChangeSelect}
                        onTurnDiffRestore={onTurnDiffRestore}
                        onTurnDiffReview={onTurnDiffReview}
                      />
                    ) : null}
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
      {activeImagePreview ? (
        <ImageLightbox
          key={`${activeImagePreview.src}:${activeImagePreview.openedAt}`}
          preview={activeImagePreview}
          onClose={handleCloseImagePreview}
        />
      ) : null}
    </section>
  )
}
