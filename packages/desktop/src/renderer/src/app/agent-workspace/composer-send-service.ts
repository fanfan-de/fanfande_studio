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
import type {
  AssistantTurn,
  ComposerAttachment,
  ComposerCommentReference,
  ComposerDraftState,
  OpenAIReasoningEffort,
  PendingAgentStream,
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

interface SendPromptToSessionInput {
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
  selectedSkillIDs: string[]
  session: SessionSummary
  tabKey: string
  text: string
  workspace: WorkspaceGroup
}

interface SendPromptToSessionEnvironment {
  agentConnected: boolean
  agentDefaultDirectory: string
  agentSessions: Record<string, string>
  appendConversationTurns: (sessionID: string, nextTurns: Turn[]) => void
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
  } = environment
  const {
    attachments,
    displayText,
    preserveComposerState,
    questionAnswer,
    reasoningEffort,
    references = [],
    session,
    selectedSkillIDs,
    tabKey,
    text,
    workspace,
  } = input
  const uiSessionID = session.id
  const agentSession = getAgentSessionBridge()
  const canStream = Boolean(agentSession?.canStream)
  const normalizedText = text.trim() || normalizeQuestionAnswerText(questionAnswer)
  const attachmentInputs = attachments.map((attachment) => ({
    path: attachment.path,
    name: attachment.name,
  }))
  const effectiveSelectedSkillIDs = resolveComposerSkillSelectionForSession(session, selectedSkillIDs)
  const userTurnDisplayText = displayText?.trim() || normalizeQuestionAnswerText(questionAnswer) || undefined
  const userTurn: Turn = buildUserTurn({
    attachments: attachmentInputs,
    displayText: userTurnDisplayText,
    fallbackText: normalizedText,
    questionAnswer,
    references,
  })

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

  appendConversationTurns(uiSessionID, [userTurn])
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
      streamingTurnID = streamingTurn.id
      streamID = createID("stream")
      pendingStreamsRef.current[streamID] = {
        sessionID: uiSessionID,
        backendSessionID,
        assistantTurnID: streamingTurn.id,
      }

      appendConversationTurns(uiSessionID, [streamingTurn])

      await agentSession.sendTurn({
        clientTurnID: streamID,
        backendSessionID,
        ...(normalizedText ? { text: normalizedText } : {}),
        ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
        ...(questionAnswer ? { questionAnswer } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        skills: effectiveSelectedSkillIDs,
      })

      return
    }

    const result = await agentSession.sendTurn({
      clientTurnID: createID("turn"),
      backendSessionID,
      ...(normalizedText ? { text: normalizedText } : {}),
      ...(attachmentInputs.length > 0 ? { attachments: attachmentInputs } : {}),
      ...(questionAnswer ? { questionAnswer } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
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
