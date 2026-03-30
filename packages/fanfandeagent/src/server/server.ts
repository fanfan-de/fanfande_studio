import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { ProjectRoutes } from "#server/routes/projects.ts"
import { SessionRoutes } from "#server/routes/session.ts"
import { isApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as Log from "#util/log.ts"

export interface ServerOptions {
  host?: string
  port?: number
  corsWhitelist?: string[]
}

const log = Log.create({ service: "server" })
let activeServer: Bun.Server<unknown> | undefined
let activeURL = new URL("http://127.0.0.1:4096")

function getRequestId(c: Context<AppEnv>) {
  return c.get("requestId") ?? "unknown"
}

function jsonError(c: Context<AppEnv>, status: ContentfulStatusCode, code: string, message: string) {
  return c.json(
    {
      success: false,
      error: { code, message },
      requestId: getRequestId(c),
    },
    status,
  )
}

function parsePort(input: string | undefined, fallback: number) {
  if (!input) return fallback
  const parsed = Number(input)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

export function createServerApp(options: Pick<ServerOptions, "corsWhitelist"> = {}) {
  const app = new Hono<AppEnv>()
  const whitelist = (options.corsWhitelist ?? []).filter(Boolean)

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set("requestId", requestId)
    c.header("x-request-id", requestId)
    await next()
  })

  if (whitelist.length > 0) app.use("/api/*", cors({ origin: whitelist }))
  else app.use("/api/*", cors())

  app.use("*", async (c, next) => {
    const started = Date.now()
    try {
      await next()
    } finally {
      const url = new URL(c.req.url)
      log.info("request", {
        method: c.req.method,
        path: url.pathname,
        status: c.res.status,
        duration: Date.now() - started,
        requestId: getRequestId(c),
      })
    }
  })

  app.get("/", (c) =>
    c.json({
      success: true,
      data: {
        service: "fanfandeagent-api",
      },
      requestId: getRequestId(c),
    }),
  )

  app.get("/healthz", (c) =>
    c.json({
      success: true,
      data: { ok: true },
      requestId: getRequestId(c),
    }),
  )

  app.route("/api/projects", ProjectRoutes())
  app.route("/api/sessions", SessionRoutes())

  app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Route not found"))

  app.onError((error, c) => {
    if (isApiError(error)) return jsonError(c, error.status, error.code, error.message)

    log.error("unhandled-error", {
      error,
      requestId: getRequestId(c),
      path: new URL(c.req.url).pathname,
    })
    return jsonError(c, 500, "INTERNAL_ERROR", "Internal server error")
  })

  return app
}

export function url() {
  return activeURL
}

export function startServer(options: ServerOptions = {}) {
  if (activeServer) return activeServer

  const host = options.host ?? process.env["FanFande_SERVER_HOST"] ?? "127.0.0.1"
  const port = options.port ?? parsePort(process.env["FanFande_SERVER_PORT"], 4096)
  const app = createServerApp({ corsWhitelist: options.corsWhitelist })
  activeServer = Bun.serve({
    hostname: host,
    port,
    fetch: app.fetch,
  })
  activeURL = new URL(`http://${host}:${port}`)
  log.info("server-started", {
    host,
    port,
    url: activeURL.toString(),
  })
  return activeServer
}

export function stopServer() {
  if (!activeServer) return
  activeServer.stop(true)
  activeServer = undefined
  log.info("server-stopped")
}
