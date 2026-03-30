import { useEffect, useMemo, useRef, useState } from "react"
import { createGateway, createGatewayFromEnv, type AdapterMode } from "./gateway"
import type { ProjectInfo, StreamHandle } from "./gateway/types"

const init = createGatewayFromEnv()

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function App() {
  const [adapter, setAdapter] = useState<AdapterMode>(init.mode)
  const [baseURL, setBaseURL] = useState(init.defaultBaseURL)
  const gateway = useMemo(() => createGateway(adapter, baseURL), [adapter, baseURL])

  const [platform, setPlatform] = useState("unknown")
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [directory, setDirectory] = useState("C:/Projects/fanfande_studio")
  const [sessionID, setSessionID] = useState("")
  const [prompt, setPrompt] = useState("请介绍一下这个项目下一步如何开发前端。")
  const [assistantText, setAssistantText] = useState("")
  const [events, setEvents] = useState<string[]>([])
  const [status, setStatus] = useState("idle")
  const streamRef = useRef<StreamHandle | null>(null)

  useEffect(() => {
    window.desktop
      ?.getInfo()
      .then((info) => setPlatform(info.platform))
      .catch(() => setPlatform(window.desktop?.platform ?? "unknown"))
  }, [])

  const pushEvent = (label: string, payload: unknown) => {
    setEvents((prev) => [`[${new Date().toLocaleTimeString()}] ${label}: ${pretty(payload)}`, ...prev].slice(0, 8))
  }

  const loadProjects = async () => {
    try {
      setStatus("loading projects")
      const list = await gateway.listProjects()
      setProjects(list)
      setStatus(`loaded ${list.length} project(s)`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const createSession = async () => {
    try {
      setStatus("creating session")
      const session = await gateway.createSession({ directory })
      setSessionID(session.id)
      setStatus(`session created: ${session.id}`)
      pushEvent("session", session)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  const sendPrompt = async () => {
    if (!sessionID.trim()) {
      setStatus("sessionID is required")
      return
    }

    streamRef.current?.cancel()
    setAssistantText("")
    setStatus("streaming")

    const stream = gateway.streamSessionMessage(
      {
        sessionID: sessionID.trim(),
        text: prompt,
      },
      {
        onStarted: (payload) => {
          setStatus("stream started")
          pushEvent("started", payload)
        },
        onDelta: (delta, payload) => {
          setAssistantText((prev) => prev + delta)
          pushEvent("delta", payload)
        },
        onPart: (payload) => {
          pushEvent("part", payload)
        },
        onDone: (payload) => {
          setStatus("stream done")
          pushEvent("done", payload)
        },
        onError: (message, payload) => {
          setStatus(`stream error: ${message}`)
          if (payload) pushEvent("error", payload)
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

  return (
    <main className="app">
      <header className="panel">
        <h1>Fanfande Desktop (Electron)</h1>
        <p>Platform: {platform}</p>
      </header>

      <section className="panel row">
        <label>
          Adapter
          <select value={adapter} onChange={(e) => setAdapter(e.target.value as AdapterMode)}>
            <option value="mock">mock</option>
            <option value="http">http</option>
          </select>
        </label>
        <label className="grow">
          API Base URL
          <input
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="http://127.0.0.1:4096"
            disabled={adapter !== "http"}
          />
        </label>
      </section>

      <section className="panel row">
        <label className="grow">
          Project Directory
          <input value={directory} onChange={(e) => setDirectory(e.target.value)} />
        </label>
        <button onClick={loadProjects}>Load Projects</button>
        <button onClick={createSession}>Create Session</button>
      </section>

      <section className="panel">
        <h2>Projects</h2>
        {projects.length === 0 ? <p className="muted">No projects loaded.</p> : null}
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <strong>{project.id}</strong> {project.worktree ? `- ${project.worktree}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel row">
        <label className="grow">
          Session ID
          <input value={sessionID} onChange={(e) => setSessionID(e.target.value)} placeholder="session_xxx" />
        </label>
      </section>

      <section className="panel">
        <label>
          Prompt
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} />
        </label>
        <div className="row">
          <button onClick={sendPrompt}>Send</button>
          <button onClick={cancelStream}>Cancel</button>
          <span className="status">{status}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Assistant Output</h2>
        <pre className="output">{assistantText || "(empty)"}</pre>
      </section>

      <section className="panel">
        <h2>Recent Stream Events</h2>
        <pre className="events">{events.join("\n\n") || "(empty)"}</pre>
      </section>
    </main>
  )
}
