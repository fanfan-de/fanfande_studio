import * as Identifier from "#id/id.ts"
import * as EventStore from "#session/runtime/event-store.ts"
import * as RuntimeEvent from "#session/runtime/runtime-event.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "session.orchestrator" })

type PendingStreamEvent = {
  [TType in RuntimeEvent.TransientStreamEventType]: {
    type: TType
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType]
  }
}[RuntimeEvent.TransientStreamEventType]

type PendingDeltaStreamEventType = "text.part.delta" | "reasoning.part.delta" | "tool.input.delta"

type PendingDeltaStreamEvent = PendingStreamEvent & {
  type: PendingDeltaStreamEventType
  payload: RuntimeEvent.RuntimeEventPayloadByType[PendingDeltaStreamEventType]
}

function isPendingDeltaStreamEvent(event: PendingStreamEvent): event is PendingDeltaStreamEvent {
  return event.type === "text.part.delta" || event.type === "reasoning.part.delta" || event.type === "tool.input.delta"
}

function canCoalescePendingStreamEvent(current: PendingStreamEvent, next: PendingStreamEvent) {
  if (!isPendingDeltaStreamEvent(current) || !isPendingDeltaStreamEvent(next)) return false
  if (current.type !== next.type) return false
  if (current.type === "tool.input.delta" && next.type === "tool.input.delta") {
    return (
      current.payload.messageID === next.payload.messageID &&
      current.payload.partID === next.payload.partID &&
      current.payload.toolCallID === next.payload.toolCallID
    )
  }

  return (
    current.payload.messageID === next.payload.messageID &&
    current.payload.partID === next.payload.partID
  )
}

function coalescePendingStreamEvent(current: PendingDeltaStreamEvent, next: PendingDeltaStreamEvent): PendingDeltaStreamEvent {
  return {
    type: next.type,
    payload: {
      ...next.payload,
      delta: current.payload.delta + next.payload.delta,
    },
  } as PendingDeltaStreamEvent
}

export interface TurnContext {
  readonly sessionID: string
  readonly turnID: string
  emit<TType extends RuntimeEvent.RuntimeEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ): RuntimeEvent.RuntimeEvent
  emitStream<TType extends RuntimeEvent.TransientStreamEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ): void
  flushStreamEvents(): void
  close(): void
}

const activeTurns = new Map<string, TurnRuntime>()

class TurnRuntime implements TurnContext {
  readonly sessionID: string
  readonly turnID: string
  private readonly factory: ReturnType<typeof RuntimeEvent.createRuntimeEventFactory>
  private readonly pendingStreamEvents: PendingStreamEvent[] = []
  private streamFlushScheduled = false
  private closed = false
  private terminalEvent: RuntimeEvent.RuntimeEvent | undefined

  constructor(input: { sessionID: string; turnID: string }) {
    this.sessionID = input.sessionID
    this.turnID = input.turnID
    this.factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID: input.sessionID,
      turnID: input.turnID,
    })
  }

  emit<TType extends RuntimeEvent.RuntimeEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ) {
    if (this.closed) {
      throw new Error(`Turn '${this.turnID}' is already closed.`)
    }

    if (this.terminalEvent) {
      return this.terminalEvent
    }

    this.flushStreamEvents()
    const event = this.emitNow(type, payload)

    if (RuntimeEvent.isTerminalRuntimeEvent(event)) {
      this.terminalEvent = event
    }

    return event
  }

  emitStream<TType extends RuntimeEvent.TransientStreamEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ) {
    if (this.closed || this.terminalEvent) return

    const next = { type, payload } as PendingStreamEvent
    const previous = this.pendingStreamEvents[this.pendingStreamEvents.length - 1]
    if (previous && canCoalescePendingStreamEvent(previous, next)) {
      this.pendingStreamEvents[this.pendingStreamEvents.length - 1] = coalescePendingStreamEvent(
        previous as PendingDeltaStreamEvent,
        next as PendingDeltaStreamEvent,
      )
    } else {
      this.pendingStreamEvents.push(next)
    }
    this.scheduleStreamFlush()
  }

  flushStreamEvents() {
    this.streamFlushScheduled = false

    while (!this.terminalEvent && this.pendingStreamEvents.length > 0) {
      const pending = this.pendingStreamEvents.shift()!
      this.emitNow(
        pending.type as RuntimeEvent.TransientStreamEventType,
        pending.payload as RuntimeEvent.RuntimeEventPayloadByType[RuntimeEvent.TransientStreamEventType],
      )
    }
  }

  close() {
    if (this.closed) return
    this.flushStreamEvents()
    this.closed = true

    const current = activeTurns.get(this.sessionID)
    if (current?.turnID === this.turnID) {
      activeTurns.delete(this.sessionID)
    }
  }

  private emitNow<TType extends RuntimeEvent.RuntimeEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ) {
    const event = this.factory.next(type, payload)
    EventStore.appendAndProject(event)
    return event
  }

  private scheduleStreamFlush() {
    if (this.streamFlushScheduled) return
    this.streamFlushScheduled = true

    setTimeout(() => {
      try {
        this.flushStreamEvents()
      } catch (error) {
        log.error("failed to flush stream runtime events", { error })
      }
    }, 0)
  }
}

export function startTurn(input: {
  sessionID: string
  userMessageID?: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
  resume?: boolean
}) {
  if (activeTurns.has(input.sessionID)) {
    throw new Error(`Session '${input.sessionID}' already has an active turn.`)
  }

  const turn = new TurnRuntime({
    sessionID: input.sessionID,
    turnID: Identifier.ascending("turn"),
  })
  activeTurns.set(input.sessionID, turn)
  turn.emit("turn.started", {
    userMessageID: input.userMessageID,
    agent: input.agent,
    model: input.model,
    resume: input.resume,
  })
  return turn
}

export function activeTurn(sessionID: string) {
  return activeTurns.get(sessionID)
}

export function finishTurn(turn: TurnContext) {
  turn.close()
}
