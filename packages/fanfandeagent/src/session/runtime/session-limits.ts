const DEFAULT_MAX_RUNNING = 8
const DEFAULT_MAX_RUNNING_PER_DIRECTORY = 4
const DEFAULT_MAX_QUEUE_OPS = 16
const DEFAULT_MAX_STREAM_SUBSCRIBERS = 128
const DEFAULT_MAX_STREAM_SUBSCRIBERS_PER_SESSION = 8

export type SessionLimitCode =
  | "SESSION_GLOBAL_CONCURRENCY_LIMIT"
  | "SESSION_DIRECTORY_CONCURRENCY_LIMIT"
  | "SESSION_QUEUE_LIMIT"
  | "SESSION_STREAM_SUBSCRIBER_LIMIT"

export class SessionLimitError extends Error {
  readonly code: SessionLimitCode
  readonly limit: number

  constructor(code: SessionLimitCode, message: string, limit: number) {
    super(message)
    this.name = "SessionLimitError"
    this.code = code
    this.limit = limit
  }
}

function positiveIntegerFromEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getSessionLimits() {
  return {
    maxRunning: positiveIntegerFromEnv("FanFande_SESSION_MAX_RUNNING", DEFAULT_MAX_RUNNING),
    maxRunningPerDirectory: positiveIntegerFromEnv(
      "FanFande_SESSION_MAX_RUNNING_PER_DIRECTORY",
      DEFAULT_MAX_RUNNING_PER_DIRECTORY,
    ),
    maxQueueOps: positiveIntegerFromEnv("FanFande_SESSION_MAX_QUEUE_OPS", DEFAULT_MAX_QUEUE_OPS),
    maxStreamSubscribers: positiveIntegerFromEnv(
      "FanFande_SESSION_MAX_STREAM_SUBSCRIBERS",
      DEFAULT_MAX_STREAM_SUBSCRIBERS,
    ),
    maxStreamSubscribersPerSession: positiveIntegerFromEnv(
      "FanFande_SESSION_MAX_STREAM_SUBSCRIBERS_PER_SESSION",
      DEFAULT_MAX_STREAM_SUBSCRIBERS_PER_SESSION,
    ),
  }
}

export function isSessionLimitError(error: unknown): error is SessionLimitError {
  return error instanceof SessionLimitError
}
