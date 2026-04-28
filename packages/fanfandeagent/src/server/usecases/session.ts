import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import z from "zod"
import * as Project from "#project/project.ts"
import { Instance } from "#project/instance.ts"
import { ApiError } from "#server/error.ts"
import * as Message from "#session/message.ts"
import * as Prompt from "#session/prompt.ts"
import * as RunningState from "#session/running-state.ts"
import * as Session from "#session/session.ts"
import * as SessionDiff from "#session/diff.ts"
import * as Task from "#session/task.ts"
import * as Log from "#util/log.ts"
import {
  createSessionEventStream,
  createSessionExecutionStream,
  parseReplayCursor,
  parseSinceSeq,
  serializeReplayCursor,
} from "#server/usecases/session-stream.ts"

export { createSessionExecutionStream } from "#server/usecases/session-stream.ts"

export const CreateSessionBody = z.object({
  directory: z.string().min(1),
})

export const CreateSideChatBody = z.object({
  anchorMessageID: z.string().min(1),
})

export const StreamSessionAttachmentBody = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
})

export const StreamSessionQuestionAnswerBody = z.object({
  questionID: z.string().min(1),
  selectedOptions: z.array(z.string().min(1)).optional(),
  freeformText: z.string().optional(),
})

export const StreamSessionMessageBody = z.object({
  text: z.string().optional(),
  attachments: z.array(StreamSessionAttachmentBody).optional(),
  questionAnswer: StreamSessionQuestionAnswerBody.optional(),
  system: z.string().optional(),
  agent: z.string().optional(),
  skills: z.array(z.string()).optional(),
  reasoningEffort: Message.OpenAIReasoningEffort.optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
}).superRefine((value, ctx) => {
  const hasText = typeof value.text === "string" && value.text.trim().length > 0
  const derivedQuestionText = normalizeQuestionAnswerText(value.questionAnswer)
  const hasQuestionAnswerText = typeof derivedQuestionText === "string" && derivedQuestionText.length > 0
  const hasAttachments = Array.isArray(value.attachments) && value.attachments.length > 0

  if (!hasText && !hasQuestionAnswerText && !hasAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Body must include a non-empty 'text', a structured question answer, or at least one attachment",
      path: ["text"],
    })
  }
})

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
}

const FILE_MIME_BY_EXTENSION: Record<string, string> = {
  ".csv": "text/csv",
  ".html": "text/html",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".xml": "application/xml",
}

const log = Log.create({ service: "server.session" })

type StreamSessionMessageInput = z.infer<typeof StreamSessionMessageBody>

type SessionStreamResult = {
  info: Message.MessageInfo
  parts: Message.Part[]
}

function normalizePromptText(text: string | undefined) {
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeQuestionAnswerText(
  answer: z.infer<typeof StreamSessionQuestionAnswerBody> | undefined,
) {
  if (!answer) return undefined

  const freeformText = normalizePromptText(answer.freeformText)
  if (freeformText) return freeformText

  const selectedOptions = Array.isArray(answer.selectedOptions)
    ? answer.selectedOptions.map((option) => option.trim()).filter(Boolean)
    : []

  if (selectedOptions.length > 0) {
    return selectedOptions.join(", ")
  }

  return undefined
}

function buildDataURL(mime: string, buffer: Buffer) {
  return `data:${mime};base64,${buffer.toString("base64")}`
}

function normalizeLogError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function summarizeAttachmentInput(attachment: z.infer<typeof StreamSessionAttachmentBody>) {
  const extension = extname(attachment.path).toLowerCase()
  return {
    path: attachment.path,
    name: attachment.name?.trim() || basename(attachment.path),
    extension,
  }
}

function summarizeResolvedPart(part: z.infer<typeof Prompt.PromptInput>["parts"][number]) {
  if (part.type === "text") {
    return {
      type: "text",
      textLength: part.text.length,
    }
  }

  if (part.type === "file" || part.type === "image") {
    return {
      type: part.type,
      mime: part.mime,
      filename: part.filename,
      urlScheme: part.url.startsWith("data:") ? "data" : "remote",
    }
  }

  return {
    type: part.type,
  }
}

async function resolveAttachmentPart(
  attachment: z.infer<typeof StreamSessionAttachmentBody>,
): Promise<z.infer<typeof Prompt.PromptInput>["parts"][number]> {
  const attachmentSummary = summarizeAttachmentInput(attachment)

  try {
    const buffer = await readFile(attachment.path)
    const extension = extname(attachment.path).toLowerCase()
    const filename = attachment.name?.trim() || basename(attachment.path)

    const imageMime = IMAGE_MIME_BY_EXTENSION[extension]
    if (imageMime) {
      log.info("resolved stream attachment", {
        ...attachmentSummary,
        kind: "image",
        mime: imageMime,
        bytes: buffer.byteLength,
      })
      return {
        type: "image",
        mime: imageMime,
        filename,
        url: buildDataURL(imageMime, buffer),
      }
    }

    const fileMime = FILE_MIME_BY_EXTENSION[extension] ?? "application/octet-stream"
    log.info("resolved stream attachment", {
      ...attachmentSummary,
      kind: "file",
      mime: fileMime,
      bytes: buffer.byteLength,
    })
    return {
      type: "file",
      mime: fileMime,
      filename,
      url: buildDataURL(fileMime, buffer),
    }
  } catch (error) {
    log.error("failed to resolve stream attachment", {
      ...attachmentSummary,
      error: normalizeLogError(error),
    })
    throw error
  }
}

async function resolvePromptPartsFromStreamPayload(payload: StreamSessionMessageInput) {
  const parts: z.infer<typeof Prompt.PromptInput>["parts"] = []
  const normalizedText = normalizePromptText(payload.text) ?? normalizeQuestionAnswerText(payload.questionAnswer)

  if (normalizedText) {
    parts.push({
      type: "text",
      text: normalizedText,
      ...(payload.questionAnswer
        ? {
            metadata: {
              kind: "question-answer",
              questionID: payload.questionAnswer.questionID,
              selectedOptions: payload.questionAnswer.selectedOptions ?? [],
              freeformText: payload.questionAnswer.freeformText,
            },
          }
        : {}),
    })
  }

  for (const attachment of payload.attachments ?? []) {
    parts.push(await resolveAttachmentPart(attachment))
  }

  log.info("resolved stream payload parts", {
    hasText: Boolean(normalizedText),
    attachmentCount: payload.attachments?.length ?? 0,
    parts: parts.map((part) => summarizeResolvedPart(part)),
  })

  return parts
}

function safeReadSession(sessionID: string): Session.SessionInfo | null {
  try {
    return Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
  } catch {
    return null
  }
}

function safeReadArchivedSession(sessionID: string): Session.ArchivedSessionRecord | null {
  try {
    return Session.readArchivedSession(sessionID)
  } catch {
    return null
  }
}

function requireSession(sessionID: string) {
  const session = safeReadSession(sessionID)
  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
  }

  return session
}

function mapSessionSummary(session: Session.SessionInfo) {
  const normalized = Session.normalizeSessionInfo(session)
  return {
    ...normalized,
    origin: Session.getSessionOrigin(normalized.id),
  }
}

function mapSideChatLink(link: Session.SideChatLink) {
  const activeSession = safeReadSession(link.sessionID)
  const archivedSession = safeReadArchivedSession(link.sessionID)
  return {
    ...link,
    session: activeSession
      ? mapSessionSummary(activeSession)
      : archivedSession
        ? mapSessionSummary(Session.normalizeSessionInfo(archivedSession.snapshot.session))
        : undefined,
    archived: !activeSession && Boolean(archivedSession),
  }
}

function mapArchivedSessionSummary(record: Session.ArchivedSessionRecord) {
  const project = Project.get(record.projectID)
  const normalized = Session.normalizeSessionInfo(record.snapshot.session)

  return {
    id: record.sessionID,
    projectID: record.projectID,
    projectName: project?.name ?? null,
    projectMissing: !project,
    directory: record.directory,
    title: record.title,
    created: record.createdAt,
    updated: record.updatedAt,
    archivedAt: record.archivedAt,
    messageCount: record.messageCount,
    eventCount: record.eventCount,
    kind: normalized.kind,
    policy: normalized.policy,
    origin: Session.getSessionOrigin(record.sessionID),
  }
}

export async function createSession(input: z.infer<typeof CreateSessionBody>) {
  const { project } = await Project.fromDirectory(input.directory)
  const session = await Session.createSession({
    directory: input.directory,
    projectID: project.id,
  })

  return mapSessionSummary(session)
}

export function listArchivedSessions() {
  return Session.listArchivedSessions().map(mapArchivedSessionSummary)
}

export function archiveSession(sessionID: string) {
  const session = safeReadSession(sessionID)
  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
  }

  if (RunningState.isRunning(sessionID)) {
    throw new ApiError(409, "SESSION_RUNNING", `Session '${sessionID}' is currently running and cannot be archived`)
  }

  if (safeReadArchivedSession(sessionID)) {
    throw new ApiError(409, "SESSION_ALREADY_ARCHIVED", `Session '${sessionID}' is already archived`)
  }

  const sessionsToArchive = Session.listArchivableSessions(sessionID)
  const runningSession = sessionsToArchive.find((candidate) => RunningState.isRunning(candidate.id))
  if (runningSession) {
    throw new ApiError(409, "SESSION_RUNNING", `Session '${runningSession.id}' is currently running and cannot be archived`)
  }

  const archivedRecords = Session.archiveSessionCascade(sessionID)
  const archived = archivedRecords[0]
  if (!archived) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
  }

  return {
    sessionID: archived.sessionID,
    projectID: archived.projectID,
    directory: archived.directory,
    archivedAt: archived.archivedAt,
    archivedSessionIDs: archivedRecords.map((record) => record.sessionID),
  }
}

export function restoreArchivedSession(sessionID: string) {
  const archived = safeReadArchivedSession(sessionID)
  if (!archived) {
    throw new ApiError(404, "ARCHIVED_SESSION_NOT_FOUND", `Archived session '${sessionID}' not found`)
  }

  if (safeReadSession(sessionID)) {
    throw new ApiError(409, "SESSION_ALREADY_EXISTS", `Session '${sessionID}' already exists`)
  }

  const project = Project.get(archived.projectID)
  if (!project) {
    throw new ApiError(
      409,
      "PROJECT_NOT_FOUND",
      `Project '${archived.projectID}' no longer exists, so session '${sessionID}' cannot be restored`,
    )
  }

  const restored = Session.restoreArchivedSession(sessionID)
  if (!restored) {
    throw new ApiError(404, "ARCHIVED_SESSION_NOT_FOUND", `Archived session '${sessionID}' not found`)
  }

  return mapSessionSummary(restored)
}

export function deleteArchivedSession(sessionID: string) {
  const archived = Session.deleteArchivedSession(sessionID)
  if (!archived) {
    throw new ApiError(404, "ARCHIVED_SESSION_NOT_FOUND", `Archived session '${sessionID}' not found`)
  }

  return {
    sessionID: archived.sessionID,
  }
}

export async function createSideChat(
  parentSessionID: string,
  input: z.infer<typeof CreateSideChatBody>,
) {
  const parentSession = safeReadSession(parentSessionID)
  if (!parentSession) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${parentSessionID}' not found`)
  }

  if (Session.isSideChatSession(parentSession)) {
    throw new ApiError(409, "INVALID_PARENT_SESSION", "Side chats can only be created from main sessions")
  }

  try {
    const sideChat = await Session.createSideChat({
      parentSessionID,
      anchorMessageID: input.anchorMessageID,
    })

    return mapSessionSummary(sideChat)
  } catch (error) {
    throw new ApiError(
      400,
      "SIDE_CHAT_CREATE_FAILED",
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function listSideChats(parentSessionID: string, anchorMessageID?: string) {
  const parentSession = safeReadSession(parentSessionID) ?? safeReadArchivedSession(parentSessionID)?.snapshot.session
  if (!parentSession) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${parentSessionID}' not found`)
  }

  if (Session.isSideChatSession(parentSession)) {
    throw new ApiError(409, "INVALID_PARENT_SESSION", "Side chats can only be listed from main sessions")
  }

  return Session.listSideChats(parentSessionID, anchorMessageID).map(mapSideChatLink)
}

export function getSideChatLink(sessionID: string) {
  const link = Session.getSideChatLink(sessionID)
  if (!link) {
    throw new ApiError(404, "SIDE_CHAT_NOT_FOUND", `Side chat '${sessionID}' not found`)
  }

  return mapSideChatLink(link)
}

export function getSideChatContext(sessionID: string) {
  const context = Session.getSideChatContext(sessionID)
  if (!context) {
    throw new ApiError(404, "SIDE_CHAT_NOT_FOUND", `Side chat '${sessionID}' not found`)
  }

  return {
    session: mapSessionSummary(context.session),
    link: mapSideChatLink(context.link),
    messages: context.messages,
  }
}

export function getSession(sessionID: string) {
  return mapSessionSummary(requireSession(sessionID))
}

export function listSessionTasks(sessionID: string, input?: {
  owner?: string
  status?: string
  includeCompleted?: string
}) {
  requireSession(sessionID)
  const status = Task.SessionTaskStatus.safeParse(input?.status)
  return Task.listSessionTasks(sessionID, {
    owner: input?.owner?.trim() || undefined,
    status: status.success ? status.data : undefined,
    includeCompleted:
      input?.includeCompleted === undefined
        ? undefined
        : input.includeCompleted !== "false",
  })
}

export function getSessionTask(sessionID: string, taskID: string) {
  requireSession(sessionID)
  const task = Task.getSessionTask(sessionID, taskID)
  if (!task) {
    throw new ApiError(404, "TASK_NOT_FOUND", `Task '${taskID}' not found`)
  }
  return task
}

export async function listSessionMessages(sessionID: string) {
  requireSession(sessionID)

  const messages: Message.WithParts[] = []
  for await (const item of Message.stream(sessionID)) {
    messages.push(item)
  }

  return messages
}

export async function getSessionDiff(sessionID: string) {
  const session = requireSession(sessionID)
  const diff = await Instance.provide({
    directory: session.directory,
    fn: () => SessionDiff.computeSessionDetailedDiff(sessionID),
  })

  return diff ?? SessionDiff.buildDetailedDiffSummary([])
}

export function deleteSession(sessionID: string) {
  const session = Session.removeSession(sessionID)
  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
  }

  return {
    sessionID: session.id,
    projectID: session.projectID,
  }
}

export function cancelSession(sessionID: string) {
  requireSession(sessionID)

  return {
    sessionID,
    cancelled: Prompt.cancel(sessionID),
  }
}

export function createEventStreamResponse(input: {
  sessionID: string
  requestId?: string
  replayCursor?: string
}) {
  const session = requireSession(input.sessionID)

  let since: ReturnType<typeof parseReplayCursor>
  try {
    since = parseReplayCursor(input.replayCursor)
  } catch {
    throw new ApiError(400, "INVALID_REPLAY_CURSOR", "Query 'since' or header 'Last-Event-ID' is invalid")
  }

  log.info("received session event stream request", {
    sessionID: input.sessionID,
    requestId: input.requestId,
    directory: session.directory,
    replayFrom: since ? serializeReplayCursor(since) : undefined,
  })

  return createSessionEventStream({
    sessionID: input.sessionID,
    requestId: input.requestId,
    since,
  })
}

export function createMessageStreamResponse(input: {
  sessionID: string
  payload: StreamSessionMessageInput
  requestId?: string
  replayTurnID?: string
  sinceSeq?: string
}) {
  const session = requireSession(input.sessionID)
  const normalizedText = normalizePromptText(input.payload.text)

  log.info("received session stream request", {
    sessionID: input.sessionID,
    requestId: input.requestId,
    directory: session.directory,
    textLength: normalizedText?.length ?? 0,
    questionAnswerID: input.payload.questionAnswer?.questionID,
    questionAnswerOptions: input.payload.questionAnswer?.selectedOptions?.length ?? 0,
    attachmentCount: input.payload.attachments?.length ?? 0,
    attachments: (input.payload.attachments ?? []).map((attachment) => summarizeAttachmentInput(attachment)),
    reasoningEffort: input.payload.reasoningEffort ?? "default",
    model: input.payload.model ? `${input.payload.model.providerID}/${input.payload.model.modelID}` : "default",
    skillCount: input.payload.skills?.length ?? 0,
  })

  return createSessionExecutionStream({
    sessionID: input.sessionID,
    requestId: input.requestId,
    replayTurnID: input.replayTurnID,
    sinceSeq: parseSinceSeq(input.sinceSeq),
    execute: () =>
      Instance.provide({
        directory: session.directory,
        fn: async () => {
          const parts = await resolvePromptPartsFromStreamPayload(input.payload)
          return Prompt.prompt({
            sessionID: input.sessionID,
            parts,
            system: input.payload.system,
            agent: input.payload.agent,
            skills: input.payload.skills,
            reasoningEffort: input.payload.reasoningEffort,
            model: input.payload.model,
          })
        },
      }).then(async (value) => (await value) as SessionStreamResult),
    cancel: () => {
      void Prompt.cancel(input.sessionID)
    },
  })
}

export function createResumeStreamResponse(input: {
  sessionID: string
  requestId?: string
  replayTurnID?: string
  sinceSeq?: string
}) {
  const session = requireSession(input.sessionID)

  return createSessionExecutionStream({
    sessionID: input.sessionID,
    requestId: input.requestId,
    replayTurnID: input.replayTurnID,
    sinceSeq: parseSinceSeq(input.sinceSeq),
    execute: () =>
      Instance.provide({
        directory: session.directory,
        fn: () => Prompt.resume({ sessionID: input.sessionID }),
      }).then(async (value) => (await value) as SessionStreamResult),
    cancel: () => {
      void Prompt.cancel(input.sessionID)
    },
  })
}
