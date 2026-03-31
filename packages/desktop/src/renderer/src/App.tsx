import { startTransition, useEffect, useMemo, useState } from "react"

type SessionStatus = "Live" | "Review" | "Ready"
type TitlebarMenuKey = "file" | "edit" | "view" | "window" | "help"
type SidebarActionKey = "density" | "sort" | "new"

interface SessionSummary {
  id: string
  title: string
  branch: string
  status: SessionStatus
  updated: number
  focus: string
  summary: string
}

interface WorkspaceGroup {
  id: string
  name: string
  sessions: SessionSummary[]
}

interface UserTurn {
  id: string
  kind: "user"
  text: string
  timestamp: number
}

interface ArtifactCard {
  id: string
  tag: string
  title: string
  detail: string
}

interface AssistantTurn {
  id: string
  kind: "assistant"
  timestamp: number
  state: string
  summary: string
  reasoning: string[]
  checklist: string[]
  artifacts: ArtifactCard[]
  nextStep: string
}

type Turn = UserTurn | AssistantTurn

const seedWorkspaces: WorkspaceGroup[] = [
  {
    id: "project-1",
    name: "Project 1",
    sessions: [
      {
        id: "session-layout-pass",
        title: "Layout pass",
        branch: "feature/layout-pass",
        status: "Ready",
        updated: new Date("2026-03-31T09:24:00+08:00").getTime(),
        focus: "Polish",
        summary: "Tighten the shell layout and reduce visual noise around the message lane.",
      },
    ],
  },
  {
    id: "project-2",
    name: "Project 2",
    sessions: [
      {
        id: "session-chat-1",
        title: "Chat 1",
        branch: "feature/anybox-sidebar",
        status: "Live",
        updated: new Date("2026-03-31T10:12:00+08:00").getTime(),
        focus: "Ship",
        summary: "Rebuild the left rail so it behaves like a lightweight project tree.",
      },
      {
        id: "session-chat-2",
        title: "Chat 2",
        branch: "feature/review-lane",
        status: "Review",
        updated: new Date("2026-03-31T08:42:00+08:00").getTime(),
        focus: "Review",
        summary: "Turn the assistant output into a review-first stream with stronger scanability.",
      },
    ],
  },
  {
    id: "project-3",
    name: "Project 3",
    sessions: [
      {
        id: "session-delivery-plan",
        title: "Delivery plan",
        branch: "feature/delivery-plan",
        status: "Ready",
        updated: new Date("2026-03-30T18:06:00+08:00").getTime(),
        focus: "Plan",
        summary: "Break the request into milestones and keep approval points explicit.",
      },
    ],
  },
]

const initialConversations: Record<string, Turn[]> = {
  "session-layout-pass": [
    {
      id: "layout-user-1",
      kind: "user",
      text: "Keep the shell quiet and let the center column stay dominant.",
      timestamp: new Date("2026-03-31T09:12:00+08:00").getTime(),
    },
    {
      id: "layout-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-31T09:13:00+08:00").getTime(),
      state: "Shell structure aligned",
      summary:
        "I kept the desktop frame restrained, moved the emphasis back to the center lane, and left space for the composer to stay visually anchored at the bottom.",
      reasoning: [
        "The window chrome should read as a frame, not a feature.",
        "The sidebar should support project navigation without competing with the active thread.",
        "The composer needs to feel attached to the conversation instead of floating as a separate card.",
      ],
      checklist: ["Reduce chrome weight", "Preserve center focus", "Anchor composer"],
      artifacts: [
        {
          id: "artifact-shell",
          tag: "Layout",
          title: "Desktop shell pass",
          detail: "Balanced the window chrome, workspace rail, thread lane, and composer spacing.",
        },
      ],
      nextStep: "Use the same restraint when the sidebar switches between projects and expanded conversations.",
    },
  ],
  "session-chat-1": [
    {
      id: "chat-user-1",
      kind: "user",
      text: "Make the left rail feel closer to Anybox and less like a dashboard.",
      timestamp: new Date("2026-03-31T10:06:00+08:00").getTime(),
    },
    {
      id: "chat-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-31T10:08:00+08:00").getTime(),
      state: "Sidebar direction corrected",
      summary:
        "I am collapsing the information-heavy workspace cards into a project tree so the rail behaves like navigation, not like a second content surface.",
      reasoning: [
        "The active project should own the only expanded conversation list.",
        "Project rows need state through icon, weight, and background rather than through stacked metadata.",
        "The bottom settings affordance should stay isolated and always available.",
      ],
      checklist: ["Match project tree", "Keep one expanded group", "Isolate settings"],
      artifacts: [
        {
          id: "artifact-sidebar",
          tag: "Sidebar",
          title: "Tree navigation model",
          detail: "Top actions, project rows, nested conversations, and a single bottom settings action.",
        },
        {
          id: "artifact-states",
          tag: "States",
          title: "Active row treatment",
          detail: "Used background, icon swap, indentation, and text weight instead of extra cards.",
        },
      ],
      nextStep: "Carry the same density rules into hover and truncation behavior once the real data is wired in.",
    },
  ],
  "session-chat-2": [
    {
      id: "chat-review-1",
      kind: "assistant",
      timestamp: new Date("2026-03-31T08:36:00+08:00").getTime(),
      state: "Review lane scoped",
      summary:
        "The thread is organized so the outcome appears first, then the reasoning, then the deliverables, which keeps scan time low in review mode.",
      reasoning: [
        "Review mode should privilege conclusion over chronology.",
        "Artifacts need enough structure to attach logs or file changes later.",
        "The checklist should read like operational state, not decoration.",
      ],
      checklist: ["Outcome first", "Artifacts structured", "Status remains compact"],
      artifacts: [
        {
          id: "artifact-review",
          tag: "Review",
          title: "Outcome-first turn",
          detail: "The turn opens with the decision, then exposes the supporting reasoning and next step.",
        },
      ],
      nextStep: "If this holds up, the next pass can add code diff and file cards without changing the hierarchy.",
    },
  ],
  "session-delivery-plan": [
    {
      id: "delivery-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-30T18:06:00+08:00").getTime(),
      state: "Plan ready",
      summary:
        "The request is now split into a sequence of checkpoints so implementation can move without losing approval points.",
      reasoning: [
        "Capture the shell changes before introducing real backend state.",
        "Keep the component boundaries obvious so the desktop view can evolve safely.",
      ],
      checklist: ["Frame the work", "Keep checkpoints", "Preserve UI seams"],
      artifacts: [
        {
          id: "artifact-plan",
          tag: "Plan",
          title: "Milestone outline",
          detail: "Defines a path from shell cleanup to data-backed agent sessions.",
        },
      ],
      nextStep: "Feed in the next task and I will expand it into implementation-sized steps.",
    },
  ],
}

const suggestedPrompts = [
  "Refine the desktop shell spacing and remove dashboard-like noise.",
  "Turn the active thread into a review-first AI agent flow.",
  "Outline the next backend integration step for this desktop surface.",
]

const titlebarMenus: Array<{ key: TitlebarMenuKey; label: string }> = [
  { key: "file", label: "File" },
  { key: "edit", label: "Edit" },
  { key: "view", label: "View" },
  { key: "window", label: "Window" },
  { key: "help", label: "Help" },
]

const sidebarActions: Array<{ key: SidebarActionKey; label: string }> = [
  { key: "density", label: "Toggle sidebar density" },
  { key: "sort", label: "Sort sessions" },
  { key: "new", label: "Create session" },
]

function createID(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

function formatRelative(timestamp: number) {
  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} day ago`
}

function buildAgentTurn(prompt: string, session: SessionSummary, workspaceName: string, platform: string): AssistantTurn {
  const compactPrompt = prompt.replace(/\s+/g, " ").trim()
  const focusLine = compactPrompt.length > 56 ? `${compactPrompt.slice(0, 56)}...` : compactPrompt

  return {
    id: createID("assistant"),
    kind: "assistant",
    timestamp: Date.now(),
    state: "Implementation draft generated",
    summary: `I captured "${focusLine}" and will first align the ${workspaceName} context around ${session.title} before deciding which pieces belong in the shell versus the agent lane.`,
    reasoning: [
      "Keep the shell hierarchy obvious before wiring real-time state.",
      "Preserve the Anybox-like restraint while making the assistant output more operational.",
      `Treat ${platform} as the primary runtime so window and density choices stay desktop-first.`,
    ],
    checklist: ["Lock shell structure", "Protect center lane", "Leave backend seams visible"],
    artifacts: [
      {
        id: createID("artifact"),
        tag: "UI",
        title: "Agent workspace shell",
        detail: "Sidebar, thread lane, and composer all keep a clear ownership boundary.",
      },
      {
        id: createID("artifact"),
        tag: "Next",
        title: "Integration seam",
        detail: "The current placeholders can be replaced by real sessions, statuses, and artifacts without changing the layout model.",
      },
    ],
    nextStep: "Once the structure holds, the next pass can wire search, streaming updates, and real file activity.",
  }
}

function findSession(workspaces: WorkspaceGroup[], sessionID: string) {
  for (const workspace of workspaces) {
    const session = workspace.sessions.find((item) => item.id === sessionID)
    if (session) return { workspace, session }
  }

  return {
    workspace: workspaces[0],
    session: workspaces[0].sessions[0],
  }
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.75 7.5h5.2l1.6 2h9.7v8.75a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.75 9.5V6.75a1.5 1.5 0 0 1 1.5-1.5h3.7l1.6 2h8.2a1.5 1.5 0 0 1 1.5 1.5V9.5" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10l5 5 5-5" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3H3v6" />
      <path d="M15 3h6v6" />
      <path d="M21 15v6h-6" />
      <path d="M3 15v6h6" />
      <path d="M3 9l6-6" />
      <path d="M15 3l6 6" />
      <path d="M21 15l-6 6" />
      <path d="M9 21l-6-6" />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v14" />
      <path d="M4 15l3 3 3-3" />
      <path d="M14 6h6" />
      <path d="M14 12h4" />
      <path d="M14 18h2" />
    </svg>
  )
}

function NewItemIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7.75A1.75 1.75 0 0 0 6 4.75v14.5C6 20.22 6.78 21 7.75 21h8.5A1.75 1.75 0 0 0 18 19.25V7z" />
      <path d="M14 3v4h4" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
      <path d="M19.4 15.15l1.1 1.9-1.9 3.29-2.16-.51a7.85 7.85 0 0 1-1.45.84L14.5 23h-5l-.49-2.33a7.84 7.84 0 0 1-1.46-.84l-2.15.51-1.9-3.29 1.1-1.9a8.32 8.32 0 0 1 0-1.7l-1.1-1.9 1.9-3.29 2.15.51c.45-.33.95-.61 1.46-.84L9.5 1h5l.49 2.33c.51.23 1 .51 1.45.84l2.16-.51 1.9 3.29-1.1 1.9c.08.56.08 1.14 0 1.7Z" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 5h8" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 1.5h7v7h-7z" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 1.5h5v5H2z" />
      <path d="M3 3.5h5V8.5H3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6" />
      <path d="M8 2L2 8" />
    </svg>
  )
}

export function App() {
  const [platform, setPlatform] = useState("Desktop")
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [isSidebarCondensed, setIsSidebarCondensed] = useState(false)
  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [activeSessionID, setActiveSessionID] = useState(seedWorkspaces[1].sessions[0].id)
  const [mode, setMode] = useState<"Autopilot" | "Review">("Autopilot")
  const [draft, setDraft] = useState("Help me align the desktop sidebar with the Pencil design.")
  const [conversations, setConversations] = useState(initialConversations)

  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)

  useEffect(() => {
    let mounted = true

    window.desktop
      ?.getInfo()
      .then((info) => {
        if (mounted) setPlatform(info.platform)
      })
      .catch(() => {
        if (mounted && window.desktop?.platform) setPlatform(window.desktop.platform)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    window.desktop
      ?.getWindowState?.()
      .then((state) => {
        if (mounted) setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)

    const unsubscribe = window.desktop?.onWindowStateChange?.((state) => {
      if (mounted) setIsWindowMaximized(state.isMaximized)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const metrics = useMemo(
    () => [
      { label: "Runtime", value: platform },
      { label: "Mode", value: mode },
      { label: "Focus", value: activeSession.focus },
      { label: "Session", value: activeSession.status },
    ],
    [activeSession.focus, activeSession.status, mode, platform],
  )

  const activeTurns = conversations[activeSession.id] ?? []

  function handlePromptApply(prompt: string) {
    setDraft(prompt)
  }

  function handleTitleMenu(menuKey: TitlebarMenuKey) {
    void window.desktop?.showMenu?.(menuKey)
  }

  function handleWindowAction(action: "minimize" | "toggle-maximize" | "close") {
    void window.desktop?.windowAction?.(action)
  }

  function handleSidebarAction(action: SidebarActionKey) {
    if (action === "density") {
      setIsSidebarCondensed((value) => !value)
      return
    }

    if (action === "sort") {
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: [...workspace.sessions].sort((left, right) => right.updated - left.updated),
        })),
      )
      return
    }

    const newSession: SessionSummary = {
      id: createID("session"),
      title: `New chat ${activeWorkspace.sessions.length + 1}`,
      branch: `feature/${createID("draft")}`,
      status: "Ready",
      updated: Date.now(),
      focus: "Draft",
      summary: "Fresh session created from the sidebar action rail.",
    }

    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === activeWorkspace.id
          ? {
              ...workspace,
              sessions: [newSession, ...workspace.sessions],
            }
          : workspace,
      ),
    )
    setConversations((prev) => ({
      ...prev,
      [newSession.id]: [
        {
          id: createID("assistant"),
          kind: "assistant",
          timestamp: Date.now(),
          state: "Session created",
          summary: "This new session is ready for a fresh task.",
          reasoning: ["Use the composer below to describe the next change or review target."],
          checklist: ["Await task"],
          artifacts: [],
          nextStep: "Start by describing the desired UI or coding task.",
        },
      ],
    }))
    setActiveSessionID(newSession.id)
  }

  function handleSend() {
    const text = draft.trim()
    if (!text) return

    const userTurn: UserTurn = {
      id: createID("user"),
      kind: "user",
      text,
      timestamp: Date.now(),
    }

    const agentTurn = buildAgentTurn(text, activeSession, activeWorkspace.name, platform)

    startTransition(() => {
      setConversations((prev) => ({
        ...prev,
        [activeSession.id]: [...(prev[activeSession.id] ?? []), userTurn, agentTurn],
      }))

      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: workspace.sessions.map((session) =>
            session.id === activeSession.id
              ? {
                  ...session,
                  status: mode === "Autopilot" ? "Live" : "Review",
                  summary: text,
                  updated: Date.now(),
                }
              : session,
          ),
        })),
      )
    })

    setDraft("")
  }

  return (
    <div className={isWindowMaximized ? "window-shell is-maximized" : "window-shell"}>
      <header className="titlebar">
        <div className="titlebar-surface">
          <div className="titlebar-left">
            <div className="titlebar-brand" aria-hidden="true">
              <span className="titlebar-mark">◌</span>
            </div>
            <nav className="titlebar-menus" aria-label="Application menu">
              {titlebarMenus.map((menu) => (
                <button key={menu.key} className="titlebar-menu-button" onClick={() => handleTitleMenu(menu.key)}>
                  {menu.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="titlebar-right">
            <div className="titlebar-command">workspace://desktop-shell</div>
            <div className="titlebar-controls" aria-label="Window controls">
              <button className="window-control" aria-label="Minimize window" onClick={() => handleWindowAction("minimize")}>
                <MinimizeIcon />
              </button>
              <button
                className="window-control"
                aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
                onClick={() => handleWindowAction("toggle-maximize")}
              >
                {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
              </button>
              <button className="window-control is-close" aria-label="Close window" onClick={() => handleWindowAction("close")}>
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-shell">
        <aside className={isSidebarCondensed ? "sidebar is-condensed" : "sidebar"} aria-label="Project navigation">
          <div className="sidebar-actions" aria-label="Sidebar actions">
            {sidebarActions.map((action) => (
              <button
                key={action.key}
                className="sidebar-action"
                aria-label={action.label}
                title={action.label}
                onClick={() => handleSidebarAction(action.key)}
              >
                {action.key === "density" ? <ExpandIcon /> : null}
                {action.key === "sort" ? <SortIcon /> : null}
                {action.key === "new" ? <NewItemIcon /> : null}
              </button>
            ))}
          </div>

          <div className="sidebar-projects">
            {workspaces.map((workspace) => {
              const expanded = workspace.id === activeWorkspace.id

              return (
                <section key={workspace.id} className="project-block">
                  <button
                    className={expanded ? "project-row is-active" : "project-row"}
                    onClick={() => setActiveSessionID(workspace.sessions[0].id)}
                  >
                    <span className="project-row-leading" aria-hidden="true">
                      {expanded ? <ChevronDownIcon /> : <FolderIcon />}
                    </span>
                    <span className="project-row-label">{workspace.name}</span>
                  </button>

                  {expanded ? (
                    <div className="session-tree">
                      {workspace.sessions.map((session) => {
                        const active = session.id === activeSession.id

                        return (
                          <button
                            key={session.id}
                            className={active ? "session-row is-active" : "session-row"}
                            onClick={() => setActiveSessionID(session.id)}
                          >
                            <span className="session-row-label">{session.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>

          <button className="sidebar-settings" aria-label="Open settings" title="Open settings">
            <SettingsIcon />
          </button>
        </aside>

        <section className="canvas">
          <header className="canvas-header">
            <div className="canvas-title">
              <span className="label">Active Session</span>
              <h2>AI Agent Workspace</h2>
              <p>
                {activeWorkspace.name} / {activeSession.title}
              </p>
            </div>

            <div className="metrics-grid">
              {metrics.map((metric) => (
                <article key={metric.label} className="metric-card">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>
          </header>

          <section className="signal-row" aria-label="Quick prompts">
            {suggestedPrompts.map((prompt) => (
              <button key={prompt} className="signal-chip" onClick={() => handlePromptApply(prompt)}>
                {prompt}
              </button>
            ))}
          </section>

          <section className="thread-shell">
            <div className="thread-column">
              {activeTurns.map((turn) =>
                turn.kind === "user" ? (
                  <article key={turn.id} className="turn user-turn">
                    <div className="turn-meta">
                      <span>You</span>
                      <time>{formatTime(turn.timestamp)}</time>
                    </div>
                    <div className="user-bubble">{turn.text}</div>
                  </article>
                ) : (
                  <article key={turn.id} className="turn assistant-turn">
                    <div className="assistant-shell">
                      <header className="assistant-header">
                        <div>
                          <span className="label">Agent Turn</span>
                          <h3>{turn.state}</h3>
                        </div>
                        <time>{formatTime(turn.timestamp)}</time>
                      </header>

                      <p className="assistant-summary">{turn.summary}</p>

                      <div className="stage-row">
                        {turn.checklist.map((item) => (
                          <span key={item} className="stage-chip">
                            {item}
                          </span>
                        ))}
                      </div>

                      <section className="assistant-section">
                        <span className="section-title">Working Notes</span>
                        <ul>
                          {turn.reasoning.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>

                      <section className="assistant-section">
                        <div className="section-header">
                          <span className="section-title">Artifacts</span>
                          <small>{turn.artifacts.length || 1} items</small>
                        </div>
                        <div className="artifact-grid">
                          {turn.artifacts.length === 0 ? (
                            <div className="artifact-card is-empty">Waiting for the next result.</div>
                          ) : (
                            turn.artifacts.map((artifact) => (
                              <article key={artifact.id} className="artifact-card">
                                <span>{artifact.tag}</span>
                                <strong>{artifact.title}</strong>
                                <p>{artifact.detail}</p>
                              </article>
                            ))
                          )}
                        </div>
                      </section>

                      <section className="assistant-section next-step">
                        <span className="section-title">Next Step</span>
                        <p>{turn.nextStep}</p>
                      </section>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>

          <footer className="composer prompt-input-shell">
            <textarea
              aria-label="Task draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Describe the UI, implementation task, or review target for the agent."
              rows={3}
            />

            <div className="composer-toolbar">
              <div className="composer-pills">
                <span className="composer-pill">GPT-5.4</span>
                <span className="composer-pill">Desktop</span>
                <span className="composer-pill">Anybox Ref</span>
              </div>

              <div className="composer-actions">
                <button aria-label="Clear draft" className="secondary-button" onClick={() => setDraft("")}>
                  Clear
                </button>
                <button aria-label="Send task" className="primary-button" onClick={handleSend}>
                  Send task
                </button>
              </div>
            </div>
          </footer>
        </section>
      </main>
    </div>
  )
}
