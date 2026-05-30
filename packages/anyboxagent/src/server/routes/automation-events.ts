import { Hono } from "hono"
import * as AutomationEvents from "#automation/events.ts"
import type { AppEnv } from "#server/types.ts"

const STREAM_HEARTBEAT_INTERVAL_MS = 3000

function createSSEHeaders(requestId?: string) {
  const headers: Record<string, string> = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  }
  if (requestId) headers["x-request-id"] = requestId
  return headers
}

export function AutomationEventRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/stream", (c) => {
    const encoder = new TextEncoder()
    const lastEventID = c.req.header("last-event-id")?.trim() || undefined
    const requestSignal = c.req.raw.signal
    let closeStream: (() => void) | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        let unsubscribe: (() => void) | undefined
        let heartbeat: ReturnType<typeof setInterval> | undefined

        const enqueue = (text: string) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            close()
          }
        }

        const send = (event: AutomationEvents.AutomationEventRecord) => {
          enqueue(AutomationEvents.toSSE(event))
        }

        const close = () => {
          if (closed) return
          closed = true
          unsubscribe?.()
          if (heartbeat) clearInterval(heartbeat)
          requestSignal.removeEventListener("abort", close)
          try {
            controller.close()
          } catch {
            // The client may already have disconnected.
          }
        }

        requestSignal.addEventListener("abort", close)
        closeStream = close

        for (const event of AutomationEvents.listEventsAfter(lastEventID)) {
          send(event)
        }

        unsubscribe = AutomationEvents.subscribe(send)
        heartbeat = setInterval(() => {
          enqueue(": heartbeat\n\n")
        }, STREAM_HEARTBEAT_INTERVAL_MS)
      },
      cancel() {
        closeStream?.()
      },
    })

    return new Response(stream, {
      headers: createSSEHeaders(c.get("requestId")),
    })
  })

  return app
}
