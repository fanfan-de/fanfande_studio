import { Hono, type Context } from "hono"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as EventStore from "#session/event-store.ts"
import * as RunningState from "#session/running-state.ts"
import { getSessionRuntimeDebugSnapshot } from "#session/runtime-debug.ts"
import * as Session from "#session/session.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.debug" })
const LOG_STREAM_HEARTBEAT_INTERVAL_MS = 3000
const STATUS_STREAM_SNAPSHOT_INTERVAL_MS = 1000

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function parseLogLevel(value: string | undefined) {
  if (!value) return undefined
  const parsed = Log.Level.safeParse(value.trim().toUpperCase())
  return parsed.success ? parsed.data : undefined
}

function parseLogQuery(c: Context<AppEnv>) {
  return {
    level: parseLogLevel(c.req.query("level")),
    service: c.req.query("service")?.trim() || undefined,
    excludeService: c.req.query("excludeService")?.trim() || undefined,
    q: c.req.query("q")?.trim() || undefined,
    limit: parseLimit(c.req.query("limit"), 200, 1000),
  } satisfies Log.LogQuery
}

function toSSE(event: string, data: unknown, id?: string) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  return `${lines.join("\n")}\n\n`
}

function buildStatusPayload() {
  const runningSessions = RunningState.snapshot()
  const memory = process.memoryUsage()

  return {
    ok: true,
    generatedAt: Date.now(),
    process: {
      pid: process.pid,
      uptimeMs: Math.round(process.uptime() * 1000),
      platform: process.platform,
      memory,
    },
    logging: Log.status(),
    runningSessions: {
      count: runningSessions.length,
      items: runningSessions,
    },
    recentErrors: Log.list({
      level: "ERROR",
      limit: 10,
    }),
  }
}

function buildRuntimePayload(input?: {
  eventLimit?: number
  turnLimit?: number
}) {
  const eventLimit = input?.eventLimit ?? 12
  const turnLimit = input?.turnLimit ?? 2

  return {
    generatedAt: Date.now(),
    process: {
      pid: process.pid,
      uptimeMs: Math.round(process.uptime() * 1000),
      platform: process.platform,
    },
    logging: Log.status(),
    runningSessions: RunningState.snapshot().map((item) =>
      getSessionRuntimeDebugSnapshot({
        sessionID: item.sessionID,
        eventLimit,
        turnLimit,
      }),
    ),
  }
}

function buildStatusStreamPayload() {
  return {
    status: buildStatusPayload(),
    runtime: buildRuntimePayload(),
  }
}

function createLogStream(input: {
  query: Omit<Log.LogQuery, "limit">
  requestId?: string
}) {
  let cancelled = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let unsubscribe: (() => void) | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cancelled = true
          heartbeat && clearInterval(heartbeat)
          unsubscribe?.()
        }
      }

      heartbeat = setInterval(() => {
        enqueue(`: keepalive ${Date.now()}\n\n`)
      }, LOG_STREAM_HEARTBEAT_INTERVAL_MS)

      unsubscribe = Log.subscribe((entry) => {
        if (!Log.matches(entry, input.query)) return
        enqueue(toSSE("log", entry, entry.id))
      })
    },
    cancel() {
      cancelled = true
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe?.()
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

function createStatusStream(input: {
  requestId?: string
}) {
  let cancelled = false
  let pending = false
  let snapshotTimer: ReturnType<typeof setInterval> | undefined
  const unsubscribers: Array<() => void> = []

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cancelled = true
          if (snapshotTimer) clearInterval(snapshotTimer)
          for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
        }
      }

      const pushSnapshot = () => {
        if (cancelled) return
        enqueue(toSSE("status", buildStatusStreamPayload()))
      }

      const scheduleSnapshot = () => {
        if (cancelled || pending) return
        pending = true
        queueMicrotask(() => {
          pending = false
          pushSnapshot()
        })
      }

      pushSnapshot()

      snapshotTimer = setInterval(() => {
        scheduleSnapshot()
      }, STATUS_STREAM_SNAPSHOT_INTERVAL_MS)

      unsubscribers.push(
        Log.subscribe(() => scheduleSnapshot()),
        RunningState.subscribe(() => scheduleSnapshot()),
        EventStore.subscribe(() => scheduleSnapshot()),
      )
    },
    cancel() {
      cancelled = true
      if (snapshotTimer) clearInterval(snapshotTimer)
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
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

export function DebugRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/status", (c) => {
    return c.json({
      success: true,
      data: buildStatusPayload(),
      requestId: c.get("requestId"),
    })
  })

  app.get("/status/stream", (c) =>
    createStatusStream({
      requestId: c.get("requestId"),
    }),
  )

  app.get("/logs", (c) => {
    const query = parseLogQuery(c)

    return c.json({
      success: true,
      data: {
        logs: Log.list(query),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/logs/stream", (c) => {
    const query = parseLogQuery(c)
    const { limit: _limit, ...streamQuery } = query
    return createLogStream({
      query: streamQuery,
      requestId: c.get("requestId"),
    })
  })

  app.get("/runtime", (c) => {
    const eventLimit = parseLimit(c.req.query("limit"), 12, 100)
    const turnLimit = parseLimit(c.req.query("turns"), 2, 10)
    const runtime = buildRuntimePayload({ eventLimit, turnLimit })

    log.info("runtime debug snapshot requested", {
      requestId: c.get("requestId"),
      runningSessions: runtime.runningSessions.length,
      eventLimit,
      turnLimit,
    })

    return c.json({
      success: true,
      data: runtime,
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
