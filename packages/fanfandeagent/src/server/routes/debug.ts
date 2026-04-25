import { Hono } from "hono"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as RunningState from "#session/running-state.ts"
import { getSessionRuntimeDebugSnapshot } from "#session/runtime-debug.ts"
import * as Session from "#session/session.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.debug" })

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export function DebugRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/runtime", (c) => {
    const eventLimit = parseLimit(c.req.query("limit"), 12, 100)
    const turnLimit = parseLimit(c.req.query("turns"), 2, 10)
    const runningSessions = RunningState.snapshot().map((item) =>
      getSessionRuntimeDebugSnapshot({
        sessionID: item.sessionID,
        eventLimit,
        turnLimit,
      }),
    )

    log.info("runtime debug snapshot requested", {
      requestId: c.get("requestId"),
      runningSessions: runningSessions.length,
      eventLimit,
      turnLimit,
    })

    return c.json({
      success: true,
      data: {
        generatedAt: Date.now(),
        process: {
          pid: process.pid,
          uptimeMs: Math.round(process.uptime() * 1000),
          platform: process.platform,
        },
        logging: Log.status(),
        runningSessions,
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/sessions/:id/runtime", (c) => {
    const sessionID = c.req.param("id")
    const session = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    const eventLimit = parseLimit(c.req.query("limit"), 25, 100)
    const turnLimit = parseLimit(c.req.query("turns"), 6, 20)
    const detail = getSessionRuntimeDebugSnapshot({
      sessionID,
      eventLimit,
      turnLimit,
    })

    log.info("session runtime debug requested", {
      requestId: c.get("requestId"),
      sessionID,
      eventLimit,
      turnLimit,
    })

    return c.json({
      success: true,
      data: detail,
      requestId: c.get("requestId"),
    })
  })

  return app
}
