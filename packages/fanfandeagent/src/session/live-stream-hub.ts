import * as RuntimeEvent from "#session/runtime-event.ts"

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
      this.queue.push(event)
    }

    if (this.closeOnTerminalTurn && RuntimeEvent.isTerminalRuntimeEvent(event)) {
      this.close()
    }
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
