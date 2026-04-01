import { startTransition, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"

type SessionStatus = "Live" | "Review" | "Ready"
type TitlebarMenuKey = "file" | "edit" | "view" | "window" | "help"
type SidebarActionKey = "project" | "density" | "sort" | "new"
type CanvasMenuKey = "overview" | "artifacts" | "changes" | "console" | "deploy"

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
  directory: string
  created: number
  updated: number
  project: {
    id: string
    name: string
    worktree: string
  }
  sessions: SessionSummary[]
}

interface LoadedSessionSnapshot {
  id: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
}

interface LoadedFolderWorkspace {
  id: string
  directory: string
  name: string
  created: number
  updated: number
  project: {
    id: string
    name: string
    worktree: string
  }
  sessions: LoadedSessionSnapshot[]
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
  isStreaming?: boolean
}

type Turn = UserTurn | AssistantTurn

interface AgentStreamEvent {
  event: string
  data: unknown
}

interface AgentStreamIPCEvent extends AgentStreamEvent {
  streamID: string
}

interface PendingAgentStream {
  sessionID: string
  assistantTurnID: string
}

const DEFAULT_SIDEBAR_WIDTH = 236
const MIN_SIDEBAR_WIDTH = 192
const MAX_SIDEBAR_WIDTH = 420
const MIN_CANVAS_WIDTH = 560
const SIDEBAR_KEYBOARD_STEP = 16
const STREAM_PENDING_PREFIX = 'Queued prompt:'
const STREAM_PENDING_REASONING = "Reasoning updates will appear here as soon as the backend emits them."
const STREAM_PENDING_NEXT_STEP = "Live output will keep appending inside this turn while the backend responds."

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveSidebarWidthBounds(containerWidth?: number) {
  if (!containerWidth || containerWidth <= 0) {
    return {
      min: MIN_SIDEBAR_WIDTH,
      max: MAX_SIDEBAR_WIDTH,
    }
  }

  return {
    min: MIN_SIDEBAR_WIDTH,
    max: Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, containerWidth - MIN_CANVAS_WIDTH)),
  }
}

const seedWorkspaces: WorkspaceGroup[] = [
  {
    id: "C:\\Projects\\Project 1\\src",
    name: "src",
    directory: "C:\\Projects\\Project 1\\src",
    created: new Date("2026-03-31T09:24:00+08:00").getTime(),
    updated: new Date("2026-03-31T09:24:00+08:00").getTime(),
    project: {
      id: "project-1",
      name: "Project 1",
      worktree: "C:\\Projects\\Project 1",
    },
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
    id: "C:\\Projects\\Project 2\\app",
    name: "app",
    directory: "C:\\Projects\\Project 2\\app",
    created: new Date("2026-03-31T10:12:00+08:00").getTime(),
    updated: new Date("2026-03-31T10:12:00+08:00").getTime(),
    project: {
      id: "project-2",
      name: "Project 2",
      worktree: "C:\\Projects\\Project 2",
    },
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
    id: "C:\\Projects\\Project 3\\docs",
    name: "docs",
    directory: "C:\\Projects\\Project 3\\docs",
    created: new Date("2026-03-30T18:06:00+08:00").getTime(),
    updated: new Date("2026-03-30T18:06:00+08:00").getTime(),
    project: {
      id: "project-3",
      name: "Project 3",
      worktree: "C:\\Projects\\Project 3",
    },
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

const titlebarMenus: Array<{ key: TitlebarMenuKey; label: string }> = [
  { key: "file", label: "File" },
  { key: "edit", label: "Edit" },
  { key: "view", label: "View" },
  { key: "window", label: "Window" },
  { key: "help", label: "Help" },
]

const sidebarActions: Array<{ key: SidebarActionKey; label: string }> = [
  { key: "project", label: "Open folder" },
  { key: "density", label: "Toggle sidebar density" },
  { key: "sort", label: "Sort sessions" },
  { key: "new", label: "Create session" },
]

const canvasMenuItems: Array<{ key: CanvasMenuKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "artifacts", label: "Artifacts" },
  { key: "changes", label: "Changes" },
  { key: "console", label: "Console" },
  { key: "deploy", label: "Deploy" },
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

function compactText(input: string, maxLength = 180) {
  const normalized = input.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function dedupeItems(items: string[]) {
  return [...new Set(items.filter(Boolean))]
}

function upsertArtifact(cards: ArtifactCard[], nextCard: ArtifactCard) {
  return [...cards.filter((card) => card.id !== nextCard.id), nextCard]
}

function mergeArtifacts(current: ArtifactCard[], incoming: ArtifactCard[]) {
  return incoming.reduce((cards, artifact) => upsertArtifact(cards, artifact), current)
}

function describeStructuredValue(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return compactText(value) || fallback
  }

  if (value == null) return fallback

  try {
    const serialized = JSON.stringify(value)
    return compactText(serialized, 220) || fallback
  } catch {
    return fallback
  }
}

function extractTextParts(parts: unknown[], type: "text" | "reasoning") {
  let combined = ""

  for (const item of parts) {
    const part = readRecord(item)
    if (!part || readString(part.type) !== type) continue
    combined += readString(part.text)
  }

  return combined.trim()
}

function buildArtifactFromPart(input: unknown): ArtifactCard | null {
  const part = readRecord(input)
  if (!part) return null

  const id = readString(part.id) || createID("artifact")
  const type = readString(part.type)

  if (type === "tool") {
    const state = readRecord(part.state)
    const status = readString(state?.status) || "updated"
    const toolName = readString(part.tool) || "Tool"
    const detail =
      status === "completed"
        ? describeStructuredValue(state?.output, "Tool completed.")
        : status === "error"
          ? readString(state?.error) || "Tool failed."
          : readString(state?.title) || describeStructuredValue(state?.input, "Tool update received.")

    return {
      id,
      tag: "Tool",
      title: `${toolName} · ${status}`,
      detail,
    }
  }

  if (type === "file" || type === "image") {
    return {
      id,
      tag: type === "image" ? "Image" : "File",
      title: readString(part.filename) || "Attachment",
      detail: readString(part.mime) || describeStructuredValue(part.url, "Attachment returned from the agent."),
    }
  }

  if (type === "patch") {
    const files = Array.isArray(part.files) ? part.files.filter((item): item is string => typeof item === "string") : []
    return {
      id,
      tag: "Patch",
      title: files.length > 0 ? `${files.length} file change${files.length === 1 ? "" : "s"}` : "Patch update",
      detail: files.length > 0 ? compactText(files.join(", "), 220) : "Patch metadata received from the backend.",
    }
  }

  if (type === "subtask") {
    return {
      id,
      tag: "Subtask",
      title: readString(part.description) || readString(part.agent) || "Delegated task",
      detail: compactText(readString(part.prompt), 220) || "The assistant delegated part of the request.",
    }
  }

  if (type === "step-finish") {
    return {
      id,
      tag: "Step",
      title: "Reasoning step finished",
      detail: readString(part.reason) || "The backend completed one reasoning step.",
    }
  }

  if (type === "retry") {
    return {
      id,
      tag: "Retry",
      title: "Retry scheduled",
      detail: `Attempt ${String(part.attempt ?? "?")}`,
    }
  }

  if (type === "snapshot") {
    return {
      id,
      tag: "Snapshot",
      title: "Workspace snapshot",
      detail: "The backend captured a workspace snapshot during the run.",
    }
  }

  return null
}

function collectArtifactsFromParts(parts: unknown[]) {
  return parts.reduce<ArtifactCard[]>((cards, item) => {
    const artifact = buildArtifactFromPart(item)
    return artifact ? [...cards, artifact] : cards
  }, [])
}

function buildStreamingAssistantTurn(prompt: string): AssistantTurn {
  const compactPrompt = compactText(prompt, 72)

  return {
    id: createID("assistant"),
    kind: "assistant",
    timestamp: Date.now(),
    state: "Waiting for agent stream",
    summary: `${STREAM_PENDING_PREFIX} "${compactPrompt}". Waiting for backend response.`,
    reasoning: [STREAM_PENDING_REASONING],
    checklist: ["Prompt queued", "Await first token", "Render live output"],
    artifacts: [],
    nextStep: STREAM_PENDING_NEXT_STEP,
    isStreaming: true,
  }
}

function buildFailureTurn(message: string, existingTurn?: AssistantTurn): AssistantTurn {
  const turnID = existingTurn?.id ?? createID("assistant")

  return {
    id: turnID,
    kind: "assistant",
    timestamp: existingTurn?.timestamp ?? Date.now(),
    state: "Backend request failed",
    summary: `Cannot reach fanfandeagent: ${message}`,
    reasoning: ["Desktop connected to Electron IPC, but the backend stream call failed."],
    checklist: ["Check server status", "Validate API base URL", "Retry request"],
    artifacts: upsertArtifact(existingTurn?.artifacts ?? [], {
      id: `${turnID}-error`,
      tag: "Error",
      title: "Stream request failed",
      detail: message,
    }),
    nextStep: "Start fanfandeagent server and send again.",
    isStreaming: false,
  }
}

function finalizeStreamAssistantTurn(turn: AssistantTurn): AssistantTurn {
  if (turn.state === "Backend stream failed" || turn.state === "Backend request failed") {
    return {
      ...turn,
      isStreaming: false,
    }
  }

  return {
    ...turn,
    isStreaming: false,
    state: "Backend response received",
    reasoning:
      turn.reasoning.length === 1 && turn.reasoning[0] === STREAM_PENDING_REASONING
        ? ["SSE stream connected and returned structured events."]
        : turn.reasoning,
    checklist: ["Session ready", "Prompt sent", "Response parsed"],
    nextStep: "Continue the thread or switch sessions now that the backend response has completed.",
  }
}

function applyAgentStreamEventToTurn(turn: AssistantTurn, item: AgentStreamEvent): AssistantTurn {
  const payload = readRecord(item.data)

  if (item.event === "started") {
    return {
      ...turn,
      state: "Agent stream connected",
      checklist: dedupeItems(["Prompt sent", "Stream connected", "Await first token"]),
      nextStep: STREAM_PENDING_NEXT_STEP,
      isStreaming: true,
    }
  }

  if (item.event === "delta") {
    const delta = readString(payload?.delta)
    const fullText = readString(payload?.text)
    const kind = readString(payload?.kind) || "text"

    if (kind === "reasoning") {
      const previousReasoning = turn.reasoning.length === 1 && turn.reasoning[0] === STREAM_PENDING_REASONING ? "" : turn.reasoning.join("\n\n")
      const nextReasoning = fullText || `${previousReasoning}${delta}`

      return {
        ...turn,
        state: "Agent is reasoning",
        reasoning: nextReasoning ? [nextReasoning] : turn.reasoning,
        checklist: dedupeItems(["Prompt sent", "Reasoning live", "Rendering turn"]),
        nextStep: STREAM_PENDING_NEXT_STEP,
        isStreaming: true,
      }
    }

    const previousSummary = turn.summary.startsWith(STREAM_PENDING_PREFIX) ? "" : turn.summary
    const nextSummary = fullText || `${previousSummary}${delta}`

    return {
      ...turn,
      state: "Streaming response",
      summary: nextSummary || turn.summary,
      checklist: dedupeItems(["Prompt sent", "First token received", "Streaming response"]),
      nextStep: STREAM_PENDING_NEXT_STEP,
      isStreaming: true,
    }
  }

  if (item.event === "part") {
    const artifact = buildArtifactFromPart(payload?.part)
    if (!artifact) return turn

    return {
      ...turn,
      state: artifact.tag === "Tool" ? "Running tools" : turn.state,
      artifacts: upsertArtifact(turn.artifacts, artifact),
      checklist: dedupeItems([...turn.checklist, "Structured update"]),
      nextStep: STREAM_PENDING_NEXT_STEP,
      isStreaming: true,
    }
  }

  if (item.event === "done") {
    const parts = Array.isArray(payload?.parts) ? payload.parts : []

    return finalizeStreamAssistantTurn({
      ...turn,
      state: "Backend response received",
      summary: extractTextParts(parts, "text") || turn.summary,
      reasoning: extractTextParts(parts, "reasoning") ? [extractTextParts(parts, "reasoning")] : turn.reasoning,
      artifacts: mergeArtifacts(turn.artifacts, collectArtifactsFromParts(parts)),
    })
  }

  if (item.event === "error") {
    const message = readString(payload?.message) || "Unknown backend error"

    return {
      ...turn,
      isStreaming: false,
      state: "Backend stream failed",
      summary: `Backend error: ${message}`,
      reasoning:
        turn.reasoning.length === 1 && turn.reasoning[0] === STREAM_PENDING_REASONING
          ? ["Desktop connected to Electron IPC, but the backend stream failed."]
          : turn.reasoning,
      checklist: ["Check backend log", "Validate model config", "Retry request"],
      artifacts: upsertArtifact(turn.artifacts, {
        id: `${turn.id}-stream-error`,
        tag: "Error",
        title: "API stream error",
        detail: message,
      }),
      nextStep: "Fix the backend error and resend the same prompt.",
    }
  }

  return turn
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

function buildAgentTurnFromEvents(events: AgentStreamEvent[], prompt: string): AssistantTurn {
  let turn = buildStreamingAssistantTurn(prompt)
  for (const event of events) {
    turn = applyAgentStreamEventToTurn(turn, event)
  }

  turn = turn.isStreaming ? finalizeStreamAssistantTurn(turn) : turn

  return {
    ...turn,
    artifacts: upsertArtifact(turn.artifacts, {
      id: `${turn.id}-stream-events`,
      tag: turn.state.includes("failed") ? "Error" : "Backend",
      title: turn.state.includes("failed") ? "API stream error" : "SSE event stream",
      detail: `Received ${events.length} event(s) from fanfandeagent.`,
    }),
  }
}

function buildNewSessionConversation(): Turn[] {
  return [
    {
      id: createID("assistant"),
      kind: "assistant",
      timestamp: Date.now(),
      state: "Session created",
      summary: "This session has been created in fanfandeagent and is ready for the next prompt.",
      reasoning: ["Use the composer below to describe the next change or review target."],
      checklist: ["Session persisted", "Await task"],
      artifacts: [],
      nextStep: "Start by describing the desired UI or coding task.",
    },
  ]
}

function sortWorkspaceGroups(input: WorkspaceGroup[]) {
  const getWorkspaceUpdated = (workspace: WorkspaceGroup) => workspace.sessions[0]?.updated ?? workspace.updated

  return [...input].sort((left, right) => {
    const leftUpdated = getWorkspaceUpdated(left)
    const rightUpdated = getWorkspaceUpdated(right)
    return rightUpdated - leftUpdated
  })
}

function mapLoadedSession(session: LoadedSessionSnapshot, sessionIndex: number): SessionSummary {
  return {
    id: session.id,
    title: session.title.trim() || `Session ${sessionIndex + 1}`,
    branch: session.directory,
    status: "Ready" as const,
    updated: session.updated,
    focus: "Backend",
    summary: `Loaded from ${session.directory}`,
  }
}

function mapLoadedWorkspace(workspace: LoadedFolderWorkspace): WorkspaceGroup {
  return {
    id: workspace.id,
    name: workspace.name.trim() || workspace.directory,
    directory: workspace.directory,
    created: workspace.created,
    updated: workspace.updated,
    project: workspace.project,
    sessions: [...workspace.sessions].sort((left, right) => right.updated - left.updated).map(mapLoadedSession),
  }
}

function mapLoadedWorkspaces(input: LoadedFolderWorkspace[]): WorkspaceGroup[] {
  return sortWorkspaceGroups(
    [...input]
      .sort((left, right) => {
        const leftUpdated = left.sessions[0]?.updated ?? left.updated
        const rightUpdated = right.sessions[0]?.updated ?? right.updated
        return rightUpdated - leftUpdated
      })
      .map((workspace) => mapLoadedWorkspace(workspace)),
  )
}

function upsertWorkspaceGroup(existing: WorkspaceGroup[], nextWorkspace: WorkspaceGroup) {
  const withoutCurrent = existing.filter((workspace) => workspace.id !== nextWorkspace.id)
  return sortWorkspaceGroups([...withoutCurrent, nextWorkspace])
}

function upsertSessionInWorkspace(existing: WorkspaceGroup[], workspaceID: string, nextSession: SessionSummary) {
  return sortWorkspaceGroups(
    existing.map((workspace) =>
      workspace.id === workspaceID
        ? {
            ...workspace,
            updated: Math.max(workspace.updated, nextSession.updated),
            sessions: [nextSession, ...workspace.sessions.filter((session) => session.id !== nextSession.id)].sort(
              (left, right) => right.updated - left.updated,
            ),
          }
        : workspace,
    ),
  )
}

function findFirstSession(workspaces: WorkspaceGroup[]) {
  for (const workspace of workspaces) {
    if (workspace.sessions[0]) {
      return {
        workspace,
        session: workspace.sessions[0],
      }
    }
  }

  return {
    workspace: workspaces[0] ?? null,
    session: null,
  }
}

function findSession(workspaces: WorkspaceGroup[], sessionID: string | null) {
  if (!sessionID) {
    return {
      workspace: null,
      session: null,
    }
  }

  for (const workspace of workspaces) {
    const session = workspace.sessions.find((item) => item.id === sessionID)
    if (session) return { workspace, session }
  }

  return {
    workspace: null,
    session: null,
  }
}

function findWorkspaceByID(workspaces: WorkspaceGroup[], workspaceID: string | null) {
  if (!workspaceID) return null
  return workspaces.find((workspace) => workspace.id === workspaceID) ?? null
}

function selectAfterSessionDelete(workspaces: WorkspaceGroup[], workspaceID: string, deletedSessionID: string, activeSessionID: string | null) {
  if (activeSessionID && activeSessionID !== deletedSessionID) {
    const currentSelection = findSession(workspaces, activeSessionID)
    if (currentSelection.session) {
      return currentSelection
    }
  }

  const sameWorkspace = workspaces.find((workspace) => workspace.id === workspaceID) ?? null
  if (sameWorkspace) {
    return {
      workspace: sameWorkspace,
      session: sameWorkspace.sessions[0] ?? null,
    }
  }

  return findFirstSession(workspaces)
}

const initialSeedWorkspace = seedWorkspaces[1] ?? seedWorkspaces[0] ?? null
const initialSelection = {
  workspace: initialSeedWorkspace,
  session: initialSeedWorkspace?.sessions[0] ?? null,
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

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 7l5 5-5 5" />
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

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 12h6l1-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
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
  const appShellRef = useRef<HTMLElement | null>(null)
  const threadColumnRef = useRef<HTMLDivElement | null>(null)
  const projectRowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingStreamsRef = useRef<Record<string, PendingAgentStream>>({})
  const [platform, setPlatform] = useState("Desktop")
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [isSidebarCondensed, setIsSidebarCondensed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [workspaces, setWorkspaces] = useState(seedWorkspaces)
  const [selectedFolderID, setSelectedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [activeSessionID, setActiveSessionID] = useState<string | null>(initialSelection.session?.id ?? null)
  const [expandedFolderID, setExpandedFolderID] = useState<string | null>(initialSelection.workspace?.id ?? null)
  const [hoveredFolderID, setHoveredFolderID] = useState<string | null>(null)
  const [mode, setMode] = useState<"Autopilot" | "Review">("Autopilot")
  const [draft, setDraft] = useState("Help me align the desktop sidebar with the Pencil design.")
  const [conversations, setConversations] = useState(initialConversations)
  const [agentBaseURL, setAgentBaseURL] = useState("http://127.0.0.1:4096")
  const [agentDefaultDirectory, setAgentDefaultDirectory] = useState("")
  const [agentConnected, setAgentConnected] = useState(false)
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({})
  const [isSending, setIsSending] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [deletingSessionID, setDeletingSessionID] = useState<string | null>(null)

  const { workspace: activeWorkspace, session: activeSession } = findSession(workspaces, activeSessionID)
  const selectedWorkspace = findWorkspaceByID(workspaces, selectedFolderID) ?? activeWorkspace ?? workspaces[0] ?? null
  const activeTurns = activeSession ? conversations[activeSession.id] ?? [] : []

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
    const unsubscribe = window.desktop?.onAgentStreamEvent?.((streamEvent: AgentStreamIPCEvent) => {
      const target = pendingStreamsRef.current[streamEvent.streamID]
      if (!target) return

      startTransition(() => {
        setConversations((prev) => {
          const turns = prev[target.sessionID] ?? []
          let updated = false
          const nextTurns = turns.map((turn) => {
            if (turn.kind !== "assistant" || turn.id !== target.assistantTurnID) return turn
            updated = true
            return applyAgentStreamEventToTurn(turn, streamEvent)
          })

          if (!updated) return prev
          return {
            ...prev,
            [target.sessionID]: nextTurns,
          }
        })
      })

      if (streamEvent.event === "done" || streamEvent.event === "error") {
        delete pendingStreamsRef.current[streamEvent.streamID]
      }
    })

    return () => {
      pendingStreamsRef.current = {}
      unsubscribe?.()
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

  useEffect(() => {
    let mounted = true

    const listFolderWorkspaces = window.desktop?.listFolderWorkspaces
    if (!listFolderWorkspaces) {
      return () => {
        mounted = false
      }
    }

    listFolderWorkspaces()
      .then((loadedWorkspaces) => {
        if (!mounted) return

        const nextWorkspaces = mapLoadedWorkspaces(loadedWorkspaces)
        setWorkspaces(nextWorkspaces)
        setConversations((prev) => {
          const next = { ...prev }
          for (const workspace of nextWorkspaces) {
            for (const session of workspace.sessions) {
              next[session.id] ??= []
            }
          }
          return next
        })
        setAgentSessions((prev) => {
          const next = { ...prev }
          for (const workspace of loadedWorkspaces) {
            for (const session of workspace.sessions) {
              next[session.id] ??= session.id
            }
          }
          return next
        })

        const nextSelection = findFirstSession(nextWorkspaces)
        const nextFolderID = nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null
        setSelectedFolderID(nextFolderID)
        setExpandedFolderID(nextFolderID)
        setActiveSessionID(nextSelection.session?.id ?? null)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedFolderID) return

    const projectRow = projectRowRefs.current[selectedFolderID]
    projectRow?.scrollIntoView?.({
      block: "nearest",
    })
  }, [selectedFolderID, workspaces])

  useEffect(() => {
    let mounted = true

    const configPromise = window.desktop?.getAgentConfig
      ? window.desktop.getAgentConfig().catch(() => undefined)
      : Promise.resolve(undefined)
    const healthPromise = window.desktop?.getAgentHealth
      ? window.desktop.getAgentHealth().catch(() => undefined)
      : Promise.resolve(undefined)

    Promise.all([configPromise, healthPromise])
      .then(([config, health]) => {
        if (!mounted) return
        if (config?.baseURL) setAgentBaseURL(config.baseURL)
        if (config?.defaultDirectory) setAgentDefaultDirectory(config.defaultDirectory)
        if (health) {
          setAgentConnected(health.ok)
          if (!config?.baseURL && health.baseURL) setAgentBaseURL(health.baseURL)
        }
      })
      .catch(() => {
        if (mounted) setAgentConnected(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    function syncSidebarWidthToViewport() {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth((current) => clamp(current, bounds.min, bounds.max))
    }

    syncSidebarWidthToViewport()
    window.addEventListener("resize", syncSidebarWidthToViewport)
    return () => {
      window.removeEventListener("resize", syncSidebarWidthToViewport)
    }
  }, [])

  useEffect(() => {
    if (!isSidebarResizing) return

    function handlePointerMove(event: globalThis.PointerEvent) {
      const rect = appShellRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return

      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth(clamp(event.clientX - rect.left, bounds.min, bounds.max))
    }

    function stopSidebarResize() {
      setIsSidebarResizing(false)
    }

    document.body.classList.add("is-resizing-sidebar")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopSidebarResize)
    window.addEventListener("pointercancel", stopSidebarResize)

    return () => {
      document.body.classList.remove("is-resizing-sidebar")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopSidebarResize)
      window.removeEventListener("pointercancel", stopSidebarResize)
    }
  }, [isSidebarResizing])

  useEffect(() => {
    const threadColumn = threadColumnRef.current
    if (!threadColumn) return

    threadColumn.scrollTop = threadColumn.scrollHeight
  }, [activeSessionID, activeTurns])

  const titlebarCommand = agentConnected
    ? `agent://${agentBaseURL.replace(/^https?:\/\//, "")}`
    : `agent://offline (${agentBaseURL.replace(/^https?:\/\//, "")})`
  const appShellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties

  function appendConversationTurns(sessionID: string, nextTurns: Turn[]) {
    setConversations((prev) => ({
      ...prev,
      [sessionID]: [...(prev[sessionID] ?? []), ...nextTurns],
    }))
  }

  function updateAssistantTurn(sessionID: string, turnID: string, updater: (turn: AssistantTurn) => AssistantTurn) {
    setConversations((prev) => {
      const turns = prev[sessionID] ?? []
      let updated = false
      const nextTurns = turns.map((turn) => {
        if (turn.kind !== "assistant" || turn.id !== turnID) return turn
        updated = true
        return updater(turn)
      })

      if (!updated) return prev
      return {
        ...prev,
        [sessionID]: nextTurns,
      }
    })
  }

  function adjustSidebarWidth(delta: number) {
    const rect = appShellRef.current?.getBoundingClientRect()
    const bounds = resolveSidebarWidthBounds(rect?.width)
    setSidebarWidth((current) => clamp(current + delta, bounds.min, bounds.max))
  }

  function handleSidebarResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const rect = appShellRef.current?.getBoundingClientRect()
    if (rect?.width && rect.width > 0) {
      const bounds = resolveSidebarWidthBounds(rect.width)
      setSidebarWidth(clamp(event.clientX - rect.left, bounds.min, bounds.max))
    }

    event.preventDefault()
    setIsSidebarResizing(true)
  }

  function handleSidebarResizerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      adjustSidebarWidth(-SIDEBAR_KEYBOARD_STEP)
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      adjustSidebarWidth(SIDEBAR_KEYBOARD_STEP)
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setSidebarWidth(MIN_SIDEBAR_WIDTH)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      const rect = appShellRef.current?.getBoundingClientRect()
      const bounds = resolveSidebarWidthBounds(rect?.width)
      setSidebarWidth(bounds.max)
    }
  }

  function handleTitleMenu(menuKey: TitlebarMenuKey, event: MouseEvent<HTMLButtonElement>) {
    if (!window.desktop?.showMenu) {
      console.warn("[desktop] showMenu is unavailable. preload may not be loaded.")
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = {
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    }

    void window.desktop.showMenu(menuKey, anchor).catch((error) => {
      console.error("[desktop] showMenu failed:", error)
    })
  }

  function handleWindowAction(action: "minimize" | "toggle-maximize" | "close") {
    if (!window.desktop?.windowAction) {
      console.warn("[desktop] windowAction is unavailable. preload may not be loaded.")
      return
    }

    void window.desktop.windowAction(action).catch((error) => {
      console.error("[desktop] windowAction failed:", error)
    })
  }

  async function handleSidebarAction(action: SidebarActionKey) {
    if (action === "project") {
      if (isCreatingProject || !window.desktop?.pickProjectDirectory || !window.desktop?.openFolderWorkspace) {
        return
      }

      setIsCreatingProject(true)
      try {
        const directory = await window.desktop.pickProjectDirectory()
        if (!directory) return

        const createdWorkspace = await window.desktop.openFolderWorkspace({ directory })
        const nextWorkspace = mapLoadedWorkspace(createdWorkspace)
        setWorkspaces((prev) => upsertWorkspaceGroup(prev, nextWorkspace))
        setConversations((prev) => {
          const next = { ...prev }
          for (const session of createdWorkspace.sessions) {
            next[session.id] ??= []
          }
          return next
        })
        setAgentSessions((prev) => {
          const next = { ...prev }
          for (const session of createdWorkspace.sessions) {
            next[session.id] ??= session.id
          }
          return next
        })
        setExpandedFolderID(createdWorkspace.id)
        setSelectedFolderID(createdWorkspace.id)
        setActiveSessionID(createdWorkspace.sessions[0]?.id ?? null)
      } catch (error) {
        console.error("[desktop] openFolderWorkspace failed:", error)
      } finally {
        setIsCreatingProject(false)
      }
      return
    }

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

    const targetWorkspace = selectedWorkspace
    if (!targetWorkspace || isCreatingSession || !window.desktop?.createFolderSession) return

    setIsCreatingSession(true)
    try {
      const created = await window.desktop.createFolderSession({
        projectID: targetWorkspace.project.id,
        directory: targetWorkspace.directory,
      })
      const nextSession = mapLoadedSession(created.session, targetWorkspace.sessions.length)
      setWorkspaces((prev) => upsertSessionInWorkspace(prev, targetWorkspace.id, nextSession))
      setConversations((prev) => ({
        ...prev,
        [created.session.id]: prev[created.session.id] ?? buildNewSessionConversation(),
      }))
      setAgentSessions((prev) => ({
        ...prev,
        [created.session.id]: created.session.id,
      }))
      setSelectedFolderID(targetWorkspace.id)
      setActiveSessionID(created.session.id)
      setExpandedFolderID(targetWorkspace.id)
    } catch (error) {
      console.error("[desktop] createFolderSession failed:", error)
    } finally {
      setIsCreatingSession(false)
    }
  }

  function handleProjectClick(workspace: WorkspaceGroup) {
    const isSelected = selectedFolderID === workspace.id
    const isExpanded = expandedFolderID === workspace.id
    setSelectedFolderID(workspace.id)

    if (isSelected && isExpanded) {
      setExpandedFolderID(null)
      if (!workspace.sessions.some((session) => session.id === activeSessionID)) {
        setActiveSessionID(workspace.sessions[0]?.id ?? null)
      }
      return
    }

    setExpandedFolderID(workspace.id)
    const currentSessionInWorkspace = workspace.sessions.some((session) => session.id === activeSessionID)
    setActiveSessionID(currentSessionInWorkspace ? activeSessionID : workspace.sessions[0]?.id ?? null)
  }

  function handleSessionSelect(workspaceID: string, sessionID: string) {
    setSelectedFolderID(workspaceID)
    setExpandedFolderID(workspaceID)
    setActiveSessionID(sessionID)
  }

  async function handleSessionDelete(workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (deletingSessionID || !window.desktop?.deleteAgentSession) return

    setDeletingSessionID(session.id)
    try {
      const result = await window.desktop.deleteAgentSession({ sessionID: session.id })
      const nextWorkspaces = sortWorkspaceGroups(
        workspaces.map((item) =>
          item.id === workspace.id
            ? {
                ...item,
                sessions: item.sessions.filter((existing) => existing.id !== session.id),
              }
            : item,
        ),
      )
      const nextSelection = selectAfterSessionDelete(nextWorkspaces, workspace.id, session.id, activeSessionID)

      setWorkspaces(nextWorkspaces)
      setSelectedFolderID(nextSelection.workspace?.id ?? nextWorkspaces[0]?.id ?? null)
      setConversations((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      setAgentSessions((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
      for (const [streamID, target] of Object.entries(pendingStreamsRef.current)) {
        if (target.sessionID === session.id) {
          delete pendingStreamsRef.current[streamID]
        }
      }
      setExpandedFolderID(nextSelection.workspace?.id ?? null)
      setActiveSessionID(nextSelection.session?.id ?? null)
    } catch (error) {
      console.error("[desktop] deleteAgentSession failed:", error)
    } finally {
      setDeletingSessionID(null)
    }
  }

  async function handleSend() {
    if (!activeSession || !activeWorkspace) return

    const text = draft.trim()
    if (!text || isSending) return
    const uiSessionID = activeSession.id
    const canStream = Boolean(window.desktop?.streamAgentMessage && window.desktop?.onAgentStreamEvent)

    const userTurn: UserTurn = {
      id: createID("user"),
      kind: "user",
      text,
      timestamp: Date.now(),
    }

    setDraft("")

    startTransition(() => {
      appendConversationTurns(uiSessionID, [userTurn])

      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          sessions: workspace.sessions.map((session) =>
            session.id === uiSessionID
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

    if (!agentConnected || !window.desktop?.createAgentSession || (!canStream && !window.desktop?.sendAgentMessage)) {
      const fallback = buildAgentTurn(text, activeSession, activeWorkspace.name, platform)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [fallback])
      })
      return
    }

    setIsSending(true)
    let streamingTurnID: string | null = null
    let streamID: string | null = null

    try {
      let backendSessionID = agentSessions[uiSessionID]
      if (!backendSessionID) {
        const created = await window.desktop.createAgentSession({
          directory: agentDefaultDirectory || undefined,
        })
        backendSessionID = created.session.id
        setAgentSessions((prev) => ({
          ...prev,
          [uiSessionID]: backendSessionID,
        }))
      }

      if (!backendSessionID) {
        throw new Error("Backend session id is missing")
      }

      if (canStream && window.desktop?.streamAgentMessage) {
        const streamingTurn = buildStreamingAssistantTurn(text)
        streamingTurnID = streamingTurn.id
        streamID = createID("stream")
        pendingStreamsRef.current[streamID] = {
          sessionID: uiSessionID,
          assistantTurnID: streamingTurn.id,
        }

        startTransition(() => {
          appendConversationTurns(uiSessionID, [streamingTurn])
        })

        await window.desktop.streamAgentMessage({
          streamID,
          sessionID: backendSessionID,
          text,
        })

        return
      }

      const result = await window.desktop.sendAgentMessage?.({
        sessionID: backendSessionID,
        text,
      })

      if (!result) {
        throw new Error("Desktop preload does not expose an agent send method")
      }

      const backendTurn = buildAgentTurnFromEvents(result.events, text)
      startTransition(() => {
        appendConversationTurns(uiSessionID, [backendTurn])
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (streamID) {
        delete pendingStreamsRef.current[streamID]
      }

      startTransition(() => {
        if (streamingTurnID) {
          updateAssistantTurn(uiSessionID, streamingTurnID, (current) => buildFailureTurn(message, current))
          return
        }

        appendConversationTurns(uiSessionID, [buildFailureTurn(message)])
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={isWindowMaximized ? "window-shell is-maximized" : "window-shell"}>
      <header className="titlebar">
        <div className="titlebar-surface">
          <div className="titlebar-left">
            <div className="titlebar-brand" aria-hidden="true">
              <span className="titlebar-mark">*</span>
            </div>
            <nav className="titlebar-menus" aria-label="Application menu">
              {titlebarMenus.map((menu) => (
                <button key={menu.key} className="titlebar-menu-button" onClick={(event) => handleTitleMenu(menu.key, event)}>
                  {menu.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="titlebar-right">
            <div className="titlebar-command">{titlebarCommand}</div>
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

      <main ref={appShellRef} className="app-shell" style={appShellStyle}>
        <aside id="app-sidebar" className={isSidebarCondensed ? "sidebar is-condensed" : "sidebar"} aria-label="Folder navigation">
          <div className="sidebar-actions" aria-label="Sidebar actions">
            {sidebarActions.map((action) => (
              <button
                key={action.key}
                className="sidebar-action"
                aria-label={action.label}
                title={action.label}
                disabled={action.key === "project" ? isCreatingProject : false}
                onClick={() => void handleSidebarAction(action.key)}
              >
                {action.key === "project" ? <FolderIcon /> : null}
                {action.key === "density" ? <ExpandIcon /> : null}
                {action.key === "sort" ? <SortIcon /> : null}
                {action.key === "new" ? <NewItemIcon /> : null}
              </button>
            ))}
          </div>

          <div className="sidebar-projects">
            {workspaces.map((workspace) => {
              const isActiveWorkspace = workspace.id === selectedFolderID
              const isExpanded = workspace.id === expandedFolderID
              const showStateIcon = workspace.id === hoveredFolderID
              const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"

              return (
                <section key={workspace.id} className="project-block">
                  <div className="project-row-shell">
                    <button
                      ref={(node) => {
                        projectRowRefs.current[workspace.id] = node
                      }}
                      className={isActiveWorkspace ? "project-row is-active" : "project-row"}
                      aria-label={workspace.name}
                      aria-expanded={isExpanded}
                      data-folder-id={workspace.id}
                      onClick={() => handleProjectClick(workspace)}
                      onMouseEnter={() => setHoveredFolderID(workspace.id)}
                      onMouseLeave={() => setHoveredFolderID((current) => (current === workspace.id ? null : current))}
                      onFocus={() => setHoveredFolderID(workspace.id)}
                      onBlur={() => setHoveredFolderID((current) => (current === workspace.id ? null : current))}
                    >
                      <span
                        className="project-row-leading"
                        data-icon={leadingIcon}
                        data-testid={`project-leading-${workspace.id}`}
                        aria-hidden="true"
                      >
                        {showStateIcon ? isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon /> : <FolderIcon />}
                      </span>
                      <span className="project-row-text">
                        <span className="project-row-label">{workspace.name}</span>
                        <span className="project-row-meta">{workspace.project.name}</span>
                      </span>
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="session-tree">
                      {workspace.sessions.map((session) => {
                        const active = session.id === activeSession?.id

                        return (
                          <div key={session.id} className="session-row-shell">
                            <button
                              className={active ? "session-row is-active" : "session-row"}
                              onClick={() => handleSessionSelect(workspace.id, session.id)}
                            >
                              <span className="session-row-label">{session.title}</span>
                            </button>
                            <button
                              className="row-action"
                              aria-label={`Delete session ${session.title}`}
                              title={`Delete session ${session.title}`}
                              disabled={deletingSessionID === session.id}
                              onClick={(event) => void handleSessionDelete(workspace, session, event)}
                            >
                              <DeleteIcon />
                            </button>
                          </div>
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

        <div
          className={isSidebarResizing ? "sidebar-resizer is-active" : "sidebar-resizer"}
          role="separator"
          aria-label="Resize sidebar"
          aria-controls="app-sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          data-testid="sidebar-resizer"
          tabIndex={0}
          onKeyDown={handleSidebarResizerKeyDown}
          onPointerDown={handleSidebarResizerPointerDown}
        />

        <section className="canvas">
          <nav className="canvas-top-menu" aria-label="Main content menu">
            <div className="canvas-top-menu-group">
              {canvasMenuItems.map((item, index) => (
                <button key={item.key} className={index === 0 ? "canvas-top-menu-button is-active" : "canvas-top-menu-button"}>
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <section className="thread-shell">
            <div ref={threadColumnRef} className="thread-column">
              {!activeSession ? (
                <article className="turn assistant-turn">
                  <div className="assistant-shell">
                    <header className="assistant-header">
                      <div>
                        <span className="label">Agent Turn</span>
                        <h3>No session selected</h3>
                      </div>
                    </header>

                    <p className="assistant-summary">Load a folder from the sidebar or create a new session to begin.</p>
                  </div>
                </article>
              ) : activeTurns.length === 0 ? (
                <article className="turn assistant-turn">
                  <div className="assistant-shell">
                    <header className="assistant-header">
                      <div>
                        <span className="label">Agent Turn</span>
                        <h3>Session loaded</h3>
                      </div>
                    </header>

                    <p className="assistant-summary">This session was loaded during app startup and is ready for the next prompt.</p>
                  </div>
                </article>
              ) : (
                activeTurns.map((turn) =>
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
                      <div className={turn.isStreaming ? "assistant-shell is-streaming" : "assistant-shell"}>
                        <header className="assistant-header">
                          <div>
                            <span className="label">Agent Turn</span>
                            <h3>{turn.state}</h3>
                          </div>
                          <time>{formatTime(turn.timestamp)}</time>
                        </header>

                        <p className={turn.isStreaming ? "assistant-summary is-streaming" : "assistant-summary"}>{turn.summary}</p>

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
                )
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
                <button
                  aria-label="Send task"
                  className="primary-button"
                  disabled={isSending || !activeSession}
                  onClick={() => void handleSend()}
                >
                  {isSending ? "Sending..." : "Send task"}
                </button>
              </div>
            </div>
          </footer>
        </section>
      </main>
    </div>
  )
}

