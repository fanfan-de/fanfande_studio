import * as EventStore from "#session/runtime/event-store.ts"
import * as Identifier from "#id/id.ts"
import * as LiveStreamHub from "#session/runtime/live-stream-hub.ts"
import * as Message from "#session/core/message.ts"
import * as Orchestrator from "#session/runtime/orchestrator.ts"
import * as RuntimeEvent from "#session/runtime/runtime-event.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.session" })
const STREAM_HEARTBEAT_INTERVAL_MS = 3000
const STREAM_BACKPRESSURE_TIMEOUT_MS = 30_000
const STREAM_BACKPRESSURE_POLL_MS = 25

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

async function waitForControllerCapacity(
  controller: ReadableStreamDefaultController<Uint8Array>,
  input: {
    sessionID: string
    requestId?: string
    streamType: "event" | "execution"
  },
) {
  if ((controller.desiredSize ?? 1) > 0) return true

  const startedAt = Date.now()
  while (Date.now() - startedAt < STREAM_BACKPRESSURE_TIMEOUT_MS) {
    await sleep(STREAM_BACKPRESSURE_POLL_MS)
    if ((controller.desiredSize ?? 1) > 0) return true
  }

  log.warn("closing slow session stream client", {
    sessionID: input.sessionID,
    requestId: input.requestId,
    streamType: input.streamType,
    desiredSize: controller.desiredSize,
    timeoutMs: STREAM_BACKPRESSURE_TIMEOUT_MS,
  })
  return false
}

async function sendRuntimeEvent(
  send: (event: string, data: unknown, id?: string) => Promise<boolean>,
  event: RuntimeEvent.RuntimeEvent,
) {
  return send("runtime", event, runtimeEventSSEID(event))
}

function createTransportTerminalEvent(input: {
  sessionID: string
  turnID?: string
  seq?: number
  type: "turn.completed" | "turn.failed"
  payload:
    | RuntimeEvent.RuntimeEventPayloadByType["turn.completed"]
    | RuntimeEvent.RuntimeEventPayloadByType["turn.failed"]
}) {
  return RuntimeEvent.RuntimeEvent.parse({
    eventID: Identifier.ascending("event"),
    sessionID: input.sessionID,
    turnID: input.turnID ?? Identifier.ascending("turn"),
    seq: input.seq ?? 1,
    timestamp: Date.now(),
    type: input.type,
    payload: input.payload,
  })
}

function cancelActiveRuntimeTurn(input: {
  sessionID: string
  reason: RuntimeEvent.RuntimeEventPayloadByType["turn.cancelled"]["reason"]
  detail?: string
}) {
  const turn = Orchestrator.activeTurn(input.sessionID)
  if (!turn) return

  try {
    turn.emit("turn.state.changed", {
      phase: "cancelled",
      reason: input.detail ?? input.reason,
    })
    turn.emit("turn.cancelled", {
      reason: input.reason,
      detail: input.detail,
    })
  } catch (error) {
    log.warn("failed to emit runtime cancellation event", {
      sessionID: input.sessionID,
      error: normalizeLogError(error),
    })
  }
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

      const closeSlowClient = () => {
        cancelled = true
        subscription.close()
        try {
          controller.close()
        } catch {
          // The stream may already be closed by the runtime.
        }
      }

      const enqueue = async (chunk: string) => {
        if (cancelled) return false
        if (!await waitForControllerCapacity(controller, {
          sessionID: input.sessionID,
          requestId: input.requestId,
          streamType: "event",
        })) {
          closeSlowClient()
          return false
        }

        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cancelled = true
          subscription.close()
          return false
        }

        lastChunkAt = Date.now()
        return true
      }

      const send = (event: string, data: unknown, id?: string) => {
        return enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        return enqueue(`: keepalive ${Date.now()}\n\n`)
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
            if (!await sendKeepalive()) break
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          if (!await sendRuntimeEvent(send, next.event)) break
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch(async (error) => {
        log.error("session event stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        await sendRuntimeEvent(send, createTransportTerminalEvent({
          sessionID: input.sessionID,
          type: "turn.failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
            phase: "stream",
            retryable: true,
          },
        }))
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

      const closeSlowClient = () => {
        cancelled = true
        subscription.close()
        try {
          controller.close()
        } catch {
          // The stream may already be closed by the runtime.
        }
      }

      const enqueue = async (chunk: string) => {
        if (cancelled) return false
        if (!await waitForControllerCapacity(controller, {
          sessionID: input.sessionID,
          requestId: input.requestId,
          streamType: "execution",
        })) {
          closeSlowClient()
          return false
        }

        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cancelled = true
          subscription.close()
          return false
        }

        lastChunkAt = Date.now()
        return true
      }

      const send = (event: string, data: unknown, id?: string) => {
        return enqueue(toSSE(event, data, id))
      }

      const sendKeepalive = () => {
        return enqueue(`: keepalive ${Date.now()}\n\n`)
      }

      void (async () => {
        let resolved: SessionStreamResult | undefined
        let failed: unknown
        let terminalEvent: RuntimeEvent.RuntimeEvent | undefined
        let observedTurnID = input.replayTurnID
        let observedSeq = input.sinceSeq ?? 0
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
            if (!await sendKeepalive()) break
            continue
          }

          nextEventPromise = subscription.next()

          if (!next.event) {
            break
          }

          observedTurnID = next.event.turnID
          observedSeq = Math.max(observedSeq, next.event.seq)
          if (!await sendRuntimeEvent(send, next.event)) break

          if (RuntimeEvent.isTerminalRuntimeEvent(next.event)) {
            terminalEvent = next.event
            break
          }
        }

        if (!cancelled) {
          await execution
        }

        if (!cancelled) {
          if (terminalEvent) {
            // terminal runtime events already mapped to renderer events
          } else if (failed) {
            log.error("session execution stream failed", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              error: normalizeLogError(failed),
            })
            await sendRuntimeEvent(send, createTransportTerminalEvent({
              sessionID: input.sessionID,
              turnID: observedTurnID,
              seq: observedSeq + 1,
              type: "turn.failed",
              payload: {
                error: failed instanceof Error ? failed.message : String(failed),
                phase: "execution",
                retryable: false,
              },
            }))
          } else if (resolved) {
            log.warn("session execution stream completed without terminal runtime event", {
              sessionID: input.sessionID,
              requestId: input.requestId,
              assistantMessageID: resolved.info.id,
              partCount: resolved.parts.length,
            })
            await sendRuntimeEvent(send, createTransportTerminalEvent({
              sessionID: input.sessionID,
              turnID: observedTurnID,
              seq: observedSeq + 1,
              type: "turn.completed",
              payload: {
                status: "completed",
                message: resolved.info,
                parts: resolved.parts,
              },
            }))
          } else {
            log.error("session execution stream exited without result", {
              sessionID: input.sessionID,
              requestId: input.requestId,
            })
            await sendRuntimeEvent(send, createTransportTerminalEvent({
              sessionID: input.sessionID,
              turnID: observedTurnID,
              seq: observedSeq + 1,
              type: "turn.failed",
              payload: {
                error: "Prompt exited unexpectedly",
                phase: "execution",
                retryable: true,
              },
            }))
          }
        }

        subscription.close()
        if (!cancelled) controller.close()
      })().catch(async (error) => {
        log.error("session execution stream crashed", {
          sessionID: input.sessionID,
          requestId: input.requestId,
          error: normalizeLogError(error),
        })
        await sendRuntimeEvent(send, createTransportTerminalEvent({
          sessionID: input.sessionID,
          turnID: input.replayTurnID,
          type: "turn.failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
            phase: "stream",
            retryable: true,
          },
        }))
        subscription.close()
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      cancelActiveRuntimeTurn({
        sessionID: input.sessionID,
        reason: "client-disconnect",
        detail: "Execution stream was cancelled by the client.",
      })
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
