import { Hono } from "hono"
import type { Context } from "hono"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as RunningState from "#session/running-state.ts"
import { getSessionRuntimeDebugSnapshot } from "#session/runtime-debug.ts"
import * as Session from "#session/session.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.debug" })
const LOG_STREAM_HEARTBEAT_INTERVAL_MS = 3000

function truthy(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

function isDebugApiEnabled() {
  return process.env["NODE_ENV"] !== "production" || truthy(process.env["FanFande_DEBUG_API_ENABLED"])
}

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function parseLogFilter(c: Context<AppEnv>): Log.LogFilter {
  const filter: Log.LogFilter = {}
  const level = c.req.query("level")?.trim().toUpperCase()
  const parsedLevel = level ? Log.Level.safeParse(level) : undefined
  if (parsedLevel?.success) filter.level = parsedLevel.data

  const service = c.req.query("service")?.trim()
  if (service) filter.service = service

  const q = c.req.query("q")?.trim()
  if (q) filter.q = q

  return filter
}

function toSSE(event: string, data: unknown, id?: string) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  return `${lines.join("\n")}\n\n`
}

function withLegacyTurnAlias(snapshot: ReturnType<typeof getSessionRuntimeDebugSnapshot>) {
  return {
    ...snapshot,
    turn: snapshot.activeTurnID ? { id: snapshot.activeTurnID } : null,
  }
}

export function DebugRoutes() {
  const app = new Hono<AppEnv>()

  app.use("*", async (_c, next) => {
    if (!isDebugApiEnabled()) {
      throw new ApiError(404, "NOT_FOUND", "Route not found")
    }
    await next()
  })

  app.get("/status", (c) => {
    const runningSessions = RunningState.snapshot()
    const memory = process.memoryUsage()

    return c.json({
      success: true,
      data: {
        ok: true,
        generatedAt: Date.now(),
        process: {
          pid: process.pid,
          uptimeMs: Math.round(process.uptime() * 1000),
          platform: process.platform,
          memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers,
          },
        },
        logging: Log.status(),
        runningSessions: {
          count: runningSessions.length,
          items: runningSessions,
        },
        recentErrors: Log.listRecent({ limit: 5, filter: { level: "ERROR" } }),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/logs", (c) => {
    const limit = parseLimit(c.req.query("limit"), 200, 500)
    const filter = parseLogFilter(c)

    return c.json({
      success: true,
      data: {
        generatedAt: Date.now(),
        logs: Log.listRecent({ limit, filter }),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/logs/stream", (c) => {
    const filter = parseLogFilter(c)
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    let heartbeat: Timer | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        const enqueue = (chunk: string) => {
          if (cancelled) return
          controller.enqueue(encoder.encode(chunk))
        }

        unsubscribe = Log.subscribe({
          filter,
          push(entry) {
            enqueue(toSSE("log", entry, entry.id))
          },
        })

        heartbeat = setInterval(() => {
          enqueue(`: keepalive ${Date.now()}\n\n`)
        }, LOG_STREAM_HEARTBEAT_INTERVAL_MS)
      },
      cancel() {
        cancelled = true
        unsubscribe?.()
        if (heartbeat) clearInterval(heartbeat)
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-request-id": c.get("requestId") ?? "",
      },
    })
  })

  app.get("/runtime", (c) => {
    const eventLimit = parseLimit(c.req.query("limit"), 12, 100)
    const turnLimit = parseLimit(c.req.query("turns"), 2, 10)
    const runningSessions = RunningState.snapshot().map((item) =>
      withLegacyTurnAlias(getSessionRuntimeDebugSnapshot({
        sessionID: item.sessionID,
        eventLimit,
        turnLimit,
      })),
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
    const detail = withLegacyTurnAlias(getSessionRuntimeDebugSnapshot({
      sessionID,
      eventLimit,
      turnLimit,
    }))

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
