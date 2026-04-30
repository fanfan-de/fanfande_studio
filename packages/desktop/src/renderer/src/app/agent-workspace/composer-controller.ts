import type { MutableRefObject } from "react"
import { buildComposerAttachment, isComposerAttachmentSupported } from "../composer/attachment-utils"
import {
  appendTextToComposerDraftState,
  compileComposerSubmission,
  createEmptyComposerDraftState,
  normalizeComposerDraftState,
} from "../composer/draft-state"
import type {
  AssistantTurn,
  ComposerAttachment,
  ComposerCommentReference,
  ComposerDraftState,
  CreateSessionTab,
  OpenAIReasoningEffort,
  PendingAgentStream,
  PermissionDecision,
  PermissionRequest,
  SessionSummary,
  Turn,
  UserTurn,
  WorkspaceGroup,
} from "../types"
import { getAgentSessionBridge } from "../agent-session/client"
import { buildFailureTurn } from "../stream"
import { findSession, findWorkspaceByID, normalizeSessionModelSelection, updateSessionModelSelectionInWorkspaces } from "../workspace"
import {
  normalizeQuestionAnswerText,
  sendPromptToSession as sendPromptToSessionService,
} from "./composer-send-service"
import { respondPermissionRequest } from "./permission-requests-service"
import { getWorkbenchTabReferenceFromKey } from "./workspace-derived-state"
import type { WorkspaceStateUpdater } from "./workspace-store"

type StateSetter<T> = (update: WorkspaceStateUpdater<T>) => void

interface CreateSessionResult {
  backendSessionID: string
  session: SessionSummary
  workspace: WorkspaceGroup
}

interface UseComposerControllerOptions {
  activeCreateSessionTabID: string | null
  activeSessionID: string | null
  activeTabKey: string | null
  agentConnected: boolean
  agentDefaultDirectory: string
  agentSessions: Record<string, string>
  appendConversationTurns: (sessionID: string, nextTurns: Turn[]) => void
  composerAttachmentsByTabKey: Record<string, ComposerAttachment[]>
  composerDraftStateByTabKey: Record<string, ComposerDraftState>
  createSessionForWorkspace: (
    workspace: WorkspaceGroup,
    options?: {
      createSessionTabID?: string | null
      closeCreateTab?: boolean
      paneID?: string | null
      skipInitialHistoryLoad?: boolean
      title?: string
    },
  ) => Promise<CreateSessionResult | null>
  createSessionTabs: CreateSessionTab[]
  isSendingByTabKey: Record<string, boolean>
  loadPendingPermissionRequestsForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  loadSessionDiffForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  loadSessionRuntimeDebugForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  pendingPermissionRequestsBySession: Record<string, PermissionRequest[]>
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  permissionRequestActionRequestID: string | null
  permissionRequestsRequestRef: MutableRefObject<Record<string, number>>
  platform: string
  refreshWorkspaceForSession: (sessionID: string) => void
  refreshWorkspaceFromDirectory: (directory: string) => void | Promise<WorkspaceGroup | null>
  reloadSessionHistoryForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  sessionDirectoryBySession: Record<string, string>
  setAgentSessions: StateSetter<Record<string, string>>
  setComposerAttachmentsByTabKey: StateSetter<Record<string, ComposerAttachment[]>>
  setComposerDraftStateByTabKey: StateSetter<Record<string, ComposerDraftState>>
  setIsSendingByTabKey: StateSetter<Record<string, boolean>>
  setPendingPermissionRequestsBySession: StateSetter<Record<string, PermissionRequest[]>>
  setPermissionRequestActionError: StateSetter<string | null>
  setPermissionRequestActionRequestID: StateSetter<string | null>
  setSessionDirectoryBySession: StateSetter<Record<string, string>>
  setWorkspaces: StateSetter<WorkspaceGroup[]>
  updateAssistantConversationTurn: (
    sessionID: string,
    turnID: string,
    updater: (turn: AssistantTurn) => AssistantTurn,
  ) => void
  workspaces: WorkspaceGroup[]
}

export function useComposerController({
  activeCreateSessionTabID,
  activeSessionID,
  activeTabKey,
  agentConnected,
  agentDefaultDirectory,
  agentSessions,
  appendConversationTurns,
  composerAttachmentsByTabKey,
  composerDraftStateByTabKey,
  createSessionForWorkspace,
  createSessionTabs,
  isSendingByTabKey,
  loadPendingPermissionRequestsForSession,
  loadSessionDiffForSession,
  loadSessionRuntimeDebugForSession,
  pendingPermissionRequestsBySession,
  pendingStreamsRef,
  permissionRequestActionRequestID,
  permissionRequestsRequestRef,
  platform,
  refreshWorkspaceForSession,
  refreshWorkspaceFromDirectory,
  reloadSessionHistoryForSession,
  sessionDirectoryBySession,
  setAgentSessions,
  setComposerAttachmentsByTabKey,
  setComposerDraftStateByTabKey,
  setIsSendingByTabKey,
  setPendingPermissionRequestsBySession,
  setPermissionRequestActionError,
  setPermissionRequestActionRequestID,
  setSessionDirectoryBySession,
  setWorkspaces,
  updateAssistantConversationTurn,
  workspaces,
}: UseComposerControllerOptions) {
  function setDraftForTab(tabKey: string, value: ComposerDraftState) {
    setComposerDraftStateByTabKey((current) => ({
      ...current,
      [tabKey]: normalizeComposerDraftState(value),
    }))
  }

  function setDraft(value: ComposerDraftState) {
    if (!activeTabKey) return
    setDraftForTab(activeTabKey, value)
  }

  function appendDraftForTab(tabKey: string, value: string) {
    const trimmedValue = value.trim()
    if (!trimmedValue) return

    setComposerDraftStateByTabKey((current) => {
      const existingDraft = current[tabKey] ?? createEmptyComposerDraftState()
      return {
        ...current,
        [tabKey]: appendTextToComposerDraftState(existingDraft, trimmedValue),
      }
    })
  }

  async function sendPromptToSession(input: {
    attachments: ComposerAttachment[]
    backendSessionID?: string | null
    commentReferences?: ComposerCommentReference[]
    displayText?: string
    preserveComposerState?: boolean
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    reasoningEffort?: OpenAIReasoningEffort | null
    references?: UserTurn["references"]
    selectedModel?: string | null
    session: SessionSummary
    selectedSkillIDs: string[]
    tabKey: string
    text: string
    workspace: WorkspaceGroup
  }) {
    await sendPromptToSessionService(input, {
      agentConnected,
      agentDefaultDirectory,
      agentSessions,
      appendConversationTurns,
      pendingStreamsRef,
      platform,
      refreshWorkspaceFromDirectory,
      reloadSessionHistoryForSession,
      sessionDirectoryBySession,
      setAgentSessions,
      setComposerAttachmentsByTabKey,
      setComposerDraftStateByTabKey,
      setIsSendingByTabKey,
      setSessionDirectoryBySession,
      setWorkspaces,
      updateAssistantConversationTurn,
    })
  }

  async function handleSend(input?: {
    attachmentError?: string | null
    attachmentsOverride?: ComposerAttachment[]
    createSessionTabID?: string | null
    draftStateOverride?: ComposerDraftState
    paneID?: string | null
    preserveComposerState?: boolean
    questionAnswer?: {
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }
    selectedReasoningEffort?: OpenAIReasoningEffort | null
    selectedModel?: string | null
    selectedSkillIDs?: string[]
    sessionID?: string | null
    tabKey?: string | null
    waitForPendingModelSelection?: (() => Promise<void>) | null
  }) {
    const targetTabKey = input?.tabKey ?? activeTabKey
    const targetSessionID = input?.sessionID ?? activeSessionID
    const targetCreateSessionTabID = input?.createSessionTabID ?? activeCreateSessionTabID
    const attachments = input?.attachmentsOverride ?? (targetTabKey ? composerAttachmentsByTabKey[targetTabKey] ?? [] : [])
    const draftState = normalizeComposerDraftState(
      input?.draftStateOverride ??
        (targetTabKey ? composerDraftStateByTabKey[targetTabKey] ?? createEmptyComposerDraftState() : createEmptyComposerDraftState()),
    )
    const compiledSubmission = compileComposerSubmission({
      draftState,
      selectedSkillIDs: input?.selectedSkillIDs ?? [],
    })
    const normalizedQuestionAnswerText = normalizeQuestionAnswerText(input?.questionAnswer)
    const effectiveText = compiledSubmission.transportText || normalizedQuestionAnswerText
    const pendingPermissionRequests = targetSessionID ? pendingPermissionRequestsBySession[targetSessionID] ?? [] : []
    if (!targetTabKey || ((!effectiveText && attachments.length === 0) || isSendingByTabKey[targetTabKey] || pendingPermissionRequests.length > 0)) return
    if (input?.waitForPendingModelSelection) {
      await input.waitForPendingModelSelection().catch(() => undefined)
    }
    if (input?.attachmentError) return

    if (targetSessionID) {
      const nextSelection = findSession(workspaces, targetSessionID)
      if (!nextSelection.workspace || !nextSelection.session) return
      await sendPromptToSession({
        attachments,
        commentReferences: compiledSubmission.commentReferences,
        displayText: compiledSubmission.displayText,
        preserveComposerState: input?.preserveComposerState,
        questionAnswer: input?.questionAnswer,
        reasoningEffort: input?.selectedReasoningEffort,
        references: compiledSubmission.userReferences,
        selectedModel: input?.selectedModel,
        selectedSkillIDs: compiledSubmission.selectedSkillIDs,
        session: nextSelection.session,
        tabKey: targetTabKey,
        text: effectiveText,
        workspace: nextSelection.workspace,
      })
      return
    }

    if (!targetCreateSessionTabID) return

    const currentCreateSessionTab = createSessionTabs.find((tab) => tab.id === targetCreateSessionTabID)
    if (!currentCreateSessionTab) return

    const workspace = findWorkspaceByID(workspaces, currentCreateSessionTab.workspaceID)
    if (!workspace) return

    const created = await createSessionForWorkspace(workspace, {
      closeCreateTab: true,
      createSessionTabID: targetCreateSessionTabID,
      paneID: input?.paneID,
      skipInitialHistoryLoad: true,
    })
    if (!created) return

    let createdSession = created.session
    if (input?.selectedModel) {
      const selection = await window.desktop?.updateSessionModelSelection?.({
        sessionID: created.session.id,
        model: input.selectedModel,
      }).catch((error) => {
        console.error("[desktop] updateSessionModelSelection for new session failed:", error)
        return null
      })

      if (selection) {
        const modelSelection = normalizeSessionModelSelection(selection)
        createdSession = {
          ...created.session,
          modelSelection,
        }
        setWorkspaces((current) =>
          updateSessionModelSelectionInWorkspaces(current, created.session.id, modelSelection),
        )
      }
    }

    await sendPromptToSession({
      attachments,
      backendSessionID: created.backendSessionID,
      commentReferences: compiledSubmission.commentReferences,
      displayText: compiledSubmission.displayText,
      preserveComposerState: input?.preserveComposerState,
      questionAnswer: input?.questionAnswer,
      reasoningEffort: input?.selectedReasoningEffort,
      references: compiledSubmission.userReferences,
      selectedModel: input?.selectedModel,
      selectedSkillIDs: compiledSubmission.selectedSkillIDs,
      session: createdSession,
      tabKey: targetTabKey,
      text: effectiveText,
      workspace: created.workspace,
    })
  }

  async function handleCancelSend(input?: {
    sessionID?: string | null
    tabKey?: string | null
  }) {
    const agentSession = getAgentSessionBridge()
    if (!agentSession?.cancelTurn) return

    const tabKey = input?.tabKey ?? activeTabKey
    const tabReference = tabKey ? getWorkbenchTabReferenceFromKey(tabKey) : null
    const sessionID = input?.sessionID ?? (tabReference?.kind === "session" ? tabReference.sessionID : activeSessionID)
    if (!sessionID) return

    const pending = Object.entries(pendingStreamsRef.current).find(([, stream]) => stream.sessionID === sessionID)
    if (!pending) return

    const [clientTurnID, stream] = pending
    if (!stream.backendSessionID || stream.cancelRequested) return

    stream.cancelRequested = true

    try {
      await agentSession.cancelTurn({
        clientTurnID,
        backendSessionID: stream.backendSessionID,
      })
    } catch (error) {
      stream.cancelRequested = false
      console.error("[desktop] agentSession.cancelTurn failed:", error)
    }
  }

  async function handleAskUserQuestionAnswer(input: {
    freeformText?: string
    questionID?: string
    selectedOptions?: string[]
    sessionID?: string | null
    tabKey?: string | null
    text: string
  }) {
    const sessionID = input.sessionID ?? activeSessionID
    const tabKey = input.tabKey ?? activeTabKey
    const questionID = input.questionID?.trim()
    if (!sessionID || !tabKey || !questionID) return

    const agentSession = getAgentSessionBridge()
    const backendSessionID = agentSessions[sessionID]
    if (!agentSession?.answerQuestion || !backendSessionID) {
      console.error("[desktop] Cannot answer question because the backend session is unavailable.")
      return
    }

    const selectedOptions = (input.selectedOptions ?? []).map((value) => value.trim()).filter(Boolean)
    const freeformText = input.freeformText?.trim()
    const answerText = input.text.trim() || freeformText || selectedOptions.join(", ")
    if (!answerText) return

    try {
      await agentSession.answerQuestion({
        backendSessionID,
        questionID,
        ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
        ...(freeformText ? { freeformText } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendConversationTurns(sessionID, [buildFailureTurn(message)])
    }
  }

  async function handlePermissionRequestResponse(input: {
    sessionID: string
    request: PermissionRequest
    decision: PermissionDecision
    note?: string
  }) {
    await respondPermissionRequest({
      appendConversationTurns,
      input,
      loadPendingPermissionRequestsForSession,
      loadSessionDiffForSession,
      loadSessionRuntimeDebugForSession,
      pendingStreamsRef,
      permissionRequestActionRequestID,
      permissionRequestsRequestRef,
      refreshWorkspaceForSession,
      reloadSessionHistoryForSession,
      setPendingPermissionRequestsBySession,
      setPermissionRequestActionError,
      setPermissionRequestActionRequestID,
      updateAssistantConversationTurn,
    })
  }

  async function handlePickComposerAttachments(input?: {
    allowImage: boolean
    allowPdf: boolean
    disabledReason?: string | null
    tabKey?: string | null
  }) {
    const pickComposerAttachments = window.desktop?.pickComposerAttachments
    if (!pickComposerAttachments) return

    const tabKey = input?.tabKey ?? activeTabKey
    const allowImage = input?.allowImage ?? false
    const allowPdf = input?.allowPdf ?? false
    const disabledReason = input?.disabledReason ?? null
    if (disabledReason) return
    if (!tabKey) return

    try {
      const pickedPaths = await pickComposerAttachments({
        allowImage,
        allowPdf,
      })
      if (!pickedPaths || pickedPaths.length === 0) return

      setComposerAttachmentsByTabKey((current) => {
        const existingAttachments = current[tabKey] ?? []
        const seen = new Set(existingAttachments.map((attachment) => attachment.path))
        const nextAttachments = [...existingAttachments]
        const supportedCapabilities = { image: allowImage, pdf: allowPdf }

        for (const path of pickedPaths) {
          if (!isComposerAttachmentSupported(path, supportedCapabilities)) continue
          if (seen.has(path)) continue
          seen.add(path)
          nextAttachments.push(buildComposerAttachment(path))
        }

        return {
          ...current,
          [tabKey]: nextAttachments,
        }
      })
    } catch (error) {
      console.error("[desktop] pickComposerAttachments failed:", error)
    }
  }

  function handleRemoveComposerAttachment(path: string, tabKey = activeTabKey) {
    if (!tabKey) return
    setComposerAttachmentsByTabKey((current) => ({
      ...current,
      [tabKey]: (current[tabKey] ?? []).filter((attachment) => attachment.path !== path),
    }))
  }

  return {
    appendDraftForTab,
    handlePermissionRequestResponse,
    handlePickComposerAttachments,
    handleRemoveComposerAttachment,
    handleAskUserQuestionAnswer,
    handleCancelSend,
    handleSend,
    sendPromptToSession,
    setDraft,
    setDraftForTab,
  }
}
