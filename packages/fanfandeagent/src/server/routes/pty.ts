import type { UpgradeWebSocket } from "hono/helper/websocket"
import { Hono } from "hono"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import type { PtyRegistry } from "#pty/registry.ts"
import {
  CreatePtySessionBody,
  PtyClientMessage,
  type PtyServerMessage as PtyServerMessageValue,
  PtyServerMessage,
  UpdatePtySessionBody,
} from "#pty/types.ts"

function sendServerMessage(
  ws: {
    send: (data: string) => void
    close: (code?: number, reason?: string) => void
  },
  payload: PtyServerMessageValue,
) {
  ws.send(JSON.stringify(PtyServerMessage.parse(payload)))
}

function parseCursor(value: string | undefined) {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, "INVALID_CURSOR", "Query parameter 'cursor' must be a non-negative integer")
  }

  return parsed
}

export function PtyRoutes(options: { registry: PtyRegistry; upgradeWebSocket: UpgradeWebSocket }) {
  const app = new Hono<AppEnv>()

  app.post("/", async (c) => {
    const payload = CreatePtySessionBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include valid optional PTY session fields")
    }

    const session = await options.registry.create(payload.data)
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
    const session = options.registry.info(id)
    if (!session) {
      throw new ApiError(404, "PTY_NOT_FOUND", `PTY session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: session,
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id", async (c) => {
    const id = c.req.param("id")
    const payload = UpdatePtySessionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include PTY fields to update")
    }

    const session = options.registry.update(id, payload.data)
    if (!session) {
      throw new ApiError(404, "PTY_NOT_FOUND", `PTY session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: session,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    const session = options.registry.delete(id)
    if (!session) {
      throw new ApiError(404, "PTY_NOT_FOUND", `PTY session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: session,
      requestId: c.get("requestId"),
    })
  })

  app.get(
    "/:id/connect",
    options.upgradeWebSocket((c) => {
      const id = c.req.param("id")
      const cursor = parseCursor(c.req.query("cursor"))
      const session = options.registry.get(id)
      if (!session) {
        throw new ApiError(404, "PTY_NOT_FOUND", `PTY session '${id}' not found`)
      }

      let unsubscribe: (() => void) | null = null

      return {
        onOpen(_event, ws) {
          const replay = session.replay(cursor)
          sendServerMessage(ws, {
            type: "ready",
            session: session.info(),
            replay,
          })

          unsubscribe = session.subscribe((event) => {
            if (event.type === "output") {
              sendServerMessage(ws, {
                type: "output",
                id: event.id,
                data: event.data,
                cursor: event.cursor,
              })
              return
            }

            if (event.type === "state") {
              sendServerMessage(ws, {
                type: "state",
                session: event.session,
              })
              return
            }

            if (event.type === "exited") {
              sendServerMessage(ws, {
                type: "exited",
                session: event.session,
              })
              return
            }

            sendServerMessage(ws, {
              type: "deleted",
              session: event.session,
            })
            ws.close(1000, "PTY deleted")
          })
        },
        onMessage(event, ws) {
          const payload = PtyClientMessage.safeParse(JSON.parse(String(event.data)))
          if (!payload.success) {
            sendServerMessage(ws, {
              type: "error",
              code: "INVALID_MESSAGE",
              message: "PTY message must include a valid 'type' payload",
            })
            return
          }

          if (payload.data.type === "input") {
            try {
              options.registry.write(id, payload.data.data)
            } catch (error) {
              sendServerMessage(ws, {
                type: "error",
                code: "PTY_WRITE_FAILED",
                message: error instanceof Error ? error.message : String(error),
              })
            }
          }
        },
        onClose() {
          unsubscribe?.()
          unsubscribe = null
        },
        onError(_event, ws) {
          sendServerMessage(ws, {
            type: "error",
            code: "PTY_SOCKET_ERROR",
            message: "PTY socket connection failed",
          })
        },
      }
    }),
  )

  return app
}
