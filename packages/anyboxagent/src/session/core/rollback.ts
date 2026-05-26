import * as Identifier from "#id/id.ts"
import * as Provider from "#provider/provider.ts"
import * as Message from "#session/core/message.ts"
import * as Session from "#session/core/session.ts"
import * as Snapshot from "#snapshot/snapshot.ts"

export interface CorrectiveBranchInput {
  sessionID: string
  targetMessageID: string
  reason: string
  correctivePrompt: string
  restoreWorkspace?: WorkspaceRestoreResult
  turnID?: string
}

export interface CorrectiveBranchResult {
  session: Session.SessionInfo
  targetMessage: Message.MessageInfo
  assistantMessage: Message.Assistant
  textPart: Message.TextPart
}

export interface RollbackSnapshotResult {
  messageID: string
  snapshot: string
  source: "assistant-patch" | "user-snapshot"
}

export interface RollbackCheckpoint {
  messageID: string
  role: "user" | "assistant"
  parentMessageID: string | null
  created: number
  preview: string
  activePath: boolean
  turnID?: string
  canRestoreWorkspace: boolean
  snapshotMessageID?: string
  snapshotSource?: RollbackSnapshotResult["source"]
}

export interface WorkspaceRestoreResult {
  targetSnapshot: string
  preRestoreSnapshot?: string
  restoredFiles: string[]
}

export interface ListRollbackCheckpointsInput {
  sessionID: string
  includeInactive?: boolean
  limit?: number
}

export interface ListRollbackCheckpointsResult {
  sessionID: string
  activeMessageID: string | null
  checkpoints: RollbackCheckpoint[]
  total: number
  truncated: boolean
}

function readTargetMessage(sessionID: string, targetMessageID: string) {
  const message = Session.DataBaseRead("messages", targetMessageID) as Message.MessageInfo | null
  if (!message) {
    throw new Error(`Rollback target message '${targetMessageID}' was not found.`)
  }

  if (message.sessionID !== sessionID) {
    throw new Error("Rollback target message must belong to the current session.")
  }

  if (message.role === "user" && message.internal) {
    throw new Error("Internal messages cannot be used as rollback targets.")
  }

  if (message.role === "system") {
    throw new Error("System messages cannot be used as rollback targets.")
  }

  return message
}

function listMessagesWithParts(sessionID: string) {
  return Message.listAllWithParts(sessionID)
}

function buildMessageIndexes(messages: Message.WithParts[]) {
  const byID = new Map<string, Message.WithParts>()
  for (const message of messages) {
    byID.set(message.info.id, message)
  }
  return byID
}

function nearestVisibleUser(
  targetMessageID: string,
  byID: Map<string, Message.WithParts>,
): Message.User | undefined {
  const seen = new Set<string>()
  let currentID: string | null | undefined = targetMessageID

  while (currentID) {
    if (seen.has(currentID)) return undefined
    seen.add(currentID)

    const current = byID.get(currentID)
    if (!current) return undefined

    if (current.info.role === "user" && !current.info.internal) {
      return current.info
    }

    currentID = current.info.parentMessageID
  }
}

function findAssistantPatchSnapshot(message: Message.WithParts) {
  if (message.info.role !== "assistant") return undefined
  const patchParts = message.parts.filter(
    (part): part is Message.PatchPart => part.type === "patch" && Boolean(part.hash.trim()),
  )
  return patchParts.at(-1)?.hash
}

function findUserSnapshot(message: Message.WithParts) {
  if (message.info.role !== "user") return undefined
  return message.parts.find(
    (part): part is Message.SnapshotPart => part.type === "snapshot" && Boolean(part.snapshot.trim()),
  )?.snapshot
}

function findRollbackSnapshotInIndex(
  targetMessageID: string,
  byID: Map<string, Message.WithParts>,
): RollbackSnapshotResult | null {
  const seen = new Set<string>()
  let currentID: string | null | undefined = targetMessageID

  while (currentID) {
    if (seen.has(currentID)) return null
    seen.add(currentID)

    const current = byID.get(currentID)
    if (!current) return null

    const assistantSnapshot = findAssistantPatchSnapshot(current)
    if (assistantSnapshot) {
      return {
        messageID: current.info.id,
        snapshot: assistantSnapshot,
        source: "assistant-patch",
      }
    }

    const userSnapshot = findUserSnapshot(current)
    if (userSnapshot) {
      return {
        messageID: current.info.id,
        snapshot: userSnapshot,
        source: "user-snapshot",
      }
    }

    currentID = current.info.parentMessageID
  }

  return null
}

export function findRollbackSnapshot(input: {
  sessionID: string
  targetMessageID: string
}): RollbackSnapshotResult | null {
  readTargetMessage(input.sessionID, input.targetMessageID)
  const messages = listMessagesWithParts(input.sessionID)
  const byID = buildMessageIndexes(messages)
  return findRollbackSnapshotInIndex(input.targetMessageID, byID)
}

function compactPreview(value: string, maxLength = 160) {
  const compacted = value.replace(/\s+/g, " ").trim()
  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, maxLength - 1)}...`
}

function textFromParts(message: Message.WithParts) {
  return message.parts
    .filter((part): part is Message.TextPart => part.type === "text" && !part.ignored)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
}

function messagePreview(message: Message.WithParts) {
  if (message.info.role === "user" && message.info.displayText?.trim()) {
    return compactPreview(message.info.displayText)
  }

  const text = textFromParts(message)
  if (text) return compactPreview(text)
  return message.info.role === "user" ? "User message" : "Assistant response"
}

type RollbackTargetMessage = Message.WithParts & { info: Message.User | Message.Assistant }

function isRollbackTargetCandidate(message: Message.WithParts): message is RollbackTargetMessage {
  if (message.info.role === "system") return false
  if (message.info.role === "user" && message.info.internal) return false
  return message.info.role === "user" || message.info.role === "assistant"
}

export function listRollbackCheckpoints(input: ListRollbackCheckpointsInput): ListRollbackCheckpointsResult {
  const session = Session.DataBaseRead("sessions", input.sessionID) as Session.SessionInfo | null
  if (!session) {
    throw new Error(`Session '${input.sessionID}' was not found.`)
  }

  const allMessages = listMessagesWithParts(input.sessionID)
  const activeMessages = Message.listActiveBranch(input.sessionID)
  const activePathIDs = new Set(activeMessages.map((message) => message.info.id))
  const byID = buildMessageIndexes(allMessages)
  const sourceMessages = input.includeInactive ? allMessages : activeMessages
  const candidates = sourceMessages.filter(isRollbackTargetCandidate)
  const limit = Math.max(1, Math.min(200, input.limit ?? 80))
  const visibleCandidates = candidates.slice(-limit)
  const checkpoints = visibleCandidates.map((message): RollbackCheckpoint => {
    const snapshot = findRollbackSnapshotInIndex(message.info.id, byID)
    return {
      messageID: message.info.id,
      role: message.info.role,
      parentMessageID: message.info.parentMessageID ?? null,
      created: message.info.created,
      preview: messagePreview(message),
      activePath: activePathIDs.has(message.info.id),
      turnID: message.info.turnID,
      canRestoreWorkspace: Boolean(snapshot),
      snapshotMessageID: snapshot?.messageID,
      snapshotSource: snapshot?.source,
    }
  })

  return {
    sessionID: input.sessionID,
    activeMessageID: Session.getActiveMessageID(input.sessionID) ?? null,
    checkpoints,
    total: candidates.length,
    truncated: visibleCandidates.length < candidates.length,
  }
}

export async function restoreWorkspaceToRollbackSnapshot(input: {
  sessionID: string
  targetMessageID: string
}): Promise<WorkspaceRestoreResult> {
  const snapshot = findRollbackSnapshot(input)
  if (!snapshot) {
    throw new Error(`No rollback snapshot was found for message '${input.targetMessageID}'.`)
  }

  const preRestoreSnapshot = await Snapshot.track()
  const patch = await Snapshot.patch(snapshot.snapshot)
  await Snapshot.revert([patch])

  return {
    targetSnapshot: snapshot.snapshot,
    preRestoreSnapshot,
    restoredFiles: patch.files,
  }
}

function rollbackText(reason: string, correctivePrompt: string) {
  return [
    "<rollback_correction>",
    "Rollback reason:",
    reason.trim(),
    "",
    "Corrective instruction:",
    correctivePrompt.trim(),
    "</rollback_correction>",
  ].join("\n")
}

async function resolveBranchModel(input: {
  session: Session.SessionInfo
  sourceUser?: Message.User
}) {
  if (input.sourceUser?.model) return input.sourceUser.model
  return Provider.getDefaultModelRef(input.session.projectID)
}

export async function createCorrectiveBranch(input: CorrectiveBranchInput): Promise<CorrectiveBranchResult> {
  const session = Session.DataBaseRead("sessions", input.sessionID) as Session.SessionInfo | null
  if (!session) {
    throw new Error(`Session '${input.sessionID}' was not found.`)
  }

  const targetMessage = readTargetMessage(input.sessionID, input.targetMessageID)
  const messages = listMessagesWithParts(input.sessionID)
  const sourceUser = nearestVisibleUser(input.targetMessageID, buildMessageIndexes(messages))
  const model = await resolveBranchModel({
    session,
    sourceUser,
  })
  const now = Date.now()
  const assistantMessage = Message.Assistant.parse({
    id: Identifier.ascending("message"),
    sessionID: input.sessionID,
    turnID: input.turnID,
    parentMessageID: targetMessage.id,
    role: "assistant",
    created: now,
    completed: now,
    parentID: targetMessage.id,
    modelID: model.modelID,
    providerID: model.providerID,
    agent: sourceUser?.agent ?? "default",
    path: {
      cwd: session.directory,
      root: session.directory,
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  })
  const textPart = Message.TextPart.parse({
    id: Identifier.ascending("part"),
    sessionID: input.sessionID,
    messageID: assistantMessage.id,
    type: "text",
    text: rollbackText(input.reason, input.correctivePrompt),
    synthetic: true,
    metadata: {
      kind: "rollback-correction",
      targetMessageID: targetMessage.id,
      reason: input.reason.trim(),
      correctivePrompt: input.correctivePrompt.trim(),
      restoreWorkspace: Boolean(input.restoreWorkspace),
      restoredFiles: input.restoreWorkspace?.restoredFiles,
      targetSnapshot: input.restoreWorkspace?.targetSnapshot,
      preRestoreSnapshot: input.restoreWorkspace?.preRestoreSnapshot,
    },
    time: {
      start: now,
      end: now,
    },
  })

  Session.upsertMessage(assistantMessage)
  Session.upsertPart(textPart)
  const updatedSession = Session.updateActiveMessageID(input.sessionID, assistantMessage.id, { touch: true })
  if (!updatedSession) {
    throw new Error(`Session '${input.sessionID}' was not found.`)
  }

  return {
    session: updatedSession,
    targetMessage,
    assistantMessage,
    textPart,
  }
}
