import * as Identifier from "#id/id.ts"
import * as EventStore from "#session/event-store.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"

export interface TurnContext {
  readonly sessionID: string
  readonly turnID: string
  emit<TType extends RuntimeEvent.RuntimeEventType>(
    type: TType,
    payload: RuntimeEvent.RuntimeEventPayloadByType[TType],
  ): RuntimeEvent.RuntimeEvent
  close(): void
}

const activeTurns = new Map<string, TurnRuntime>()

class TurnRuntime implements TurnContext {
  readonly sessionID: string
  readonly turnID: string
  private readonly factory: ReturnType<typeof RuntimeEvent.createRuntimeEventFactory>
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

    const event = this.factory.next(type, payload)
    EventStore.appendAndProject(event)

    if (RuntimeEvent.isTerminalRuntimeEvent(event)) {
      this.terminalEvent = event
    }

    return event
  }

  close() {
    if (this.closed) return
    this.closed = true

    const current = activeTurns.get(this.sessionID)
    if (current?.turnID === this.turnID) {
      activeTurns.delete(this.sessionID)
    }
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
