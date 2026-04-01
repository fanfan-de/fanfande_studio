import { Hono } from "hono"
import z from "zod"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import * as Prompt from "#session/prompt.ts"
import * as Message from "#session/message.ts"
import * as db from "#database/Sqlite.ts"
import { Instance } from "#project/instance.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const CreateSessionBody = z.object({
  directory: z.string().min(1),
})

const StreamSessionMessageBody = z.object({
  text: z.string().min(1),
  system: z.string().optional(),
  agent: z.string().optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
})

function safeReadSession(sessionID: string): Session.SessionInfo | null {
  try {
    return Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
  } catch {
    return null
  }
}

function toSSE(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  app.post("/:id/messages/stream", async (c) => {
    const sessionID = c.req.param("id")
    const payload = StreamSessionMessageBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'text'")
    }

    const session = safeReadSession(sessionID)
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()

        const send = (event: string, data: unknown) => {
          if (cancelled) return
          controller.enqueue(encoder.encode(toSSE(event, data)))
        }

        const seenParts = new Map<string, Message.Part>()

        const flushPartUpdates = () => {
          const parts = db.findManyWithSchema("parts", Message.Part, {
            where: [{ column: "sessionID", value: sessionID }],
            orderBy: [{ column: "id", direction: "ASC" }],
          })

          for (const part of parts) {
            const owner = db.findById("messages", Message.MessageInfo, part.messageID)
            if (owner?.role === "user") {
              seenParts.set(part.id, part)
              continue
            }

            const previous = seenParts.get(part.id)
            const changed = !previous || JSON.stringify(previous) !== JSON.stringify(part)
            if (!changed) continue

            if ((part.type === "text" || part.type === "reasoning") && previous?.type === part.type) {
              const previousText = previous.text
              const delta = part.text.startsWith(previousText) ? part.text.slice(previousText.length) : part.text
              if (delta.length > 0) {
                send("delta", {
                  sessionID,
                  messageID: part.messageID,
                  partID: part.id,
                  kind: part.type,
                  delta,
                  text: part.text,
                })
              }
            } else if (part.type === "text" || part.type === "reasoning") {
              if (part.text.length > 0) {
                send("delta", {
                  sessionID,
                  messageID: part.messageID,
                  partID: part.id,
                  kind: part.type,
                  delta: part.text,
                  text: part.text,
                })
              } else {
                send("part", { sessionID, part })
              }
            } else {
              send("part", { sessionID, part })
            }

            seenParts.set(part.id, part)
          }
        }

        void (async () => {
          send("started", {
            sessionID,
            timestamp: Date.now(),
          })

          const promptPromise = Instance.provide({
            directory: session.directory,
            fn: () =>
              Prompt.prompt({
                sessionID,
                parts: [
                  {
                    type: "text",
                    text: payload.data.text,
                  },
                ],
                system: payload.data.system,
                agent: payload.data.agent,
                model: payload.data.model,
              }),
          }).then(async (value) => (await value) as { info: Message.MessageInfo; parts: Message.Part[] })

          let resolved: { info: Message.MessageInfo; parts: Message.Part[] } | undefined
          let failed: unknown
          let done = false
          promptPromise
            .then((value) => {
              resolved = value
              done = true
            })
            .catch((error) => {
              failed = error
              done = true
            })

          while (!done && !cancelled) {
            flushPartUpdates()
            await sleep(120)
          }

          flushPartUpdates()

          if (!cancelled) {
            if (failed) {
              send("error", {
                sessionID,
                message: failed instanceof Error ? failed.message : String(failed),
              })
            } else if (resolved) {
              send("done", {
                sessionID,
                message: resolved.info,
                parts: resolved.parts,
              })
            } else {
              send("error", {
                sessionID,
                message: "Prompt exited unexpectedly",
              })
            }
          }

          if (!cancelled) controller.close()
        })().catch((error) => {
          send("error", {
            sessionID,
            message: error instanceof Error ? error.message : String(error),
          })
          if (!cancelled) controller.close()
        })
      },
      cancel() {
        cancelled = true
        void Prompt.cancel(sessionID)
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-request-id": c.get("requestId"),
      },
    })
  })

  return app
}
