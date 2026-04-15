import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { Hono } from "hono"
import z from "zod"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import * as Prompt from "#session/prompt.ts"
import * as Message from "#session/message.ts"
import * as SessionDiff from "#session/diff.ts"
import * as EventStore from "#session/event-store.ts"
import * as LiveStreamHub from "#session/live-stream-hub.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as StreamMapper from "#session/stream-mapper.ts"
import * as RunningState from "#session/running-state.ts"
import { Instance } from "#project/instance.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as Log from "#util/log.ts"

const CreateSessionBody = z.object({
  directory: z.string().min(1),
})

const StreamSessionAttachmentBody = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
})

const StreamSessionMessageBody = z.object({
  text: z.string().optional(),
  attachments: z.array(StreamSessionAttachmentBody).optional(),
  system: z.string().optional(),
  agent: z.string().optional(),
  skills: z.array(z.string()).optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
}).superRefine((value, ctx) => {
  const hasText = typeof value.text === "string" && value.text.trim().length > 0
  const hasAttachments = Array.isArray(value.attachments) && value.attachments.length > 0

  if (!hasText && !hasAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Body must include a non-empty 'text' or at least one attachment",
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

function normalizePromptText(text: string | undefined) {
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
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

async function resolvePromptPartsFromStreamPayload(payload: z.infer<typeof StreamSessionMessageBody>) {
  const parts: z.infer<typeof Prompt.PromptInput>["parts"] = []
  const normalizedText = normalizePromptText(payload.text)

  if (normalizedText) {
    parts.push({
      type: "text",
      text: normalizedText,
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

function mapArchivedSessionSummary(record: Session.ArchivedSessionRecord) {
  const project = Project.get(record.projectID)

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
  }
}

function toSSE(event: string, data: unknown, id?: string) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  return `${lines.join("\n")}\n\n`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const STREAM_HEARTBEAT_INTERVAL_MS = 3000

type SessionStreamResult = {
  info: Message.MessageInfo
  parts: Message.Part[]
}

function replayRuntimeEvents(input: {
  sessionID: string
  turnID?: string
  sinceSeq?: number
  since?: RuntimeEvent.RuntimeEventCursor
}) {
  if (input.turnID) {
    return EventStore.listTurnEvents({
      sessionID: input.sessionID,
      turnID: input.turnID,
      sinceSeq: input.sinceSeq,
    })
  }

  if (input.since) {
    return EventStore.listSessionEvents({
      sessionID: input.sessionID,
      after: input.since,
    })
  }

  return []
}

function parseSinceSeq(value: string | undefined) {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.floor(parsed)
}

function parseReplayCursor(value: string | undefined) {
  if (!value) return undefined
  return RuntimeEvent.parseCursor(value.trim())
}

function runtimeEventSSEID(event: RuntimeEvent.RuntimeEvent) {
  return RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(event))
}

export function createSessionEventStream(input: {
  sessionID: string
  requestId?: string
  heartbeatIntervalMs?: number
  since?: RuntimeEvent.RuntimeEventCursor
}) {
  let cancelled = false
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? STREAM_HEARTBEAT_INTERVAL_MS
  const subscription = LiveStreamHub.subscribe({
    sessionID: input.sessionID,
    closeOnTerminalTurn: false,
    seed: replayRuntimeEvents({
      sessionID: input.sessionID,
      since: input.since,
    }),
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let lastChunkAt = Date.now()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        controller.enqueue(encoder.encode(chunk))
        lastChunkAt = Date.now()
      }

      const send = (event: string, data: unknown, id?: string) => {
        enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        enqueue(`: keepalive ${Date.now()}\n\n`)
      }

      void (async () => {
        let nextEventPromise = subscription.next()

        while (!cancelled) {
          const timeoutMs = Math.max(0, heartbeatIntervalMs - (Date.now() - lastChunkAt))
          const next = await Promise.race([
            nextEventPromise.then((event) => ({ type: "event" as const, event })),
            sleep(timeoutMs).then(() => ({ type: "heartbeat" as const })),
          ])

          if (next.type === "heartbeat") {
            sendKeepalive()
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          const sseID = runtimeEventSSEID(next.event)
          for (const rendererEvent of StreamMapper.toRendererStreamEvents(next.event)) {
            send(rendererEvent.event, rendererEvent.data, sseID)
          }
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch((error) => {
        log.error("session event stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        send("error", {
          sessionID: input.sessionID,
          turnID: "",
          message: error instanceof Error ? error.message : String(error),
        })
        subscription.close()
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      subscription.close()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-request-id": input.requestId,
    },
  })
}

export function createSessionExecutionStream(input: {
  sessionID: string
  execute: () => Promise<SessionStreamResult>
  cancel: () => void
  requestId?: string
  heartbeatIntervalMs?: number
  replayTurnID?: string
  sinceSeq?: number
}) {
  let cancelled = false
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? STREAM_HEARTBEAT_INTERVAL_MS
  const subscription = LiveStreamHub.subscribe({
    sessionID: input.sessionID,
    turnID: input.replayTurnID,
    closeOnTerminalTurn: true,
    seed: replayRuntimeEvents({
      sessionID: input.sessionID,
      turnID: input.replayTurnID,
      sinceSeq: input.sinceSeq,
    }),
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let lastChunkAt = Date.now()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        controller.enqueue(encoder.encode(chunk))
        lastChunkAt = Date.now()
      }

      const send = (event: string, data: unknown, id?: string) => {
        enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        enqueue(`: keepalive ${Date.now()}\n\n`)
      }

      void (async () => {
        let resolved: SessionStreamResult | undefined
        let failed: unknown
        let terminalEvent: RuntimeEvent.RuntimeEvent | undefined
        let executionDone = false

        const execution = input.execute()
          .then((value) => {
            resolved = value
            executionDone = true
          })
          .catch((error) => {
            failed = error
            executionDone = true
          })
        let nextEventPromise = subscription.next()

        while (!cancelled) {
          const timeoutMs = Math.max(0, heartbeatIntervalMs - (Date.now() - lastChunkAt))
          const next = await Promise.race([
            nextEventPromise.then((event) => ({ type: "event" as const, event })),
            sleep(timeoutMs).then(() => ({ type: "heartbeat" as const })),
          ])

          if (next.type === "heartbeat") {
            if (executionDone) {
              break
            }
            sendKeepalive()
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          const sseID = runtimeEventSSEID(next.event)
          for (const rendererEvent of StreamMapper.toRendererStreamEvents(next.event)) {
            send(rendererEvent.event, rendererEvent.data, sseID)
          }

          if (RuntimeEvent.isTerminalRuntimeEvent(next.event)) {
            terminalEvent = next.event
            break
          }
        }

        await execution

        if (!cancelled) {
          if (terminalEvent) {
            // terminal runtime events already mapped to renderer events
          } else if (failed) {
            log.error("session execution stream failed", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              error: normalizeLogError(failed),
            })
            send("error", {
              sessionID: input.sessionID,
              message: failed instanceof Error ? failed.message : String(failed),
            })
          } else if (resolved) {
            log.warn("session execution stream completed without terminal runtime event", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              assistantMessageID: resolved.info.id,
              partCount: resolved.parts.length,
            })
            send("done", {
              sessionID: input.sessionID,
              message: resolved.info,
              parts: resolved.parts,
            })
          } else {
            log.error("session execution stream exited without result", {
              sessionID: input.sessionID,
              requestId: input.requestId,
            })
            send("error", {
              sessionID: input.sessionID,
              message: "Prompt exited unexpectedly",
            })
          }
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch((error) => {
        log.error("session execution stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        send("error", {
          sessionID: input.sessionID,
          message: error instanceof Error ? error.message : String(error),
        })
        subscription.close()
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      subscription.close()
      input.cancel()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-request-id": input.requestId,
    },
  })
}

export function SessionRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", (c) => {
    return c.json({
      success: true,
      data: {
        hint: "Use POST /api/sessions with { directory } to create a session",
      },
      requestId: c.get("requestId"),
    })
  })

  app.post("/", async (c) => {
    const payload = CreateSessionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const { project } = await Project.fromDirectory(payload.data.directory)
    const session = await Session.createSession({
      directory: payload.data.directory,
      projectID: project.id,
    })

    return c.json(
      {
        success: true,
        data: session,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.get("/archived", (c) => {
    return c.json({
      success: true,
      data: Session.listArchivedSessions().map(mapArchivedSessionSummary),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/archive", (c) => {
    const sessionID = c.req.param("id")
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

    const archived = Session.archiveSession(sessionID)
    if (!archived) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    return c.json({
      success: true,
      data: {
        sessionID: archived.sessionID,
        projectID: archived.projectID,
        directory: archived.directory,
        archivedAt: archived.archivedAt,
      },
      requestId: c.get("requestId"),
    })
  })

  app.post("/archived/:id/restore", (c) => {
    const sessionID = c.req.param("id")
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

    return c.json({
      success: true,
      data: restored,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/archived/:id", (c) => {
    const sessionID = c.req.param("id")
    const archived = Session.deleteArchivedSession(sessionID)
    if (!archived) {
      throw new ApiError(404, "ARCHIVED_SESSION_NOT_FOUND", `Archived session '${sessionID}' not found`)
    }

    return c.json({
      success: true,
      data: {
        sessionID: archived.sessionID,
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const session = safeReadSession(id)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: session,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/messages", async (c) => {
    const sessionID = c.req.param("id")
    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    const messages: Message.WithParts[] = []
    for await (const item of Message.stream(sessionID)) {
      messages.push(item)
    }

    return c.json({
      success: true,
      data: messages,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/diff", async (c) => {
    const sessionID = c.req.param("id")
    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    const diff = await Instance.provide({
      directory: session.directory,
      fn: () => SessionDiff.computeSessionDetailedDiff(sessionID),
    })

    return c.json({
      success: true,
      data: diff ?? SessionDiff.buildDetailedDiffSummary([]),
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    const session = Session.removeSession(id)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: {
        sessionID: session.id,
        projectID: session.projectID,
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/events/stream", async (c) => {
    const sessionID = c.req.param("id")
    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    let since: RuntimeEvent.RuntimeEventCursor | undefined
    try {
      since = parseReplayCursor(c.req.query("since") ?? c.req.header("last-event-id"))
    } catch {
      throw new ApiError(400, "INVALID_REPLAY_CURSOR", "Query 'since' or header 'Last-Event-ID' is invalid")
    }

    log.info("received session event stream request", {
      sessionID,
      requestId: c.get("requestId"),
      directory: session.directory,
      replayFrom: since ? RuntimeEvent.serializeCursor(since) : undefined,
    })

    return createSessionEventStream({
      sessionID,
      requestId: c.get("requestId"),
      since,
    })
  })

  app.post("/:id/messages/stream", async (c) => {
    const sessionID = c.req.param("id")
    const payload = StreamSessionMessageBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'text' or at least one attachment")
    }

    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    const normalizedText = normalizePromptText(payload.data.text)
    log.info("received session stream request", {
      sessionID,
      requestId: c.get("requestId"),
      directory: session.directory,
      textLength: normalizedText?.length ?? 0,
      attachmentCount: payload.data.attachments?.length ?? 0,
      attachments: (payload.data.attachments ?? []).map((attachment) => summarizeAttachmentInput(attachment)),
      model: payload.data.model ? `${payload.data.model.providerID}/${payload.data.model.modelID}` : "default",
      skillCount: payload.data.skills?.length ?? 0,
    })

    return createSessionExecutionStream({
      sessionID,
      requestId: c.get("requestId"),
      replayTurnID: c.req.query("turnID"),
      sinceSeq: parseSinceSeq(c.req.query("sinceSeq")),
      execute: () =>
        Instance.provide({
          directory: session.directory,
          fn: async () => {
            const parts = await resolvePromptPartsFromStreamPayload(payload.data)
            return Prompt.prompt({
              sessionID,
              parts,
              system: payload.data.system,
              agent: payload.data.agent,
              skills: payload.data.skills,
              model: payload.data.model,
            })
          },
        }).then(async (value) => (await value) as SessionStreamResult),
      cancel: () => {
        void Prompt.cancel(sessionID)
      },
    })
  })

  app.post("/:id/resume/stream", async (c) => {
    const sessionID = c.req.param("id")
    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    return createSessionExecutionStream({
      sessionID,
      requestId: c.get("requestId"),
      replayTurnID: c.req.query("turnID"),
      sinceSeq: parseSinceSeq(c.req.query("sinceSeq")),
      execute: () =>
        Instance.provide({
          directory: session.directory,
          fn: () => Prompt.resume({ sessionID }),
        }).then(async (value) => (await value) as SessionStreamResult),
      cancel: () => {
        void Prompt.cancel(sessionID)
      },
    })
  })

  return app
}
