import type { UpgradeWebSocket } from "hono/ws"
import { Hono } from "hono"
import { browserExtensionBridge } from "#browser-extension/bridge.ts"
import { ok } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"

function readMessageData(data: MessageEvent["data"]) {
  if (typeof data === "string") return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength))
  }
  throw new Error("Browser extension websocket payload must be text.")
}

export function BrowserExtensionRoutes(options: { upgradeWebSocket: UpgradeWebSocket }) {
  const app = new Hono<AppEnv>()

  app.get("/health", (c) => ok(c, { ok: true }))
  app.get("/status", (c) => ok(c, browserExtensionBridge.status()))

  app.get(
    "/ws",
    options.upgradeWebSocket(() => {
      let connectionID: string | undefined

      return {
        onOpen(_event, ws) {
          connectionID = browserExtensionBridge.register(ws)
        },
        onMessage(event, ws) {
          if (!connectionID) {
            ws.close(1011, "Browser extension connection was not initialized.")
            return
          }

          try {
            browserExtensionBridge.handleRawMessage(connectionID, readMessageData(event.data))
          } catch (error) {
            ws.send(JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            }))
          }
        },
        onClose() {
          if (connectionID) browserExtensionBridge.unregister(connectionID)
          connectionID = undefined
        },
        onError(_event, ws) {
          ws.close(1011, "Browser extension websocket failed.")
        },
      }
    }),
  )

  return app
}
