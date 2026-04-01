import { startServer, stopServer, url } from "#server/server.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server-bootstrap" })

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
