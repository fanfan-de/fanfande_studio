type RunningSession = {
  abort: AbortController
}

const runningSessions: Record<string, RunningSession> = Object.create(null)

export type { RunningSession }

export function state() {
  return runningSessions
}

export function isRunning(sessionID: string) {
  return Boolean(runningSessions[sessionID])
}

export function register(sessionID: string, controller: AbortController) {
  if (runningSessions[sessionID]) return false

  runningSessions[sessionID] = {
    abort: controller,
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
