import * as RuntimeEvent from "#session/runtime/runtime-event.ts"
import {
  getSessionLimits,
  SessionLimitError,
} from "#session/runtime/session-limits.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "session.live-stream" })
const MAX_SUBSCRIPTION_QUEUE_EVENTS = 1000

const metrics = {
  coalescedEvents: 0,
  droppedEvents: 0,
  closedSlowClients: 0,
  maxQueueLength: 0,
}

type SubscriberOptions = {
  sessionID: string
  turnID?: string
  closeOnTerminalTurn?: boolean
  seed?: RuntimeEvent.RuntimeEvent[]
}

type PendingResolver = (event: RuntimeEvent.RuntimeEvent | undefined) => void

export interface LiveStreamSubscription {
  next(): Promise<RuntimeEvent.RuntimeEvent | undefined>
  close(): void
}

type StreamDeltaEvent = RuntimeEvent.RuntimeEvent & {
  type: "text.part.delta" | "reasoning.part.delta" | "tool.input.delta"
  payload:
    | RuntimeEvent.RuntimeEventPayloadByType["text.part.delta"]
    | RuntimeEvent.RuntimeEventPayloadByType["reasoning.part.delta"]
    | RuntimeEvent.RuntimeEventPayloadByType["tool.input.delta"]
}

function isStreamDeltaEvent(event: RuntimeEvent.RuntimeEvent): event is StreamDeltaEvent {
  return event.type === "text.part.delta" || event.type === "reasoning.part.delta" || event.type === "tool.input.delta"
}

function canCoalesceStreamDeltaEvent(current: RuntimeEvent.RuntimeEvent, next: RuntimeEvent.RuntimeEvent) {
  if (!isStreamDeltaEvent(current) || !isStreamDeltaEvent(next)) return false
  if (current.type !== next.type) return false
  if (current.type === "tool.input.delta" && next.type === "tool.input.delta") {
    return (
      current.sessionID === next.sessionID &&
      current.turnID === next.turnID &&
      current.payload.messageID === next.payload.messageID &&
      current.payload.partID === next.payload.partID &&
      current.payload.toolCallID === next.payload.toolCallID
    )
  }

  return (
    current.sessionID === next.sessionID &&
    current.turnID === next.turnID &&
    current.payload.messageID === next.payload.messageID &&
    current.payload.partID === next.payload.partID
  )
}

function coalesceStreamDeltaEvent(current: StreamDeltaEvent, next: StreamDeltaEvent): StreamDeltaEvent {
  return {
    ...next,
    payload: {
      ...next.payload,
      delta: current.payload.delta + next.payload.delta,
    },
  } as StreamDeltaEvent
}

function noteQueueLength(length: number) {
  if (length > metrics.maxQueueLength) {
    metrics.maxQueueLength = length
  }
}

function noteCoalescedEvent(sessionID: string, queueLength: number) {
  metrics.coalescedEvents += 1
  if (metrics.coalescedEvents % 1000 === 0) {
    log.warn("coalesced many stream events for slow subscribers", {
      sessionID,
      coalescedEvents: metrics.coalescedEvents,
      queueLength,
    })
  }
}

function noteDroppedEvent(sessionID: string, queueLength: number) {
  metrics.droppedEvents += 1
  if (metrics.droppedEvents % 100 === 0) {
    log.warn("dropped transient stream events for slow subscribers", {
      sessionID,
      droppedEvents: metrics.droppedEvents,
      queueLength,
    })
  }
}

class Subscription implements LiveStreamSubscription {
  readonly sessionID: string
  readonly turnID?: string
  readonly closeOnTerminalTurn: boolean
  private readonly queue: RuntimeEvent.RuntimeEvent[] = []
  private readonly waiters: PendingResolver[] = []
  private closed = false

  constructor(options: SubscriberOptions) {
    this.sessionID = options.sessionID
    this.turnID = options.turnID
    this.closeOnTerminalTurn = options.closeOnTerminalTurn ?? true
    for (const event of options.seed ?? []) {
      this.queue.push(event)
    }
  }

  matches(event: RuntimeEvent.RuntimeEvent) {
    if (event.sessionID !== this.sessionID) return false
    if (this.turnID && event.turnID !== this.turnID) return false
    return true
  }

  push(event: RuntimeEvent.RuntimeEvent) {
    if (this.closed || !this.matches(event)) return

    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(event)
    } else {
      this.enqueue(event)
    }

    if (this.closeOnTerminalTurn && RuntimeEvent.isTerminalRuntimeEvent(event)) {
      this.close()
    }
  }

  private enqueue(event: RuntimeEvent.RuntimeEvent) {
    if (this.coalesceQueuedEvent(event)) return

    if (this.queue.length >= MAX_SUBSCRIPTION_QUEUE_EVENTS && !this.makeRoomFor()) {
      metrics.closedSlowClients += 1
      log.warn("closing slow stream subscriber with a full queue", {
        sessionID: this.sessionID,
        turnID: this.turnID,
        queueLength: this.queue.length,
        eventType: event.type,
        closedSlowClients: metrics.closedSlowClients,
      })
      this.close()
      return
    }

    this.queue.push(event)
    noteQueueLength(this.queue.length)
  }

  private coalesceQueuedEvent(event: RuntimeEvent.RuntimeEvent) {
    if (!isStreamDeltaEvent(event)) return false

    const last = this.queue[this.queue.length - 1]
    if (!last || !canCoalesceStreamDeltaEvent(last, event)) return false

    this.queue[this.queue.length - 1] = coalesceStreamDeltaEvent(last as StreamDeltaEvent, event)
    noteCoalescedEvent(this.sessionID, this.queue.length)
    return true
  }

  private makeRoomFor() {
    const dropIndex = this.queue.findIndex((queued) => isStreamDeltaEvent(queued))
    if (dropIndex === -1) return false

    this.queue.splice(dropIndex, 1)
    noteDroppedEvent(this.sessionID, this.queue.length)
    return true
  }

  async next() {
    if (this.queue.length > 0) {
      return this.queue.shift()
    }

    if (this.closed) {
      return undefined
    }

    return new Promise<RuntimeEvent.RuntimeEvent | undefined>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  close() {
    if (this.closed) return
    this.closed = true

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      waiter?.(undefined)
    }
  }

  isClosed() {
    return this.closed
  }

  queueLength() {
    return this.queue.length
  }
}

const subscriptionsBySession = new Map<string, Set<Subscription>>()

function subscriptionsForSession(sessionID: string) {
  let current = subscriptionsBySession.get(sessionID)
  if (!current) {
    current = new Set<Subscription>()
    subscriptionsBySession.set(sessionID, current)
  }
  return current
}

function activeSubscriptionCount() {
  let count = 0
  for (const subscriptions of subscriptionsBySession.values()) {
    count += subscriptions.size
  }
  return count
}

export function publish(event: RuntimeEvent.RuntimeEvent) {
  const subscribers = subscriptionsBySession.get(event.sessionID)
  if (!subscribers || subscribers.size === 0) return event

  for (const subscriber of [...subscribers]) {
    subscriber.push(event)
    if (subscriber.isClosed()) {
      subscribers.delete(subscriber)
    }
  }

  if (subscribers.size === 0) {
    subscriptionsBySession.delete(event.sessionID)
  }

  return event
}

export function subscribe(options: SubscriberOptions): LiveStreamSubscription {
  const existingSessionSubscriptions = subscriptionsBySession.get(options.sessionID)
  const limits = getSessionLimits()
  if (activeSubscriptionCount() >= limits.maxStreamSubscribers) {
    throw new SessionLimitError(
      "SESSION_STREAM_SUBSCRIBER_LIMIT",
      `At most ${limits.maxStreamSubscribers} session stream subscribers can be active.`,
      limits.maxStreamSubscribers,
    )
  }
  if ((existingSessionSubscriptions?.size ?? 0) >= limits.maxStreamSubscribersPerSession) {
    throw new SessionLimitError(
      "SESSION_STREAM_SUBSCRIBER_LIMIT",
      `At most ${limits.maxStreamSubscribersPerSession} stream subscribers can be active for one session.`,
      limits.maxStreamSubscribersPerSession,
    )
  }

  const subscriber = new Subscription(options)
  const sessionSubscriptions = subscriptionsForSession(options.sessionID)
  sessionSubscriptions.add(subscriber)

  return {
    next: () => subscriber.next(),
    close: () => {
      subscriber.close()
      sessionSubscriptions.delete(subscriber)
      if (sessionSubscriptions.size === 0) {
        subscriptionsBySession.delete(options.sessionID)
      }
    },
  }
}

export function snapshot() {
  const sessions = [...subscriptionsBySession.entries()].map(([sessionID, subscriptions]) => {
    const queueLengths = [...subscriptions].map((subscription) => subscription.queueLength())
    return {
      sessionID,
      subscriptions: subscriptions.size,
      queuedEvents: queueLengths.reduce((sum, value) => sum + value, 0),
      maxQueueLength: queueLengths.length > 0 ? Math.max(...queueLengths) : 0,
    }
  })

  return {
    activeSubscriptions: sessions.reduce((sum, session) => sum + session.subscriptions, 0),
    sessions,
    totals: {
      ...metrics,
    },
  }
}
