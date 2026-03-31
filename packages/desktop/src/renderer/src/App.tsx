import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react"

type SessionStatus = "Live" | "Review" | "Ready"

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
  owner: string
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
    id: "ws-agent",
    name: "Agent Studio",
    owner: "桌面端",
    sessions: [
      {
        id: "session-runway",
        title: "工作台主界面",
        branch: "feature/agent-runway",
        status: "Live",
        updated: new Date("2026-03-31T09:24:00+08:00").getTime(),
        focus: "Ship",
        summary: "对齐 Anybox 的信息密度，但让 Agent 的行动状态更清晰。",
      },
      {
        id: "session-review",
        title: "执行回顾面板",
        branch: "feature/review-lane",
        status: "Review",
        updated: new Date("2026-03-31T08:42:00+08:00").getTime(),
        focus: "Review",
        summary: "把 reasoning、artifacts、next action 分层展示。",
      },
    ],
  },
  {
    id: "ws-growth",
    name: "增长实验室",
    owner: "策略组",
    sessions: [
      {
        id: "session-growth",
        title: "渠道分析 Agent",
        branch: "feature/growth-agent",
        status: "Ready",
        updated: new Date("2026-03-30T18:06:00+08:00").getTime(),
        focus: "Observe",
        summary: "将提示词与运营日程合并成一条轻量工作流。",
      },
    ],
  },
  {
    id: "ws-delivery",
    name: "交付中台",
    owner: "项目管理",
    sessions: [
      {
        id: "session-delivery",
        title: "需求拆解 Agent",
        branch: "feature/delivery-plan",
        status: "Ready",
        updated: new Date("2026-03-29T20:18:00+08:00").getTime(),
        focus: "Plan",
        summary: "把任务拆成可执行分段，并保留人工确认节点。",
      },
    ],
  },
]

const initialConversations: Record<string, Turn[]> = {
  "session-runway": [
    {
      id: "runway-user-1",
      kind: "user",
      text: "先按 Anybox 的文档界面做版式，侧边栏保持轻量，Composer 固定在底部。",
      timestamp: new Date("2026-03-31T09:12:00+08:00").getTime(),
    },
    {
      id: "runway-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-31T09:13:00+08:00").getTime(),
      state: "布局草图已对齐",
      summary: "我会把桌面端主界面收束成三段：左侧项目树、中部对话视口、底部悬浮 Composer。用户消息保持右侧短气泡，Agent 输出拆成可扫描卡片。",
      reasoning: [
        "主界面保留大面积留白，让中间对话列成为唯一视觉主轴。",
        "用户消息与 Composer 垂直对齐，避免输入区和消息区像两个独立模块。",
        "Agent 回复不再堆成长段文字，而是拆成状态、推理、产物和下一步。",
      ],
      checklist: ["收束窗口壳层", "拉齐聊天视口宽度", "定义底部 Composer 工具带"],
      artifacts: [
        {
          id: "artifact-wire",
          tag: "Layout",
          title: "Anybox 风格工作台",
          detail: "浅色背景、薄描边、温和阴影，保持桌面端高级感。",
        },
        {
          id: "artifact-agent",
          tag: "Agent",
          title: "行动状态分层",
          detail: "把执行过程拆成 Observe / Plan / Act / Deliver 四个阶段。",
        },
      ],
      nextStep: "接下来将把消息、阶段标签和结果卡做成同一套视觉语言。",
    },
    {
      id: "runway-user-2",
      kind: "user",
      text: "界面要更像 AI Agent，而不是普通聊天应用。",
      timestamp: new Date("2026-03-31T09:19:00+08:00").getTime(),
    },
    {
      id: "runway-agent-2",
      kind: "assistant",
      timestamp: new Date("2026-03-31T09:20:00+08:00").getTime(),
      state: "Agent 层已强化",
      summary: "我会保留聊天结构，但让每个 Agent turn 都能回答三个问题：它正在做什么、为什么这么做、接下来产出什么。",
      reasoning: [
        "状态标签让用户在不阅读正文时，也能知道当前轮次已经推进到哪一步。",
        "Reasoning 区块用短句列出关键判断，而不是塞进一段长文。",
        "Artifacts 用卡片承接执行结果，为后续接入真实工具链留出口。",
      ],
      checklist: ["保留轻聊天感", "强化行动状态", "为真实流式结果留结构"],
      artifacts: [
        {
          id: "artifact-ops",
          tag: "Flow",
          title: "阶段型 Assistant 卡片",
          detail: "每轮回复可承接任务拆解、文件变更、结果确认。",
        },
        {
          id: "artifact-handshake",
          tag: "Ready",
          title: "后端接入接口位",
          detail: "底部 Composer 和会话列表都能继续扩展到真实会话流。",
        },
      ],
      nextStep: "完成壳层后，再把会话状态、搜索和快捷提示接进来。",
    },
  ],
  "session-review": [
    {
      id: "review-user-1",
      kind: "user",
      text: "我要一版偏 review 的工作流，能快速扫一遍 agent 输出。",
      timestamp: new Date("2026-03-31T08:34:00+08:00").getTime(),
    },
    {
      id: "review-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-31T08:36:00+08:00").getTime(),
      state: "Review 视图已收束",
      summary: "这一版会让摘要先出现，再给关键判断和交付物，减少用户来回找重点的成本。",
      reasoning: [
        "摘要优先，适合 review 场景快速过结果。",
        "后续若接代码 diff 或日志，也可以继续挂在 artifact 卡上。",
        "保留少量状态色，但不做过强视觉噪音。",
      ],
      checklist: ["摘要优先", "证据后置", "下一步明确"],
      artifacts: [
        {
          id: "artifact-review-1",
          tag: "Review",
          title: "审阅优先消息结构",
          detail: "让用户先看结论，再看展开内容。",
        },
      ],
      nextStep: "确认没问题后可再扩展成多标签审阅面板。",
    },
  ],
  "session-growth": [
    {
      id: "growth-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-30T18:06:00+08:00").getTime(),
      state: "等待输入",
      summary: "当前会话保留增长实验上下文，等待新的任务目标。",
      reasoning: ["会话已具备结构，但还没有新的运营指令。"],
      checklist: ["等待任务", "准备接管上下文"],
      artifacts: [],
      nextStep: "输入一个目标，例如生成本周增长实验计划。",
    },
  ],
  "session-delivery": [
    {
      id: "delivery-agent-1",
      kind: "assistant",
      timestamp: new Date("2026-03-29T20:18:00+08:00").getTime(),
      state: "计划就绪",
      summary: "需求拆解 Agent 会把需求转成阶段清单，并保留风险提醒。",
      reasoning: ["当前结构已经适合承接 checklist 和下一步说明。"],
      checklist: ["收集约束", "拆分里程碑", "标注风险"],
      artifacts: [
        {
          id: "artifact-delivery-1",
          tag: "Plan",
          title: "里程碑骨架",
          detail: "定义从需求输入到执行确认的完整链路。",
        },
      ],
      nextStep: "输入新的需求后，我会直接扩充为可执行任务。",
    },
  ],
}

const suggestedPrompts = [
  "帮我梳理 packages/desktop 的首屏布局和组件切分。",
  "把当前会话改成 review-first 的 AI Agent 工作流。",
  "给这版桌面端补一个可落地的后端接入计划。",
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
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} 天前`
}

function buildAgentTurn(prompt: string, session: SessionSummary, workspaceName: string, platform: string): AssistantTurn {
  const compactPrompt = prompt.replace(/\s+/g, " ").trim()
  const focusLine = compactPrompt.length > 34 ? `${compactPrompt.slice(0, 34)}...` : compactPrompt

  return {
    id: createID("assistant"),
    kind: "assistant",
    timestamp: Date.now(),
    state: "执行草案已生成",
    summary: `已收到“${focusLine}”的任务。我会先在 ${workspaceName} 内收束 ${session.title} 的信息层级，再决定哪些部分先做静态结构、哪些部分预留给真实 Agent 接口。`,
    reasoning: [
      "先把桌面端壳层、聊天视口和底部 Composer 定位清楚，避免后续接入流式数据时返工。",
      "继续沿用 Anybox 的轻量留白与右侧用户气泡，让主轴始终落在中间对话列。",
      `当前运行环境识别为 ${platform}，窗口和信息密度会按桌面端优先处理。`,
    ],
    checklist: ["收束页面骨架", "补足阶段标签", "定义可接入后端的占位结构"],
    artifacts: [
      {
        id: createID("artifact"),
        tag: "UI",
        title: "Agent 工作台骨架",
        detail: "侧边栏、视口、Composer 三段式布局已明确。",
      },
      {
        id: createID("artifact"),
        tag: "Next",
        title: "真实接口接入位",
        detail: "后续可以把会话流、任务状态和 artifacts 替换成真实数据。",
      },
    ],
    nextStep: "如果这版界面结构成立，下一步就接搜索、会话切换和流式回复。",
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

export function App() {
  const [platform, setPlatform] = useState("Desktop")
  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [activeSessionID, setActiveSessionID] = useState(seedWorkspaces[0].sessions[0].id)
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"Autopilot" | "Review">("Autopilot")
  const [draft, setDraft] = useState("帮我梳理 packages/desktop 的首屏布局和组件切分。")
  const [conversations, setConversations] = useState(initialConversations)

  const deferredSearch = useDeferredValue(search)
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

  const filteredWorkspaces = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()
    if (!keyword) return workspaces

    return workspaces
      .map((workspace) => {
        const sessions = workspace.sessions.filter((session) => {
          const haystack = `${workspace.name} ${session.title} ${session.summary} ${session.branch}`.toLowerCase()
          return haystack.includes(keyword)
        })

        if (workspace.name.toLowerCase().includes(keyword) && sessions.length === 0) {
          return workspace
        }

        return { ...workspace, sessions }
      })
      .filter((workspace) => workspace.name.toLowerCase().includes(keyword) || workspace.sessions.length > 0)
  }, [deferredSearch, workspaces])

  const activeTurns = conversations[activeSession.id] ?? []
  const metrics = [
    { label: "Runtime", value: platform },
    { label: "Mode", value: mode },
    { label: "Focus", value: activeSession.focus },
    { label: "Session", value: activeSession.status },
  ]

  function handlePromptApply(prompt: string) {
    setDraft(prompt)
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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-line">
            <span className="brand-mark" aria-hidden="true" />
            <span className="label">Fanfande Desktop</span>
          </div>
          <h1>AI Agent Workspace</h1>
          <p>以 Anybox 的轻界面为底，做一版更像桌面代理控制台的前端工作台。</p>
        </div>

        <label className="search-field">
          <span className="label">搜索项目 / 会话</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 branch、会话标题、摘要" />
        </label>

        <div className="mode-switch" aria-label="Agent mode">
          <button className={mode === "Autopilot" ? "mode-pill is-active" : "mode-pill"} onClick={() => setMode("Autopilot")}>
            Autopilot
          </button>
          <button className={mode === "Review" ? "mode-pill is-active" : "mode-pill"} onClick={() => setMode("Review")}>
            Review
          </button>
        </div>

        <div className="workspace-list">
          {filteredWorkspaces.length === 0 ? (
            <div className="empty-state">没有匹配的项目或会话。</div>
          ) : (
            filteredWorkspaces.map((workspace) => (
              <section key={workspace.id} className="workspace-group">
                <header className="workspace-group-header">
                  <div>
                    <strong>{workspace.name}</strong>
                    <span>{workspace.owner}</span>
                  </div>
                  <small>{workspace.sessions.length} sessions</small>
                </header>

                <div className="session-stack">
                  {workspace.sessions.map((session) => {
                    const active = session.id === activeSession.id

                    return (
                      <button
                        key={session.id}
                        className={active ? "session-card is-active" : "session-card"}
                        onClick={() => setActiveSessionID(session.id)}
                      >
                        <div className="session-card-top">
                          <strong>{session.title}</strong>
                          <span className={`status-dot status-${session.status.toLowerCase()}`}>{session.status}</span>
                        </div>
                        <span className="session-branch">{session.branch}</span>
                        <p>{session.summary}</p>
                        <small>{formatRelative(session.updated)}</small>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div>
            <span className="label">当前工作区</span>
            <strong>{activeWorkspace.name}</strong>
          </div>
          <button className="secondary-button" onClick={() => setSearch("")}>
            清空搜索
          </button>
        </div>
      </aside>

      <section className="canvas">
        <header className="canvas-header">
          <div className="canvas-title">
            <span className="label">Active Session</span>
            <h2>{activeSession.title}</h2>
            <p>
              {activeWorkspace.name} / {activeSession.branch}
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
                          <div className="artifact-card is-empty">等待新的输出结果。</div>
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

        <footer className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="描述你希望 Agent 处理的任务、目标或界面方向。"
            rows={3}
          />

          <div className="composer-toolbar">
            <div className="composer-pills">
              <span className="composer-pill">GPT-5.4</span>
              <span className="composer-pill">Desktop</span>
              <span className="composer-pill">Anybox Ref</span>
            </div>

            <div className="composer-actions">
              <button className="secondary-button" onClick={() => setDraft("")}>
                清空
              </button>
              <button className="primary-button" onClick={handleSend}>
                发送任务
              </button>
            </div>
          </div>
        </footer>
      </section>
    </main>
  )
}
