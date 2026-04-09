import type {
  TerminalSessionRecord,
  TerminalStoragePayload,
  TerminalStorageSessionSnapshot,
  TerminalWorkspaceState,
} from "./types"

const TERMINAL_STORAGE_KEY = "desktop.terminal.workspace.v1"
const DEFAULT_PANEL_HEIGHT = 280

function toStoredSession(session: TerminalSessionRecord): TerminalStorageSessionSnapshot {
  // PTY scrollback is live data owned by the backend. Persist only the
  // structural shell state so typing and streaming output do not rewrite
  // large buffers into localStorage on every frame.
  return {
    ptyID: session.ptyID,
    title: session.title,
    cwd: session.cwd,
    shell: session.shell,
    rows: session.rows,
    cols: session.cols,
    status: session.status,
    exitCode: session.exitCode,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    cursor: 0,
    buffer: "",
    scrollTop: 0,
  }
}

function fromStoredSession(snapshot: TerminalStorageSessionSnapshot): TerminalSessionRecord {
  return {
    ...snapshot,
    transportState: "idle",
  }
}

export function createEmptyTerminalWorkspaceState(): TerminalWorkspaceState {
  return {
    isOpen: false,
    activePtyID: null,
    order: [],
    sessions: {},
    panelHeight: DEFAULT_PANEL_HEIGHT,
  }
}

export function loadTerminalWorkspaceState(): TerminalWorkspaceState {
  if (typeof window === "undefined") return createEmptyTerminalWorkspaceState()

  try {
    const raw = window.localStorage.getItem(TERMINAL_STORAGE_KEY)
    if (!raw) return createEmptyTerminalWorkspaceState()

    const parsed = JSON.parse(raw) as TerminalStoragePayload
    if (parsed.version !== 1 || !Array.isArray(parsed.order) || !Array.isArray(parsed.sessions)) {
      return createEmptyTerminalWorkspaceState()
    }

    const sessions = Object.fromEntries(parsed.sessions.map((session) => [session.ptyID, fromStoredSession(session)]))
    const order = parsed.order.filter((ptyID) => Boolean(sessions[ptyID]))
    const activePtyID = parsed.activePtyID && sessions[parsed.activePtyID] ? parsed.activePtyID : order[0] ?? null

    return {
      isOpen: parsed.isOpen === true,
      activePtyID,
      order,
      sessions,
      panelHeight: Number.isFinite(parsed.panelHeight) ? Math.max(220, Math.min(parsed.panelHeight, 560)) : DEFAULT_PANEL_HEIGHT,
    }
  } catch {
    return createEmptyTerminalWorkspaceState()
  }
}

export function saveTerminalWorkspaceState(state: TerminalWorkspaceState) {
  if (typeof window === "undefined") return

  const payload = serializeTerminalWorkspaceState(state)

  window.localStorage.setItem(TERMINAL_STORAGE_KEY, payload)
}

export function serializeTerminalWorkspaceState(state: TerminalWorkspaceState) {
  const payload: TerminalStoragePayload = {
    version: 1,
    isOpen: state.isOpen,
    activePtyID: state.activePtyID,
    order: state.order,
    sessions: state.order.map((ptyID) => toStoredSession(state.sessions[ptyID]!)),
    panelHeight: state.panelHeight,
  }

  return JSON.stringify(payload)
}

export function clearTerminalWorkspaceState() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(TERMINAL_STORAGE_KEY)
}
