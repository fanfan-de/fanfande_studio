import * as Orchestrator from "#session/runtime/orchestrator.ts"
import * as Identifier from "#id/id.ts"
import {
  getSessionLimits,
  SessionLimitError,
} from "#session/runtime/session-limits.ts"

export type SessionRunnerStatus = "idle" | "running" | "cancelling" | "stopped"
export type SessionOperationType = "prompt" | "resume"
export type SessionExecutionMode = "new-turn" | "queued" | "steer"

export type PromptRuntime = {
  sessionID: string
  turnID: string
  controller: AbortController
  abort: AbortSignal
}

export type SessionExecutionHandle<T> = {
  sessionID: string
  turnID: string
  mode: SessionExecutionMode
  promise: Promise<T>
  cancel: () => void
}

export type SessionRunnerSnapshot = {
  sessionID: string
  status: SessionRunnerStatus
  startedAt: number | null
  activeForMs: number
  reason?: SessionOperationType
  activeTurnID: string | null
  directory?: string
  queueLength: number
  queuedOpCount: number
  pendingSteerCount: number
}

export type SessionRunnerEvent = {
  type: "registered" | "finished" | "cancelled" | "queued" | "steered"
  sessionID: string
}

type QueuedOperation<T> = {
  type: SessionOperationType
  sessionID: string
  directory: string
  turnID: string
  execute: (runtime: PromptRuntime) => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  cancelled: boolean
}

type ActiveOperation = {
  type: SessionOperationType
  directory: string
  turnID: string
  controller: AbortController
  startedAt: number
  pendingSteerCount: number
  pendingSteerWrites: Set<Promise<void>>
  promise: Promise<unknown>
}

type EnqueueOperationInput<T> = {
  sessionID: string
  directory: string
  type: SessionOperationType
  execute: (runtime: PromptRuntime) => Promise<T>
}

type EnqueuePromptInput<T> = EnqueueOperationInput<T> & {
  steer?: (input: { turn: Orchestrator.TurnContext }) => Promise<void>
}

const runners = new Map<string, SessionRunner>()
const subscribers = new Set<(event: SessionRunnerEvent) => void>()

function notify(event: SessionRunnerEvent) {
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(event)
    } catch {
      subscribers.delete(subscriber)
    }
  }
}

function activeRunnerSnapshots() {
  return [...runners.values()]
    .map((runner) => runner.snapshot())
    .filter((snapshot) => snapshot.status === "running" || snapshot.status === "cancelling")
}

function assertQueueCapacity(runner: SessionRunner) {
  const limits = getSessionLimits()
  if (runner.queueLength() >= limits.maxQueueOps) {
    throw new SessionLimitError(
      "SESSION_QUEUE_LIMIT",
      `Session '${runner.sessionID}' already has ${limits.maxQueueOps} queued operations.`,
      limits.maxQueueOps,
    )
  }
}

function assertRunningCapacity(directory: string) {
  const limits = getSessionLimits()
  const active = activeRunnerSnapshots()
  if (active.length >= limits.maxRunning) {
    throw new SessionLimitError(
      "SESSION_GLOBAL_CONCURRENCY_LIMIT",
      `At most ${limits.maxRunning} sessions can run concurrently.`,
      limits.maxRunning,
    )
  }

  const activeInDirectory = active.filter((snapshot) => snapshot.directory === directory).length
  if (activeInDirectory >= limits.maxRunningPerDirectory) {
    throw new SessionLimitError(
      "SESSION_DIRECTORY_CONCURRENCY_LIMIT",
      `At most ${limits.maxRunningPerDirectory} sessions can run concurrently in this directory.`,
      limits.maxRunningPerDirectory,
    )
  }
}

class SessionRunner {
  readonly sessionID: string
  private readonly queue: QueuedOperation<unknown>[] = []
  private statusValue: SessionRunnerStatus = "idle"
  private active: ActiveOperation | undefined
  private draining = false
  private idleWaiters: Array<() => void> = []

  constructor(sessionID: string) {
    this.sessionID = sessionID
  }

  status() {
    return this.statusValue
  }

  queueLength() {
    return this.queue.filter((op) => !op.cancelled).length
  }

  enqueue<T>(input: EnqueueOperationInput<T>): SessionExecutionHandle<T> {
    assertQueueCapacity(this)
    const turnID = Identifier.ascending("turn")
    const mode: SessionExecutionMode = this.active || this.statusValue === "cancelling" ? "queued" : "new-turn"

    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((innerResolve, innerReject) => {
      resolve = innerResolve
      reject = innerReject
    })

    const op: QueuedOperation<T> = {
      type: input.type,
      sessionID: input.sessionID,
      directory: input.directory,
      turnID,
      execute: input.execute,
      resolve,
      reject,
      cancelled: false,
    }

    this.queue.push(op as QueuedOperation<unknown>)
    notify({ type: "queued", sessionID: this.sessionID })
    this.drain()

    return {
      sessionID: input.sessionID,
      turnID,
      mode,
      promise,
      cancel: () => {
        if (this.removeQueued(turnID)) return
        if (this.active?.turnID === turnID) {
          this.cancel()
        }
      },
    }
  }

  enqueuePrompt<T>(input: EnqueuePromptInput<T>): SessionExecutionHandle<T> {
    const activeTurn = Orchestrator.activeTurn(input.sessionID)
    if (
      this.statusValue === "running" &&
      this.active &&
      activeTurn?.turnID === this.active.turnID &&
      activeTurn.canAcceptSteer() &&
      input.steer
    ) {
      const turnID = activeTurn.turnID
      const activePromise = this.active.promise as Promise<T>
      const steerWrite = input.steer({ turn: activeTurn }).then(() => {
        if (this.active?.turnID === turnID) {
          this.active.pendingSteerCount += 1
        }
        notify({ type: "steered", sessionID: this.sessionID })
      })
      this.active.pendingSteerWrites.add(steerWrite)
      steerWrite.finally(() => {
        this.active?.pendingSteerWrites.delete(steerWrite)
      }).catch(() => undefined)
      const promise = steerWrite.then(() => activePromise)

      return {
        sessionID: input.sessionID,
        turnID,
        mode: "steer",
        promise,
        cancel: () => {
          // Steer requests are already recorded as user messages. Disconnecting
          // their request stream must not abort the active turn.
        },
      }
    }

    return this.enqueue(input)
  }

  cancel() {
    if (!this.active) return false
    this.statusValue = "cancelling"
    this.active.controller.abort()
    notify({ type: "cancelled", sessionID: this.sessionID })
    return true
  }

  async consumePendingSteer(turnID: string) {
    if (!this.active || this.active.turnID !== turnID) return 0
    const pendingWrites = [...this.active.pendingSteerWrites]
    if (pendingWrites.length > 0) {
      await Promise.allSettled(pendingWrites)
    }
    if (!this.active || this.active.turnID !== turnID) return 0
    const count = this.active.pendingSteerCount
    this.active.pendingSteerCount = 0
    return count
  }

  waitForIdle() {
    if (!this.active && this.queueLength() === 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  snapshot(): SessionRunnerSnapshot {
    const startedAt = this.active?.startedAt ?? null
    return {
      sessionID: this.sessionID,
      status: this.statusValue,
      startedAt,
      activeForMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
      reason: this.active?.type,
      activeTurnID: this.active?.turnID ?? null,
      directory: this.active?.directory ?? this.queue.find((op) => !op.cancelled)?.directory,
      queueLength: this.queueLength(),
      queuedOpCount: this.queueLength(),
      pendingSteerCount: this.active?.pendingSteerCount ?? 0,
    }
  }

  private removeQueued(turnID: string) {
    const index = this.queue.findIndex((op) => op.turnID === turnID && !op.cancelled)
    if (index === -1) return false
    const [op] = this.queue.splice(index, 1)
    if (!op) return false
    op.cancelled = true
    op.reject(new Error("Session operation was cancelled before it started."))
    this.resolveIdleIfNeeded()
    return true
  }

  private drain() {
    if (this.draining) return
    this.draining = true
    queueMicrotask(() => {
      void this.drainLoop()
    })
  }

  private async drainLoop() {
    try {
      while (!this.active) {
        const op = this.queue.shift()
        if (!op) {
          this.statusValue = "idle"
          this.resolveIdleIfNeeded()
          break
        }

        if (op.cancelled) continue
        await this.runOperation(op)
      }
    } finally {
      this.draining = false
      if (!this.active && this.queueLength() > 0) {
        this.drain()
      }
    }
  }

  private async runOperation(op: QueuedOperation<unknown>) {
    try {
      assertRunningCapacity(op.directory)
    } catch (error) {
      op.reject(error)
      return
    }
    const controller = new AbortController()
    const startedAt = Date.now()
    const runtime: PromptRuntime = {
      sessionID: op.sessionID,
      turnID: op.turnID,
      controller,
      abort: controller.signal,
    }
    let resolveActive!: (value: unknown) => void
    let rejectActive!: (error: unknown) => void
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveActive = resolve
      rejectActive = reject
    })
    promise.catch(() => undefined)
    this.active = {
      type: op.type,
      directory: op.directory,
      turnID: op.turnID,
      controller,
      startedAt,
      pendingSteerCount: 0,
      pendingSteerWrites: new Set(),
      promise,
    }
    this.statusValue = "running"
    notify({ type: "registered", sessionID: this.sessionID })

    try {
      const value = await op.execute(runtime)
      resolveActive(value)
      op.resolve(value)
    } catch (error) {
      rejectActive(error)
      op.reject(error)
    } finally {
      if (this.active?.turnID === op.turnID) {
        this.active = undefined
      }
      notify({ type: "finished", sessionID: this.sessionID })
      this.statusValue = "idle"
      this.resolveIdleIfNeeded()
    }
  }

  private resolveIdleIfNeeded() {
    if (this.active || this.queueLength() > 0) return
    const waiters = this.idleWaiters.splice(0)
    for (const waiter of waiters) {
      waiter()
    }
  }
}

function getOrCreateRunner(sessionID: string) {
  let runner = runners.get(sessionID)
  if (!runner) {
    runner = new SessionRunner(sessionID)
    runners.set(sessionID, runner)
  }
  return runner
}

export function enqueuePrompt<T>(input: EnqueuePromptInput<T>): SessionExecutionHandle<T> {
  return getOrCreateRunner(input.sessionID).enqueuePrompt(input)
}

export function enqueueResume<T>(input: EnqueueOperationInput<T>): SessionExecutionHandle<T> {
  return getOrCreateRunner(input.sessionID).enqueue(input)
}

export function cancel(sessionID: string) {
  return runners.get(sessionID)?.cancel() ?? false
}

export function consumePendingSteer(sessionID: string, turnID: string) {
  return runners.get(sessionID)?.consumePendingSteer(turnID) ?? Promise.resolve(0)
}

export function waitForIdle(sessionID: string) {
  return runners.get(sessionID)?.waitForIdle() ?? Promise.resolve()
}

export function info(sessionID: string) {
  return runners.get(sessionID)?.snapshot() ?? null
}

export function snapshot() {
  return [...runners.values()]
    .map((runner) => runner.snapshot())
    .filter((item) => item.status === "running" || item.status === "cancelling" || item.queueLength > 0)
    .sort((left, right) => (left.startedAt ?? Number.MAX_SAFE_INTEGER) - (right.startedAt ?? Number.MAX_SAFE_INTEGER))
}

export function isRunning(sessionID: string) {
  const status = runners.get(sessionID)?.status()
  return status === "running" || status === "cancelling"
}

export function subscribe(subscriber: (event: SessionRunnerEvent) => void) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

export function runtimeLimitsSnapshot() {
  const limits = getSessionLimits()
  const active = activeRunnerSnapshots()
  const byDirectory = new Map<string, number>()
  for (const runner of active) {
    if (!runner.directory) continue
    byDirectory.set(runner.directory, (byDirectory.get(runner.directory) ?? 0) + 1)
  }

  return {
    limits,
    running: active.length,
    runningByDirectory: [...byDirectory.entries()].map(([directory, count]) => ({ directory, count })),
  }
}
