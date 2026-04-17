type RunningSession = {
  abort: AbortController
  startedAt?: number
  reason?: string
}

const runningSessions: Record<string, RunningSession> = Object.create(null)

export type { RunningSession }

export type RunningSessionSnapshot = {
  sessionID: string
  startedAt: number
  activeForMs: number
  reason?: string
}

export function state() {
  return runningSessions
}

export function isRunning(sessionID: string) {
  return Boolean(runningSessions[sessionID])
}

export function info(sessionID: string): RunningSessionSnapshot | null {
  const current = runningSessions[sessionID]
  if (!current) return null
  const startedAt = current.startedAt ?? Date.now()

  return {
    sessionID,
    startedAt,
    activeForMs: Math.max(0, Date.now() - startedAt),
    reason: current.reason,
  }
}

export function snapshot(): RunningSessionSnapshot[] {
  return Object.keys(runningSessions)
    .map((sessionID) => info(sessionID))
    .filter((value): value is RunningSessionSnapshot => Boolean(value))
    .sort((left, right) => left.startedAt - right.startedAt)
}

export function register(
  sessionID: string,
  controller: AbortController,
  options?: {
    startedAt?: number
    reason?: string
  },
) {
  if (runningSessions[sessionID]) return false

  runningSessions[sessionID] = {
    abort: controller,
    startedAt: options?.startedAt ?? Date.now(),
    reason: options?.reason,
  }
  return true
}

export function finish(sessionID: string, controller?: AbortController) {
  const current = runningSessions[sessionID]
  if (!current) return
  if (controller && current.abort !== controller) return

  delete runningSessions[sessionID]
}

export async function waitForStop(sessionID: string) {
  while (isRunning(sessionID)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

export function cancel(sessionID: string) {
  const current = runningSessions[sessionID]
  if (!current) return false

  current.abort.abort()
  delete runningSessions[sessionID]
  return true
}
