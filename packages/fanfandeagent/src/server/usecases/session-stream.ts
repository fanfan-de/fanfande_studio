import * as EventStore from "#session/event-store.ts"
import * as LiveStreamHub from "#session/live-stream-hub.ts"
import * as Message from "#session/message.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as StreamMapper from "#session/stream-mapper.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.session" })
const STREAM_HEARTBEAT_INTERVAL_MS = 3000

type SessionStreamResult = {
  info: Message.MessageInfo
  parts: Message.Part[]
}

function normalizeLogError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function toSSE(event: string, data: unknown, id?: string) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  return `${lines.join("\n")}\n\n`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function replayRuntimeEvents(input: {
  sessionID: string
  turnID?: string
  sinceSeq?: number
  since?: RuntimeEvent.RuntimeEventCursor
}) {
  if (input.turnID) {
    return EventStore.listTurnEvents({
      sessionID: input.sessionID,
      turnID: input.turnID,
      sinceSeq: input.sinceSeq,
    })
  }

  if (input.since) {
    return EventStore.listSessionEvents({
      sessionID: input.sessionID,
      after: input.since,
    })
  }

  return []
}

export function parseSinceSeq(value: string | undefined) {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.floor(parsed)
}

export function parseReplayCursor(value: string | undefined) {
  if (!value) return undefined
  return RuntimeEvent.parseCursor(value.trim())
}

export function serializeReplayCursor(cursor: RuntimeEvent.RuntimeEventCursor) {
  return RuntimeEvent.serializeCursor(cursor)
}

function runtimeEventSSEID(event: RuntimeEvent.RuntimeEvent) {
  return RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(event))
}

export function createSessionEventStream(input: {
  sessionID: string
  requestId?: string
  heartbeatIntervalMs?: number
  since?: RuntimeEvent.RuntimeEventCursor
}) {
  let cancelled = false
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? STREAM_HEARTBEAT_INTERVAL_MS
  const subscription = LiveStreamHub.subscribe({
    sessionID: input.sessionID,
    closeOnTerminalTurn: false,
    seed: replayRuntimeEvents({
      sessionID: input.sessionID,
      since: input.since,
    }),
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let lastChunkAt = Date.now()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        controller.enqueue(encoder.encode(chunk))
        lastChunkAt = Date.now()
      }

      const send = (event: string, data: unknown, id?: string) => {
        enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        enqueue(`: keepalive ${Date.now()}\n\n`)
      }

      void (async () => {
        let nextEventPromise = subscription.next()

        while (!cancelled) {
          const timeoutMs = Math.max(0, heartbeatIntervalMs - (Date.now() - lastChunkAt))
          const next = await Promise.race([
            nextEventPromise.then((event) => ({ type: "event" as const, event })),
            sleep(timeoutMs).then(() => ({ type: "heartbeat" as const })),
          ])

          if (next.type === "heartbeat") {
            sendKeepalive()
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          const sseID = runtimeEventSSEID(next.event)
          for (const rendererEvent of StreamMapper.toRendererStreamEvents(next.event)) {
            send(rendererEvent.event, rendererEvent.data, sseID)
          }
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch((error) => {
        log.error("session event stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        send("error", {
          sessionID: input.sessionID,
          turnID: "",
          message: error instanceof Error ? error.message : String(error),
        })
        subscription.close()
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      subscription.close()
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

export function createSessionExecutionStream(input: {
  sessionID: string
  execute: () => Promise<SessionStreamResult>
  cancel: () => void
  requestId?: string
  heartbeatIntervalMs?: number
  replayTurnID?: string
  sinceSeq?: number
}) {
  let cancelled = false
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? STREAM_HEARTBEAT_INTERVAL_MS
  const subscription = LiveStreamHub.subscribe({
    sessionID: input.sessionID,
    turnID: input.replayTurnID,
    closeOnTerminalTurn: true,
    seed: replayRuntimeEvents({
      sessionID: input.sessionID,
      turnID: input.replayTurnID,
      sinceSeq: input.sinceSeq,
    }),
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let lastChunkAt = Date.now()

      const enqueue = (chunk: string) => {
        if (cancelled) return
        controller.enqueue(encoder.encode(chunk))
        lastChunkAt = Date.now()
      }

      const send = (event: string, data: unknown, id?: string) => {
        enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        enqueue(`: keepalive ${Date.now()}\n\n`)
      }

      void (async () => {
        let resolved: SessionStreamResult | undefined
        let failed: unknown
        let terminalEvent: RuntimeEvent.RuntimeEvent | undefined
        let executionDone = false

        const execution = input.execute()
          .then((value) => {
            resolved = value
            executionDone = true
          })
          .catch((error) => {
            failed = error
            executionDone = true
          })
        let nextEventPromise = subscription.next()

        while (!cancelled) {
          const timeoutMs = Math.max(0, heartbeatIntervalMs - (Date.now() - lastChunkAt))
          const next = await Promise.race([
            nextEventPromise.then((event) => ({ type: "event" as const, event })),
            sleep(timeoutMs).then(() => ({ type: "heartbeat" as const })),
          ])

          if (next.type === "heartbeat") {
            if (executionDone) {
              break
            }
            sendKeepalive()
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          const sseID = runtimeEventSSEID(next.event)
          for (const rendererEvent of StreamMapper.toRendererStreamEvents(next.event)) {
            send(rendererEvent.event, rendererEvent.data, sseID)
          }

          if (RuntimeEvent.isTerminalRuntimeEvent(next.event)) {
            terminalEvent = next.event
            break
          }
        }

        await execution

        if (!cancelled) {
          if (terminalEvent) {
            // terminal runtime events already mapped to renderer events
          } else if (failed) {
            log.error("session execution stream failed", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              error: normalizeLogError(failed),
            })
            send("error", {
              sessionID: input.sessionID,
              message: failed instanceof Error ? failed.message : String(failed),
            })
          } else if (resolved) {
            log.warn("session execution stream completed without terminal runtime event", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              assistantMessageID: resolved.info.id,
              partCount: resolved.parts.length,
            })
            send("done", {
              sessionID: input.sessionID,
              message: resolved.info,
              parts: resolved.parts,
            })
          } else {
            log.error("session execution stream exited without result", {
              sessionID: input.sessionID,
              requestId: input.requestId,
            })
            send("error", {
              sessionID: input.sessionID,
              message: "Prompt exited unexpectedly",
            })
          }
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch((error) => {
        log.error("session execution stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        send("error", {
          sessionID: input.sessionID,
          message: error instanceof Error ? error.message : String(error),
        })
        subscription.close()
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      subscription.close()
      input.cancel()
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
