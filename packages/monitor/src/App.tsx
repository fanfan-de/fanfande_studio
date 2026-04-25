import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Eraser,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  TerminalSquare,
  Wifi,
  WifiOff,
} from "lucide-react"

const DEFAULT_BASE_URL = "http://127.0.0.1:4096"
const BASE_URL_STORAGE_KEY = "fanfande.monitor.baseURL"
const MAX_VISIBLE_LOGS = 300

type LoadState = "idle" | "loading" | "ready" | "error"
type StreamState = "idle" | "connecting" | "live" | "paused" | "error"
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

type ApiEnvelope<T> =
  | {
      success: true
      data: T
      requestId?: string
    }
  | {
      success: false
      error?: {
        code: string
        message: string
      }
      requestId?: string
    }

type LogEntry = {
  id: string
  timestamp: number
  level: LogLevel
  service: string | null
  message: string
  fields: Record<string, unknown>
  requestId?: string
  sessionID?: string
  raw: string
}

type DebugStatus = {
  ok: boolean
  generatedAt: number
  process: {
    pid: number
    uptimeMs: number
    platform: string
    memory: {
      rss: number
      heapTotal: number
      heapUsed: number
      external: number
      arrayBuffers?: number
    }
  }
  logging: {
    level?: string
    print?: boolean
    file?: boolean
    path?: string | null
  }
  runningSessions: {
    count: number
    items: Array<{
      sessionID: string
      startedAt: number
      activeForMs: number
      reason?: string
    }>
  }
  recentErrors: LogEntry[]
}

type RuntimeSnapshot = {
  generatedAt: number
  process: {
    pid: number
    uptimeMs: number
    platform: string
  }
  logging: unknown
  runningSessions: Array<{
    session: {
      id: string
      title?: string
      directory?: string
      missing?: boolean
    }
    status?: {
      type: "busy" | "idle"
      phase?: string
    }
    running?: {
      sessionID: string
      startedAt: number | null
      activeForMs: number
      reason?: string
    }
    activeTurnID?: string | null
    latestTurn?: {
      turnID: string
      status: string
      phase?: string
      durationMs?: number
      agent?: string
      model?: string
    } | null
    diagnostics?: {
      blockedOnApproval: boolean
      activeToolCount: number
      failedToolCount: number
      llmFailureCount: number
      lastErrorMessage?: string
    }
  }>
}

function normalizeBaseURL(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return DEFAULT_BASE_URL
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

function buildURL(baseURL: string, pathname: string, params?: Record<string, string | undefined>) {
  const url = new URL(pathname, `${normalizeBaseURL(baseURL)}/`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

async function fetchEnvelope<T>(baseURL: string, pathname: string, params?: Record<string, string | undefined>) {
  const response = await fetch(buildURL(baseURL, pathname, params))
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!response.ok || !envelope || envelope.success !== true) {
    const message =
      envelope && envelope.success === false && envelope.error?.message
        ? envelope.error.message
        : `Request failed (${response.status})`
    throw new Error(message)
  }

  return envelope.data
}

function readSavedBaseURL() {
  try {
    return localStorage.getItem(BASE_URL_STORAGE_KEY) || DEFAULT_BASE_URL
  } catch {
    return DEFAULT_BASE_URL
  }
}

function formatDuration(ms: number | undefined | null) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "-"
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatBytes(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  const units = ["B", "KB", "MB", "GB"]
  let next = value
  let unitIndex = 0
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024
    unitIndex += 1
  }
  return `${next.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp)
}

function MetricCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string
  tone?: "neutral" | "good" | "warn" | "bad"
  value: string
}) {
  return (
    <section className={`metric-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

function StatusPill({ state }: { state: LoadState | StreamState }) {
  const isGood = state === "ready" || state === "live"
  const isBad = state === "error"
  return (
    <span className={isBad ? "status-pill is-bad" : isGood ? "status-pill is-good" : "status-pill"}>
      {isGood ? <Wifi size={14} /> : isBad ? <WifiOff size={14} /> : <RefreshCw size={14} />}
      {state}
    </span>
  )
}

function LogLevelBadge({ level }: { level: LogLevel }) {
  return <span className={`log-level is-${level.toLowerCase()}`}>{level}</span>
}

export function App() {
  const [baseURLInput, setBaseURLInput] = useState(readSavedBaseURL)
  const [baseURL, setBaseURL] = useState(() => normalizeBaseURL(readSavedBaseURL()))
  const [status, setStatus] = useState<DebugStatus | null>(null)
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>("idle")
  const [streamState, setStreamState] = useState<StreamState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState("")
  const [serviceFilter, setServiceFilter] = useState("")
  const [queryFilter, setQueryFilter] = useState("")
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logListRef = useRef<HTMLDivElement | null>(null)

  const filterParams = useMemo(
    () => ({
      level: levelFilter || undefined,
      service: serviceFilter.trim() || undefined,
      q: queryFilter.trim() || undefined,
    }),
    [levelFilter, queryFilter, serviceFilter],
  )

  async function refreshSnapshot() {
    setLoadState("loading")
    setErrorMessage(null)

    try {
      const [nextStatus, nextRuntime, nextLogs] = await Promise.all([
        fetchEnvelope<DebugStatus>(baseURL, "/api/debug/status"),
        fetchEnvelope<RuntimeSnapshot>(baseURL, "/api/debug/runtime"),
        fetchEnvelope<{ logs: LogEntry[] }>(baseURL, "/api/debug/logs", {
          ...filterParams,
          limit: "200",
        }),
      ])

      setStatus(nextStatus)
      setRuntime(nextRuntime)
      setLogs(nextLogs.logs)
      setLoadState("ready")
    } catch (error) {
      setLoadState("error")
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function applyBaseURL() {
    const normalized = normalizeBaseURL(baseURLInput)
    setBaseURL(normalized)
    setBaseURLInput(normalized)
    try {
      localStorage.setItem(BASE_URL_STORAGE_KEY, normalized)
    } catch {
      // Ignore persistence failures in private or restricted contexts.
    }
  }

  useEffect(() => {
    void refreshSnapshot()
    const timer = window.setInterval(() => {
      void refreshSnapshot()
    }, 4000)

    return () => window.clearInterval(timer)
  }, [baseURL, filterParams])

  useEffect(() => {
    if (isPaused) {
      setStreamState("paused")
      return
    }

    setStreamState("connecting")
    const source = new EventSource(buildURL(baseURL, "/api/debug/logs/stream", filterParams))

    source.addEventListener("open", () => {
      setStreamState("live")
      setErrorMessage(null)
    })

    source.addEventListener("log", (event) => {
      const entry = JSON.parse((event as MessageEvent<string>).data) as LogEntry
      setLogs((current) => [...current, entry].slice(-MAX_VISIBLE_LOGS))
    })

    source.addEventListener("error", () => {
      setStreamState("error")
    })

    return () => {
      source.close()
    }
  }, [baseURL, filterParams, isPaused])

  useEffect(() => {
    if (!autoScroll) return
    const node = logListRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [autoScroll, logs])

  const recentErrors = status?.recentErrors ?? []
  const runningSessions = runtime?.runningSessions ?? []
  const serviceOptions = Array.from(new Set(logs.map((entry) => entry.service).filter(Boolean) as string[])).sort()

  return (
    <main className="monitor-shell">
      <header className="monitor-header">
        <div className="brand-block">
          <div className="brand-mark">
            <Server size={20} />
          </div>
          <div>
            <p>Fanfande Monitor</p>
            <h1>Backend diagnostics</h1>
          </div>
        </div>

        <form
          className="connection-form"
          onSubmit={(event) => {
            event.preventDefault()
            applyBaseURL()
          }}
        >
          <label>
            <span>Agent base URL</span>
            <input value={baseURLInput} onChange={(event) => setBaseURLInput(event.target.value)} />
          </label>
          <button type="submit">
            <CheckCircle2 size={16} />
            Connect
          </button>
          <button type="button" className="ghost-button" onClick={() => void refreshSnapshot()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </form>
      </header>

      {errorMessage ? (
        <section className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Connection issue</strong>
            <span>
              {errorMessage} at {baseURL}
            </span>
          </div>
        </section>
      ) : null}

      <section className="status-grid">
        <MetricCard label="Server" tone={status?.ok ? "good" : "bad"} value={status?.ok ? "online" : "offline"} />
        <MetricCard label="Snapshot" value={loadState} tone={loadState === "error" ? "bad" : loadState === "ready" ? "good" : "neutral"} />
        <MetricCard label="Log stream" value={streamState} tone={streamState === "error" ? "bad" : streamState === "live" ? "good" : "neutral"} />
        <MetricCard label="Running sessions" value={String(status?.runningSessions.count ?? 0)} />
        <MetricCard label="Uptime" value={formatDuration(status?.process.uptimeMs)} />
        <MetricCard label="Heap used" value={formatBytes(status?.process.memory.heapUsed)} tone="warn" />
      </section>

      <section className="main-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>Running sessions</h2>
            </div>
            <StatusPill state={loadState} />
          </div>

          <div className="session-list">
            {runningSessions.length > 0 ? (
              runningSessions.map((item) => (
                <article key={item.session.id} className="session-row">
                  <div className="session-title">
                    <Activity size={16} />
                    <div>
                      <strong>{item.session.title || item.session.id}</strong>
                      <span>{item.session.directory || "No directory"}</span>
                    </div>
                  </div>
                  <div className="session-meta">
                    <span>{item.status?.phase || item.latestTurn?.phase || "running"}</span>
                    <span>{formatDuration(item.running?.activeForMs)}</span>
                    <span>{item.latestTurn?.model || "model pending"}</span>
                  </div>
                  {item.diagnostics?.lastErrorMessage ? (
                    <p className="session-error">{item.diagnostics.lastErrorMessage}</p>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">No sessions are running right now.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Errors</p>
              <h2>Recent failures</h2>
            </div>
            <span className="count-badge">{recentErrors.length}</span>
          </div>

          <div className="error-list">
            {recentErrors.length > 0 ? (
              recentErrors.map((entry) => (
                <article key={entry.id} className="error-row">
                  <div>
                    <strong>{entry.service || "unknown"}</strong>
                    <time>{formatTime(entry.timestamp)}</time>
                  </div>
                  <p>{entry.message}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">No recent errors in the in-memory log buffer.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel log-panel">
        <div className="panel-header log-header">
          <div>
            <p className="eyebrow">Logs</p>
            <h2>Live server output</h2>
          </div>
          <div className="log-actions">
            <StatusPill state={streamState} />
            <button type="button" className="icon-button" title={isPaused ? "Resume stream" : "Pause stream"} onClick={() => setIsPaused((value) => !value)}>
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button type="button" className="icon-button" title="Clear visible logs" onClick={() => setLogs([])}>
              <Eraser size={16} />
            </button>
          </div>
        </div>

        <div className="log-toolbar">
          <label className="select-field">
            <span>Level</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="">All</option>
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>
          </label>
          <label className="select-field">
            <span>Service</span>
            <input list="service-options" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} placeholder="Any service" />
            <datalist id="service-options">
              {serviceOptions.map((service) => (
                <option key={service} value={service} />
              ))}
            </datalist>
          </label>
          <label className="search-field">
            <Search size={16} />
            <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="Search message, requestId, sessionID" />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
            Auto scroll
          </label>
        </div>

        <div className="log-list" ref={logListRef}>
          {logs.length > 0 ? (
            logs.map((entry) => (
              <article key={entry.id} className="log-row">
                <div className="log-row-main">
                  <time>{formatTime(entry.timestamp)}</time>
                  <LogLevelBadge level={entry.level} />
                  <span className="log-service">{entry.service || "unknown"}</span>
                  <p>{entry.message}</p>
                </div>
                <div className="log-row-meta">
                  {entry.requestId ? <span>req {entry.requestId}</span> : null}
                  {entry.sessionID ? <span>session {entry.sessionID}</span> : null}
                  <button
                    type="button"
                    className="icon-button is-small"
                    title="Copy raw log line"
                    onClick={() => void navigator.clipboard?.writeText(entry.raw)}
                  >
                    <Clipboard size={14} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-log-state">
              <TerminalSquare size={22} />
              <span>No logs match the current filters.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
