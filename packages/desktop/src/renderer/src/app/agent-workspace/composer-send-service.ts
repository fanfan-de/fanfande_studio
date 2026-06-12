import { startTransition, type MutableRefObject } from "react"
import { getAgentSessionBridge } from "../agent-session/client"
import { createEmptyComposerDraftState } from "../composer/draft-state"
import {
  buildAgentTurn,
  buildAgentTurnFromEvents,
  buildFailureTurn,
  buildStreamingAssistantTurn,
  buildUserTurn,
} from "../stream"
import { appendPendingConversationInput, removePendingConversationInput } from "../pending-conversation-inputs"
import type {
  AssistantTurn,
  ComposerAttachment,
  ComposerCommentReference,
  ComposerDraftState,
  PendingAgentStream,
  PendingConversationInput,
  ReasoningEffort,
  SessionSummary,
  Turn,
  UserTurn,
  WorkspaceGroup,
} from "../types"
import { createID } from "../utils"
import { isSideChatSession } from "../workspace"
import type { WorkspaceStateUpdater } from "./workspace-store"

export function resolveComposerSkillSelectionForSession(
  session: Pick<SessionSummary, "kind"> | null | undefined,
  selectedSkillIDs: string[],
) {
  return isSideChatSession(session) ? [] : selectedSkillIDs
}

export function normalizeQuestionAnswerText(input?: {
  selectedOptions?: string[]
  freeformText?: string
}) {
  const freeformText = input?.freeformText?.trim()
  if (freeformText) return freeformText

  const selectedOptions = (input?.selectedOptions ?? []).map((value) => value.trim()).filter(Boolean)
  if (selectedOptions.length > 0) return selectedOptions.join(", ")

  return ""
}

function parseComposerModelValue(value: string | null | undefined) {
  if (!value) return undefined
  const [providerID, ...rest] = value.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) return undefined
  return {
    providerID,
    modelID,
  }
}

function resolveComposerTurnModel(
  selectedModel: string | null | undefined,
  session: Pick<SessionSummary, "modelSelection">,
) {
  const modelValue = selectedModel?.trim()
  if (!modelValue) return undefined

  const persistedModelValue = session.modelSelection?.model?.trim()
  if (!persistedModelValue || persistedModelValue !== modelValue) return undefined

  return parseComposerModelValue(modelValue)
}

interface SendPromptToSessionInput {
  attachments: ComposerAttachment[]
  backendSessionID?: string | null
  commentReferences?: ComposerCommentReference[]
  displayText?: string
  parentMessageID?: string | null
  preserveComposerState?: boolean
  questionAnswer?: {
    questionID: string
    selectedOptions?: string[]
    freeformText?: string
  }
  reasoningEffort?: ReasoningEffort | null
  references?: UserTurn["references"]
  selectedModel?: string | null
  selectedSkillIDs: string[]
  session: SessionSummary
  submissionMode?: UserTurn["submissionMode"]
  tabKey: string
  text: string
  workspace: WorkspaceGroup
}

interface SendPromptToSessionEnvironment {
  agentConnected: boolean
  agentDefaultDirectory: string
  agentSessions: Record<string, string>
  appendConversationTurns: (sessionID: string, nextTurns: Turn[]) => void
  replaceConversationTurns: (sessionID: string, nextTurns: Turn[]) => void
  getConversationTurns: (sessionID: string) => Turn[]
  pendingStreamsRef: MutableRefObject<Record<string, PendingAgentStream>>
  platform: string
  refreshWorkspaceFromDirectory: (directory: string) => void | Promise<WorkspaceGroup | null>
  reloadSessionHistoryForSession: (sessionID: string, backendSessionID?: string) => Promise<void>
  sessionDirectoryBySession: Record<string, string>
  setAgentSessions: (update: WorkspaceStateUpdater<Record<string, string>>) => void
  setComposerAttachmentsByTabKey: (
    update: WorkspaceStateUpdater<Record<string, ComposerAttachment[]>>,
  ) => void
  setComposerDraftStateByTabKey: (
    update: WorkspaceStateUpdater<Record<string, ComposerDraftState>>,
  ) => void
  setIsSendingByTabKey: (update: WorkspaceStateUpdater<Record<string, boolean>>) => void
  setPendingConversationInputsBySession: (
    update: WorkspaceStateUpdater<Record<string, PendingConversationInput[]>>,
  ) => void
  setSessionDirectoryBySession: (update: WorkspaceStateUpdater<Record<string, string>>) => void
  setWorkspaces: (update: WorkspaceStateUpdater<WorkspaceGroup[]>) => void
  updateAssistantConversationTurn: (
    sessionID: string,
    turnID: string,
    updater: (turn: AssistantTurn) => AssistantTurn,
  ) => void
}

export async function sendPromptToSession(
  input: SendPromptToSessionInput,
  environment: SendPromptToSessionEnvironment,
) {
  const {
    agentConnected,
    agentDefaultDirectory,
    agentSessions,
    appendConversationTurns,
    replaceConversationTurns,
    getConversationTurns,
    pendingStreamsRef,
    platform,
    refreshWorkspaceFromDirectory,
    reloadSessionHistoryForSession,
    sessionDirectoryBySession,
    setAgentSessions,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setIsSendingByTabKey,
    setPendingConversationInputsBySession,
    setSessionDirectoryBySession,
    setWorkspaces,
    updateAssistantConversationTurn,
  } = environment
  const {
    attachments,
    displayText,
    parentMessageID,
    preserveComposerState,
    questionAnswer,
    reasoningEffort,
    references = [],
    selectedModel,
    session,
    selectedSkillIDs,
    submissionMode,
    tabKey,
    text,
    workspace,
  } = input
  const uiSessionID = session.id
  const agentSession = getAgentSessionBridge()
  const canStream = Boolean(agentSession?.canStream)
  const concurrentInputMode = submissionMode === "steer" ? "steer" : submissionMode === "queued" ? "queue" : undefined
  const usesBackendStream = agentConnected && Boolean(window.desktop?.createAgentSession) && Boolean(agentSession) && canStream
  const pendingInputMode = usesBackendStream && (submissionMode === "queued" || submissionMode === "steer")
    ? submissionMode
    : null
  const normalizedText = text.trim() || normalizeQuestionAnswerText(questionAnswer)
  const attachmentInputs = attachments.map((attachment) => ({
    path: attachment.path,
    name: attachment.name,
  }))
  const model = resolveComposerTurnModel(selectedModel, session)
  const effectiveSelectedSkillIDs = resolveComposerSkillSelectionForSession(session, selectedSkillIDs)
  const userTurnDisplayText = displayText?.trim() || normalizeQuestionAnswerText(questionAnswer) || undefined
  const userTurn: UserTurn = buildUserTurn({
    attachments: attachmentInputs,
    displayText: userTurnDisplayText,
    fallbackText: normalizedText,
    questionAnswer,
    references,
  })
  const pendingInput: PendingConversationInput | null = pendingInputMode
    ? {
        id: userTurn.id,
        sessionID: uiSessionID,
        text: userTurn.text,
        ...(userTurn.displayText ? { displayText: userTurn.displayText } : {}),
        ...(userTurn.attachments?.length ? { attachments: userTurn.attachments } : {}),
        ...(userTurn.references?.length ? { references: userTurn.references } : {}),
        ...(userTurn.questionAnswer ? { questionAnswer: userTurn.questionAnswer } : {}),
        mode: pendingInputMode,
        status: "pending",
        createdAt: userTurn.timestamp,
      }
    : null

  if (!preserveComposerState) {
    setComposerDraftStateByTabKey((current) => ({
      ...current,
      [tabKey]: createEmptyComposerDraftState(),
    }))
    setComposerAttachmentsByTabKey((current) => ({
      ...current,
      [tabKey]: [],
    }))
  }

  if (pendingInput) {
    setPendingConversationInputsBySession((current) => appendPendingConversationInput(current, pendingInput))
  } else if (parentMessageID) {
    const currentTurns = getConversationTurns(uiSessionID)
    const parentTurnIndex = currentTurns.findIndex((turn) =>
      turn.kind === "assistant"
        ? (turn.messageID ?? turn.id) === parentMessageID
        : turn.id === parentMessageID,
    )
    const parentPathTurns = parentTurnIndex >= 0 ? currentTurns.slice(0, parentTurnIndex + 1) : currentTurns
    replaceConversationTurns(uiSessionID, [...parentPathTurns, userTurn])
  } else {
    appendConversationTurns(uiSessionID, [userTurn])
  }
  setWorkspaces((prev) => {
    const nextUpdatedAt = Date.now()

    return prev.map((currentWorkspace) => ({
      ...currentWorkspace,
      sessions: currentWorkspace.sessions.map((currentSession) =>
            currentSession.id === uiSessionID
        ? {
            ...currentSession,
            status: "Live",
            summary: userTurn.text,
            updated: nextUpdatedAt,
          }
        : currentSession,
      ),
    }))
  })

  if (!agentConnected || !window.desktop?.createAgentSession || !agentSession) {
    const fallback = buildAgentTurn(userTurn.text, session, workspace.name, platform)
    startTransition(() => {
      appendConversationTurns(uiSessionID, [fallback])
    })
    return
  }

  setIsSendingByTabKey((current) => ({
    ...current,
    [tabKey]: true,
  }))
  let streamingTurnID: string | null = null
  let streamID: string | null = null

  try {
    let backendSessionID = input.backendSessionID ?? agentSessions[uiSessionID]
    if (!backendSessionID) {
      const requestedSessionDirectory = sessionDirectoryBySession[uiSessionID] ?? workspace.directory
      const created = await window.desktop.createAgentSession({
        directory: requestedSessionDirectory || agentDefaultDirectory || undefined,
      })
      backendSessionID = created.session.id
      setAgentSessions((prev) => ({
        ...prev,
        [uiSessionID]: backendSessionID!,
      }))
      setSessionDirectoryBySession((prev) => ({
        ...prev,
        [uiSessionID]: created.session.directory,
      }))
    }

    if (!backendSessionID) {
      throw new Error("Backend session id is missing")
    }

    if (canStream) {
      const streamingTurn = buildStreamingAssistantTurn(userTurn.text)
      const assistantTurnID = streamingTurn.id
      if (!assistantTurnID) {
        throw new Error("Assistant stream target is missing")
      }

      streamingTurnID = streamingTurn?.id ?? null
      streamID = createID("stream")
      pendingStreamsRef.current[streamID] = {
        sessionID: uiSessionID,
        backendSessionID,
        assistantTurnID,
        ...(pendingInput ? { pendingInput } : {}),
        ...(pendingInput ? { pendingInputID: pendingInput.id } : {}),
        userTurnID: userTurn.id,
        requestedMode: pendingInput?.mode === "steer" ? "steer" : pendingInput?.mode === "queued" ? "queue" : "new-turn",
        createdAssistantTurnID: streamingTurn.id,
      }

      if (!pendingInput) {
        appendConversationTurns(uiSessionID, [streamingTurn])
      }

      await agentSession.sendTurn({
        clientTurnID: streamID,
        backendSessionID,
        ...(normalizedText ? { text: normalizedText } : {}),
        ...(userTurnDisplayText ? { displayText: userTurnDisplayText } : {}),
        ...(parentMessageID ? { parentMessageID } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
        ...(questionAnswer ? { questionAnswer } : {}),
        ...(concurrentInputMode ? { concurrentInputMode } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(model ? { model } : {}),
        skills: effectiveSelectedSkillIDs,
      })

      return
    }

    const result = await agentSession.sendTurn({
      clientTurnID: createID("turn"),
      backendSessionID,
      ...(normalizedText ? { text: normalizedText } : {}),
      ...(userTurnDisplayText ? { displayText: userTurnDisplayText } : {}),
      ...(parentMessageID ? { parentMessageID } : {}),
      ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
      ...(questionAnswer ? { questionAnswer } : {}),
      ...(concurrentInputMode ? { concurrentInputMode } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(model ? { model } : {}),
      skills: effectiveSelectedSkillIDs,
    })

    if (!result.events) {
      throw new Error("Desktop preload did not return batch agent events")
    }

    const backendTurn = buildAgentTurnFromEvents(result.events, userTurn.text)
    startTransition(() => {
      appendConversationTurns(uiSessionID, [backendTurn])
    })
    void reloadSessionHistoryForSession(uiSessionID, backendSessionID).catch((error) => {
      console.error("[desktop] session history refresh failed after send:", error)
    })
    void refreshWorkspaceFromDirectory(workspace.directory)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (streamID) {
      delete pendingStreamsRef.current[streamID]
    }
    if (pendingInput) {
      setPendingConversationInputsBySession((current) =>
        removePendingConversationInput(current, pendingInput.sessionID, pendingInput.id),
      )
    }

    startTransition(() => {
      if (streamingTurnID) {
        const failedTurnID = streamingTurnID
        updateAssistantConversationTurn(uiSessionID, failedTurnID, (current) => buildFailureTurn(message, current))
        return
      }

      appendConversationTurns(uiSessionID, [buildFailureTurn(message)])
    })
  } finally {
    setIsSendingByTabKey((current) => {
      if (!(tabKey in current)) return current
      const next = { ...current }
      delete next[tabKey]
      return next
    })
  }
}
