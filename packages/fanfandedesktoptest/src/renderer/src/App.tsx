import { useEffect, useMemo, useRef, useState } from "react"
import { createGateway, createGatewayFromEnv, type AdapterMode } from "./gateway"
import type { ProjectInfo, SessionInfo, StreamHandle } from "./gateway/types"

const init = createGatewayFromEnv()

type MessageRole = "user" | "assistant" | "system"

interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  meta?: string
}

interface TimelineEvent {
  id: string
  label: string
  summary: string
  timestamp: number
}

interface SessionCard {
  id: string
  title: string
  directory: string
  updated: number
  status: string
}

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function summarize(value: unknown, limit = 84) {
  const text = pretty(value).replace(/\s+/g, " ").trim()
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

function formatTime(value?: number) {
  if (!value) return "waiting"
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatRelative(value?: number) {
  if (!value) return "No activity yet"
  const diffMinutes = Math.max(0, Math.round((Date.now() - value) / 60000))
  if (diffMinutes < 1) return "Updated just now"
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  return `Updated ${diffHours}h ago`
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const starterMessages: ChatMessage[] = [
  {
    id: "system_welcome",
    role: "system",
    text: "Session warmup complete. The workspace is ready for your first desktop agent workflow.",
    meta: "System",
  },
  {
    id: "assistant_seed",
    role: "assistant",
    text: "Try asking for a task breakdown, a file review, or a first code change. This first build keeps the loop narrow: pick workspace, create session, send prompt, read stream.",
    meta: "Agent",
  },
]

const hotFiles = [
  "src/renderer/src/App.tsx",
  "src/renderer/src/styles.css",
  "src/renderer/src/gateway/index.ts",
]

export function App() {
  const [adapter, setAdapter] = useState<AdapterMode>(init.mode)
  const [baseURL, setBaseURL] = useState(init.defaultBaseURL)
  const gateway = useMemo(() => createGateway(adapter, baseURL), [adapter, baseURL])

  const [platform, setPlatform] = useState("unknown")
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [directory, setDirectory] = useState("C:/Projects/fanfande_studio")
  const [sessionID, setSessionID] = useState("")
  const [prompt, setPrompt] = useState("Analyze the current workspace and propose a focused first milestone for this AI agent UI.")
  const [assistantText, setAssistantText] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [status, setStatus] = useState("idle")
  const [sessions, setSessions] = useState<SessionCard[]>([])
  const [activeSessionTitle, setActiveSessionTitle] = useState("New Session")
  const streamRef = useRef<StreamHandle | null>(null)
  const didBootstrapRef = useRef(false)

  useEffect(() => {
    let active = true

    window.desktop
      ?.getInfo()
      .then((info) => {
        if (active) setPlatform(info.platform)
      })
      .catch(() => {
        if (active) setPlatform(window.desktop?.platform ?? "unknown")
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (didBootstrapRef.current) return
    didBootstrapRef.current = true
    void loadProjects()
  }, [gateway])

  const pushEvent = (label: string, payload: unknown) => {
    setEvents((prev) =>
      [
        {
          id: makeId("event"),
          label,
          summary: summarize(payload),
          timestamp: Date.now(),
        },
        ...prev,
      ].slice(0, 8),
    )
  }

  const upsertSessionCard = (session: SessionInfo, nextStatus: string) => {
    setSessions((prev) => {
      const nextCard: SessionCard = {
        id: session.id,
        title: session.title ?? `Session ${prev.length + 1}`,
        directory: session.directory,
        updated: session.time?.updated ?? Date.now(),
        status: nextStatus,
      }

      const remaining = prev.filter((item) => item.id !== session.id)
      return [nextCard, ...remaining].slice(0, 6)
    })
  }

  async function loadProjects() {
    try {
      setStatus("loading projects")
      const list = await gateway.listProjects()
      setProjects(list)
      if (list[0]?.worktree) setDirectory(list[0].worktree)
      setStatus(`loaded ${list.length} project(s)`)
      pushEvent("projects", list)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function createSession() {
    try {
      setStatus("creating session")
      const session = await gateway.createSession({ directory })
      setSessionID(session.id)
      setActiveSessionTitle(session.title ?? "Untitled Session")
      upsertSessionCard(session, "idle")
      setStatus(`session created: ${session.id}`)
      pushEvent("session", session)
      return session
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
      return null
    }
  }

  async function ensureSession() {
    if (sessionID.trim()) {
      return {
        id: sessionID.trim(),
        directory,
        projectID: projects[0]?.id ?? "manual",
        title: activeSessionTitle,
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      } satisfies SessionInfo
    }

    return createSession()
  }

  async function sendPrompt() {
    const text = prompt.trim()
    if (!text) {
      setStatus("prompt is required")
      return
    }

    const ensuredSession = await ensureSession()
    if (!ensuredSession) return

    const activeSessionID = ensuredSession.id
    const userMessageID = makeId("user")
    const assistantMessageID = makeId("assistant")

    streamRef.current?.cancel()
    setAssistantText("")
    setStatus("streaming")
    setMessages((prev) => [
      ...prev,
      { id: userMessageID, role: "user", text, meta: formatTime(Date.now()) },
      { id: assistantMessageID, role: "assistant", text: "", meta: "Streaming..." },
    ])
    setPrompt("")

    const stream = gateway.streamSessionMessage(
      {
        sessionID: activeSessionID,
        text,
      },
      {
        onStarted: (payload) => {
          setStatus("stream started")
          pushEvent("started", payload)
          setSessions((prev) =>
            prev.map((item) =>
              item.id === activeSessionID ? { ...item, status: "streaming", updated: Date.now() } : item,
            ),
          )
        },
        onDelta: (delta, payload) => {
          setAssistantText((prev) => prev + delta)
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageID
                ? { ...message, text: `${message.text}${delta}`, meta: "Assistant" }
                : message,
            ),
          )
          pushEvent("delta", payload)
        },
        onPart: (payload) => {
          pushEvent("part", payload)
        },
        onDone: (payload) => {
          setStatus("stream done")
          pushEvent("done", payload)
          setSessions((prev) =>
            prev.map((item) => (item.id === activeSessionID ? { ...item, status: "ready", updated: Date.now() } : item)),
          )
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageID ? { ...message, meta: formatTime(Date.now()) } : message,
            ),
          )
        },
        onError: (message, payload) => {
          setStatus(`stream error: ${message}`)
          if (payload) pushEvent("error", payload)
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageID
                ? {
                    ...item,
                    text: item.text || `Stream interrupted: ${message}`,
                    meta: "Interrupted",
                  }
                : item,
            ),
          )
          setSessions((prev) =>
            prev.map((item) => (item.id === activeSessionID ? { ...item, status: "error", updated: Date.now() } : item)),
          )
        },
      },
    )

    streamRef.current = stream
    await stream.done
  }

  const cancelStream = () => {
    streamRef.current?.cancel()
    streamRef.current = null
    setStatus("stream cancelled")
  }

  const statusCards = [
    { label: "Runtime", value: platform },
    { label: "Gateway", value: adapter.toUpperCase() },
    { label: "Projects", value: String(projects.length) },
  ]

  const sessionSummary = sessionID ? `${activeSessionTitle} | ${sessionID}` : "Create or auto-start a session"

  return (
    <main className="shell">
      <header className="chrome-bar">
        <nav className="menu-strip" aria-label="Top menu">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span className="is-active">Agent</span>
          <span>Window</span>
          <span>Help</span>
        </nav>
        <div className="window-controls" aria-hidden="true">
          <span />
          <span />
          <span className="close" />
        </div>
      </header>

      <div className="workspace">
        <aside className="panel sidebar">
          <div className="panel-heading">
            <span className="eyebrow">Project Explorer</span>
            <h1>AI Agent Console</h1>
            <p>Choose a workspace, create a session, then start prompting.</p>
          </div>

          <div className="search-shell">
            <span aria-hidden="true">Search</span>
            <input placeholder="Filter files or sessions..." />
          </div>

          <div className="sidebar-actions">
            <button className="primary-button" onClick={() => void createSession()}>
              + New Session
            </button>
            <button className="ghost-button" onClick={() => void loadProjects()}>
              Refresh Projects
            </button>
          </div>

          <section className="sidebar-section">
            <div className="section-label">Workspace Directory</div>
            <label className="field">
              <span>Path</span>
              <input value={directory} onChange={(event) => setDirectory(event.target.value)} />
            </label>
          </section>

          <section className="sidebar-section">
            <div className="section-label">Projects</div>
            <div className="stack-list">
              {projects.length === 0 ? (
                <div className="empty-card">No projects loaded yet.</div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    className="list-card project-card"
                    onClick={() => setDirectory(project.worktree ?? directory)}
                  >
                    <strong>{project.name ?? project.id}</strong>
                    <span>{project.worktree ?? "No worktree"}</span>
                    <em>{project.sandboxes?.[0] ?? "Local sandbox"}</em>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="sidebar-section grow">
            <div className="section-label">Recent Sessions</div>
            <div className="stack-list">
              {sessions.length === 0 ? (
                <div className="empty-card">No session created. Press New Session or send your first prompt.</div>
              ) : (
                sessions.map((session) => (
                  <button key={session.id} className="list-card session-card" onClick={() => setSessionID(session.id)}>
                    <strong>{session.title}</strong>
                    <span>{session.directory}</span>
                    <em>
                      {session.status} | {formatRelative(session.updated)}
                    </em>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="panel main-panel">
          <div className="main-header">
            <div>
              <span className="eyebrow">Prompt Workspace For Browser-based Agents</span>
              <h2>Build, inspect and steer your desktop AI agent loop</h2>
              <p>{sessionSummary}</p>
            </div>
            <div className="status-grid">
              {statusCards.map((card) => (
                <div key={card.label} className="status-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="status-row">
            <div className="metric-card emphasis">
              <span>Status</span>
              <strong>{status}</strong>
              <p>Core runtime state for stream and project activity.</p>
            </div>
            <div className="metric-card">
              <span>Adapter</span>
              <label className="inline-field">
                <select value={adapter} onChange={(event) => setAdapter(event.target.value as AdapterMode)}>
                  <option value="mock">mock</option>
                  <option value="http">http</option>
                </select>
              </label>
            </div>
            <div className="metric-card">
              <span>Session</span>
              <strong>{sessionID || "auto-create"}</strong>
              <p>{assistantText ? `${assistantText.length} streamed chars` : "No output yet"}</p>
            </div>
          </div>

          <div className="chat-shell">
            <div className="toolbar">
              <span>Conversation</span>
              <div className="toolbar-actions">
                <button className="ghost-button" onClick={cancelStream}>
                  Cancel Stream
                </button>
                <button className="ghost-button" onClick={() => void createSession()}>
                  Recreate Session
                </button>
              </div>
            </div>

            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message-card ${message.role}`}>
                  <header>
                    <strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Agent" : "System"}</strong>
                    <span>{message.meta ?? "Live"}</span>
                  </header>
                  <p>{message.text || "Thinking..."}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="composer-shell">
            <label className="field grow">
              <span>Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the task you want the agent to handle..."
                rows={5}
              />
            </label>

            <div className="composer-footer">
              <label className="field grow">
                <span>HTTP Base URL</span>
                <input
                  value={baseURL}
                  onChange={(event) => setBaseURL(event.target.value)}
                  placeholder="http://127.0.0.1:4096"
                  disabled={adapter !== "http"}
                />
              </label>
              <div className="composer-actions">
                <button className="ghost-button" onClick={cancelStream}>
                  Abort
                </button>
                <button className="primary-button" onClick={() => void sendPrompt()}>
                  Send Prompt
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel inspector">
          <div className="panel-heading">
            <span className="eyebrow">Execution Context</span>
            <h2>Live workspace diagnostics</h2>
          </div>

          <section className="context-card">
            <span className="section-label">Environment</span>
            <dl>
              <div>
                <dt>Platform</dt>
                <dd>{platform}</dd>
              </div>
              <div>
                <dt>Gateway</dt>
                <dd>{adapter}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{directory}</dd>
              </div>
            </dl>
          </section>

          <section className="context-card">
            <span className="section-label">Hot Files</span>
            <ul className="mono-list">
              {hotFiles.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </section>

          <section className="context-card grow">
            <span className="section-label">Recent Events</span>
            <div className="event-list">
              {events.length === 0 ? (
                <div className="empty-card compact">Stream and session events will appear here.</div>
              ) : (
                events.map((event) => (
                  <article key={event.id} className="event-card">
                    <header>
                      <strong>{event.label}</strong>
                      <span>{formatTime(event.timestamp)}</span>
                    </header>
                    <p>{event.summary}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
