import { startServer, stopServer, url } from "#server/server.ts"
import * as Log from "#util/log.ts"
import { getProcessEnvValue } from "#env/compat.ts"

const log = Log.create({ service: "server-bootstrap" })

function truthy(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true"
}

function resolveLogLevel(): Log.Level {
  const candidate = getProcessEnvValue("ANYBOX_LOG_LEVEL")?.trim().toUpperCase()
  const parsed = candidate ? Log.Level.safeParse(candidate) : undefined
  if (parsed?.success) return parsed.data
  return process.env["NODE_ENV"] === "production" ? "INFO" : "DEBUG"
}

await Log.init({
  print: getProcessEnvValue("ANYBOX_LOG_PRINT") ? truthy(getProcessEnvValue("ANYBOX_LOG_PRINT")) : true,
  file: getProcessEnvValue("ANYBOX_LOG_FILE") ? truthy(getProcessEnvValue("ANYBOX_LOG_FILE")) : true,
  dev: process.env["NODE_ENV"] !== "production",
  level: resolveLogLevel(),
})

log.info("server-logging-ready", Log.status())

startServer()
log.info("server-ready", { url: url().toString() })

const shutdown = (signal: "SIGINT" | "SIGTERM") => {
  log.info("server-shutdown", { signal })
  stopServer()
  process.exit(0)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

await new Promise(() => undefined)
