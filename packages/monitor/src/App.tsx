import {
  Activity,
  ChevronDown,
  CircleCheck,
  Clock3,
  Clipboard,
  Eraser,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  SquareTerminal,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react"
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react"

const DEFAULT_BASE_URL = "http://127.0.0.1:4096"
const BASE_URL_STORAGE_KEY = "fanfande.monitor.baseURL"
const MAX_VISIBLE_LOGS = 300

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

type LogEntry = {
  id: string
  timestamp: number
  level: LogLevel
  service?: string
  message: string
  raw: string
  requestId?: string
  sessionID?: string
  projectID?: string
  extra?: Record<string, unknown>
}

type MonitorStatus = {
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
      arrayBuffers: number
    }
  }
  logging: {
    level: string
    print: boolean
    file: boolean
    path: string | null
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
  runningSessions: RuntimeSession[]
}

type RuntimeSession = {
  session: {
    id: string
    title?: string
    directory?: string
  }
  running: {
    activeForMs: number
    reason?: string
  }
  status?: {
    type: "busy" | "idle"
    phase?: string
  }
  latestTurn?: {
    status?: string
    phase?: string
    model?: string
  } | null
  diagnostics?: {
    lastErrorMessage?: string
  }
}

type StatusStreamPayload = {
  status: MonitorStatus
  runtime: RuntimeSnapshot
}

type JsonEnvelope<T> =
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

type LoadState = "idle" | "loading" | "ready" | "error"
type StreamState = "idle" | "connecting" | "live" | "paused" | "error"

function normalizeBaseURL(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_BASE_URL
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

function readStoredBaseURL() {
  try {
    return window.localStorage.getItem(BASE_URL_STORAGE_KEY) || DEFAULT_BASE_URL
  } catch {
    return DEFAULT_BASE_URL
  }
}

function resolveURL(baseURL: string, pathname: string, query?: Record<string, string | undefined>) {
  const url = new URL(pathname, `${normalizeBaseURL(baseURL)}/`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

async function requestJSON<T>(baseURL: string, pathname: string, query?: Record<string, string | undefined>) {
  const response = await fetch(resolveURL(baseURL, pathname, query))
  const envelope = (await response.json().catch(() => null)) as JsonEnvelope<T> | null
  if (!response.ok || !envelope || envelope.success !== true) {
    const message = envelope && envelope.success === false && envelope.error?.message
      ? envelope.error.message
      : `Request failed (${response.status})`
    throw new Error(message)
  }
  return envelope.data
}

function formatDuration(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  if (value < 1000) return `${Math.max(0, Math.round(value))}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatBytes(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  const units = ["B", "KB", "MB", "GB"]
  let amount = value
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value)
}

function formatUpdateTime(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--:--:--"
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value)
}

function formatLogTimestamp(value: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  const timestamp = new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
  return `${timestamp}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function appendUniqueLogs(current: LogEntry[], nextEntry: LogEntry) {
  if (current.some((entry) => entry.id === nextEntry.id)) return current
  return [...current, nextEntry].slice(-MAX_VISIBLE_LOGS)
}

function mergeServiceOptions(current: string[], next: Array<string | undefined>) {
  const services = new Set(current)
  let changed = false

  for (const value of next) {
    const service = value?.trim()
    if (!service || services.has(service)) continue
    services.add(service)
    changed = true
  }

  return changed ? Array.from(services).sort((a, b) => a.localeCompare(b)) : current
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
  const Icon = isGood ? Wifi : isBad ? WifiOff : RefreshCw
  return (
    <span className={isBad ? "status-pill is-bad" : isGood ? "status-pill is-good" : "status-pill"}>
      <Icon size={14} />
      {state}
    </span>
  )
}

function LogLevelBadge({ level }: { level: LogLevel }) {
  return <span className={`log-level is-${level.toLowerCase()}`}>{level}</span>
}

const DETAIL_KEY_ORDER = [
  "method",
  "path",
  "status",
  "duration",
  "requestId",
  "sessionID",
  "projectID",
]

const DETAIL_LABELS: Record<string, string> = {
  duration: "duration",
  method: "method",
  path: "path",
  projectID: "project",
  requestId: "req",
  sessionID: "session",
  status: "status",
}

const HIDDEN_DETAIL_KEYS = new Set(["service"])

type LogDetailItem = {
  key: string
  label: string
  tone?: "good" | "warn" | "bad"
  value: string
}

function stringifyDetailValue(value: unknown) {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readDetailString(entry: LogEntry, key: string) {
  const value = entry.extra?.[key]
  const text = stringifyDetailValue(value)
  return text || undefined
}

function formatDetailValue(key: string, value: unknown) {
  if (key === "duration" && typeof value === "number") return formatDuration(value)
  return stringifyDetailValue(value)
}

function statusTone(value: unknown): LogDetailItem["tone"] {
  const status = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(status)) return undefined
  if (status >= 500) return "bad"
  if (status >= 400) return "warn"
  if (status >= 200 && status < 400) return "good"
  return undefined
}

function compareDetailKeys(left: string, right: string) {
  const leftIndex = DETAIL_KEY_ORDER.indexOf(left)
  const rightIndex = DETAIL_KEY_ORDER.indexOf(right)
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
  }
  return left.localeCompare(right)
}

function getLogHeadline(entry: LogEntry) {
  const method = readDetailString(entry, "method")?.toUpperCase()
  const path = readDetailString(entry, "path")
  if (method || path) return [method, path].filter(Boolean).join(" ")
  return entry.message || "(empty message)"
}

function getLogSubline(entry: LogEntry, headline: string) {
  if (!entry.message || entry.message === headline) return undefined
  return entry.message
}

function buildLogDetails(entry: LogEntry): LogDetailItem[] {
  const rawEntries = new Map<string, unknown>()

  for (const [key, value] of Object.entries(entry.extra ?? {})) {
    if (HIDDEN_DETAIL_KEYS.has(key) || value === undefined || value === null) continue
    rawEntries.set(key, value)
  }

  if (entry.requestId && !rawEntries.has("requestId")) rawEntries.set("requestId", entry.requestId)
  if (entry.sessionID && !rawEntries.has("sessionID")) rawEntries.set("sessionID", entry.sessionID)
  if (entry.projectID && !rawEntries.has("projectID")) rawEntries.set("projectID", entry.projectID)

  return Array.from(rawEntries.entries())
    .sort(([left], [right]) => compareDetailKeys(left, right))
    .map(([key, value]) => ({
      key,
      label: DETAIL_LABELS[key] ?? key,
      tone: key === "status" ? statusTone(value) : undefined,
      value: formatDetailValue(key, value),
    }))
    .filter((item) => item.value.length > 0)
}

function formatLogForClipboard(entry: LogEntry) {
  try {
    return JSON.stringify(entry, null, 2)
  } catch {
    return entry.raw
  }
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()
  const headline = getLogHeadline(entry)
  const subline = getLogSubline(entry, headline)
  const details = buildLogDetails(entry)
  const title = Number.isFinite(entry.timestamp) ? new Date(entry.timestamp).toISOString() : undefined

  return (
    <article className={`log-row is-${entry.level.toLowerCase()}${isExpanded ? " is-expanded" : ""}`}>
      <button
        type="button"
        className="log-row-toggle"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        title={isExpanded ? "Collapse log details" : "Expand log details"}
        onClick={() => setIsExpanded((value) => !value)}
      >
        <ChevronDown className="log-row-chevron" size={15} aria-hidden="true" />
        <span className="log-row-primary">
          <time className="log-time" title={title}>{formatLogTimestamp(entry.timestamp)}</time>
          <LogLevelBadge level={entry.level} />
          <span className="log-service">{entry.service || "unknown"}</span>
          <span className="log-message" title={headline}>{headline}</span>
          {details.length > 0 ? <span className="log-detail-count">{details.length}</span> : null}
        </span>
      </button>
      <div className="log-row-actions">
        <button
          type="button"
          className="icon-button is-small"
          title="Copy detailed log JSON"
          onClick={() => void navigator.clipboard?.writeText(formatLogForClipboard(entry))}
        >
          <Clipboard size={14} />
        </button>
      </div>
      {isExpanded ? (
        <div className="log-row-details" id={detailsId}>
          {subline ? <p className="log-subline">{subline}</p> : null}
          {details.length > 0 ? (
            <dl className="log-detail-list">
              {details.map((item) => (
                <div className={item.tone ? `log-detail-item is-${item.tone}` : "log-detail-item"} key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {entry.raw ? <pre className="log-raw">{entry.raw}</pre> : null}
        </div>
      ) : null}
    </article>
  )
}

export function App() {
  const [draftBaseURL, setDraftBaseURL] = useState(readStoredBaseURL)
  const [baseURL, setBaseURL] = useState(() => normalizeBaseURL(readStoredBaseURL()))
  const [status, setStatus] = useState<MonitorStatus | null>(null)
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>("idle")
  const [statusStreamState, setStatusStreamState] = useState<StreamState>("idle")
  const [streamState, setStreamState] = useState<StreamState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastStatusReceivedAt, setLastStatusReceivedAt] = useState<number | undefined>()
  const [statusEventCount, setStatusEventCount] = useState(0)
  const [levelFilter, setLevelFilter] = useState("")
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [knownServices, setKnownServices] = useState<string[]>([])
  const [searchFilter, setSearchFilter] = useState("")
  const [isStreamPaused, setIsStreamPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logListRef = useRef<HTMLDivElement | null>(null)

  const query = useMemo(
    () => ({
      level: levelFilter || undefined,
      service: selectedServices.length > 0 ? selectedServices.join(",") : undefined,
      q: searchFilter.trim() || undefined,
    }),
    [levelFilter, searchFilter, selectedServices],
  )

  async function refreshSnapshot() {
    setLoadState("loading")
    setErrorMessage(null)
    try {
      const [nextStatus, nextRuntime, nextLogs] = await Promise.all([
        requestJSON<MonitorStatus>(baseURL, "/api/debug/status"),
        requestJSON<RuntimeSnapshot>(baseURL, "/api/debug/runtime"),
        requestJSON<{ logs: LogEntry[] }>(baseURL, "/api/debug/logs", {
          ...query,
          limit: "200",
        }),
      ])
      setStatus(nextStatus)
      setRuntime(nextRuntime)
      setLogs(nextLogs.logs)
      setLoadState("ready")
      setLastStatusReceivedAt(Date.now())
    } catch (error) {
      setLoadState("error")
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshLogs() {
    try {
      const nextLogs = await requestJSON<{ logs: LogEntry[] }>(baseURL, "/api/debug/logs", {
        ...query,
        limit: "200",
      })
      setLogs(nextLogs.logs)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function connect(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const nextBaseURL = normalizeBaseURL(draftBaseURL)
    setBaseURL(nextBaseURL)
    setDraftBaseURL(nextBaseURL)
    try {
      window.localStorage.setItem(BASE_URL_STORAGE_KEY, nextBaseURL)
    } catch {
      return
    }
  }

  useEffect(() => {
    setLoadState("loading")
    setStatusStreamState("connecting")
    setErrorMessage(null)
    setLastStatusReceivedAt(undefined)
    setStatusEventCount(0)

    const source = new EventSource(resolveURL(baseURL, "/api/debug/status/stream"))

    source.addEventListener("open", () => {
      setStatusStreamState("live")
    })
    source.addEventListener("status", (event) => {
      try {
        const payload = JSON.parse(event.data) as StatusStreamPayload
        setStatus(payload.status)
        setRuntime(payload.runtime)
        setLoadState("ready")
        setStatusStreamState("live")
        setLastStatusReceivedAt(Date.now())
        setStatusEventCount((count) => count + 1)
        setErrorMessage(null)
      } catch (error) {
        setLoadState("error")
        setStatusStreamState("error")
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    })
    source.addEventListener("error", () => {
      setLoadState("error")
      setStatusStreamState("error")
      setErrorMessage("Status stream disconnected")
    })

    return () => source.close()
  }, [baseURL])

  useEffect(() => {
    void refreshLogs()
  }, [baseURL, query])

  useEffect(() => {
    if (isStreamPaused) {
      setStreamState("paused")
      return
    }

    setStreamState("connecting")
    const source = new EventSource(resolveURL(baseURL, "/api/debug/logs/stream", query))

    source.addEventListener("open", () => {
      setStreamState("live")
      setErrorMessage(null)
    })
    source.addEventListener("log", (event) => {
      const entry = JSON.parse(event.data) as LogEntry
      setLogs((current) => appendUniqueLogs(current, entry))
    })
    source.addEventListener("error", () => {
      setStreamState("error")
    })

    return () => source.close()
  }, [baseURL, isStreamPaused, query])

  useEffect(() => {
    if (!autoScroll) return
    const node = logListRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [autoScroll, logs])

  useEffect(() => {
    setKnownServices((current) =>
      mergeServiceOptions(current, [
        ...logs.map((entry) => entry.service),
        ...(status?.recentErrors ?? []).map((entry) => entry.service),
      ]),
    )
  }, [logs, status?.recentErrors])

  function toggleServiceFilter(service: string) {
    setSelectedServices((current) =>
      current.includes(service)
        ? current.filter((item) => item !== service)
        : [...current, service].sort((a, b) => a.localeCompare(b)),
    )
  }

  const runningSessions = runtime?.runningSessions ?? []
  const recentErrors = status?.recentErrors ?? []

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

        <form className="connection-form" onSubmit={connect}>
          <label>
            <span>Agent base URL</span>
            <input value={draftBaseURL} onChange={(event) => setDraftBaseURL(event.target.value)} />
          </label>
          <button type="submit">
            <CircleCheck size={16} />
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
          <TriangleAlert size={18} />
          <div>
            <strong>Connection issue</strong>
            <span>{errorMessage} at {baseURL}</span>
          </div>
        </section>
      ) : null}

      <div className="status-meta">
        <span>
          <Clock3 size={14} />
          Last update: {formatUpdateTime(lastStatusReceivedAt ?? status?.generatedAt)}
        </span>
        <span className={statusStreamState === "error" ? "is-bad" : statusStreamState === "live" ? "is-good" : ""}>
          <Wifi size={14} />
          Status stream: {statusStreamState} · Events: {statusEventCount}
        </span>
      </div>

      <section className="status-grid">
        <MetricCard label="Server" tone={status?.ok ? "good" : "bad"} value={status?.ok ? "online" : "offline"} />
        <MetricCard label="Snapshot" value={loadState} tone={loadState === "error" ? "bad" : loadState === "ready" ? "good" : "neutral"} />
        <MetricCard label="Log stream" value={streamState} tone={streamState === "error" ? "bad" : streamState === "live" ? "good" : "neutral"} />
        <MetricCard label="Running sessions" value={String(status?.runningSessions.count ?? runningSessions.length)} />
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
              runningSessions.map((session) => (
                <article className="session-row" key={session.session.id}>
                  <div className="session-title">
                    <Activity size={16} />
                    <div>
                      <strong>{session.session.title || session.session.id}</strong>
                      <span>{session.session.directory || "No directory"}</span>
                    </div>
                  </div>
                  <div className="session-meta">
                    <span>{session.status?.phase || session.latestTurn?.phase || session.latestTurn?.status || "running"}</span>
                    <span>{formatDuration(session.running.activeForMs)}</span>
                    <span>{session.latestTurn?.model || "model pending"}</span>
                  </div>
                  {session.diagnostics?.lastErrorMessage ? (
                    <p className="session-error">{session.diagnostics.lastErrorMessage}</p>
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
                <article className="error-row" key={entry.id}>
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
            <button
              type="button"
              className="icon-button"
              title={isStreamPaused ? "Resume stream" : "Pause stream"}
              onClick={() => setIsStreamPaused((value) => !value)}
            >
              {isStreamPaused ? <Play size={16} /> : <Pause size={16} />}
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
          <div className="service-filter-field">
            <span>Service</span>
            <div className="filter-chip-group" aria-label="Service filter">
              <label className={selectedServices.length === 0 ? "filter-chip is-active" : "filter-chip"}>
                <input
                  type="checkbox"
                  checked={selectedServices.length === 0}
                  onChange={() => setSelectedServices([])}
                />
                <span>All</span>
              </label>
              {knownServices.length > 0 ? (
                knownServices.map((service) => (
                  <label
                    className={selectedServices.includes(service) ? "filter-chip is-active" : "filter-chip"}
                    key={service}
                    title={service}
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service)}
                      onChange={() => toggleServiceFilter(service)}
                    />
                    <span>{service}</span>
                  </label>
                ))
              ) : (
                <span className="filter-chip is-disabled">No services yet</span>
              )}
            </div>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search message, path, requestId, sessionID"
            />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
            Auto scroll
          </label>
        </div>

        <div className="log-list" ref={logListRef}>
          {logs.length > 0 ? (
            logs.map((entry) => <LogRow entry={entry} key={entry.id} />)
          ) : (
            <div className="empty-log-state">
              <SquareTerminal size={22} />
              <span>No logs match the current filters.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
